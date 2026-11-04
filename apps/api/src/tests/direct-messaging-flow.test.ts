import assert from 'node:assert';
import { PrismaClient } from '@apnasamaj/database';
import {
  getOrCreateDirectConversation,
  getDirectChatInbox,
  getDirectMessageHistory,
  sendDirectMessage,
  markDirectConversationAsRead,
  verifyDirectConversationAccess,
} from '../modules/chat/direct-chat.service';
import {
  getGroupChatHistory,
  sendChatMessage,
  verifyGroupChatAccess,
  ChatNotFoundError,
  ForbiddenChatError,
  ChatServiceError,
} from '../modules/chat/chat.service';
import { getConversationRoomName } from '../modules/chat/chat.socket';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.2: Personal One-to-One Messaging Flow  ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// -------------------------------------------------------------
// Isolated In-Memory Mock Prisma Client Factory for Direct Chat
// -------------------------------------------------------------
interface MockDataStore {
  users: any[];
  groups: any[];
  groupMembers: any[];
  chatMessages: any[];
  directConversations: any[];
  directConversationParticipants: any[];
  directMessages: any[];
}

function createMockPrismaClient(communitySlug: string, initialData: Partial<MockDataStore> = {}) {
  const queryLog: string[] = [];
  const data: MockDataStore = {
    users: initialData.users ? [...initialData.users] : [],
    groups: initialData.groups ? [...initialData.groups] : [],
    groupMembers: initialData.groupMembers ? [...initialData.groupMembers] : [],
    chatMessages: initialData.chatMessages ? [...initialData.chatMessages] : [],
    directConversations: initialData.directConversations ? [...initialData.directConversations] : [],
    directConversationParticipants: initialData.directConversationParticipants
      ? [...initialData.directConversationParticipants]
      : [],
    directMessages: initialData.directMessages ? [...initialData.directMessages] : [],
  };

  const client = {
    communitySlug,
    queryLog,
    data,

    user: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`user.findUnique(${communitySlug})`);
        const found = data.users.find((u) => u.id === where.id);
        if (!found) return null;
        return {
          ...found,
          profile: found.profile || { fullName: `User ${found.id}`, avatarUrl: null },
        };
      },
    },

    directConversation: {
      findUnique: async ({ where, include }: any) => {
        queryLog.push(`directConversation.findUnique(${communitySlug})`);
        let conv: any = null;
        if (where?.id) {
          conv = data.directConversations.find((c) => c.id === where.id);
        } else if (where?.userOneId_userTwoId) {
          const { userOneId, userTwoId } = where.userOneId_userTwoId;
          conv = data.directConversations.find(
            (c) => c.userOneId === userOneId && c.userTwoId === userTwoId
          );
        }

        if (!conv) return null;

        const res: any = { ...conv };
        if (include?.participants) {
          res.participants = data.directConversationParticipants
            .filter((p) => p.conversationId === conv.id)
            .map((p) => {
              const u = data.users.find((user) => user.id === p.userId);
              return {
                ...p,
                user: {
                  id: p.userId,
                  profile: u?.profile || { fullName: `User ${p.userId}`, avatarUrl: null },
                },
              };
            });
        }
        if (include?.messages) {
          let msgs = data.directMessages.filter((m) => m.conversationId === conv.id);
          msgs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          if (include.messages.take) {
            msgs = msgs.slice(0, include.messages.take);
          }
          res.messages = msgs.map((m) => {
            const sender = data.users.find((u) => u.id === m.senderId);
            return {
              ...m,
              sender: {
                id: m.senderId,
                profile: sender?.profile || { fullName: `User ${m.senderId}`, avatarUrl: null },
              },
            };
          });
        }
        return res;
      },

      create: async ({ data: payload, include }: any) => {
        queryLog.push(`directConversation.create(${communitySlug})`);
        const existing = data.directConversations.find(
          (c) => c.userOneId === payload.userOneId && c.userTwoId === payload.userTwoId
        );
        if (existing) {
          const err = new Error('Unique constraint failed on userOneId, userTwoId');
          (err as any).code = 'P2002';
          throw err;
        }

        const newConv = {
          id: `conv-${data.directConversations.length + 1}`,
          userOneId: payload.userOneId,
          userTwoId: payload.userTwoId,
          createdAt: new Date(Date.now() + (data.directMessages.length + 1) * 100),
          updatedAt: new Date(Date.now() + (data.directMessages.length + 1) * 100),
        };
        data.directConversations.push(newConv);

        if (payload.participants?.create) {
          for (const p of payload.participants.create) {
            data.directConversationParticipants.push({
              id: `part-${data.directConversationParticipants.length + 1}`,
              conversationId: newConv.id,
              userId: p.userId,
              lastReadAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }

        return client.directConversation.findUnique({
          where: { id: newConv.id },
          include,
        });
      },

      update: async ({ where, data: patch }: any) => {
        queryLog.push(`directConversation.update(${communitySlug})`);
        const conv = data.directConversations.find((c) => c.id === where.id);
        if (conv) {
          Object.assign(conv, patch);
        }
        return conv;
      },

      findMany: async ({ where, take = 20, orderBy, include }: any) => {
        queryLog.push(`directConversation.findMany(${communitySlug})`);
        let filtered = data.directConversations.filter((c) => {
          if (where?.OR) {
            const matched = where.OR.some(
              (cond: any) =>
                (cond.userOneId && c.userOneId === cond.userOneId) ||
                (cond.userTwoId && c.userTwoId === cond.userTwoId)
            );
            if (!matched) return false;
          }
          if (where?.updatedAt?.lt) {
            if (c.updatedAt.getTime() >= where.updatedAt.lt.getTime()) return false;
          }
          return true;
        });

        filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        const sliced = filtered.slice(0, take);

        return Promise.all(
          sliced.map(async (c) => {
            const res: any = { ...c };
            if (include?.participants) {
              res.participants = data.directConversationParticipants
                .filter((p) => p.conversationId === c.id)
                .map((p) => {
                  const u = data.users.find((user) => user.id === p.userId);
                  return {
                    ...p,
                    user: {
                      id: p.userId,
                      profile: u?.profile || { fullName: `User ${p.userId}`, avatarUrl: null },
                    },
                  };
                });
            }
            if (include?.messages) {
              let msgs = data.directMessages.filter((m) => m.conversationId === c.id);
              msgs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
              if (include.messages.take) {
                msgs = msgs.slice(0, include.messages.take);
              }
              res.messages = msgs.map((m) => {
                const sender = data.users.find((u) => u.id === m.senderId);
                return {
                  ...m,
                  sender: {
                    id: m.senderId,
                    profile: sender?.profile || { fullName: `User ${m.senderId}`, avatarUrl: null },
                  },
                };
              });
            }
            return res;
          })
        );
      },
    },

    directConversationParticipant: {
      upsert: async ({ where, update, create }: any) => {
        queryLog.push(`directConversationParticipant.upsert(${communitySlug})`);
        const { conversationId, userId } = where.conversationId_userId;
        let part = data.directConversationParticipants.find(
          (p) => p.conversationId === conversationId && p.userId === userId
        );
        if (part) {
          Object.assign(part, update);
        } else {
          part = {
            id: `part-${data.directConversationParticipants.length + 1}`,
            conversationId,
            userId,
            ...create,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          data.directConversationParticipants.push(part);
        }
        return part;
      },
    },

    directMessage: {
      create: async ({ data: payload, include }: any) => {
        queryLog.push(`directMessage.create(${communitySlug})`);
        const newMsg = {
          id: `dmsg-${data.directMessages.length + 1}`,
          conversationId: payload.conversationId,
          senderId: payload.senderId,
          content: payload.content,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        data.directMessages.push(newMsg);

        const sender = data.users.find((u) => u.id === payload.senderId);
        return {
          ...newMsg,
          sender: sender
            ? {
              id: sender.id,
              profile: sender.profile || { fullName: `User ${sender.id}`, avatarUrl: null },
            }
            : null,
        };
      },

      findUnique: async ({ where }: any) => {
        queryLog.push(`directMessage.findUnique(${communitySlug})`);
        return data.directMessages.find((m) => m.id === where.id) || null;
      },

      findMany: async ({ where, take = 20, orderBy, include }: any) => {
        queryLog.push(`directMessage.findMany(${communitySlug})`);
        let filtered = data.directMessages.filter((m) => {
          if (where?.conversationId && m.conversationId !== where.conversationId) return false;
          if (where?.createdAt?.lt) {
            if (m.createdAt.getTime() >= where.createdAt.lt.getTime()) return false;
          }
          return true;
        });

        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const sliced = filtered.slice(0, take);

        return sliced.map((m) => {
          const sender = data.users.find((u) => u.id === m.senderId);
          return {
            ...m,
            sender: sender
              ? {
                id: sender.id,
                profile: sender.profile || { fullName: `User ${sender.id}`, avatarUrl: null },
              }
              : null,
          };
        });
      },

      count: async ({ where }: any) => {
        queryLog.push(`directMessage.count(${communitySlug})`);
        return data.directMessages.filter((m) => {
          if (where?.conversationId && m.conversationId !== where.conversationId) return false;
          if (where?.senderId?.not && m.senderId === where.senderId.not) return false;
          if (where?.createdAt?.gt) {
            if (m.createdAt.getTime() <= where.createdAt.gt.getTime()) return false;
          }
          return true;
        }).length;
      },
    },

    // Community Group Chat Mock for regression verification
    group: {
      findFirst: async ({ where }: any) => {
        queryLog.push(`group.findFirst(${communitySlug})`);
        return (
          data.groups.find((g) => {
            if (where?.OR) {
              return where.OR.some((cond: any) => cond.id === g.id || cond.slug === g.slug);
            }
            return false;
          }) || null
        );
      },
    },

    groupMember: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`groupMember.findUnique(${communitySlug})`);
        const { groupId_userId } = where;
        return (
          data.groupMembers.find(
            (m) =>
              m.groupId === groupId_userId.groupId &&
              m.userId === groupId_userId.userId &&
              m.status === 'ACTIVE'
          ) || null
        );
      },
    },

    chatMessage: {
      create: async ({ data: payload }: any) => {
        queryLog.push(`chatMessage.create(${communitySlug})`);
        const newMsg = {
          id: `gmsg-${data.chatMessages.length + 1}`,
          groupId: payload.groupId,
          senderId: payload.senderId,
          content: payload.content,
          createdAt: new Date(Date.now() + (data.directMessages.length + 1) * 100),
          updatedAt: new Date(Date.now() + (data.directMessages.length + 1) * 100),
          sender: {
            id: payload.senderId,
            profile: { fullName: `User ${payload.senderId}`, avatarUrl: null },
          },
        };
        data.chatMessages.push(newMsg);
        return newMsg;
      },
      findMany: async ({ where, take = 20 }: any) => {
        queryLog.push(`chatMessage.findMany(${communitySlug})`);
        let filtered = data.chatMessages.filter((m) => m.groupId === where.groupId);
        filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return filtered.slice(0, take).map((m) => ({
          ...m,
          sender: {
            id: m.senderId,
            profile: { fullName: `User ${m.senderId}`, avatarUrl: null },
          },
        }));
      },
      findUnique: async ({ where }: any) => {
        return data.chatMessages.find((m) => m.id === where.id) || null;
      },
    },
  };

  return client as unknown as PrismaClient & typeof client;
}

// -------------------------------------------------------------
// Test Execution Suite
// -------------------------------------------------------------
async function runDirectMessagingSuite() {
  const initialUsers = [
    {
      id: 'user-a-1111',
      status: 'ACTIVE',
      profile: { fullName: 'Aarav Kewat', avatarUrl: 'https://example.com/aarav.jpg' },
    },
    {
      id: 'user-b-2222',
      status: 'ACTIVE',
      profile: { fullName: 'Bhavna Kewat', avatarUrl: 'https://example.com/bhavna.jpg' },
    },
    {
      id: 'user-c-3333',
      status: 'ACTIVE',
      profile: { fullName: 'Chirag Kewat', avatarUrl: null },
    },
    {
      id: 'user-inactive-4444',
      status: 'SUSPENDED',
      profile: { fullName: 'Suspended Member', avatarUrl: null },
    },
  ];

  const dbTenant1 = createMockPrismaClient('kewat', {
    users: initialUsers,
    groups: [
      { id: 'grp-yuva-1', slug: 'yuva-mandal', name: 'Yuva Mandal', privacy: 'PUBLIC' },
    ],
    groupMembers: [
      { groupId: 'grp-yuva-1', userId: 'user-a-1111', status: 'ACTIVE', role: 'MEMBER' },
    ],
  });

  const dbTenant2 = createMockPrismaClient('patel', {
    users: [
      { id: 'patel-user-1', status: 'ACTIVE', profile: { fullName: 'Patel User 1', avatarUrl: null } },
    ],
  });

  console.log('--- 1. Creating a direct conversation ---');
  const conv1 = await getOrCreateDirectConversation('user-a-1111', 'user-b-2222', dbTenant1);
  assertTest(Boolean(conv1.id), 'Successfully created direct conversation');
  assertTest(conv1.otherUser.id === 'user-b-2222', 'Recipient is identified as otherUser');
  assertTest(conv1.otherUser.fullName === 'Bhavna Kewat', 'Recipient profile display name populated');
  assertTest(conv1.unreadCount === 0, 'Initial unread count is 0');

  console.log('\n--- 2. Duplicate conversation prevention (order-independent uniqueness) ---');
  // Reverse order: user-b starts conversation with user-a
  const conv2 = await getOrCreateDirectConversation('user-b-2222', 'user-a-1111', dbTenant1);
  assertTest(conv2.id === conv1.id, 'Reciprocal request (B -> A) returns identical conversation ID');
  assertTest(conv2.otherUser.id === 'user-a-1111', 'OtherUser correctly points to user-a when initiated by user-b');

  // Verify self-chat rejection
  let selfChatBlocked = false;
  try {
    await getOrCreateDirectConversation('user-a-1111', 'user-a-1111', dbTenant1);
  } catch (err: any) {
    selfChatBlocked = err.message.includes('Cannot start a direct conversation with yourself');
  }
  assertTest(selfChatBlocked, 'Self-chat attempt is strictly rejected (400)');

  // Verify inactive user rejection
  let inactiveUserBlocked = false;
  try {
    await getOrCreateDirectConversation('user-a-1111', 'user-inactive-4444', dbTenant1);
  } catch (err: any) {
    inactiveUserBlocked = err instanceof ChatNotFoundError;
  }
  assertTest(inactiveUserBlocked, 'Direct chat with inactive/suspended member is rejected (404)');

  console.log('\n--- 3. Sending a direct message inside conversation ---');
  const msg1 = await sendDirectMessage(
    conv1.id,
    'user-a-1111',
    'Namaste Bhavna ji, how are you?',
    'temp-uuid-001',
    dbTenant1
  );
  assertTest(Boolean(msg1.id), 'Direct message saved successfully');
  assertTest(msg1.content === 'Namaste Bhavna ji, how are you?', 'Message content matches');
  assertTest(msg1.senderId === 'user-a-1111', 'Sender ID matches');
  assertTest(msg1.sender?.fullName === 'Aarav Kewat', 'Sender profile info attached');

  // Second message from A to B
  await new Promise((r) => setTimeout(r, 10));
  const msg2 = await sendDirectMessage(
    conv1.id,
    'user-a-1111',
    'Are you attending the annual samaj meet?',
    'temp-uuid-002',
    dbTenant1
  );
  assertTest(Boolean(msg2.id), 'Second message saved successfully');

  console.log('\n--- 4. Message history pagination (cursor & limit) ---');
  // Add additional messages
  for (let i = 1; i <= 5; i++) {
    await new Promise((r) => setTimeout(r, 10));
    await sendDirectMessage(conv1.id, 'user-a-1111', `Test pagination message #${i}`, undefined, dbTenant1);
  }

  const page1 = await getDirectMessageHistory(conv1.id, 'user-a-1111', { limit: 3 }, dbTenant1);
  assertTest(page1.messages.length === 3, 'First page respects limit: 3');
  assertTest(page1.hasMore === true, 'hasMore flag is true when more messages exist');
  assertTest(Boolean(page1.nextCursor), 'nextCursor is provided for cursor pagination');

  const page2 = await getDirectMessageHistory(
    conv1.id,
    'user-a-1111',
    { limit: 3, before: page1.nextCursor! },
    dbTenant1
  );
  assertTest(page2.messages.length === 3, 'Second page retrieves next 3 messages');
  assertTest(page2.messages[0].id !== page1.messages[0].id, 'Second page messages differ from first page');

  console.log('\n--- 5. Inbox last-message preview ---');
  const inboxA = await getDirectChatInbox('user-a-1111', {}, dbTenant1);
  assertTest(inboxA.conversations.length === 1, 'Inbox contains 1 active direct conversation');
  assertTest(
    inboxA.conversations[0].lastMessage?.content === 'Test pagination message #5',
    'Inbox reflects most recent message preview'
  );
  assertTest(
    inboxA.conversations[0].otherUser.fullName === 'Bhavna Kewat',
    'Inbox shows other participant name'
  );

  console.log('\n--- 6. Unread count calculation ---');
  // User A sent 7 messages. User B has not opened or read the conversation yet.
  const inboxB = await getDirectChatInbox('user-b-2222', {}, dbTenant1);
  assertTest(inboxB.conversations[0].unreadCount === 7, 'User B has exactly 7 unread messages from User A');

  // User A sent the messages, so User A has 0 unread messages
  const inboxABeforeRead = await getDirectChatInbox('user-a-1111', {}, dbTenant1);
  assertTest(inboxABeforeRead.conversations[0].unreadCount === 0, 'User A has 0 unread messages');

  console.log('\n--- 7. Read status marking ---');
  await new Promise((r) => setTimeout(r, 10));
  const readResult = await markDirectConversationAsRead(conv1.id, 'user-b-2222', dbTenant1);
  assertTest(readResult.conversationId === conv1.id, 'Conversation marked as read for user B');
  assertTest(Boolean(readResult.readAt), 'Read timestamp returned');

  // Verify unread count for B drops to 0
  const inboxBAfterRead = await getDirectChatInbox('user-b-2222', {}, dbTenant1);
  assertTest(inboxBAfterRead.conversations[0].unreadCount === 0, 'User B unread count dropped to 0 after read');

  // Now User B replies to User A
  await new Promise((r) => setTimeout(r, 10));
  await sendDirectMessage(
    conv1.id,
    'user-b-2222',
    'Namaste Aarav bhai, yes I am attending!',
    'temp-uuid-003',
    dbTenant1
  );
  const inboxAAfterReply = await getDirectChatInbox('user-a-1111', {}, dbTenant1);
  assertTest(inboxAAfterReply.conversations[0].unreadCount === 1, 'User A now has 1 unread reply from User B');

  await new Promise((r) => setTimeout(r, 10));
  await markDirectConversationAsRead(conv1.id, 'user-a-1111', dbTenant1);
  const inboxAAfterRead = await getDirectChatInbox('user-a-1111', {}, dbTenant1);
  assertTest(inboxAAfterRead.conversations[0].unreadCount === 0, 'User A unread count dropped to 0 after marking read');

  console.log('\n--- 8. Unauthorized conversation access rejection (403) ---');
  let unauthorizedAccessBlocked = false;
  try {
    await verifyDirectConversationAccess(conv1.id, 'user-c-3333', dbTenant1);
  } catch (err: any) {
    unauthorizedAccessBlocked = err instanceof ForbiddenChatError;
  }
  assertTest(unauthorizedAccessBlocked, 'Third-party User C is denied access to conversation (403 Forbidden)');

  let unauthorizedHistoryBlocked = false;
  try {
    await getDirectMessageHistory(conv1.id, 'user-c-3333', { limit: 10 }, dbTenant1);
  } catch (err: any) {
    unauthorizedHistoryBlocked = err instanceof ForbiddenChatError;
  }
  assertTest(unauthorizedHistoryBlocked, 'Third-party User C cannot fetch message history (403)');

  let unauthorizedSendBlocked = false;
  try {
    await sendDirectMessage(conv1.id, 'user-c-3333', 'Intruder message', undefined, dbTenant1);
  } catch (err: any) {
    unauthorizedSendBlocked = err instanceof ForbiddenChatError;
  }
  assertTest(unauthorizedSendBlocked, 'Third-party User C cannot send messages to conversation (403)');

  console.log('\n--- 9. Cross-tenant isolation ---');
  // Conversation in tenant1 (kewat) does not exist in tenant2 (patel)
  let crossTenantFetchBlocked = false;
  try {
    await verifyDirectConversationAccess(conv1.id, 'user-a-1111', dbTenant2);
  } catch (err: any) {
    crossTenantFetchBlocked = err instanceof ChatNotFoundError;
  }
  assertTest(crossTenantFetchBlocked, 'Conversation does not exist in foreign tenant database (404)');

  const inboxTenant2 = await getDirectChatInbox('user-a-1111', {}, dbTenant2);
  assertTest(inboxTenant2.conversations.length === 0, 'Foreign tenant inbox is completely isolated and empty');

  console.log('\n--- 10. Socket room authorization helper ---');
  const expectedRoomName = 'kewat:conversation:' + conv1.id;
  const actualRoomName = getConversationRoomName('kewat', conv1.id);
  assertTest(actualRoomName === expectedRoomName, 'Socket room name format strictly scoped: tenant:conversation:id');

  console.log('\n--- 11. Duplicate message handling / idempotency (tempId) ---');
  // Testing tempId propagation in response
  const tempIdMsg = await sendDirectMessage(
    conv1.id,
    'user-a-1111',
    'Message with optimistic client tempId',
    'temp-client-abc-123',
    dbTenant1
  );
  assertTest(Boolean(tempIdMsg.id), 'Message with tempId generated database ID');
  assertTest(tempIdMsg.content === 'Message with optimistic client tempId', 'Content verified');

  console.log('\n--- 12. Group Chat regression test (group chat works unchanged) ---');
  // Verify existing group chat functions remain fully operational
  const groupAccess = await verifyGroupChatAccess('grp-yuva-1', 'user-a-1111', false, dbTenant1);
  assertTest(groupAccess.group.name === 'Yuva Mandal', 'Group chat access verification unchanged');

  const groupMsg = await sendChatMessage(
    'grp-yuva-1',
    'user-a-1111',
    'Hello everyone in Yuva Mandal!',
    'group-temp-1',
    dbTenant1
  );
  assertTest(Boolean(groupMsg.id), 'Group chat message sending works unchanged');
  assertTest(groupMsg.groupId === 'grp-yuva-1', 'Group chat message assigned to correct group');

  const groupHistory = await getGroupChatHistory('grp-yuva-1', 'user-a-1111', {}, dbTenant1);
  assertTest(groupHistory.messages.length === 1, 'Group chat message history retrieves group messages');
  assertTest(groupHistory.messages[0].content === 'Hello everyone in Yuva Mandal!', 'Group message content matches');

  console.log('\n================================================================');
  console.log(`   Direct Messaging Suite: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runDirectMessagingSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

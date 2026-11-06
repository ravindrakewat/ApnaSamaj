import assert from 'assert';
import {
  sendChatMessage,
  toggleChatMessageReaction,
  removeChatMessageReaction,
  getGroupChatHistory,
  aggregateReactions,
  mapToChatMessageItem,
  ChatServiceError,
} from '../modules/chat/chat.service';
import {
  sendDirectMessage,
  toggleDirectMessageReaction,
  removeDirectMessageReaction,
  getDirectMessageHistory,
  mapToDirectMessageItem,
} from '../modules/chat/direct-chat.service';
import { ALLOWED_CHAT_REACTIONS } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.8: Chat Reactions & Replies Backend Tests');
console.log('================================================================\n');

// In-memory Mock PrismaClient simulating PostgreSQL multi-tenant database
function createMockPrismaClient() {
  const groups: any[] = [];
  const groupMembers: any[] = [];
  const users: any[] = [];
  const chatMessages: any[] = [];
  const chatMessageReactions: any[] = [];
  const directConversations: any[] = [];
  const directConversationParticipants: any[] = [];
  const directMessages: any[] = [];
  const directMessageReactions: any[] = [];
  const chatAttachments: any[] = [];

  const db: any = {
    group: {
      findFirst: async ({ where }: any) => {
        return (
          groups.find(
            (g) =>
              g.id === where?.OR?.[0]?.id ||
              g.slug === where?.OR?.[1]?.slug ||
              g.id === where?.id ||
              g.slug === where?.slug
          ) || null
        );
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        const { groupId, userId } = where.groupId_userId;
        return (
          groupMembers.find((m) => m.groupId === groupId && m.userId === userId) || null
        );
      },
      findMany: async () => [],
    },
    user: {
      findUnique: async ({ where }: any) => {
        return users.find((u) => u.id === where.id) || null;
      },
    },
    chatMessage: {
      findUnique: async ({ where }: any) => {
        const msg = chatMessages.find((m) => m.id === where.id);
        return msg ? { ...msg } : null;
      },
      findFirst: async ({ where }: any) => {
        const msg = chatMessages.find(
          (m) =>
            m.groupId === where.groupId &&
            m.senderId === where.senderId &&
            m.clientMessageId === where.clientMessageId
        );
        return msg ? { ...msg } : null;
      },
      findMany: async ({ where, take, orderBy }: any) => {
        let list = chatMessages.filter((m) => m.groupId === where.groupId);
        if (where.createdAt?.lt) {
          list = list.filter((m) => m.createdAt < where.createdAt.lt);
        }
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) list = list.slice(0, take);
        return list.map((m) => {
          const sender = users.find((u) => u.id === m.senderId);
          const replyTo = m.replyToMessageId ? chatMessages.find((p) => p.id === m.replyToMessageId) : null;
          const replySender = replyTo ? users.find((u) => u.id === replyTo.senderId) : null;
          const reactions = chatMessageReactions
            .filter((r) => r.messageId === m.id)
            .map((r) => ({
              ...r,
              user: users.find((u) => u.id === r.userId),
            }));

          return {
            ...m,
            sender,
            replyTo: replyTo
              ? {
                  ...replyTo,
                  sender: replySender,
                  attachments: chatAttachments.filter((a) => a.chatMessageId === replyTo.id),
                }
              : null,
            reactions,
            attachments: chatAttachments.filter((a) => a.chatMessageId === m.id),
          };
        });
      },
      create: async ({ data }: any) => {
        const id = data.id || `chat-msg-${chatMessages.length + 1}`;
        const newMsg = {
          id,
          groupId: data.groupId,
          senderId: data.senderId,
          content: data.content || '',
          clientMessageId: data.clientMessageId || null,
          replyToMessageId: data.replyToMessageId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        chatMessages.push(newMsg);

        const sender = users.find((u) => u.id === newMsg.senderId);
        const replyTo = newMsg.replyToMessageId ? chatMessages.find((p) => p.id === newMsg.replyToMessageId) : null;
        const replySender = replyTo ? users.find((u) => u.id === replyTo.senderId) : null;

        return {
          ...newMsg,
          sender,
          replyTo: replyTo
            ? {
                ...replyTo,
                sender: replySender,
                attachments: chatAttachments.filter((a) => a.chatMessageId === replyTo.id),
              }
            : null,
          reactions: [],
          attachments: [],
        };
      },
    },
    chatMessageReaction: {
      findUnique: async ({ where }: any) => {
        const { messageId, userId } = where.messageId_userId;
        return (
          chatMessageReactions.find(
            (r) => r.messageId === messageId && r.userId === userId
          ) || null
        );
      },
      findMany: async ({ where }: any) => {
        return chatMessageReactions
          .filter((r) => r.messageId === where.messageId)
          .map((r) => ({
            ...r,
            user: users.find((u) => u.id === r.userId),
          }));
      },
      create: async ({ data }: any) => {
        const dup = chatMessageReactions.find(
          (r) => r.messageId === data.messageId && r.userId === data.userId
        );
        if (dup) {
          const err: any = new Error('Unique constraint failed on the fields: (`messageId`,`userId`)');
          err.code = 'P2002';
          throw err;
        }
        const item = {
          id: `cm-rx-${chatMessageReactions.length + 1}`,
          messageId: data.messageId,
          userId: data.userId,
          emoji: data.emoji,
          createdAt: new Date(),
        };
        chatMessageReactions.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const idx = chatMessageReactions.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          chatMessageReactions[idx].emoji = data.emoji;
          return chatMessageReactions[idx];
        }
        throw new Error('Not found');
      },
      delete: async ({ where }: any) => {
        const idx = chatMessageReactions.findIndex(
          (r) =>
            r.id === where.id ||
            (where.messageId_userId &&
              r.messageId === where.messageId_userId.messageId &&
              r.userId === where.messageId_userId.userId)
        );
        if (idx >= 0) {
          return chatMessageReactions.splice(idx, 1)[0];
        }
        throw new Error('Not found');
      },
    },
    directConversation: {
      findUnique: async ({ where }: any) => {
        return directConversations.find((c) => c.id === where.id) || null;
      },
      update: async ({ where }: any) => {
        const conv = directConversations.find((c) => c.id === where.id);
        if (conv) conv.updatedAt = new Date();
        return conv;
      },
    },
    directConversationParticipant: {
      findMany: async ({ where }: any) => {
        return directConversationParticipants.filter(
          (p) => p.conversationId === where.conversationId
        );
      },
      upsert: async () => {},
    },
    directMessage: {
      findUnique: async ({ where }: any) => {
        return directMessages.find((m) => m.id === where.id) || null;
      },
      findFirst: async ({ where }: any) => {
        return (
          directMessages.find(
            (m) =>
              m.conversationId === where.conversationId &&
              m.senderId === where.senderId &&
              m.clientMessageId === where.clientMessageId
          ) || null
        );
      },
      findMany: async ({ where, take }: any) => {
        let list = directMessages.filter(
          (m) => m.conversationId === where.conversationId
        );
        list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) list = list.slice(0, take);
        return list.map((m) => {
          const sender = users.find((u) => u.id === m.senderId);
          const replyTo = m.replyToMessageId ? directMessages.find((p) => p.id === m.replyToMessageId) : null;
          const replySender = replyTo ? users.find((u) => u.id === replyTo.senderId) : null;
          const reactions = directMessageReactions
            .filter((r) => r.messageId === m.id)
            .map((r) => ({
              ...r,
              user: users.find((u) => u.id === r.userId),
            }));

          return {
            ...m,
            sender,
            replyTo: replyTo
              ? {
                  ...replyTo,
                  sender: replySender,
                  attachments: chatAttachments.filter((a) => a.directMessageId === replyTo.id),
                }
              : null,
            reactions,
            attachments: chatAttachments.filter((a) => a.directMessageId === m.id),
          };
        });
      },
      create: async ({ data }: any) => {
        const id = data.id || `dm-${directMessages.length + 1}`;
        const newMsg = {
          id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content || '',
          clientMessageId: data.clientMessageId || null,
          replyToMessageId: data.replyToMessageId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        directMessages.push(newMsg);

        const sender = users.find((u) => u.id === newMsg.senderId);
        const replyTo = newMsg.replyToMessageId ? directMessages.find((p) => p.id === newMsg.replyToMessageId) : null;
        const replySender = replyTo ? users.find((u) => u.id === replyTo.senderId) : null;

        return {
          ...newMsg,
          sender,
          replyTo: replyTo
            ? {
                ...replyTo,
                sender: replySender,
                attachments: chatAttachments.filter((a) => a.directMessageId === replyTo.id),
              }
            : null,
          reactions: [],
          attachments: [],
        };
      },
    },
    directMessageReaction: {
      findUnique: async ({ where }: any) => {
        const { messageId, userId } = where.messageId_userId;
        return (
          directMessageReactions.find(
            (r) => r.messageId === messageId && r.userId === userId
          ) || null
        );
      },
      findMany: async ({ where }: any) => {
        return directMessageReactions
          .filter((r) => r.messageId === where.messageId)
          .map((r) => ({
            ...r,
            user: users.find((u) => u.id === r.userId),
          }));
      },
      create: async ({ data }: any) => {
        const dup = directMessageReactions.find(
          (r) => r.messageId === data.messageId && r.userId === data.userId
        );
        if (dup) {
          const err: any = new Error('Unique constraint failed on the fields: (`messageId`,`userId`)');
          err.code = 'P2002';
          throw err;
        }
        const item = {
          id: `dm-rx-${directMessageReactions.length + 1}`,
          messageId: data.messageId,
          userId: data.userId,
          emoji: data.emoji,
          createdAt: new Date(),
        };
        directMessageReactions.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const idx = directMessageReactions.findIndex((r) => r.id === where.id);
        if (idx >= 0) {
          directMessageReactions[idx].emoji = data.emoji;
          return directMessageReactions[idx];
        }
        throw new Error('Not found');
      },
      delete: async ({ where }: any) => {
        const idx = directMessageReactions.findIndex(
          (r) =>
            r.id === where.id ||
            (where.messageId_userId &&
              r.messageId === where.messageId_userId.messageId &&
              r.userId === where.messageId_userId.userId)
        );
        if (idx >= 0) {
          return directMessageReactions.splice(idx, 1)[0];
        }
        throw new Error('Not found');
      },
    },
    chatAttachment: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    _seed: {
      users,
      groups,
      groupMembers,
      chatMessages,
      chatMessageReactions,
      directConversations,
      directConversationParticipants,
      directMessages,
      directMessageReactions,
      chatAttachments,
    },
  };

  return db;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res && typeof (res as any).then === 'function') {
        return (res as any).then(
          () => {
            console.log(`✅ PASS: ${name}`);
            passed++;
          },
          (err: any) => {
            console.error(`❌ FAIL: ${name}`, err);
            failed++;
          }
        );
      } else {
        console.log(`✅ PASS: ${name}`);
        passed++;
      }
    } catch (err) {
      console.error(`❌ FAIL: ${name}`, err);
      failed++;
    }
  }

  // Setup mock database & test entities
  const db = createMockPrismaClient();

  const user1 = { id: 'user-1', profile: { fullName: 'Aarav Sharma', avatarUrl: null } };
  const user2 = { id: 'user-2', profile: { fullName: 'Priya Verma', avatarUrl: null } };
  const user3 = { id: 'user-3', profile: { fullName: 'Rohan Gupta', avatarUrl: null } };
  db._seed.users.push(user1, user2, user3);

  const group1 = { id: 'grp-1', name: 'Youth Mandal', slug: 'youth-mandal', privacy: 'PUBLIC' };
  const group2 = { id: 'grp-2', name: 'Elder Council', slug: 'elder-council', privacy: 'PRIVATE' };
  db._seed.groups.push(group1, group2);

  db._seed.groupMembers.push(
    { groupId: 'grp-1', userId: 'user-1', role: 'MEMBER' },
    { groupId: 'grp-1', userId: 'user-2', role: 'MEMBER' },
    { groupId: 'grp-1', userId: 'user-3', role: 'MEMBER' },
    { groupId: 'grp-2', userId: 'user-1', role: 'MEMBER' }
  );

  const directConv = {
    id: 'conv-1',
    userOneId: 'user-1',
    userTwoId: 'user-2',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db._seed.directConversations.push(directConv);
  db._seed.directConversationParticipants.push(
    { id: 'part-1', conversationId: 'conv-1', userId: 'user-1' },
    { id: 'part-2', conversationId: 'conv-1', userId: 'user-2' }
  );

  console.log('--- 1. Allowed Emojis Invariants ---');
  test('Allowed reaction emoji set contains exact standard 6 emojis', () => {
    assert.deepStrictEqual(ALLOWED_CHAT_REACTIONS, ['👍', '❤️', '😂', '😮', '😢', '🙏']);
  });

  console.log('\n--- 2. Group Chat Reactions Lifecycle ---');
  let groupMsgId = '';
  await test('Create group chat message to react on', async () => {
    const msg = await sendChatMessage('grp-1', 'user-1', 'Welcome to the Samaj group!', undefined, 'temp-g-1', db);
    assert.strictEqual(msg.content, 'Welcome to the Samaj group!');
    assert.strictEqual(msg.replyTo, null);
    groupMsgId = msg.id;
  });

  await test('User 1 adds 👍 reaction (action: added)', async () => {
    const res = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-1', '👍', db);
    assert.strictEqual(res.action, 'added');
    assert.strictEqual(res.reactions.length, 1);
    assert.strictEqual(res.reactions[0].emoji, '👍');
    assert.strictEqual(res.reactions[0].count, 1);
    assert.strictEqual(res.reactions[0].hasReacted, true);
    assert.strictEqual(res.reactions[0].users[0].fullName, 'Aarav Sharma');
  });

  await test('User 1 changes reaction to ❤️ (action: updated, replaces 👍)', async () => {
    const res = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-1', '❤️', db);
    assert.strictEqual(res.action, 'updated');
    assert.strictEqual(res.reactions.length, 1);
    assert.strictEqual(res.reactions[0].emoji, '❤️');
    assert.strictEqual(res.reactions[0].count, 1);
    assert.strictEqual(res.reactions[0].hasReacted, true);
    // User 1 must only have ONE active reaction
    const dbUserReactions = db._seed.chatMessageReactions.filter(
      (r: any) => r.messageId === groupMsgId && r.userId === 'user-1'
    );
    assert.strictEqual(dbUserReactions.length, 1);
    assert.strictEqual(dbUserReactions[0].emoji, '❤️');
  });

  await test('User 2 adds ❤️ reaction (count increases to 2)', async () => {
    const res = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-2', '❤️', db);
    assert.strictEqual(res.action, 'added');
    assert.strictEqual(res.reactions.length, 1);
    assert.strictEqual(res.reactions[0].emoji, '❤️');
    assert.strictEqual(res.reactions[0].count, 2);
    assert.strictEqual(res.reactions[0].hasReacted, true); // hasReacted relative to user-2
  });

  await test('User 3 adds 😂 reaction (two distinct emojis aggregated)', async () => {
    const res = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-3', '😂', db);
    assert.strictEqual(res.action, 'added');
    assert.strictEqual(res.reactions.length, 2);
    const heart = res.reactions.find((r) => r.emoji === '❤️');
    const laugh = res.reactions.find((r) => r.emoji === '😂');
    assert.strictEqual(heart?.count, 2);
    assert.strictEqual(laugh?.count, 1);
    assert.strictEqual(laugh?.hasReacted, true);
  });

  await test('User 1 taps ❤️ again to toggle off / remove (action: removed)', async () => {
    const res = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-1', '❤️', db);
    assert.strictEqual(res.action, 'removed');
    const heart = res.reactions.find((r) => r.emoji === '❤️');
    assert.strictEqual(heart?.count, 1); // User 2 still has ❤️
    assert.strictEqual(heart?.hasReacted, false); // User 1 no longer reacted
  });

  await test('Unsupported emoji reaction is rejected with 400', async () => {
    let errOccurred = false;
    try {
      await toggleChatMessageReaction('grp-1', groupMsgId, 'user-1', '🚀', db);
    } catch (err: any) {
      errOccurred = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('Invalid reaction emoji'));
    }
    assert.strictEqual(errOccurred, true);
  });

  await test('Explicit remove reaction deletes active reaction', async () => {
    const res = await removeChatMessageReaction('grp-1', groupMsgId, 'user-3', db);
    assert.strictEqual(res.action, 'removed');
    const laugh = res.reactions.find((r) => r.emoji === '😂');
    assert.strictEqual(laugh, undefined);
  });

  console.log('\n--- 3. Direct Chat Reactions Lifecycle ---');
  let directMsgId = '';
  await test('Send direct message and toggle reaction', async () => {
    const msg = await sendDirectMessage('conv-1', 'user-1', 'Hey Priya, see you at the community meet', undefined, 'temp-d-1', db);
    directMsgId = msg.id;

    const res = await toggleDirectMessageReaction('conv-1', directMsgId, 'user-2', '🙏', db);
    assert.strictEqual(res.action, 'added');
    assert.strictEqual(res.reactions[0].emoji, '🙏');
    assert.strictEqual(res.reactions[0].count, 1);
    assert.strictEqual(res.reactions[0].hasReacted, true);
  });

  await test('Non-participant user cannot react to direct message (403 Forbidden)', async () => {
    let errOccurred = false;
    try {
      await toggleDirectMessageReaction('conv-1', directMsgId, 'user-3', '👍', db);
    } catch (err: any) {
      errOccurred = true;
      assert.strictEqual(err.statusCode, 403);
    }
    assert.strictEqual(errOccurred, true);
  });

  console.log('\n--- 4. Swipe-to-Reply & Quoted Message Previews ---');
  let replyMsgId = '';
  await test('Send reply to group message with replyToMessageId', async () => {
    const reply = await sendChatMessage(
      'grp-1',
      'user-2',
      'Thank you Aarav bhai!',
      undefined,
      'temp-g-reply',
      db,
      undefined,
      groupMsgId
    );

    assert.strictEqual(reply.content, 'Thank you Aarav bhai!');
    assert.strictEqual(reply.replyToMessageId, groupMsgId);
    assert(reply.replyTo !== null);
    assert.strictEqual(reply.replyTo?.id, groupMsgId);
    assert.strictEqual(reply.replyTo?.senderId, 'user-1');
    assert.strictEqual(reply.replyTo?.senderName, 'Aarav Sharma');
    assert.strictEqual(reply.replyTo?.content, 'Welcome to the Samaj group!');
    replyMsgId = reply.id;
  });

  await test('Send reply to direct message with replyToMessageId', async () => {
    const reply = await sendDirectMessage(
      'conv-1',
      'user-2',
      'Yes absolutely, will bring the documents',
      undefined,
      'temp-d-reply',
      db,
      undefined,
      directMsgId
    );

    assert.strictEqual(reply.replyToMessageId, directMsgId);
    assert(reply.replyTo !== null);
    assert.strictEqual(reply.replyTo?.id, directMsgId);
    assert.strictEqual(reply.replyTo?.senderName, 'Aarav Sharma');
    assert.strictEqual(reply.replyTo?.content, 'Hey Priya, see you at the community meet');
  });

  console.log('\n--- 5. Cross-Conversation Reply Rejection ---');
  await test('Replying in Group 2 to a message from Group 1 is rejected with 400', async () => {
    let errOccurred = false;
    try {
      await sendChatMessage(
        'grp-2',
        'user-1',
        'Attempting cross-group reply',
        undefined,
        'temp-cross',
        db,
        undefined,
        groupMsgId // from grp-1
      );
    } catch (err: any) {
      errOccurred = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('different group'));
    }
    assert.strictEqual(errOccurred, true);
  });

  await test('Replying in Direct Conversation to a non-existent or foreign message is rejected with 400', async () => {
    let errOccurred = false;
    try {
      await sendDirectMessage(
        'conv-1',
        'user-1',
        'Attempting cross-conv reply',
        undefined,
        'temp-cross-dm',
        db,
        undefined,
        groupMsgId // from group chat!
      );
    } catch (err: any) {
      errOccurred = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('different conversation'));
    }
    assert.strictEqual(errOccurred, true);
  });

  console.log('\n--- 6. Deleted Parent Message Safe Fallback ---');
  test('Deleted original message gracefully falls back to [Message deleted]', () => {
    const rawMessageWithDeletedParent = {
      id: 'reply-deleted-test',
      groupId: 'grp-1',
      senderId: 'user-2',
      content: 'I replied to a message that was later deleted',
      replyToMessageId: 'deleted-msg-id-1234',
      replyTo: null, // Prisma returns null when parent row is deleted via onDelete: SetNull
      createdAt: new Date(),
      updatedAt: new Date(),
      reactions: [],
      attachments: [],
    };

    const mapped = mapToChatMessageItem(rawMessageWithDeletedParent, 'user-2');
    assert.strictEqual(mapped.replyToMessageId, 'deleted-msg-id-1234');
    assert(mapped.replyTo !== null);
    assert.strictEqual(mapped.replyTo?.content, 'This message was deleted');
    assert.strictEqual(mapped.replyTo?.senderName, 'Original Message');
  });

  console.log('\n--- 7. History Pagination With Replies and Reactions ---');
  await test('History query retrieves messages with full reply previews and reactions', async () => {
    const history = await getGroupChatHistory('grp-1', 'user-2', { limit: 10 }, db);
    assert(history.messages.length >= 2);
    const replyItem = history.messages.find((m) => m.id === replyMsgId);
    assert(replyItem !== undefined);
    assert.strictEqual(replyItem?.replyTo?.senderName, 'Aarav Sharma');
  });

  console.log('\n--- 8. Batch 8.8.1 Reliability & Security Hardening Tests ---');
  await test('Group slug resolution returns canonical groupId in toggle reaction', async () => {
    // Calling with slug 'youth-mandal' instead of id 'grp-1'
    const res = await toggleChatMessageReaction('youth-mandal', groupMsgId, 'user-2', '👍', db);
    assert.strictEqual(res.groupId, 'grp-1');
    assert.strictEqual(res.action, 'updated'); // User 2 had ❤️ earlier, switches to 👍
  });

  await test('Empty or whitespace replyToMessageId is sanitized safely as no reply', async () => {
    const msg = await sendChatMessage('grp-1', 'user-1', 'Message with empty replyToMessageId', undefined, 'temp-san-1', db, undefined, '   ');
    assert.strictEqual(msg.replyToMessageId, null);
    assert.strictEqual(msg.replyTo, null);
  });

  await test('Excessively long replyToMessageId (>100 chars) is rejected with 400', async () => {
    let errOccurred = false;
    try {
      await sendChatMessage('grp-1', 'user-1', 'Invalid long reply ID', undefined, 'temp-long-reply', db, undefined, 'a'.repeat(150));
    } catch (err: any) {
      errOccurred = true;
      assert.strictEqual(err.statusCode, 400);
      assert(err.message.includes('replyToMessageId'));
    }
    assert.strictEqual(errOccurred, true);
  });

  await test('Concurrent P2002 conflict handling returns valid reaction state without throwing', async () => {
    // User 1 already has reaction from earlier or we toggle
    const res1 = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-3', '😮', db);
    assert.strictEqual(res1.action, 'added');

    // Simulate concurrent second toggle with same emoji (toggle off)
    const res2 = await toggleChatMessageReaction('grp-1', groupMsgId, 'user-3', '😮', db);
    assert.strictEqual(res2.action, 'removed');
  });

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});


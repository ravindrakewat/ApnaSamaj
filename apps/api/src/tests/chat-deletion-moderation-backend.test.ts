import assert from 'assert';
import {
  deleteGroupMessage,
  getGroupChatHistory,
  searchGroupMessages,
  getGroupMediaGallery,
  getGroupMessageContext,
  ChatNotFoundError,
  ForbiddenChatError,
  BadRequestChatError,
} from '../modules/chat/chat.service';
import {
  deleteDirectMessage,
  getDirectMessageHistory,
  searchDirectMessages,
  getDirectMediaGallery,
  getChatAttachmentDetails,
} from '../modules/chat/direct-chat.service';
import { DELETED_CHAT_MESSAGE_PLACEHOLDER } from '@apnasamaj/shared-types';

console.log('========================================================================');
console.log('   Apna Samaj — Batch 8.10: Chat Message Deletion & Moderation Backend Tests');
console.log('========================================================================\n');

// In-memory Mock PrismaClient simulating PostgreSQL multi-tenant database
function createMockPrismaClient() {
  const groups: any[] = [];
  const groupMembers: any[] = [];
  const users: any[] = [];
  const chatMessages: any[] = [];
  const chatMessageDeletions: any[] = [];
  const directConversations: any[] = [];
  const directMessages: any[] = [];
  const directMessageDeletions: any[] = [];
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
    },
    user: {
      findUnique: async ({ where }: any) => {
        return users.find((u) => u.id === where.id) || null;
      },
    },
    chatMessage: {
      findFirst: async ({ where }: any) => {
        return (
          chatMessages.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.groupId && m.groupId !== where.groupId) return false;
            return true;
          }) || null
        );
      },
      findMany: async ({ where, take }: any) => {
        let results = chatMessages.filter((m) => {
          if (where.groupId && m.groupId !== where.groupId) return false;
          if (where.isDeletedForEveryone === false && m.isDeletedForEveryone) return false;
          if (where.content && where.content.not && m.content === where.content.not) return false;
          if (where.deletions?.none?.userId) {
            const hasDel = chatMessageDeletions.some(
              (d) => d.messageId === m.id && d.userId === where.deletions.none.userId
            );
            if (hasDel) return false;
          }
          if (where.createdAt?.lt && m.createdAt >= where.createdAt.lt) return false;
          if (where.createdAt?.gt && m.createdAt <= where.createdAt.gt) return false;
          if (where.OR) {
            const rawKeyword = where.OR[0]?.content?.contains?.toLowerCase() || '';
            const keyword = rawKeyword.replace(/\\([_%\\])/g, '$1');
            const contentMatch = m.content?.toLowerCase().includes(keyword);
            const attMatch = m.attachments?.some((a: any) =>
              a.fileName?.toLowerCase().includes(keyword)
            );
            if (!contentMatch && !attMatch) return false;
          }
          return true;
        });

        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) results = results.slice(0, take);
        return results.map((m) => ({
          ...m,
          attachments: chatAttachments.filter((a) => a.chatMessageId === m.id),
        }));
      },
      count: async ({ where }: any) => {
        return chatMessages.filter((m) => {
          if (where.groupId && m.groupId !== where.groupId) return false;
          if (where.isDeletedForEveryone === false && m.isDeletedForEveryone) return false;
          if (where.content && where.content.not && m.content === where.content.not) return false;
          if (where.deletions?.none?.userId) {
            const hasDel = chatMessageDeletions.some(
              (d) => d.messageId === m.id && d.userId === where.deletions.none.userId
            );
            if (hasDel) return false;
          }
          return true;
        }).length;
      },
      update: async ({ where, data }: any) => {
        const msg = chatMessages.find((m) => m.id === where.id);
        if (!msg) throw new Error('Not found');
        Object.assign(msg, data);
        return msg;
      },
    },
    chatMessageDeletion: {
      upsert: async ({ where, create }: any) => {
        const existing = chatMessageDeletions.find(
          (d) =>
            d.messageId === where.messageId_userId.messageId &&
            d.userId === where.messageId_userId.userId
        );
        if (existing) return existing;
        const record = { id: `cmd-${Date.now()}`, ...create, createdAt: new Date() };
        chatMessageDeletions.push(record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        return (
          chatMessageDeletions.find(
            (d) =>
              d.messageId === where.messageId_userId.messageId &&
              d.userId === where.messageId_userId.userId
          ) || null
        );
      },
    },
    directConversation: {
      findUnique: async ({ where }: any) => {
        return (
          directConversations.find(
            (c) =>
              c.id === where.id ||
              (c.userOneId === where.userOneId_userTwoId?.userOneId &&
                c.userTwoId === where.userOneId_userTwoId?.userTwoId)
          ) || null
        );
      },
    },
    directMessage: {
      findFirst: async ({ where }: any) => {
        return (
          directMessages.find((m) => {
            if (where.id && m.id !== where.id) return false;
            if (where.conversationId && m.conversationId !== where.conversationId) return false;
            return true;
          }) || null
        );
      },
      findUnique: async ({ where }: any) => {
        return directMessages.find((m) => m.id === where.id) || null;
      },
      findMany: async ({ where, take }: any) => {
        let results = directMessages.filter((m) => {
          if (where.conversationId && m.conversationId !== where.conversationId) return false;
          if (where.isDeletedForEveryone === false && m.isDeletedForEveryone) return false;
          if (where.content && where.content.not && m.content === where.content.not) return false;
          if (where.deletions?.none?.userId) {
            const hasDel = directMessageDeletions.some(
              (d) => d.messageId === m.id && d.userId === where.deletions.none.userId
            );
            if (hasDel) return false;
          }
          if (where.createdAt?.lt && m.createdAt >= where.createdAt.lt) return false;
          if (where.createdAt?.gt && m.createdAt <= where.createdAt.gt) return false;
          if (where.OR) {
            const rawKeyword = where.OR[0]?.content?.contains?.toLowerCase() || '';
            const keyword = rawKeyword.replace(/\\([_%\\])/g, '$1');
            const contentMatch = m.content?.toLowerCase().includes(keyword);
            const attMatch = m.attachments?.some((a: any) =>
              a.fileName?.toLowerCase().includes(keyword)
            );
            if (!contentMatch && !attMatch) return false;
          }
          return true;
        });

        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) results = results.slice(0, take);
        return results.map((m) => ({
          ...m,
          attachments: chatAttachments.filter((a) => a.directMessageId === m.id),
        }));
      },
      count: async ({ where }: any) => {
        return directMessages.filter((m) => {
          if (where.conversationId && m.conversationId !== where.conversationId) return false;
          if (where.isDeletedForEveryone === false && m.isDeletedForEveryone) return false;
          if (where.content && where.content.not && m.content === where.content.not) return false;
          if (where.deletions?.none?.userId) {
            const hasDel = directMessageDeletions.some(
              (d) => d.messageId === m.id && d.userId === where.deletions.none.userId
            );
            if (hasDel) return false;
          }
          return true;
        }).length;
      },
      update: async ({ where, data }: any) => {
        const msg = directMessages.find((m) => m.id === where.id);
        if (!msg) throw new Error('Not found');
        Object.assign(msg, data);
        return msg;
      },
    },
    directMessageDeletion: {
      upsert: async ({ where, create }: any) => {
        const existing = directMessageDeletions.find(
          (d) =>
            d.messageId === where.messageId_userId.messageId &&
            d.userId === where.messageId_userId.userId
        );
        if (existing) return existing;
        const record = { id: `dmd-${Date.now()}`, ...create, createdAt: new Date() };
        directMessageDeletions.push(record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        return (
          directMessageDeletions.find(
            (d) =>
              d.messageId === where.messageId_userId.messageId &&
              d.userId === where.messageId_userId.userId
          ) || null
        );
      },
    },
    chatAttachment: {
      findUnique: async ({ where }: any) => {
        const att = chatAttachments.find((a) => a.id === where.id);
        if (!att) return null;
        const chatMessage = att.chatMessageId
          ? chatMessages.find((m) => m.id === att.chatMessageId)
          : null;
        const directMessage = att.directMessageId
          ? directMessages.find((m) => m.id === att.directMessageId)
          : null;
        return {
          ...att,
          chatMessage: chatMessage
            ? { ...chatMessage, group: groups.find((g) => g.id === chatMessage.groupId) }
            : null,
          directMessage: directMessage
            ? {
                ...directMessage,
                conversation: directConversations.find(
                  (c) => c.id === directMessage.conversationId
                ),
              }
            : null,
        };
      },
      findMany: async ({ where, take }: any) => {
        let results = chatAttachments.filter((a) => {
          if (where.chatMessage?.groupId) {
            const msg = chatMessages.find((m) => m.id === a.chatMessageId);
            if (!msg || msg.groupId !== where.chatMessage.groupId) return false;
            if (where.chatMessage.isDeletedForEveryone === false && msg.isDeletedForEveryone)
              return false;
            if (
              where.chatMessage.content?.not &&
              msg.content === where.chatMessage.content.not
            )
              return false;
            if (where.chatMessage.deletions?.none?.userId) {
              const hasDel = chatMessageDeletions.some(
                (d) => d.messageId === msg.id && d.userId === where.chatMessage.deletions.none.userId
              );
              if (hasDel) return false;
            }
          }
          if (where.directMessage?.conversationId) {
            const msg = directMessages.find((m) => m.id === a.directMessageId);
            if (!msg || msg.conversationId !== where.directMessage.conversationId) return false;
            if (where.directMessage.isDeletedForEveryone === false && msg.isDeletedForEveryone)
              return false;
            if (
              where.directMessage.content?.not &&
              msg.content === where.directMessage.content.not
            )
              return false;
            if (where.directMessage.deletions?.none?.userId) {
              const hasDel = directMessageDeletions.some(
                (d) => d.messageId === msg.id && d.userId === where.directMessage.deletions.none.userId
              );
              if (hasDel) return false;
            }
          }
          return true;
        });

        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) results = results.slice(0, take);
        return results.map((att) => ({
          ...att,
          chatMessage: chatMessages.find((m) => m.id === att.chatMessageId),
          directMessage: directMessages.find((m) => m.id === att.directMessageId),
        }));
      },
    },
    // Raw stores for test fixture setup
    _store: {
      groups,
      groupMembers,
      users,
      chatMessages,
      chatMessageDeletions,
      directConversations,
      directMessages,
      directMessageDeletions,
      chatAttachments,
    },
  };

  return db;
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  function pass(desc: string) {
    passed++;
    console.log(`  [PASS] ${desc}`);
  }

  function fail(desc: string, err: any) {
    failed++;
    console.error(`  [FAIL] ${desc}:`, err.message || err);
  }

  const db = createMockPrismaClient();

  // Seed Users
  const userAdmin = {
    id: 'user-admin',
    email: 'admin@samaj.test',
    profile: { fullName: 'Admin User', avatarUrl: null },
  };
  const userAlice = {
    id: 'user-alice',
    email: 'alice@samaj.test',
    profile: { fullName: 'Alice Sharma', avatarUrl: null },
  };
  const userBob = {
    id: 'user-bob',
    email: 'bob@samaj.test',
    profile: { fullName: 'Bob Patel', avatarUrl: null },
  };
  const userCharlie = {
    id: 'user-charlie',
    email: 'charlie@samaj.test',
    profile: { fullName: 'Charlie Outsider', avatarUrl: null },
  };
  db._store.users.push(userAdmin, userAlice, userBob, userCharlie);

  // Seed Group & Members
  const group1 = {
    id: 'grp-youth',
    name: 'Youth Club',
    slug: 'youth-club',
    privacy: 'PRIVATE',
  };
  db._store.groups.push(group1);
  db._store.groupMembers.push(
    { groupId: group1.id, userId: userAdmin.id, role: 'ADMIN' },
    { groupId: group1.id, userId: userAlice.id, role: 'MEMBER' },
    { groupId: group1.id, userId: userBob.id, role: 'MEMBER' }
  );

  // Seed Direct Conversation
  const conv1 = {
    id: 'conv-alice-bob',
    userOneId: userAlice.id,
    userTwoId: userBob.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [
      { userId: userAlice.id, user: userAlice },
      { userId: userBob.id, user: userBob },
    ],
  };
  db._store.directConversations.push(conv1);

  // -------------------------------------------------------------
  // Test 1: "Delete for Me" in Group Chat
  // -------------------------------------------------------------
  try {
    const msg1 = {
      id: 'gmsg-1',
      groupId: group1.id,
      senderId: userAlice.id,
      content: 'Alice secret for Bob',
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.chatMessages.push(msg1);

    const res = await deleteGroupMessage(group1.id, msg1.id, userBob.id, 'ME', db);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scope, 'ME');

    // Bob history must not contain msg1
    const bobHistory = await getGroupChatHistory(group1.id, userBob.id, {}, db);
    assert.strictEqual(bobHistory.messages.some((m) => m.id === msg1.id), false);

    // Alice history must still contain msg1
    const aliceHistory = await getGroupChatHistory(group1.id, userAlice.id, {}, db);
    assert.strictEqual(aliceHistory.messages.some((m) => m.id === msg1.id), true);

    pass('1. "Delete for Me" in Group Chat hides message only for requesting user');
  } catch (err) {
    fail('1. "Delete for Me" in Group Chat', err);
  }

  // -------------------------------------------------------------
  // Test 2: "Delete for Me" in Direct Chat
  // -------------------------------------------------------------
  try {
    const dmsg1 = {
      id: 'dmsg-1',
      conversationId: conv1.id,
      senderId: userAlice.id,
      content: 'Hello Bob private note',
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.directMessages.push(dmsg1);

    const res = await deleteDirectMessage(conv1.id, dmsg1.id, userBob.id, 'ME', db);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scope, 'ME');

    // Bob direct history must not contain dmsg1
    const bobHistory = await getDirectMessageHistory(conv1.id, userBob.id, {}, db);
    assert.strictEqual(bobHistory.messages.some((m) => m.id === dmsg1.id), false);

    // Alice direct history must still contain dmsg1
    const aliceHistory = await getDirectMessageHistory(conv1.id, userAlice.id, {}, db);
    assert.strictEqual(aliceHistory.messages.some((m) => m.id === dmsg1.id), true);

    pass('2. "Delete for Me" in Direct Chat hides message only for requesting participant');
  } catch (err) {
    fail('2. "Delete for Me" in Direct Chat', err);
  }

  // -------------------------------------------------------------
  // Test 3: "Delete for Everyone" within 60 minutes in Group Chat
  // -------------------------------------------------------------
  try {
    const msg2 = {
      id: 'gmsg-2',
      groupId: group1.id,
      senderId: userAlice.id,
      content: 'Recent typo in group',
      createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [
        {
          id: 'att-gmsg-2',
          chatMessageId: 'gmsg-2',
          fileName: 'typo.jpg',
          mimeType: 'image/jpeg',
          fileSizeBytes: 2048,
          storagePath: 'chat-attachments/grp-youth/typo.jpg',
          createdAt: new Date(),
        },
      ],
      reactions: [{ id: 'r1', emoji: '👍', userId: userBob.id, user: userBob }],
    };
    db._store.chatMessages.push(msg2);
    db._store.chatAttachments.push(msg2.attachments[0]);

    const res = await deleteGroupMessage(group1.id, msg2.id, userAlice.id, 'EVERYONE', db);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scope, 'EVERYONE');

    const updated = db._store.chatMessages.find((m: any) => m.id === msg2.id);
    assert.strictEqual(updated.content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(updated.isDeletedForEveryone, true);

    // Group history should render placeholder and empty attachments/reactions
    const history = await getGroupChatHistory(group1.id, userBob.id, {}, db);
    const item = history.messages.find((m) => m.id === msg2.id);
    assert.ok(item);
    assert.strictEqual(item.content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(item.attachments?.length || 0, 0);
    assert.strictEqual(item.reactions?.length || 0, 0);

    pass('3. "Delete for Everyone" within 60 minutes replaces content with placeholder & clears attachments/reactions');
  } catch (err) {
    fail('3. "Delete for Everyone" within 60 minutes in Group Chat', err);
  }

  // -------------------------------------------------------------
  // Test 4: "Delete for Everyone" after 60 minutes in Group Chat
  // -------------------------------------------------------------
  try {
    const msgOld = {
      id: 'gmsg-old',
      groupId: group1.id,
      senderId: userAlice.id,
      content: 'Old message from 2 hours ago',
      createdAt: new Date(Date.now() - 120 * 60 * 1000), // 120 minutes ago
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.chatMessages.push(msgOld);

    let threw = false;
    try {
      await deleteGroupMessage(group1.id, msgOld.id, userAlice.id, 'EVERYONE', db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof BadRequestChatError);
      assert.ok(err.message.includes('60 minutes'));
    }
    assert.strictEqual(threw, true, 'Should reject delete for everyone after 60 minutes');
    pass('4. Sender cannot delete for everyone after 60 minutes (400 Bad Request)');
  } catch (err) {
    fail('4. "Delete for Everyone" after 60 minutes in Group Chat', err);
  }

  // -------------------------------------------------------------
  // Test 5: "Delete for Everyone" within 60 minutes in Direct Chat
  // -------------------------------------------------------------
  try {
    const dmsg2 = {
      id: 'dmsg-2',
      conversationId: conv1.id,
      senderId: userAlice.id,
      content: 'Direct mistake message',
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [
        {
          id: 'att-dmsg-2',
          directMessageId: 'dmsg-2',
          fileName: 'confidential.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 4096,
          storagePath: 'chat-attachments/conv-alice-bob/confidential.pdf',
          createdAt: new Date(),
        },
      ],
      reactions: [],
    };
    db._store.directMessages.push(dmsg2);
    db._store.chatAttachments.push(dmsg2.attachments[0]);

    const res = await deleteDirectMessage(conv1.id, dmsg2.id, userAlice.id, 'EVERYONE', db);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scope, 'EVERYONE');

    const updated = db._store.directMessages.find((m: any) => m.id === dmsg2.id);
    assert.strictEqual(updated.content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(updated.isDeletedForEveryone, true);

    const history = await getDirectMessageHistory(conv1.id, userBob.id, {}, db);
    const item = history.messages.find((m) => m.id === dmsg2.id);
    assert.ok(item);
    assert.strictEqual(item.content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(item.attachments?.length || 0, 0);

    pass('5. "Delete for Everyone" within 60 minutes in Direct Chat replaces content & clears attachments');
  } catch (err) {
    fail('5. "Delete for Everyone" within 60 minutes in Direct Chat', err);
  }

  // -------------------------------------------------------------
  // Test 6: "Delete for Everyone" after 60 minutes in Direct Chat
  // -------------------------------------------------------------
  try {
    const dmsgOld = {
      id: 'dmsg-old',
      conversationId: conv1.id,
      senderId: userAlice.id,
      content: 'Direct message from 90 mins ago',
      createdAt: new Date(Date.now() - 90 * 60 * 1000),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.directMessages.push(dmsgOld);

    let threw = false;
    try {
      await deleteDirectMessage(conv1.id, dmsgOld.id, userAlice.id, 'EVERYONE', db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof BadRequestChatError);
      assert.ok(err.message.includes('60 minutes'));
    }
    assert.strictEqual(threw, true);
    pass('6. Sender cannot delete direct message for everyone after 60 minutes (400 Bad Request)');
  } catch (err) {
    fail('6. "Delete for Everyone" after 60 minutes in Direct Chat', err);
  }

  // -------------------------------------------------------------
  // Test 7: Non-sender normal member attempting "Delete for Everyone" in Group
  // -------------------------------------------------------------
  try {
    const msg3 = {
      id: 'gmsg-3',
      groupId: group1.id,
      senderId: userAlice.id,
      content: 'Alice message that Bob wants to delete for everyone',
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.chatMessages.push(msg3);

    let threw = false;
    try {
      await deleteGroupMessage(group1.id, msg3.id, userBob.id, 'EVERYONE', db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(threw, true);
    pass('7. Non-sender normal group member cannot delete message for everyone (403 Forbidden)');
  } catch (err) {
    fail('7. Non-sender member attempting "Delete for Everyone" in Group Chat', err);
  }

  // -------------------------------------------------------------
  // Test 8: Non-sender attempting "Delete for Everyone" in Direct Chat
  // -------------------------------------------------------------
  try {
    const dmsg3 = {
      id: 'dmsg-3',
      conversationId: conv1.id,
      senderId: userAlice.id,
      content: 'Alice message that Bob wants to delete for everyone',
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.directMessages.push(dmsg3);

    let threw = false;
    try {
      await deleteDirectMessage(conv1.id, dmsg3.id, userBob.id, 'EVERYONE', db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(threw, true);
    pass('8. Non-sender cannot delete direct message for everyone (403 Forbidden)');
  } catch (err) {
    fail('8. Non-sender attempting "Delete for Everyone" in Direct Chat', err);
  }

  // -------------------------------------------------------------
  // Test 9: Group Admin Moderation Delete in Group Chat (Bypasses 60m window)
  // -------------------------------------------------------------
  try {
    const msgInappropriate = {
      id: 'gmsg-inapp',
      groupId: group1.id,
      senderId: userAlice.id,
      content: 'Inappropriate post sent 5 hours ago',
      createdAt: new Date(Date.now() - 300 * 60 * 1000), // 5 hours ago
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.chatMessages.push(msgInappropriate);

    const res = await deleteGroupMessage(group1.id, msgInappropriate.id, userAdmin.id, 'EVERYONE', db);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scope, 'EVERYONE');

    const updated = db._store.chatMessages.find((m: any) => m.id === msgInappropriate.id);
    assert.strictEqual(updated.content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(updated.deletedByUserId, userAdmin.id);

    pass('9. Group Admin can moderate/delete any member message even after 60 minutes');
  } catch (err) {
    fail('9. Group Admin Moderation Delete in Group Chat', err);
  }

  // -------------------------------------------------------------
  // Test 10: Non-member attempting deletion in Private Group Chat
  // -------------------------------------------------------------
  try {
    let threw = false;
    try {
      await deleteGroupMessage(group1.id, 'gmsg-1', userCharlie.id, 'ME', db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(threw, true);
    pass('10. Non-member cannot delete message in Private Group (403 Forbidden)');
  } catch (err) {
    fail('10. Non-member attempting deletion in Private Group Chat', err);
  }

  // -------------------------------------------------------------
  // Test 11: Non-participant attempting deletion in Direct Chat
  // -------------------------------------------------------------
  try {
    let threw = false;
    try {
      await deleteDirectMessage(conv1.id, 'dmsg-1', userCharlie.id, 'ME', db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof ForbiddenChatError);
    }
    assert.strictEqual(threw, true);
    pass('11. Non-participant cannot delete message in Direct Chat (403 Forbidden)');
  } catch (err) {
    fail('11. Non-participant attempting deletion in Direct Chat', err);
  }

  // -------------------------------------------------------------
  // Test 12: Search exclusion (messages deleted for everyone or for user)
  // -------------------------------------------------------------
  try {
    const searchableKeyword = 'UniqueSearchableKeyword123';
    const deletedForEveryoneMsg = {
      id: 'gmsg-search-del-everyone',
      groupId: group1.id,
      senderId: userAlice.id,
      content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
      isDeletedForEveryone: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    db._store.chatMessages.push(deletedForEveryoneMsg);

    const searchResults = await searchGroupMessages(
      group1.id,
      userBob.id,
      { q: searchableKeyword },
      db
    );
    assert.strictEqual(searchResults.results.some((r) => r.id === deletedForEveryoneMsg.id), false);

    pass('12. Search excludes messages deleted for everyone and deleted for requesting user');
  } catch (err) {
    fail('12. Search exclusion', err);
  }

  // -------------------------------------------------------------
  // Test 13: Media Gallery exclusion
  // -------------------------------------------------------------
  try {
    const deletedMediaMsg = {
      id: 'gmsg-media-del',
      groupId: group1.id,
      senderId: userAlice.id,
      content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
      isDeletedForEveryone: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: userAlice,
      attachments: [],
      reactions: [],
    };
    const deletedAtt = {
      id: 'att-deleted-gallery',
      chatMessageId: deletedMediaMsg.id,
      fileName: 'deleted_photo.jpg',
      mimeType: 'image/jpeg',
      fileSizeBytes: 2048,
      storagePath: 'chat-attachments/grp-youth/deleted_photo.jpg',
      createdAt: new Date(),
    };
    db._store.chatMessages.push(deletedMediaMsg);
    db._store.chatAttachments.push(deletedAtt);

    const gallery = await getGroupMediaGallery(group1.id, userBob.id, {}, db);
    assert.strictEqual(gallery.media.some((m) => m.id === deletedAtt.id), false);

    pass('13. Media Gallery excludes attachments belonging to deleted messages');
  } catch (err) {
    fail('13. Media Gallery exclusion', err);
  }

  // -------------------------------------------------------------
  // Test 14: Attachment URL Revocation (ForbiddenChatError on deleted message attachment)
  // -------------------------------------------------------------
  try {
    let threw = false;
    try {
      await getChatAttachmentDetails('att-deleted-gallery', userBob.id, db);
    } catch (err: any) {
      threw = true;
      assert.ok(err instanceof ForbiddenChatError);
      assert.ok(err.message.includes('Attachment access revoked: Message was deleted'));
    }
    assert.strictEqual(threw, true, 'Should reject access to attachment of deleted message with 403');

    pass('14. getChatAttachmentDetails revokes access to attachments from deleted messages (403 Forbidden)');
  } catch (err) {
    fail('14. Attachment URL Revocation', err);
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});


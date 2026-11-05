import assert from 'node:assert';
import { chatIdempotencyService } from '../modules/chat/chat-idempotency.service';
import { sendChatMessage } from '../modules/chat/chat.service';
import { sendDirectMessage } from '../modules/chat/direct-chat.service';
import { PrismaClient } from '@apnasamaj/database';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.6: Chat Backend Idempotency Test Suite  ');
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

// ---------------------------------------------------------------------------
// In-Memory Mock Prisma Client Factory for Idempotency Testing
// ---------------------------------------------------------------------------
interface MockDataStore {
  groups: any[];
  groupMembers: any[];
  chatMessages: any[];
  directConversations: any[];
  directParticipants: any[];
  directMessages: any[];
  attachments: any[];
  users: any[];
}

function createMockPrismaClient(): PrismaClient {
  const store: MockDataStore = {
    groups: [
      {
        id: 'group-100',
        name: 'Yuva Mandal',
        slug: 'yuva-mandal',
        privacy: 'PUBLIC',
      },
      {
        id: 'group-private-200',
        name: 'Admins Only',
        slug: 'admins-only',
        privacy: 'PRIVATE',
      },
    ],
    groupMembers: [
      { groupId: 'group-100', userId: 'user-sender' },
      { groupId: 'group-100', userId: 'user-other' },
      { groupId: 'group-private-200', userId: 'user-sender' },
    ],
    chatMessages: [],
    attachments: [],
    directConversations: [
      {
        id: 'conv-100',
        userOneId: 'user-sender',
        userTwoId: 'user-recipient',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    directParticipants: [
      { conversationId: 'conv-100', userId: 'user-sender', lastReadAt: null },
      { conversationId: 'conv-100', userId: 'user-recipient', lastReadAt: null },
    ],
    directMessages: [],
    users: [
      {
        id: 'user-sender',
        profile: { fullName: 'Sunil Kewat', avatarUrl: null },
        status: 'ACTIVE',
      },
      {
        id: 'user-recipient',
        profile: { fullName: 'Aakash Kewat', avatarUrl: null },
        status: 'ACTIVE',
      },
    ],
  };

  const client: any = {
    group: {
      findFirst: async ({ where }: any) => {
        const idOrSlug = where?.OR?.[0]?.id || where?.id || where?.slug;
        return store.groups.find((g) => g.id === idOrSlug || g.slug === idOrSlug) || null;
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        const { groupId, userId } = where.groupId_userId;
        return store.groupMembers.find((m) => m.groupId === groupId && m.userId === userId) || null;
      },
      findMany: async ({ where }: any) => {
        return store.groupMembers.filter((m) => {
          if (m.groupId !== where.groupId) return false;
          if (where.userId?.not && m.userId === where.userId.not) return false;
          return true;
        });
      },
    },
    chatMessage: {
      findFirst: async ({ where }: any) => {
        return (
          store.chatMessages.find((m) => {
            if (where.groupId && m.groupId !== where.groupId) return false;
            if (where.senderId && m.senderId !== where.senderId) return false;
            if (where.clientMessageId && m.clientMessageId !== where.clientMessageId) return false;
            return true;
          }) || null
        );
      },
      create: async ({ data, include }: any) => {
        // Enforce uniqueness constraint emulation
        if (data.clientMessageId) {
          const duplicate = store.chatMessages.find(
            (m) =>
              m.groupId === data.groupId &&
              m.senderId === data.senderId &&
              m.clientMessageId === data.clientMessageId
          );
          if (duplicate) {
            const err: any = new Error('Unique constraint failed on the fields: (`groupId`,`senderId`,`clientMessageId`)');
            err.code = 'P2002';
            throw err;
          }
        }

        const sender = store.users.find((u) => u.id === data.senderId);
        const record = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          groupId: data.groupId,
          senderId: data.senderId,
          content: data.content,
          clientMessageId: data.clientMessageId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          sender,
          attachments: [],
        };
        store.chatMessages.push(record);
        return record;
      },
    },
    directConversation: {
      findUnique: async ({ where }: any) => {
        return store.directConversations.find((c) => c.id === where.id) || null;
      },
      update: async ({ where, data }: any) => {
        const conv = store.directConversations.find((c) => c.id === where.id);
        if (conv) Object.assign(conv, data);
        return conv;
      },
    },
    directConversationParticipant: {
      upsert: async ({ where, create, update }: any) => {
        const { conversationId, userId } = where.conversationId_userId;
        let part = store.directParticipants.find(
          (p) => p.conversationId === conversationId && p.userId === userId
        );
        if (part) {
          Object.assign(part, update);
        } else {
          part = { ...create };
          store.directParticipants.push(part);
        }
        return part;
      },
    },
    directMessage: {
      findFirst: async ({ where }: any) => {
        return (
          store.directMessages.find((m) => {
            if (where.conversationId && m.conversationId !== where.conversationId) return false;
            if (where.senderId && m.senderId !== where.senderId) return false;
            if (where.clientMessageId && m.clientMessageId !== where.clientMessageId) return false;
            return true;
          }) || null
        );
      },
      create: async ({ data, include }: any) => {
        // Enforce uniqueness constraint emulation
        if (data.clientMessageId) {
          const duplicate = store.directMessages.find(
            (m) =>
              m.conversationId === data.conversationId &&
              m.senderId === data.senderId &&
              m.clientMessageId === data.clientMessageId
          );
          if (duplicate) {
            const err: any = new Error('Unique constraint failed on the fields: (`conversationId`,`senderId`,`clientMessageId`)');
            err.code = 'P2002';
            throw err;
          }
        }

        const sender = store.users.find((u) => u.id === data.senderId);
        const attList: any[] = [];
        if (data.attachments?.create) {
          const att = {
            id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            ...data.attachments.create,
            createdAt: new Date(),
          };
          store.attachments.push(att);
          attList.push(att);
        }

        const record = {
          id: `dir-msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content,
          clientMessageId: data.clientMessageId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
          sender,
          attachments: attList,
        };
        store.directMessages.push(record);
        return record;
      },
    },
    chatAttachment: {
      findFirst: async ({ where }: any) => {
        return (
          store.attachments.find((a: any) => {
            if (where.storagePath && a.storagePath !== where.storagePath) return false;
            return true;
          }) || null
        );
      },
    },
    user: {
      findUnique: async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      },
    },
  };

  return client as PrismaClient;
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------
async function runIdempotencyTests() {
  chatIdempotencyService.clearForTesting();
  const mockDb = createMockPrismaClient();

  // 1. Basic Key Construction & Scope
  console.log('--- 1. Idempotency Key Scoping ---');
  const key1 = chatIdempotencyService.buildKey('tenant-alpha', 'GROUP', 'group-1', 'user-1', 'temp-123');
  const key2 = chatIdempotencyService.buildKey('tenant-beta', 'GROUP', 'group-1', 'user-1', 'temp-123');
  const key3 = chatIdempotencyService.buildKey('tenant-alpha', 'DIRECT', 'conv-1', 'user-1', 'temp-123');
  assertTest(key1 !== key2, 'Key isolates by tenant slug');
  assertTest(key1 !== key3, 'Key isolates by context type (GROUP vs DIRECT)');
  assertTest(key1 === 'tenant-alpha:GROUP:group-1:user-1:temp-123', 'Key format matches expected template');

  // 2. Direct Messaging: Initial Send & Retries
  console.log('\n--- 2. Direct Messaging Send & Retry Idempotency ---');
  const directTempId = 'temp-direct-uuid-001';
  const msg1 = await sendDirectMessage(
    'conv-100',
    'user-sender',
    'Hello, this is message 1',
    undefined,
    directTempId,
    mockDb
  );

  assertTest(!!msg1.id, 'Initial message created successfully');
  assertTest(msg1.content === 'Hello, this is message 1', 'Content matches');
  assertTest(msg1.clientMessageId === directTempId, 'clientMessageId stored in return item');

  // Retry with same tempId (simulating client retry after network timeout)
  const msg1Retry = await sendDirectMessage(
    'conv-100',
    'user-sender',
    'Hello, this is message 1',
    undefined,
    directTempId,
    mockDb
  );

  assertTest(msg1Retry.id === msg1.id, 'Retry returned identical message ID without creating duplicate');
  assertTest(msg1Retry.createdAt === msg1.createdAt, 'Original creation timestamp preserved');

  // 3. Concurrent Duplicate Requests Collapse (Direct)
  console.log('\n--- 3. Concurrent Duplicate Requests Collapse ---');
  const concurrentTempId = 'temp-concurrent-uuid-002';
  const [resA, resB, resC] = await Promise.all([
    sendDirectMessage('conv-100', 'user-sender', 'Concurrent test', undefined, concurrentTempId, mockDb),
    sendDirectMessage('conv-100', 'user-sender', 'Concurrent test', undefined, concurrentTempId, mockDb),
    sendDirectMessage('conv-100', 'user-sender', 'Concurrent test', undefined, concurrentTempId, mockDb),
  ]);

  assertTest(resA.id === resB.id && resB.id === resC.id, 'All 3 concurrent calls returned the exact same message ID');

  // 4. Group Chat: Send & Retry Idempotency
  console.log('\n--- 4. Group Chat Send & Retry Idempotency ---');
  const groupTempId = 'temp-group-uuid-101';
  const groupMsg1 = await sendChatMessage(
    'group-100',
    'user-sender',
    'Group message test',
    undefined,
    groupTempId,
    mockDb
  );

  assertTest(!!groupMsg1.id, 'Group message created');
  assertTest(groupMsg1.clientMessageId === groupTempId, 'Group clientMessageId preserved');

  const groupMsg1Retry = await sendChatMessage(
    'group-100',
    'user-sender',
    'Group message test',
    undefined,
    groupTempId,
    mockDb
  );

  assertTest(groupMsg1Retry.id === groupMsg1.id, 'Group message retry returned same ID');

  // 5. Different Senders with Same TempId Do Not Collide
  console.log('\n--- 5. Sender & Conversation Isolation ---');
  const sharedTempId = 'temp-shared-name';
  const sender1Msg = await sendChatMessage(
    'group-100',
    'user-sender',
    'Sender 1 content',
    undefined,
    sharedTempId,
    mockDb
  );

  const sender2Msg = await sendChatMessage(
    'group-100',
    'user-other',
    'Sender 2 content',
    undefined,
    sharedTempId,
    mockDb
  );

  assertTest(sender1Msg.id !== sender2Msg.id, 'Different senders with same tempId create distinct messages');
  assertTest(sender1Msg.senderId === 'user-sender' && sender2Msg.senderId === 'user-other', 'Sender IDs accurately mapped');

  // 6. Same TempId in Different Groups Do Not Collide
  const group2Msg = await sendChatMessage(
    'group-private-200',
    'user-sender',
    'Private group message',
    undefined,
    sharedTempId,
    mockDb
  );

  assertTest(sender1Msg.id !== group2Msg.id, 'Same sender in different groups with same tempId creates distinct messages');

  // 7. P2002 Database Unique Constraint Catch
  console.log('\n--- 7. Database-Level Unique Constraint Collision Recovery ---');
  // Clear in-memory idempotency cache to force database lookup path
  chatIdempotencyService.clearForTesting();

  const recoveredDirectMsg = await sendDirectMessage(
    'conv-100',
    'user-sender',
    'Concurrent test',
    undefined,
    concurrentTempId,
    mockDb
  );

  assertTest(recoveredDirectMsg.id === resA.id, 'Database lookup successfully retrieved existing message after cache clear');

  // 8. Graceful Non-Idempotent Messages (Without tempId)
  console.log('\n--- 8. Legacy Messages Without tempId ---');
  const legacy1 = await sendChatMessage('group-100', 'user-sender', 'Legacy message 1', undefined, undefined, mockDb);
  const legacy2 = await sendChatMessage('group-100', 'user-sender', 'Legacy message 2', undefined, undefined, mockDb);
  assertTest(legacy1.id !== legacy2.id, 'Messages without tempId create distinct entries normally');

  // 9. Attachment Message Retry Idempotency
  console.log('\n--- 9. Attachment Message Retry Idempotency ---');
  const attTempId = 'temp-att-idempotent-001';
  const attachmentInput = {
    type: 'IMAGE' as const,
    fileName: 'photo.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 2048,
    storagePath: 'direct/kewat-samaj/conv-100/photo.jpg',
  };

  const initialAttMsg = await sendDirectMessage(
    'conv-100',
    'user-sender',
    'Photo caption',
    attachmentInput,
    attTempId,
    mockDb
  );

  assertTest(!!initialAttMsg.id, 'Attachment message created initially');

  // Retry with EXACT same tempId and attachment: must succeed without throwing "Attachment already associated"
  const retriedAttMsg = await sendDirectMessage(
    'conv-100',
    'user-sender',
    'Photo caption',
    attachmentInput,
    attTempId,
    mockDb
  );

  assertTest(retriedAttMsg.id === initialAttMsg.id, 'Retried attachment message returns identical message ID without error');

  // Attempting to reuse the same attachment with a DIFFERENT tempId: must be rejected with 400
  let reuseRejected = false;
  try {
    await sendDirectMessage(
      'conv-100',
      'user-sender',
      'Another message stealing attachment',
      attachmentInput,
      'temp-different-id',
      mockDb
    );
  } catch (err: any) {
    if (err.message && err.message.includes('already been associated')) {
      reuseRejected = true;
    }
  }
  assertTest(reuseRejected, 'Reusing existing attachment for a different message is rejected with 400');

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================');
}

runIdempotencyTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});


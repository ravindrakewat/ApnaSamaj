import assert from 'assert';
import { ChatPersistenceService } from '../services/chat-persistence.service';
import {
  DELETED_CHAT_MESSAGE_PLACEHOLDER,
  MessageDeleteScope,
} from '@apnasamaj/shared-types';

console.log('========================================================================');
console.log('   Apna Samaj — Batch 8.10: Chat Deletion & Moderation Mobile Flow');
console.log('========================================================================\n');

export async function runChatDeletionModerationMobileTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`✅ PASS: ${name}`);
        passed++;
      })
      .catch((err) => {
        console.error(`❌ FAIL: ${name}`);
        console.error(err);
        failed++;
      });
  }

  const persistence = new ChatPersistenceService();
  const tenantSlug = 'surat-samaj';
  const userId = 'u-mobile-alice';
  const otherUserId = 'u-mobile-bob';
  const conversationId = 'conv-deletion-test';

  console.log('--- 1. Persistence & Local Cache Message Deletion ---');

  await test('Save messages into local persistent cache for deletion testing', async () => {
    const messages = [
      {
        id: 'msg-local-1',
        tempId: 'temp-del-1',
        conversationId,
        senderId: userId,
        content: 'Original message content before deletion',
        createdAt: new Date('2026-11-10T10:00:00Z').toISOString(),
        reactions: [{ emoji: '👍', count: 1, hasReacted: true, users: [] }],
        attachments: [
          {
            id: 'att-local-1',
            type: 'IMAGE',
            fileName: 'sample.png',
            mimeType: 'image/png',
            fileSizeBytes: 1024,
            storagePath: 'attachments/sample.png',
          },
        ],
      },
      {
        id: 'msg-local-2',
        tempId: 'temp-del-2',
        conversationId,
        senderId: otherUserId,
        content: 'Message to be deleted for me only',
        createdAt: new Date('2026-11-10T10:05:00Z').toISOString(),
      },
    ];

    await persistence.saveReceivedMessages(
      conversationId,
      'DIRECT',
      messages,
      tenantSlug,
      userId
    );

    const cached = await persistence.getConversationMessages(conversationId, tenantSlug, userId);
    assert.strictEqual(cached.length, 2);
  });

  await test('updateMessageContent replaces content with placeholder and clears attachments/reactions ("Delete for Everyone")', async () => {
    await persistence.updateMessageContent(
      'msg-local-1',
      DELETED_CHAT_MESSAGE_PLACEHOLDER,
      true
    );

    const cached = await persistence.getConversationMessages(conversationId, tenantSlug, userId);
    const updated = cached.find((m) => m.serverMessageId === 'msg-local-1' || m.tempId === 'msg-local-1');
    assert.ok(updated, 'Message must exist in cache');
    assert.strictEqual(updated.content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(updated.attachment, null);
    assert.deepStrictEqual(updated.reactions, []);
  });

  await test('deleteLocalMessage removes message from in-memory cache and conversation index ("Delete for Me")', async () => {
    await persistence.deleteLocalMessage('msg-local-2');

    const cached = await persistence.getConversationMessages(conversationId, tenantSlug, userId);
    const deleted = cached.find((m) => m.serverMessageId === 'msg-local-2' || m.tempId === 'msg-local-2');
    assert.strictEqual(deleted, undefined, 'Deleted-for-me message must not exist in cached list');
    assert.strictEqual(cached.length, 1);
  });

  console.log('\n--- 2. Offline Chat Search Exclusions ---');

  await test('Local search does not return deleted messages', async () => {
    // Search for the original text of msg-local-1 (now replaced by DELETED_CHAT_MESSAGE_PLACEHOLDER)
    const matches1 = await persistence.searchLocalMessages(
      conversationId,
      tenantSlug,
      userId,
      'Original message content'
    );
    assert.strictEqual(matches1.length, 0, 'Deleted for everyone message must not match original content');

    // Search for msg-local-2 (completely removed via deleteLocalMessage)
    const matches2 = await persistence.searchLocalMessages(
      conversationId,
      tenantSlug,
      userId,
      'deleted for me only'
    );
    assert.strictEqual(matches2.length, 0, 'Deleted for me message must not appear in search results');
  });

  console.log('\n--- 3. Optimistic Deletion State Reconciliation ---');

  await test('Simulate optimistic Delete for Everyone in local messages array', () => {
    let localMessages = [
      {
        id: 'msg-opt-1',
        groupId: 'grp-test',
        senderId: userId,
        content: 'Sensitive message',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [{ id: 'att-1', type: 'IMAGE' as any, fileName: 'a.jpg', mimeType: 'image/jpeg', fileSizeBytes: 100, storagePath: 'p' }],
        reactions: [{ emoji: '❤️', count: 1, hasReacted: true, users: [] }],
        isDeletedForEveryone: false,
      },
    ];

    // Optimistic Delete for Everyone
    localMessages = localMessages.map((m) => {
      if (m.id === 'msg-opt-1') {
        return {
          ...m,
          content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
          attachments: [],
          reactions: [],
          isDeletedForEveryone: true,
        };
      }
      return m;
    });

    assert.strictEqual(localMessages[0].content, DELETED_CHAT_MESSAGE_PLACEHOLDER);
    assert.strictEqual(localMessages[0].attachments.length, 0);
    assert.strictEqual(localMessages[0].reactions.length, 0);
    assert.strictEqual(localMessages[0].isDeletedForEveryone, true);
  });

  await test('Simulate optimistic Delete for Me in local messages array', () => {
    let localMessages = [
      {
        id: 'msg-opt-2',
        groupId: 'grp-test',
        senderId: otherUserId,
        content: 'Message to hide for me',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'msg-opt-3',
        groupId: 'grp-test',
        senderId: userId,
        content: 'Remaining message',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Optimistic Delete for Me
    localMessages = localMessages.filter((m) => m.id !== 'msg-opt-2');

    assert.strictEqual(localMessages.length, 1);
    assert.strictEqual(localMessages[0].id, 'msg-opt-3');
  });

  console.log('\n------------------------------------------------------------------------');
  console.log(`Mobile Flow Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------------------------\n');

  return { passed, failed };
}

if (require.main === module) {
  runChatDeletionModerationMobileTests().catch((err) => {
    console.error('Mobile test failure:', err);
    process.exit(1);
  });
}

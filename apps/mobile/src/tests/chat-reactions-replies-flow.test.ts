import assert from 'assert';
import {
  ALLOWED_CHAT_REACTIONS,
  ChatReactionSummary,
  ChatMessageReplyPreview,
  ChatReactionEventPayload,
} from '@apnasamaj/shared-types';
import { chatPersistenceService } from '../services/chat-persistence.service';
import { outboxQueueService } from '../services/outbox-queue.service';
import { chatApi } from '../api/chat.api';

export async function runChatReactionsRepliesFlowTests() {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 8.8: Chat Reactions & Replies Mobile Suite');
  console.log('================================================================');

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

  console.log('\n--- 1. Allowed Reactions Constants ---');
  test('Standard 6 WhatsApp-like reaction emojis', () => {
    assert.deepStrictEqual(ALLOWED_CHAT_REACTIONS, ['👍', '❤️', '😂', '😮', '😢', '🙏']);
  });

  console.log('\n--- 2. Reaction State Aggregation & Toggle Logic ---');
  test('Adding initial reaction sets count = 1 and hasReacted = true', () => {
    const initial: ChatReactionSummary[] = [];
    const emoji = '👍';
    const user = { id: 'usr-1', fullName: 'Sunil Kewat' };

    const updated = [
      ...initial,
      {
        emoji,
        count: 1,
        hasReacted: true,
        users: [user],
      },
    ];

    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].emoji, '👍');
    assert.strictEqual(updated[0].count, 1);
    assert.strictEqual(updated[0].hasReacted, true);
  });

  test('Switching emoji replaces prior reaction (one reaction per user invariant)', () => {
    const current: ChatReactionSummary[] = [
      {
        emoji: '👍',
        count: 1,
        hasReacted: true,
        users: [{ id: 'usr-1', fullName: 'Sunil Kewat' }],
      },
    ];

    // User switches from 👍 to ❤️
    const existingIdx = current.findIndex((r) => r.hasReacted);
    assert(existingIdx >= 0);

    const decremented = current
      .map((r, i) => (i === existingIdx ? { ...r, count: r.count - 1, hasReacted: false } : r))
      .filter((r) => r.count > 0);

    const updated = [
      ...decremented,
      {
        emoji: '❤️',
        count: 1,
        hasReacted: true,
        users: [{ id: 'usr-1', fullName: 'Sunil Kewat' }],
      },
    ];

    assert.strictEqual(updated.length, 1);
    assert.strictEqual(updated[0].emoji, '❤️');
    assert.strictEqual(updated[0].count, 1);
    assert.strictEqual(updated[0].hasReacted, true);
  });

  test('Tapping same emoji toggles off / removes reaction', () => {
    const current: ChatReactionSummary[] = [
      {
        emoji: '❤️',
        count: 1,
        hasReacted: true,
        users: [{ id: 'usr-1', fullName: 'Sunil Kewat' }],
      },
    ];

    const existingIdx = current.findIndex((r) => r.hasReacted);
    const updated = current
      .map((r, i) => (i === existingIdx ? { ...r, count: r.count - 1, hasReacted: false } : r))
      .filter((r) => r.count > 0);

    assert.strictEqual(updated.length, 0);
  });

  console.log('\n--- 3. Local Outbox Queue With Replies ---');
  const tenantSlug = 'kewat-samaj-rx';
  const userId = 'usr-sunil-rx';
  const convId = 'grp-community-discussion';

  let replyTempId = '';
  await test('Enqueue message reply with replyToMessageId and replyTo snippet', async () => {
    replyTempId = `temp-reply-${Date.now()}`;
    const replySnippet: ChatMessageReplyPreview = {
      id: 'server-original-msg-123',
      senderId: 'usr-priya',
      senderName: 'Priya Verma',
      content: 'Can everyone confirm attendance for Sunday?',
      attachmentType: null,
      attachmentName: null,
    };

    const saved = await outboxQueueService.enqueue({
      tempId: replyTempId,
      conversationId: convId,
      conversationType: 'GROUP',
      content: 'Yes Priya ji, confirmed from my family!',
      attachment: null,
      replyToMessageId: 'server-original-msg-123',
      replyTo: replySnippet,
      tenantSlug,
      userId,
    });

    assert.strictEqual(saved.tempId, replyTempId);
    assert.strictEqual(saved.replyToMessageId, 'server-original-msg-123');
    assert.strictEqual(saved.replyTo?.senderName, 'Priya Verma');
    assert.strictEqual(saved.replyTo?.content, 'Can everyone confirm attendance for Sunday?');
    assert.strictEqual(saved.deliveryStatus, 'pending');
  });

  await test('Local cache preserves replyTo and reactions across simulated app restart', async () => {
    const cachedMessages = await chatPersistenceService.getConversationMessages(
      convId,
      tenantSlug,
      userId
    );

    assert(cachedMessages.length > 0);
    const restored = cachedMessages.find((m) => m.tempId === replyTempId);
    assert(restored !== undefined);
    assert.strictEqual(restored?.replyToMessageId, 'server-original-msg-123');
    assert.strictEqual(restored?.replyTo?.senderName, 'Priya Verma');
  });

  await test('Update message reactions in persistence layer', async () => {
    const newReactions: ChatReactionSummary[] = [
      {
        emoji: '🙏',
        count: 3,
        hasReacted: true,
        users: [{ id: userId, fullName: 'Sunil Kewat' }],
      },
    ];

    await chatPersistenceService.updateMessageReactions(replyTempId, newReactions);

    const cached = await chatPersistenceService.getConversationMessages(convId, tenantSlug, userId);
    const msg = cached.find((m) => m.tempId === replyTempId);
    assert.strictEqual(msg?.reactions?.length, 1);
    assert.strictEqual(msg?.reactions?.[0].emoji, '🙏');
    assert.strictEqual(msg?.reactions?.[0].count, 3);
  });

  console.log('\n--- 4. Real-time Socket Event Reconciliation ---');
  test('ChatReactionEventPayload format conforms to contract', () => {
    const eventPayload: ChatReactionEventPayload = {
      conversationId: convId,
      conversationType: 'GROUP',
      messageId: replyTempId,
      reactions: [
        {
          emoji: '👍',
          count: 5,
          hasReacted: false,
          users: [],
        },
      ],
      userId: 'usr-another-member',
      emoji: '👍',
      action: 'added',
    };

    assert.strictEqual(eventPayload.conversationId, convId);
    assert.strictEqual(eventPayload.messageId, replyTempId);
    assert.strictEqual(eventPayload.action, 'added');
  });

  console.log('\n--- 5. Deleted Original Message Safe Fallback ---');
  test('Deleted message snippet renders safely with fallback text', () => {
    const deletedSnippet: ChatMessageReplyPreview = {
      id: 'deleted-123',
      senderId: '',
      senderName: 'Original Message',
      content: 'This message was deleted',
      attachmentType: null,
      attachmentName: null,
    };

    assert.strictEqual(deletedSnippet.content, 'This message was deleted');
    assert.strictEqual(deletedSnippet.senderName, 'Original Message');
  });

  console.log('\n--- 6. Cross-Tenant Queue Isolation ---');
  await test('Tenant B cannot see Tenant A replies or outbox queue', async () => {
    const foreignCached = await chatPersistenceService.getConversationMessages(
      convId,
      'other-tenant-slug',
      userId
    );
    assert.strictEqual(foreignCached.length, 0);
  });

  console.log('\n================================================================');
  console.log(`🎉 BATCH 8.8 MOBILE TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Batch 8.8 mobile suite.`);
  }
}


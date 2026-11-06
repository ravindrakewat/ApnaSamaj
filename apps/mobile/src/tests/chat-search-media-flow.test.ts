import assert from 'assert';
import { ChatPersistenceService } from '../services/chat-persistence.service';
import { ChatSearchResultItem, ChatMediaGalleryItem, ChatAttachmentType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.9: Chat Search & Media Gallery Mobile Flow');
console.log('================================================================\n');

export async function runChatSearchMediaMobileTests(): Promise<{ passed: number; failed: number }> {
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
  const userId = 'u-mobile-1';
  const otherUserId = 'u-mobile-2';
  const conversationId = 'conv-direct-test';

  console.log('--- 1. Local Offline Chat Search ---');

  await test('Save received messages into local persistent cache', async () => {
    const messages = [
      {
        id: 'srv-msg-1',
        tempId: 'temp-1',
        conversationId,
        senderId: userId,
        content: 'Namaste, when is the committee meeting happening?',
        createdAt: new Date('2026-11-06T10:00:00Z').toISOString(),
      },
      {
        id: 'srv-msg-2',
        tempId: 'temp-2',
        conversationId,
        senderId: otherUserId,
        content: 'Meeting is at 6 PM. Check the meeting_agenda.pdf file.',
        createdAt: new Date('2026-11-06T10:05:00Z').toISOString(),
        attachments: [
          {
            id: 'att-1',
            type: 'DOCUMENT',
            fileName: 'meeting_agenda.pdf',
            mimeType: 'application/pdf',
            fileSizeBytes: 102400,
            storagePath: 'direct/surat-samaj/conv-direct-test/att-1.pdf',
          },
        ],
      },
      {
        id: 'srv-msg-3',
        tempId: 'temp-3',
        conversationId,
        senderId: otherUserId,
        content: 'Festival celebration photos are uploaded',
        createdAt: new Date('2026-11-06T10:10:00Z').toISOString(),
        attachments: [
          {
            id: 'att-2',
            type: 'IMAGE',
            fileName: 'diwali_puja.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 2048000,
            storagePath: 'direct/surat-samaj/conv-direct-test/att-2.jpg',
          },
        ],
      },
    ];

    await persistence.saveReceivedMessages(conversationId, 'DIRECT', messages, tenantSlug, userId);
    const cached = await persistence.getConversationMessages(conversationId, tenantSlug, userId);
    assert.strictEqual(cached.length, 3);
  });

  await test('Local search matches keyword in message content (case-insensitive)', async () => {
    const results = await persistence.searchLocalMessages(conversationId, tenantSlug, userId, 'meeting');
    assert.strictEqual(results.length, 2); // srv-msg-1 and srv-msg-2
    assert.strictEqual(results[0].matchSource, 'local');
    assert.ok(results.every((r) => r.matchSource === 'local'));
  });

  await test('Local search matches keyword in attachment filename', async () => {
    const results = await persistence.searchLocalMessages(conversationId, tenantSlug, userId, 'agenda');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'srv-msg-2');
    assert.strictEqual(results[0].attachmentName, 'meeting_agenda.pdf');
  });

  await test('Local search returns empty array for non-matching queries', async () => {
    const results = await persistence.searchLocalMessages(conversationId, tenantSlug, userId, 'sports');
    assert.strictEqual(results.length, 0);
  });

  await test('Local search respects tenant and user namespace isolation', async () => {
    // Other tenant search returns empty
    const otherTenantResults = await persistence.searchLocalMessages(
      conversationId,
      'other-community',
      userId,
      'meeting'
    );
    assert.strictEqual(otherTenantResults.length, 0);

    // Other user search returns empty
    const otherUserResults = await persistence.searchLocalMessages(
      conversationId,
      tenantSlug,
      'other-user-99',
      'meeting'
    );
    assert.strictEqual(otherUserResults.length, 0);
  });

  console.log('\n--- 2. Result Deduplication & Merging Logic ---');

  await test('Merge local cache matches and remote server matches without duplicates', () => {
    const localMatches: ChatSearchResultItem[] = [
      {
        id: 'msg-dup-1',
        conversationType: 'DIRECT',
        senderId: userId,
        senderName: 'You',
        senderAvatarUrl: null,
        content: 'First message cached locally',
        createdAt: '2026-11-06T10:00:00Z',
        matchSource: 'local',
      },
      {
        id: 'msg-local-only',
        conversationType: 'DIRECT',
        senderId: userId,
        senderName: 'You',
        senderAvatarUrl: null,
        content: 'Offline pending message',
        createdAt: '2026-11-06T10:01:00Z',
        matchSource: 'local',
      },
    ];

    const remoteMatches: ChatSearchResultItem[] = [
      {
        id: 'msg-dup-1', // Same ID as in local
        conversationType: 'DIRECT',
        senderId: userId,
        senderName: 'Sunil Kewat',
        senderAvatarUrl: 'https://cdn.example.com/avatar.jpg',
        content: 'First message cached locally',
        createdAt: '2026-11-06T10:00:00Z',
        matchSource: 'remote',
      },
      {
        id: 'msg-remote-only',
        conversationType: 'DIRECT',
        senderId: otherUserId,
        senderName: 'Aarav Sharma',
        senderAvatarUrl: null,
        content: 'Older message from server',
        createdAt: '2026-11-05T10:00:00Z',
        matchSource: 'remote',
      },
    ];

    const seenIds = new Set<string>();
    const merged: ChatSearchResultItem[] = [];

    // Local results first, then remote
    for (const item of localMatches) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        merged.push(item);
      }
    }
    for (const item of remoteMatches) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        merged.push(item);
      }
    }

    assert.strictEqual(merged.length, 3);
    assert.strictEqual(merged[0].id, 'msg-dup-1');
    assert.strictEqual(merged[1].id, 'msg-local-only');
    assert.strictEqual(merged[2].id, 'msg-remote-only');
  });

  console.log('\n--- 3. Media Gallery Categorization & Formatting ---');

  await test('Categorize media attachments by exact type', () => {
    const galleryItems: ChatMediaGalleryItem[] = [
      {
        id: 'att-1',
        messageId: 'm1',
        type: 'IMAGE',
        fileName: 'photo1.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1048576,
        storagePath: 'p1.jpg',
        url: 'https://signed.example.com/p1.jpg',
        createdAt: '2026-11-06T10:00:00Z',
        senderId: 'u1',
        senderName: 'User 1',
      },
      {
        id: 'att-2',
        messageId: 'm2',
        type: 'VIDEO',
        fileName: 'event.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 10485760,
        storagePath: 'v1.mp4',
        url: 'https://signed.example.com/v1.mp4',
        duration: 45,
        createdAt: '2026-11-06T10:05:00Z',
        senderId: 'u2',
        senderName: 'User 2',
      },
      {
        id: 'att-3',
        messageId: 'm3',
        type: 'AUDIO',
        fileName: 'note.m4a',
        mimeType: 'audio/m4a',
        fileSizeBytes: 65536,
        storagePath: 'a1.m4a',
        url: 'https://signed.example.com/a1.m4a',
        duration: 22,
        createdAt: '2026-11-06T10:10:00Z',
        senderId: 'u1',
        senderName: 'User 1',
      },
      {
        id: 'att-4',
        messageId: 'm4',
        type: 'DOCUMENT',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 524288,
        storagePath: 'd1.pdf',
        url: 'https://signed.example.com/d1.pdf',
        createdAt: '2026-11-06T10:15:00Z',
        senderId: 'u2',
        senderName: 'User 2',
      },
    ];

    const photos = galleryItems.filter((i) => i.type === 'IMAGE');
    const videos = galleryItems.filter((i) => i.type === 'VIDEO');
    const audio = galleryItems.filter((i) => i.type === 'AUDIO');
    const docs = galleryItems.filter((i) => i.type === 'DOCUMENT');

    assert.strictEqual(photos.length, 1);
    assert.strictEqual(videos.length, 1);
    assert.strictEqual(audio.length, 1);
    assert.strictEqual(docs.length, 1);
  });

  console.log('\n--- 4. Jump-to-Message Resolution ---');

  await test('In-memory message target index resolution', () => {
    const inMemoryList = [
      { id: 'm-newest', createdAt: '2026-11-06T12:00:00Z' },
      { id: 'm-target', createdAt: '2026-11-06T11:00:00Z' },
      { id: 'm-oldest', createdAt: '2026-11-06T10:00:00Z' },
    ];

    const targetIdx = inMemoryList.findIndex((m) => m.id === 'm-target');
    assert.strictEqual(targetIdx, 1);
  });

  await test('Out-of-memory message insertion maintains descending order', () => {
    const currentMessages = [
      { id: 'm-page1-1', createdAt: '2026-11-06T12:00:00Z' },
      { id: 'm-page1-2', createdAt: '2026-11-06T11:30:00Z' },
    ];

    const olderContextMessages = [
      { id: 'm-older-target', createdAt: '2026-11-06T09:00:00Z' },
      { id: 'm-older-2', createdAt: '2026-11-06T08:30:00Z' },
    ];

    const existingIds = new Set(currentMessages.map((m) => m.id));
    const merged = [
      ...currentMessages,
      ...olderContextMessages.filter((m) => !existingIds.has(m.id)),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    assert.strictEqual(merged.length, 4);
    assert.strictEqual(merged[0].id, 'm-page1-1');
    assert.strictEqual(merged[2].id, 'm-older-target');
  });

  console.log('\n================================================================');
  console.log(`🎉 BATCH 8.9 MOBILE TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  return { passed, failed };
}

// Allow standalone CLI execution
if (process.argv[1]?.includes('chat-search-media-flow.test.ts')) {
  runChatSearchMediaMobileTests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}


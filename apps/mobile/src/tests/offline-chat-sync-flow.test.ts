import assert from 'node:assert';
import { ChatPersistenceService } from '../services/chat-persistence.service';
import { OutboxQueueService } from '../services/outbox-queue.service';
import {
  clearMemoryStorageForTesting,
  setAuthTokens,
  clearAuthTokens,
  setStoredCommunitySlug,
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from '../services/storage.service';
import { chatApi } from '../api/chat.api';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.6: Offline Chat Sync & Outbox Tests     ');
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

export async function runOfflineChatSyncFlowTests(): Promise<void> {
  clearMemoryStorageForTesting();

  const persistence = new ChatPersistenceService();
  const outbox = new OutboxQueueService(persistence);

  const TENANT_A = 'kewat-samaj';
  const TENANT_B = 'rathore-samaj';
  const USER_1 = 'user-sunil-001';
  const USER_2 = 'user-aakash-002';
  const CONV_1 = 'conv-direct-101';
  const GROUP_1 = 'group-yuva-201';

  // -------------------------------------------------------------
  // 1. LOCAL PERSISTENCE TESTS
  // -------------------------------------------------------------
  console.log('--- 1. Local Message Persistence & Chunking ---');

  // Test 1: Save pending message
  const pending1 = await persistence.savePendingMessage({
    tempId: 'temp-msg-001',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: 'Namaste! Offline first message.',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  assertTest(pending1.deliveryStatus === 'pending', 'Message saved with initial pending deliveryStatus');
  assertTest(pending1.tempId === 'temp-msg-001', 'Temporary client ID preserved');
  assertTest(pending1.retryCount === 0, 'Initial retry count is 0');

  // Test 2: Chunking for large messages (> 1024 bytes)
  const longText = 'A'.repeat(2500); // 2500 characters, exceeds 1024-byte chunk limit
  await persistence.savePendingMessage({
    tempId: 'temp-msg-long',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: longText,
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  const retrievedConv = await persistence.getConversationMessages(CONV_1, TENANT_A, USER_1);
  const foundLong = retrievedConv.find((m) => m.tempId === 'temp-msg-long');
  assertTest(!!foundLong, 'Chunked message successfully retrieved from local storage');
  assertTest(foundLong?.content.length === 2500, 'Chunked message content cleanly reassembled without truncation');

  // Hardening Test: Interrupted write with missing chunk is rejected as corrupted
  const multiChunkMsg = await persistence.savePendingMessage({
    tempId: 'temp-incomplete-chunk',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: 'X'.repeat(3200), // 4 chunks (c0, c1, c2, c3)
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  // Delete chunk 2 simulating crash during write
  await removeSecureItem('@apnasamaj:chat:msg:kewat-samaj:user-sunil-001:temp-incomplete-chunk:c2');
  const freshReaderAfterCrash = new ChatPersistenceService();
  const readIncomplete = await freshReaderAfterCrash.getConversationMessages(CONV_1, TENANT_A, USER_1);
  assertTest(!readIncomplete.some((m) => m.tempId === 'temp-incomplete-chunk'), 'Incomplete write with missing chunk is safely rejected as corrupted');

  // Hardening Test: Corrupted chunk count header is safely rejected without runtime crash
  await setSecureItem('@apnasamaj:chat:msg:kewat-samaj:user-sunil-001:temp-incomplete-chunk:chk_cnt', 'not_a_number');
  const freshReaderCorruptHeader = new ChatPersistenceService();
  const readHeaderCorrupt = await freshReaderCorruptHeader.getConversationMessages(CONV_1, TENANT_A, USER_1);
  assertTest(!readHeaderCorrupt.some((m) => m.tempId === 'temp-incomplete-chunk'), 'Corrupted count header is safely rejected');

  // Clean up corrupted test message from outbox index
  await persistence.updateMessageDeliveryStatus('temp-incomplete-chunk', 'sent', {
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  // Hardening Test: Overwrite large chunked record with smaller chunked record cleans up obsolete chunks
  await persistence.savePendingMessage({
    tempId: 'temp-shrink-test',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: 'Y'.repeat(3500), // 4 chunks (c0, c1, c2, c3)
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  const chunk3Before = await getSecureItem('@apnasamaj:chat:msg:kewat-samaj:user-sunil-001:temp-shrink-test:c3');
  assertTest(chunk3Before !== null, '4-chunk message allocated chunk 3 in storage');

  // Overwrite with 2 chunks
  await persistence.savePendingMessage({
    tempId: 'temp-shrink-test',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: 'Z'.repeat(1500), // 2 chunks (c0, c1)
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  const chunk3After = await getSecureItem('@apnasamaj:chat:msg:kewat-samaj:user-sunil-001:temp-shrink-test:c3');
  assertTest(chunk3After === null, 'Obsolete chunk 3 was cleanly removed when record shrank');

  // Overwrite with single unchunked entry (< 1024 bytes)
  await persistence.savePendingMessage({
    tempId: 'temp-shrink-test',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: 'Short unchunked text',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  const chkCntSingle = await getSecureItem('@apnasamaj:chat:msg:kewat-samaj:user-sunil-001:temp-shrink-test:chk_cnt');
  const c0Single = await getSecureItem('@apnasamaj:chat:msg:kewat-samaj:user-sunil-001:temp-shrink-test:c0');
  assertTest(chkCntSingle === null && c0Single === null, 'All chunk keys and header removed when overwritten by unchunked single item');

  // Hardening Test: Web Storage Security & Attachment Signed URL Sanitization
  await persistence.saveReceivedMessages(
    'conv-att-sec-test',
    'DIRECT',
    [
      {
        id: 'srv-att-msg-01',
        content: 'Photo received',
        senderId: USER_1,
        attachments: [
          {
            id: 'att-999',
            type: 'IMAGE',
            fileName: 'private.png',
            mimeType: 'image/png',
            fileSizeBytes: 4096,
            storagePath: 'direct/tenant/conv/private.png',
            url: 'https://supabase.example.com/storage/v1/object/sign/chat-attachments/private.png?token=secret_jwt_expiring',
          },
        ],
      },
    ],
    TENANT_A,
    USER_1
  );
  const secReader = new ChatPersistenceService();
  const storedAttMsg = (await secReader.getConversationMessages('conv-att-sec-test', TENANT_A, USER_1))[0];
  assertTest(!!storedAttMsg?.attachment, 'Attachment metadata stored');
  assertTest(storedAttMsg?.attachment?.storagePath === 'direct/tenant/conv/private.png', 'Attachment storagePath preserved');
  assertTest((storedAttMsg?.attachment as any)?.url === undefined, 'Signed URL strictly stripped from persistent storage to prevent credential leakage');

  // Mark chunked test messages as sent to clear outbox index
  await persistence.updateMessageDeliveryStatus('temp-msg-long', 'sent', {
    serverMessageId: 'srv-msg-long',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  await persistence.updateMessageDeliveryStatus('temp-shrink-test', 'sent', {
    serverMessageId: 'srv-msg-shrink',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  // Test 3: Status transitions (pending -> sending -> sent)
  await persistence.updateMessageDeliveryStatus('temp-msg-001', 'sending', {
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  let current = (await persistence.getPendingOutboxMessages(TENANT_A, USER_1)).find((m) => m.tempId === 'temp-msg-001');
  assertTest(current?.deliveryStatus === 'sending', 'Status transitioned to sending');

  await persistence.updateMessageDeliveryStatus('temp-msg-001', 'sent', {
    serverMessageId: 'srv-msg-999',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  const pendingAfterSent = await persistence.getPendingOutboxMessages(TENANT_A, USER_1);
  assertTest(!pendingAfterSent.some((m) => m.tempId === 'temp-msg-001'), 'Sent message automatically removed from outbox queue');

  // Test 4: Simulation of app restart (fresh in-memory service instance reading L2)
  console.log('\n--- 2. App Restart Simulation & Cache Restoration ---');
  const freshPersistence = new ChatPersistenceService();
  const restoredMessages = await freshPersistence.getConversationMessages(CONV_1, TENANT_A, USER_1);
  assertTest(restoredMessages.length >= 2, 'Messages survive simulated app restart via persistent storage');
  assertTest(restoredMessages.some((m) => m.tempId === 'temp-msg-001' && m.deliveryStatus === 'sent'), 'Restored message preserves sent delivery status and serverMessageId');

  // Test 5: Strict Tenant & User Isolation
  console.log('\n--- 3. Strict Tenant & User Isolation ---');
  const foreignTenantMessages = await persistence.getConversationMessages(CONV_1, TENANT_B, USER_1);
  assertTest(foreignTenantMessages.length === 0, 'Tenant A messages are strictly invisible in Tenant B context');

  const foreignUserOutbox = await persistence.getPendingOutboxMessages(TENANT_A, USER_2);
  assertTest(foreignUserOutbox.length === 0, 'User 1 outbox messages are strictly invisible to User 2');

  // Test 6: Bounded cache growth (caps at 50 messages)
  console.log('\n--- 4. Bounded Local Cache Pruning ---');
  const bulkMessages = Array.from({ length: 60 }).map((_, i) => ({
    id: `srv-bulk-${i}`,
    tempId: `temp-bulk-${i}`,
    content: `Bulk message ${i}`,
    createdAt: new Date(Date.now() + i * 1000).toISOString(),
    senderId: USER_1,
  }));
  await persistence.saveReceivedMessages('conv-bulk-test', 'DIRECT', bulkMessages, TENANT_A, USER_1);
  const cachedBulk = await persistence.getConversationMessages('conv-bulk-test', TENANT_A, USER_1);
  assertTest(cachedBulk.length <= 50, `Local cache size safely capped at 50 items (actual: ${cachedBulk.length})`);

  // -------------------------------------------------------------
  // 2. OUTBOX QUEUE TESTS
  // -------------------------------------------------------------
  console.log('\n--- 5. Outbox Queue Lifecycle & Online Dispatch ---');

  // Mock authenticated session
  await setAuthTokens({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
  await setStoredCommunitySlug(TENANT_A);

  let apiSendCalled = 0;
  const originalSendDirect = chatApi.sendDirectMessage;
  const originalSendGroup = chatApi.sendGroupMessage;

  (chatApi as any).sendDirectMessage = async (convId: string, content?: string, tempId?: string) => {
    apiSendCalled++;
    return {
      id: `srv-confirmed-${tempId}`,
      conversationId: convId,
      senderId: USER_1,
      content: content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  await outbox.initialize(TENANT_A, USER_1);

  // Send message while online
  apiSendCalled = 0;
  outbox.setOnlineStatus(true);
  const enqueuedMsg = await outbox.enqueue({
    tempId: 'temp-online-01',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    content: 'Immediate online send',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  // Allow asynchronous worker to execute
  await new Promise((r) => setTimeout(r, 50));
  assertTest(apiSendCalled === 1, 'Online message immediately transmitted through API');

  // Queue message while offline
  console.log('\n--- 6. Offline Queueing & Reconnection Drain ---');
  outbox.setOnlineStatus(false);
  apiSendCalled = 0;

  await outbox.enqueue({
    tempId: 'temp-offline-01',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    content: 'Offline message 1',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  await outbox.enqueue({
    tempId: 'temp-offline-02',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    content: 'Offline message 2',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  await new Promise((r) => setTimeout(r, 50));
  assertTest(apiSendCalled === 0, 'No network requests dispatched while device is offline');

  // Reconnection drain
  outbox.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 100));
  assertTest(apiSendCalled === 2, 'All queued offline messages automatically transmitted on network reconnect');

  // Test 7: Sequential FIFO Order Preserved Within Conversation
  console.log('\n--- 7. Conversational FIFO Order Preservation ---');
  const transmissionOrder: string[] = [];
  (chatApi as any).sendDirectMessage = async (convId: string, content?: string, tempId?: string) => {
    transmissionOrder.push(tempId || '');
    return {
      id: `srv-${tempId}`,
      conversationId: convId,
      senderId: USER_1,
      content: content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  outbox.setOnlineStatus(false);
  await outbox.enqueue({ tempId: 'fifo-1', conversationId: 'conv-fifo', conversationType: 'DIRECT', content: '1', tenantSlug: TENANT_A, userId: USER_1 });
  await outbox.enqueue({ tempId: 'fifo-2', conversationId: 'conv-fifo', conversationType: 'DIRECT', content: '2', tenantSlug: TENANT_A, userId: USER_1 });
  await outbox.enqueue({ tempId: 'fifo-3', conversationId: 'conv-fifo', conversationType: 'DIRECT', content: '3', tenantSlug: TENANT_A, userId: USER_1 });

  outbox.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 100));
  assertTest(
    transmissionOrder[0] === 'fifo-1' && transmissionOrder[1] === 'fifo-2' && transmissionOrder[2] === 'fifo-3',
    'Messages dispatched in strict conversational FIFO order (fifo-1 -> fifo-2 -> fifo-3)'
  );

  // Test 8: Stuck Sending Message Recovery
  console.log('\n--- 8. Mid-Flight Stuck Sending Recovery ---');
  await persistence.savePendingMessage({
    tempId: 'temp-crashed-midflight',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    senderId: USER_1,
    content: 'Crashed in flight',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });
  await persistence.updateMessageDeliveryStatus('temp-crashed-midflight', 'sending', {
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  const recovered = await persistence.recoverStuckSendingMessages(TENANT_A, USER_1);
  assertTest(recovered === 1, 'Successfully recovered 1 message stuck in sending status back to pending');

  // Clear recovered test message so queue is clean for next test
  await persistence.updateMessageDeliveryStatus('temp-crashed-midflight', 'sent', {
    serverMessageId: 'srv-recovered-midflight',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  // Test 9: Permanent Error Non-Retry Guarantee
  console.log('\n--- 9. Permanent Error Handling & Retry Caps ---');
  let permanentCallCount = 0;
  (chatApi as any).sendDirectMessage = async () => {
    permanentCallCount++;
    throw new Error('403 Forbidden: You do not have permission for this chat room.');
  };

  await outbox.enqueue({
    tempId: 'temp-forbidden-msg',
    conversationId: 'conv-forbidden',
    conversationType: 'DIRECT',
    content: 'Unauthorized message',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  await new Promise((r) => setTimeout(r, 50));
  assertTest(permanentCallCount === 1, 'Permanent 403 error attempted exactly once');

  const forbiddenMsg = (await persistence.getConversationMessages('conv-forbidden', TENANT_A, USER_1))[0];
  assertTest(forbiddenMsg?.deliveryStatus === 'failed', 'Permanent error marked as failed immediately');

  // Test 10: Teardown on Logout / Community Switch & Message Preservation
  console.log('\n--- 10. Queue Teardown on Logout & Tenant Switch ---');
  // Reset API send tracking
  let syncSentCalls: string[] = [];
  (chatApi as any).sendDirectMessage = async (convId: string, content?: string, tempId?: string) => {
    syncSentCalls.push(tempId || '');
    return {
      id: `srv-${tempId}`,
      conversationId: convId,
      senderId: USER_1,
      content: content || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  // 1. Enqueue offline message in Tenant A
  outbox.setOnlineStatus(false);
  await outbox.enqueue({
    tempId: 'temp-preserve-across-logout',
    conversationId: CONV_1,
    conversationType: 'DIRECT',
    content: 'Important offline message to be preserved',
    tenantSlug: TENANT_A,
    userId: USER_1,
  });

  // 2. User logs out / switches community to Tenant B
  outbox.teardown();
  persistence.evictMemorySession();

  // Verify in-memory session was evicted
  assertTest(
    (persistence as any).inMemoryCache.size === 0 &&
      (persistence as any).conversationIndex.size === 0 &&
      (persistence as any).outboxIndex.size === 0,
    'In-memory session cache cleanly evicted on community switch/logout'
  );

  // 3. User authenticates into Tenant B
  await outbox.initialize(TENANT_B, USER_1);
  outbox.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 60));

  // Verify Tenant A's message was NEVER transmitted while active in Tenant B context
  assertTest(
    !syncSentCalls.includes('temp-preserve-across-logout'),
    'Tenant A message was NEVER dispatched with Tenant B credentials'
  );

  // 4. Another user (USER_2) logs into Tenant A on same device
  outbox.teardown();
  persistence.evictMemorySession();
  await outbox.initialize(TENANT_A, USER_2);
  const user2Pending = await persistence.getPendingOutboxMessages(TENANT_A, USER_2);
  assertTest(
    user2Pending.length === 0,
    'User 2 cannot see or dispatch User 1 pending outbox messages'
  );

  // 5. USER_1 returns and authenticates to Tenant A
  outbox.teardown();
  persistence.evictMemorySession();
  await outbox.initialize(TENANT_A, USER_1);
  outbox.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 60));

  // Verify original message is safely resumed and transmitted now that User 1 is in Tenant A
  assertTest(
    syncSentCalls.includes('temp-preserve-across-logout'),
    'Preserved outbox message cleanly recovered and transmitted when User 1 returns to Tenant A'
  );

  // Final cleanup for test runner
  outbox.teardown();
  await persistence.clearAllDataPermanentlyForTesting();

  // Restore API mocks
  (chatApi as any).sendDirectMessage = originalSendDirect;
  (chatApi as any).sendGroupMessage = originalSendGroup;

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');
}

// Auto-run if executed directly
if (require.main === module) {
  runOfflineChatSyncFlowTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}


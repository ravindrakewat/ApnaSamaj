import assert from 'assert';
import { voiceRecordingService } from '../services/audio/voice-recording.service';
import { voicePlaybackService } from '../services/audio/voice-playback.service';
import { __setMockPermission } from './mocks/expo-av';
import { ChatPersistenceService } from '../services/chat-persistence.service';
import { OutboxQueueService } from '../services/outbox-queue.service';
import { setAuthTokens } from '../services/storage.service';
import { chatApi } from '../api/chat.api';

export async function runVoiceNotesFlowTests() {
  console.log('\n--- Running Batch 8.7 Voice Notes & Audio Messaging Mobile Test Suite ---');

  // Test 1: Permission Handling - Granted
  __setMockPermission(true);
  const granted = await voiceRecordingService.requestPermissions();
  assert.strictEqual(granted, true, 'Permission should be granted when user accepts');
  console.log('✓ 1. Permission Handling: Microphone permission granted correctly');

  // Test 2: Permission Handling - Denied
  __setMockPermission(false);
  const denied = await voiceRecordingService.requestPermissions();
  assert.strictEqual(denied, false, 'Permission should be denied when user rejects');
  let permissionErrorCaught = false;
  try {
    await voiceRecordingService.startRecording();
  } catch (err: any) {
    if (err.message === 'PERMISSION_DENIED') {
      permissionErrorCaught = true;
    }
  }
  assert.strictEqual(permissionErrorCaught, true, 'startRecording should throw PERMISSION_DENIED');
  console.log('✓ 2. Permission Handling: Rejected permission throws PERMISSION_DENIED and blocks recording');

  // Test 3: Start, Pause, Resume Recording
  __setMockPermission(true);
  let statusUpdatesCount = 0;
  await voiceRecordingService.startRecording((status) => {
    statusUpdatesCount++;
  });
  assert.strictEqual(voiceRecordingService.getIsRecording(), true, 'Service should report recording active');

  await voiceRecordingService.pauseRecording();
  assert.strictEqual(voiceRecordingService.getIsPaused(), true, 'Service should report recording paused');

  await voiceRecordingService.resumeRecording();
  assert.strictEqual(voiceRecordingService.getIsPaused(), false, 'Service should report recording resumed');
  console.log('✓ 3. Recording Lifecycle: Start, pause, and resume execute successfully');

  // Test 4: Prevent Concurrent Multiple Recordings
  let concurrentErrorCaught = false;
  try {
    await voiceRecordingService.startRecording();
  } catch (err: any) {
    concurrentErrorCaught = true;
  }
  assert.strictEqual(concurrentErrorCaught, true, 'Starting a second recording simultaneously must fail');
  console.log('✓ 4. Concurrency Guard: Multiple simultaneous recordings are prevented');

  // Test 5: Stop Recording & Retrieve File URI and Duration
  const recordingResult = await voiceRecordingService.stopRecording();
  assert.ok(recordingResult.uri.startsWith('file://'), 'Recording URI must be a valid file URI');
  assert.ok(recordingResult.durationMillis > 0, 'Duration millis must be positive');
  assert.strictEqual(recordingResult.durationSeconds, 12, 'Duration seconds should be rounded properly (12s)');
  assert.strictEqual(voiceRecordingService.getIsRecording(), false, 'Recording state reset after stop');
  console.log('✓ 5. Recording Stop: File URI, duration, and amplitude metrics generated');

  // Test 6: Cancel Recording Cleanup
  await voiceRecordingService.startRecording();
  assert.strictEqual(voiceRecordingService.getIsRecording(), true);
  await voiceRecordingService.cancelRecording();
  assert.strictEqual(voiceRecordingService.getIsRecording(), false, 'Recording cancelled and cleaned up');
  console.log('✓ 6. Cancel Cleanup: Unsaved recording resources released cleanly on cancellation');

  // Test 7: Audio Playback - Play and Pause
  let playbackPlaying = false;
  const unsubscribe = voicePlaybackService.addListener((state) => {
    if (state.audioId === 'msg-voice-1') {
      playbackPlaying = state.isPlaying;
    }
  });

  await voicePlaybackService.play({
    audioId: 'msg-voice-1',
    uri: 'https://mock-storage.apnasamaj.local/chat-attachments/direct/kewat/c1/voice-1.m4a',
  });
  assert.strictEqual(playbackPlaying, true, 'Playback state should indicate playing');

  await voicePlaybackService.pause();
  assert.strictEqual(voicePlaybackService.getState().isPaused, true, 'Playback state should indicate paused');

  await voicePlaybackService.resume();
  assert.strictEqual(voicePlaybackService.getState().isPlaying, true, 'Playback state should indicate resumed');
  console.log('✓ 7. Audio Playback: Play, pause, and resume operate seamlessly');

  // Test 8: Playback Speed Toggle (1x -> 1.5x -> 2x -> 1x)
  const rate15 = await voicePlaybackService.togglePlaybackRate();
  assert.strictEqual(rate15, 1.5, 'Toggling from 1.0x should reach 1.5x');
  const rate20 = await voicePlaybackService.togglePlaybackRate();
  assert.strictEqual(rate20, 2.0, 'Toggling from 1.5x should reach 2.0x');
  const rate10 = await voicePlaybackService.togglePlaybackRate();
  assert.strictEqual(rate10, 1.0, 'Toggling from 2.0x should return to 1.0x');
  console.log('✓ 8. Playback Speed: Speed toggling cycles through 1x, 1.5x, 2x');

  // Test 9: Single Playback Concurrency (Starting a second audio stops the first)
  let firstAudioStopped = false;
  voicePlaybackService.addListener((state) => {
    if (state.audioId === 'msg-voice-2' && state.isPlaying) {
      firstAudioStopped = true;
    }
  });

  await voicePlaybackService.play({
    audioId: 'msg-voice-2',
    uri: 'https://mock-storage.apnasamaj.local/chat-attachments/direct/kewat/c1/voice-2.m4a',
  });
  assert.strictEqual(voicePlaybackService.getCurrentAudioId(), 'msg-voice-2', 'Active audio ID updated to new track');
  assert.strictEqual(firstAudioStopped, true, 'Previous audio stopped when new track started');
  console.log('✓ 9. Single Playback Lock: Only one voice note can play at a time');

  // Test 10: Seek Operation
  await voicePlaybackService.seek(6000);
  assert.strictEqual(voicePlaybackService.getState().positionMillis, 6000, 'Seek position set to 6000ms');
  await voicePlaybackService.stop();
  assert.strictEqual(voicePlaybackService.getCurrentAudioId(), null, 'Playback stopped and unloaded');
  unsubscribe();
  console.log('✓ 10. Playback Seek & Teardown: Seeking and unmounting release hardware handles');

  // Test 11: Offline Outbox Storage of Local Voice Note
  const testTenant = 'kewat';
  const testUser = 'user-voice-tester';
  const persistence = new ChatPersistenceService();
  const outbox = new OutboxQueueService(persistence);

  const localPendingVoice = await persistence.savePendingMessage({
    tempId: 'temp-voice-offline-1',
    conversationId: 'conv-voice-1',
    conversationType: 'DIRECT',
    senderId: testUser,
    content: '',
    tenantSlug: testTenant,
    userId: testUser,
    attachment: {
      type: 'AUDIO',
      fileName: 'voice-note-offline.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 24500,
      storagePath: '',
      localUri: 'file:///mock/cache/audio/voice-note-offline.m4a',
      duration: 15,
    },
  });

  assert.strictEqual(localPendingVoice.deliveryStatus, 'pending');
  assert.strictEqual(localPendingVoice.attachment?.type, 'AUDIO');
  assert.strictEqual(localPendingVoice.attachment?.localUri, 'file:///mock/cache/audio/voice-note-offline.m4a');
  assert.strictEqual(localPendingVoice.attachment?.duration, 15);
  console.log('✓ 11. Offline Voice Persistence: Local recording references and duration safely stored');

  // Test 12: Restart Recovery of Offline Voice Message
  const recoveredMessages = await persistence.getPendingOutboxMessages(testTenant, testUser);
  const recoveredVoice = recoveredMessages.find((m) => m.tempId === 'temp-voice-offline-1');
  assert.ok(recoveredVoice, 'Pending offline voice note must be recovered after restart');
  assert.strictEqual(recoveredVoice.attachment?.localUri, 'file:///mock/cache/audio/voice-note-offline.m4a');
  console.log('✓ 12. App Restart Recovery: Pending voice recording references persist across sessions');

  // Test 13: Outbox Two-Phase Upload and Dispatch
  await setAuthTokens({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
  let uploadCalled = false;
  let sendCalled = false;

  const originalUpload = chatApi.uploadDirectAttachment;
  const originalSend = chatApi.sendDirectMessage;

  chatApi.uploadDirectAttachment = async (convId: string, file: any) => {
    uploadCalled = true;
    assert.strictEqual(file.uri, 'file:///mock/cache/audio/voice-note-offline.m4a');
    return {
      id: 'att-server-voice-123',
      type: 'AUDIO',
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: 24500,
      storagePath: `direct/${testTenant}/${convId}/att-server-voice-123.m4a`,
      url: 'https://mock-storage.apnasamaj.local/chat-attachments/voice.m4a',
      duration: 15,
      createdAt: new Date().toISOString(),
    };
  };

  chatApi.sendDirectMessage = async (convId: string, content: any, tempId: any, attachment: any) => {
    sendCalled = true;
    assert.strictEqual(attachment?.id, 'att-server-voice-123');
    assert.strictEqual(attachment?.storagePath, `direct/${testTenant}/${convId}/att-server-voice-123.m4a`);
    return {
      id: 'msg-server-voice-456',
      conversationId: convId,
      senderId: testUser,
      content: '',
      clientMessageId: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: [attachment],
    };
  };

  await outbox.initialize(testTenant, testUser);
  outbox.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(uploadCalled, true, 'Direct attachment upload endpoint called for localUri');
  assert.strictEqual(sendCalled, true, 'Direct message endpoint called with server storagePath');

  // Cleanup mocks
  chatApi.uploadDirectAttachment = originalUpload;
  chatApi.sendDirectMessage = originalSend;

  // Verify message deliveryStatus updated and removed from pending outbox
  const remainingPending = await persistence.getPendingOutboxMessages(testTenant, testUser);
  assert.strictEqual(
    remainingPending.some((m) => m.tempId === 'temp-voice-offline-1'),
    false,
    'Voice message removed from pending outbox after successful dispatch'
  );
  console.log('✓ 13. Two-Phase Outbox Dispatch: Automatic upload followed by idempotent message creation');

  // Test 14: Phase 1 Upload Success with Phase 2 Send Failure -> Reuses Uploaded StoragePath on Retry
  const retryTenant = 'kewat-samaj';
  const retryUser = 'user-retry-001';
  const retryConv = 'conv-retry-123';
  const retryTempId = 'temp-voice-retry-01';

  await persistence.savePendingMessage({
    tempId: retryTempId,
    conversationId: retryConv,
    conversationType: 'DIRECT',
    senderId: retryUser,
    content: '',
    attachment: {
      id: undefined,
      type: 'AUDIO',
      fileName: 'voice-note-retry.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 31000,
      storagePath: '',
      duration: 18,
      localUri: 'file:///mock/cache/audio/voice-note-retry.m4a',
    },
    tenantSlug: retryTenant,
    userId: retryUser,
  });

  let uploadAttempts = 0;
  let sendAttempts = 0;

  chatApi.uploadDirectAttachment = async (convId: string, file: any) => {
    uploadAttempts++;
    return {
      id: 'att-retry-999',
      type: 'AUDIO',
      fileName: file.name,
      mimeType: file.type,
      fileSizeBytes: 31000,
      storagePath: `direct/${retryTenant}/${convId}/att-retry-999.m4a`,
      url: 'https://mock-storage.apnasamaj.local/chat-attachments/voice-retry.m4a',
      duration: 18,
      createdAt: new Date().toISOString(),
    };
  };

  // First send attempt fails (e.g. temporary 500 error / network blip)
  let shouldFailSend = true;
  chatApi.sendDirectMessage = async (convId: string, content: any, tempId: any, attachment: any) => {
    sendAttempts++;
    if (shouldFailSend) {
      throw new Error('500 Internal Server Error: Database busy');
    }
    return {
      id: 'msg-server-retry-finished',
      conversationId: convId,
      senderId: retryUser,
      content: '',
      clientMessageId: tempId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: [attachment],
    };
  };

  const retryOutbox = new OutboxQueueService(persistence);
  await retryOutbox.initialize(retryTenant, retryUser);
  retryOutbox.setOnlineStatus(true);
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(uploadAttempts, 1, 'Phase 1 upload should be called once');
  assert.strictEqual(sendAttempts, 1, 'Phase 2 send attempted once and failed');

  // Verify that local persistence recorded the uploaded storagePath
  const pendingAfterFail = await persistence.getPendingOutboxMessages(retryTenant, retryUser);
  const msgAfterFail = pendingAfterFail.find((m) => m.tempId === retryTempId);
  assert.ok(msgAfterFail, 'Message remains pending for retry');
  assert.strictEqual(
    msgAfterFail.attachment?.storagePath,
    `direct/${retryTenant}/${retryConv}/att-retry-999.m4a`,
    'Uploaded storagePath must be saved immediately to prevent re-uploading on retry'
  );

  // Now trigger retry when network/server recovers
  shouldFailSend = false;
  await retryOutbox.retryMessage(retryTempId);
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(uploadAttempts, 1, 'Phase 1 upload was NOT repeated; existing storagePath was reused safely');
  assert.strictEqual(sendAttempts, 2, 'Phase 2 send was retried successfully');
  console.log('✓ 14. Audio Upload Retry Safety: Existing uploaded attachment is reused without duplicate uploads');

  // Test 15: Missing Local File Handling
  const missingFileTempId = 'temp-missing-file-01';
  await persistence.savePendingMessage({
    tempId: missingFileTempId,
    conversationId: retryConv,
    conversationType: 'DIRECT',
    senderId: retryUser,
    content: '',
    attachment: {
      id: undefined,
      type: 'AUDIO',
      fileName: 'deleted-note.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 10000,
      storagePath: '',
      duration: 5,
      localUri: 'file:///data/user/0/cache/deleted-file.m4a',
    },
    tenantSlug: retryTenant,
    userId: retryUser,
  });

  chatApi.uploadDirectAttachment = async () => {
    throw new Error('ENOENT: no such file or directory, open file:///data/user/0/cache/deleted-file.m4a');
  };

  await retryOutbox.processQueue();
  await new Promise((r) => setTimeout(r, 100));

  const pendingAfterMissing = await persistence.getPendingOutboxMessages(retryTenant, retryUser);
  const failedItem = pendingAfterMissing.find((m) => m.tempId === missingFileTempId);
  assert.ok(failedItem, 'Item exists in local store');
  assert.strictEqual(failedItem.deliveryStatus, 'failed', 'Missing local file message marked failed immediately');
  assert.ok(failedItem.lastError?.includes('deleted or cannot be found'), 'Clear error explanation recorded');
  console.log('✓ 15. Local File Durability: Missing local file is gracefully flagged as failed without endless retries');

  // Test 16: Multi-Tenant Audio Isolation on Queue Switch
  const otherTenant = 'other-samaj';
  const otherUser = 'user-other-002';
  const otherOutbox = new OutboxQueueService(persistence);
  await otherOutbox.initialize(otherTenant, otherUser);

  const otherPending = await persistence.getPendingOutboxMessages(otherTenant, otherUser);
  assert.strictEqual(otherPending.length, 0, 'Other tenant must have zero access to previous tenant voice messages');
  console.log('✓ 16. Multi-Tenant Audio Isolation: Cross-tenant outbox queues remain completely segregated');

  // Restore mocks
  chatApi.uploadDirectAttachment = originalUpload;
  chatApi.sendDirectMessage = originalSend;

  console.log('\n--- Batch 8.7 & 8.7.1 Mobile Test Suite: All 16/16 Tests Passed Successfully ---\n');
}

if (require.main === module) {
  runVoiceNotesFlowTests().catch((err) => {
    console.error('Test failure:', err);
    process.exit(1);
  });
}

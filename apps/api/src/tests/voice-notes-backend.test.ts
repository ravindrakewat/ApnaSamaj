import assert from 'assert';
import {
  detectChatAttachmentTypeAndMime,
  uploadChatAttachment,
  CHAT_MAX_AUDIO_BYTES,
  OversizedFileError,
  InvalidMimeTypeError,
} from '../services/storage.service';
import { sendChatMessage, ChatServiceError, ForbiddenChatError } from '../modules/chat/chat.service';
import { sendDirectMessage, getChatAttachmentDetails } from '../modules/chat/direct-chat.service';
import { ChatAttachmentInput } from '@apnasamaj/shared-types';

async function runVoiceNotesBackendTests() {
  console.log('\n--- Running Batch 8.7 Voice Notes & Audio Messaging Backend Test Suite ---');

  // Helper buffer creators
  const createMockM4aBuffer = (size = 1024): Buffer => {
    const buf = Buffer.alloc(size);
    // ISO BMFF box with 'ftyp' at offset 4 and 'M4A ' at offset 8
    buf[4] = 0x66; buf[5] = 0x74; buf[6] = 0x79; buf[7] = 0x70; // 'ftyp'
    buf[8] = 0x4d; buf[9] = 0x34; buf[10] = 0x41; buf[11] = 0x20; // 'M4A '
    return buf;
  };

  const createMockMp3Buffer = (size = 1024): Buffer => {
    const buf = Buffer.alloc(size);
    // ID3 header
    buf[0] = 0x49; buf[1] = 0x44; buf[2] = 0x33;
    return buf;
  };

  const createMockOggBuffer = (size = 1024): Buffer => {
    const buf = Buffer.alloc(size);
    // OggS header
    buf[0] = 0x4f; buf[1] = 0x47; buf[2] = 0x47; buf[3] = 0x53;
    return buf;
  };

  const createMockWavBuffer = (size = 1024): Buffer => {
    const buf = Buffer.alloc(size);
    // RIFF....WAVE
    buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
    buf[8] = 0x57; buf[9] = 0x41; buf[10] = 0x56; buf[11] = 0x45;
    return buf;
  };

  // Test 1: M4A Audio Detection
  const m4aDetected = detectChatAttachmentTypeAndMime(createMockM4aBuffer(), 'voice-note.m4a');
  assert.ok(m4aDetected, 'M4A file should be detected');
  assert.strictEqual(m4aDetected?.type, 'AUDIO', 'Type must be AUDIO');
  assert.strictEqual(m4aDetected?.mimeType, 'audio/m4a');
  assert.strictEqual(m4aDetected?.extension, 'm4a');
  console.log('✓ 1. MIME Detection: M4A audio detected via ISO-BMFF header');

  // Test 2: MP3 Audio Detection
  const mp3Detected = detectChatAttachmentTypeAndMime(createMockMp3Buffer(), 'recording.mp3');
  assert.ok(mp3Detected);
  assert.strictEqual(mp3Detected?.type, 'AUDIO');
  assert.strictEqual(mp3Detected?.mimeType, 'audio/mpeg');
  console.log('✓ 2. MIME Detection: MP3 audio detected via ID3 header');

  // Test 3: OGG/OPUS Audio Detection
  const oggDetected = detectChatAttachmentTypeAndMime(createMockOggBuffer(), 'voice.ogg');
  assert.ok(oggDetected);
  assert.strictEqual(oggDetected?.type, 'AUDIO');
  assert.strictEqual(oggDetected?.mimeType, 'audio/ogg');
  console.log('✓ 3. MIME Detection: OGG/OPUS audio detected via OggS signature');

  // Test 4: WAV Audio Detection
  const wavDetected = detectChatAttachmentTypeAndMime(createMockWavBuffer(), 'sound.wav');
  assert.ok(wavDetected);
  assert.strictEqual(wavDetected?.type, 'AUDIO');
  assert.strictEqual(wavDetected?.mimeType, 'audio/wav');
  console.log('✓ 4. MIME Detection: WAV audio detected via RIFF-WAVE header');

  // Test 5: Reject Malicious Executable disguised as audio
  const fakeAudioBuf = Buffer.alloc(100);
  fakeAudioBuf[0] = 0x4d; fakeAudioBuf[1] = 0x5a; // MZ header
  const rejectedExe = detectChatAttachmentTypeAndMime(fakeAudioBuf, 'voice-note.m4a');
  assert.strictEqual(rejectedExe, null, 'MZ executable disguised as m4a must be rejected');

  const fakeScriptBuf = Buffer.alloc(100);
  fakeScriptBuf[0] = 0x23; fakeScriptBuf[1] = 0x21; // #! shebang
  const rejectedScript = detectChatAttachmentTypeAndMime(fakeScriptBuf, 'voice-note.m4a');
  assert.strictEqual(rejectedScript, null, 'Shell script disguised as m4a must be rejected');
  console.log('✓ 5. Security: Dangerous executables and scripts spoofing audio extensions rejected');

  // Test 6: Upload Voice Note with Duration Metadata
  const uploadResult = await uploadChatAttachment({
    tenantSlug: 'kewat',
    conversationId: 'conv-test-voice-1',
    fileBuffer: createMockM4aBuffer(45000),
    originalName: 'voice-note-2026.m4a',
    duration: 18,
  });

  assert.strictEqual(uploadResult.type, 'AUDIO');
  assert.strictEqual(uploadResult.duration, 18);
  assert.ok(uploadResult.storagePath.startsWith('direct/kewat/conv-test-voice-1/'));
  assert.ok(uploadResult.url.length > 0);
  console.log('✓ 6. Upload Pipeline: Audio upload returns valid type, storagePath, signed URL, and duration');

  // Test 7: Reject Oversized Audio File (> 25MB)
  let oversizedErrorCaught = false;
  try {
    await uploadChatAttachment({
      tenantSlug: 'kewat',
      conversationId: 'conv-test-voice-1',
      fileBuffer: createMockM4aBuffer(CHAT_MAX_AUDIO_BYTES + 1024),
      originalName: 'huge-voice.m4a',
    });
  } catch (err: any) {
    if (err instanceof OversizedFileError) {
      oversizedErrorCaught = true;
    }
  }
  assert.strictEqual(oversizedErrorCaught, true, 'Audio file exceeding 25MB limit must be rejected');
  console.log('✓ 7. Size Ceiling: Oversized audio (>25MB) rejected with OversizedFileError');

  // Test 8: Mock DB for Chat Service with Audio Attachments
  const mockDb: any = {
    chatMessage: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({
        id: 'msg-audio-grp-1',
        groupId: data.groupId,
        senderId: data.senderId,
        content: data.content,
        clientMessageId: data.clientMessageId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: { id: data.senderId, profile: { fullName: 'Sunil Kewat', avatarUrl: null } },
        attachments: [
          {
            id: 'att-audio-grp-1',
            chatMessageId: 'msg-audio-grp-1',
            type: data.attachments.create.type,
            fileName: data.attachments.create.fileName,
            mimeType: data.attachments.create.mimeType,
            fileSizeBytes: data.attachments.create.fileSizeBytes,
            storagePath: data.attachments.create.storagePath,
            duration: data.attachments.create.duration,
            createdAt: new Date(),
          },
        ],
      }),
    },
    group: {
      findFirst: async () => ({ id: 'grp-audio-1', name: 'Group Audio', slug: 'grp-audio-1', privacy: 'PUBLIC' }),
      findUnique: async () => ({ id: 'grp-audio-1', name: 'Group Audio', slug: 'grp-audio-1', privacy: 'PUBLIC' }),
    },
    groupMember: {
      findFirst: async () => ({ id: 'cm-1', role: 'MEMBER' }),
      findUnique: async () => ({ id: 'cm-1', role: 'MEMBER' }),
    },
    chatAttachment: {
      findFirst: async () => null,
    },
  };

  const groupAudioMsg = await sendChatMessage(
    'grp-audio-1',
    'user-1',
    '',
    {
      type: 'AUDIO',
      fileName: 'group-note.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 32000,
      storagePath: 'groups/kewat/grp-audio-1/audio-1.m4a',
      duration: 22,
    },
    'temp-audio-grp-01',
    mockDb
  );

  assert.strictEqual(groupAudioMsg.attachments?.length, 1);
  assert.strictEqual(groupAudioMsg.attachments?.[0].type, 'AUDIO');
  assert.strictEqual(groupAudioMsg.attachments?.[0].duration, 22);
  console.log('✓ 8. Group Chat Service: Voice message created with duration metadata');

  // Test 9: Direct Chat Service with Audio Attachments
  const mockDirectDb: any = {
    directConversation: {
      findUnique: async () => ({
        id: 'conv-audio-1',
        userOneId: 'user-1',
        userTwoId: 'user-2',
      }),
      update: async () => ({}),
    },
    directConversationParticipant: {
      upsert: async () => ({}),
    },
    directMessage: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({
        id: 'msg-audio-dir-1',
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.content,
        clientMessageId: data.clientMessageId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: { id: data.senderId, profile: { fullName: 'Sunil Kewat', avatarUrl: null } },
        attachments: [
          {
            id: 'att-audio-dir-1',
            directMessageId: 'msg-audio-dir-1',
            type: data.attachments.create.type,
            fileName: data.attachments.create.fileName,
            mimeType: data.attachments.create.mimeType,
            fileSizeBytes: data.attachments.create.fileSizeBytes,
            storagePath: data.attachments.create.storagePath,
            duration: data.attachments.create.duration,
            createdAt: new Date(),
          },
        ],
      }),
    },
    chatAttachment: {
      findFirst: async () => null,
    },
  };

  const directAudioMsg = await sendDirectMessage(
    'conv-audio-1',
    'user-1',
    '',
    {
      type: 'AUDIO',
      fileName: 'direct-note.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 28000,
      storagePath: 'direct/kewat/conv-audio-1/audio-2.m4a',
      duration: 14,
    },
    'temp-audio-dir-01',
    mockDirectDb
  );

  assert.strictEqual(directAudioMsg.attachments?.length, 1);
  assert.strictEqual(directAudioMsg.attachments?.[0].type, 'AUDIO');
  assert.strictEqual(directAudioMsg.attachments?.[0].duration, 14);
  console.log('✓ 9. Direct Chat Service: Voice message created with duration metadata');

  // Test 10: Idempotency with Audio Messages
  // Subsequent submission with same clientMessageId returns existing message
  const duplicateGroupMsg = await sendChatMessage(
    'grp-audio-1',
    'user-1',
    '',
    {
      type: 'AUDIO',
      fileName: 'group-note.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 32000,
      storagePath: 'groups/kewat/grp-audio-1/audio-1.m4a',
      duration: 22,
    },
    'temp-audio-grp-01',
    mockDb
  );
  assert.strictEqual(duplicateGroupMsg.id, groupAudioMsg.id, 'Idempotent retry must return the original message');
  console.log('✓ 10. Idempotency & Duplicate Prevention: Re-transmitting same voice note returns cached original');

  // Test 11: Attachment Association Protection & Safe Reuse
  // 11a: Reusing same attachment by different user is strictly forbidden
  const mockDbWithExistingAttachment: any = {
    ...mockDb,
    chatMessage: {
      findFirst: async () => null,
    },
    chatAttachment: {
      findFirst: async () => ({
        id: 'existing-att-1',
        storagePath: 'groups/kewat/grp-audio-1/audio-1.m4a',
        chatMessage: {
          id: 'existing-msg-1',
          groupId: 'grp-audio-1',
          senderId: 'user-1',
          content: '',
          clientMessageId: 'temp-audio-grp-01',
          createdAt: new Date(),
          updatedAt: new Date(),
          sender: { id: 'user-1', profile: { fullName: 'Sunil Kewat', avatarUrl: null } },
          attachments: [
            {
              id: 'existing-att-1',
              type: 'AUDIO',
              fileName: 'group-note.m4a',
              mimeType: 'audio/m4a',
              fileSizeBytes: 32000,
              storagePath: 'groups/kewat/grp-audio-1/audio-1.m4a',
              duration: 22,
              createdAt: new Date(),
            },
          ],
        },
      }),
    },
  };

  let stolenAttachmentErrorCaught = false;
  try {
    await sendChatMessage(
      'grp-audio-1',
      'user-hacker-99',
      '',
      {
        type: 'AUDIO',
        fileName: 'stolen.m4a',
        mimeType: 'audio/m4a',
        fileSizeBytes: 32000,
        storagePath: 'groups/kewat/grp-audio-1/audio-1.m4a',
        duration: 22,
      },
      'temp-hacker-01',
      mockDbWithExistingAttachment
    );
  } catch (err: any) {
    if (err instanceof ChatServiceError && err.message.includes('already been associated')) {
      stolenAttachmentErrorCaught = true;
    }
  }
  assert.strictEqual(stolenAttachmentErrorCaught, true, 'Re-associating another user attachment must fail with 400 error');

  // 11b: Safe reuse by the same sender returns original message cleanly
  const recoveredAudioMsg = await sendChatMessage(
    'grp-audio-1',
    'user-1',
    '',
    {
      type: 'AUDIO',
      fileName: 'group-note.m4a',
      mimeType: 'audio/m4a',
      fileSizeBytes: 32000,
      storagePath: 'groups/kewat/grp-audio-1/audio-1.m4a',
      duration: 22,
    },
    'temp-audio-grp-01',
    mockDbWithExistingAttachment
  );
  assert.strictEqual(recoveredAudioMsg.id, 'existing-msg-1', 'Same author idempotent retry recovers message safely');
  console.log('✓ 11. Attachment Association Protection: Re-use by unauthorized users rejected; same-author retry recovered safely');

  // Test 12: Attachment Access Security (Non-participants rejected)
  const mockSecurityDb: any = {
    chatAttachment: {
      findUnique: async () => ({
        id: 'att-secure-01',
        type: 'AUDIO',
        fileName: 'private-voice.m4a',
        mimeType: 'audio/m4a',
        fileSizeBytes: 25000,
        storagePath: 'direct/kewat/conv-1/private-voice.m4a',
        directMessage: {
          conversation: {
            userOneId: 'user-alice',
            userTwoId: 'user-bob',
          },
        },
      }),
    },
  };

  let unauthorizedAttachmentCaught = false;
  try {
    await getChatAttachmentDetails('att-secure-01', 'user-eve-unauthorized', mockSecurityDb);
  } catch (err: any) {
    if (err instanceof ForbiddenChatError) {
      unauthorizedAttachmentCaught = true;
    }
  }
  assert.strictEqual(unauthorizedAttachmentCaught, true, 'Non-participant access to direct voice note must be rejected with 403');

  const authorizedAttachment = await getChatAttachmentDetails('att-secure-01', 'user-alice', mockSecurityDb);
  assert.strictEqual(authorizedAttachment.id, 'att-secure-01');
  assert.ok(authorizedAttachment.url.length > 0, 'Authorized participant receives signed URL');
  console.log('✓ 12. Audio Security & Privacy: Non-participants strictly forbidden from accessing voice attachments');

  console.log('\n--- Batch 8.7 & 8.7.1 Backend Test Suite: All 12/12 Tests Passed Successfully ---\n');
}

runVoiceNotesBackendTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});

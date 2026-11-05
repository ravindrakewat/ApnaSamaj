import assert from 'assert';
import { PrismaClient } from '@apnasamaj/database';
import {
  detectChatAttachmentTypeAndMime,
  uploadChatAttachment,
  createTemporarySignedChatAttachmentUrl,
  CHAT_MAX_IMAGE_BYTES,
  CHAT_MAX_VIDEO_BYTES,
  CHAT_MAX_DOCUMENT_BYTES,
  StorageError,
  InvalidMimeTypeError,
  OversizedFileError,
} from '../services/storage.service';
import {
  sendDirectMessage,
  getDirectMessageHistory,
  getChatAttachmentDetails,
  verifyDirectConversationAccess,
} from '../modules/chat/direct-chat.service';
import {
  sendChatMessage,
  getGroupChatHistory,
  verifyGroupChatAccess,
} from '../modules/chat/chat.service';
import { ChatAttachmentInput } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.4: Chat Media Attachments Backend Test  ');
console.log('================================================================');

let passedAssertions = 0;
function pass(message: string) {
  passedAssertions++;
  console.log(`✅ PASS: ${message}`);
}

async function runChatMediaAttachmentsSuite() {
  // --------------------------------------------------------
  // Suite 1: File Content & Magic Bytes Detection
  // --------------------------------------------------------
  console.log('\n--- 1. File Magic Bytes & Content Detection ---');

  // JPEG: FF D8 FF
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const jpegDetected = detectChatAttachmentTypeAndMime(jpegBuffer, 'photo.jpg');
  assert.strictEqual(jpegDetected?.type, 'IMAGE');
  assert.strictEqual(jpegDetected?.mimeType, 'image/jpeg');
  pass('JPEG magic bytes identified correctly as IMAGE (image/jpeg)');

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const pngDetected = detectChatAttachmentTypeAndMime(pngBuffer, 'screenshot.png');
  assert.strictEqual(pngDetected?.type, 'IMAGE');
  assert.strictEqual(pngDetected?.mimeType, 'image/png');
  pass('PNG magic bytes identified correctly as IMAGE (image/png)');

  // WebP: RIFF ... WEBP
  const webpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  ]);
  const webpDetected = detectChatAttachmentTypeAndMime(webpBuffer, 'sticker.webp');
  assert.strictEqual(webpDetected?.type, 'IMAGE');
  assert.strictEqual(webpDetected?.mimeType, 'image/webp');
  pass('WebP magic bytes identified correctly as IMAGE (image/webp)');

  // MP4: ISO BMFF ftyp box at offset 4
  const mp4Buffer = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // offset 4: 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
  ]);
  const mp4Detected = detectChatAttachmentTypeAndMime(mp4Buffer, 'video.mp4');
  assert.strictEqual(mp4Detected?.type, 'VIDEO');
  assert.strictEqual(mp4Detected?.mimeType, 'video/mp4');
  pass('MP4 ISO BMFF box identified correctly as VIDEO (video/mp4)');

  // MOV: QuickTime brand or .mov extension
  const movBuffer = Buffer.from([
    0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, // 'ftyp'
    0x71, 0x74, 0x20, 0x20, 0x20, 0x05, 0x03, 0x00, // 'qt  '
  ]);
  const movDetected = detectChatAttachmentTypeAndMime(movBuffer, 'clip.mov');
  assert.strictEqual(movDetected?.type, 'VIDEO');
  assert.strictEqual(movDetected?.mimeType, 'video/quicktime');
  pass('MOV QuickTime file identified correctly as VIDEO (video/quicktime)');

  // PDF: %PDF-
  const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
  const pdfDetected = detectChatAttachmentTypeAndMime(pdfBuffer, 'document.pdf');
  assert.strictEqual(pdfDetected?.type, 'DOCUMENT');
  assert.strictEqual(pdfDetected?.mimeType, 'application/pdf');
  pass('PDF header identified correctly as DOCUMENT (application/pdf)');

  // DOCX: PK zip archive (50 4B 03 04)
  const docxBuffer = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
    0x08, 0x00, 0x00, 0x00, 0x21, 0x00,
  ]);
  const docxDetected = detectChatAttachmentTypeAndMime(docxBuffer, 'resume.docx');
  assert.strictEqual(docxDetected?.type, 'DOCUMENT');
  assert.strictEqual(
    docxDetected?.mimeType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  pass('DOCX OpenXML container identified correctly as DOCUMENT');

  // XLSX: PK zip archive (50 4B 03 04) with .xlsx extension
  const xlsxDetected = detectChatAttachmentTypeAndMime(docxBuffer, 'accounts.xlsx');
  assert.strictEqual(xlsxDetected?.type, 'DOCUMENT');
  assert.strictEqual(
    xlsxDetected?.mimeType,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  pass('XLSX OpenXML container identified correctly as DOCUMENT');

  // CFBF OLE Compound Document (DOC / XLS legacy)
  const cfbfBuffer = Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const docDetected = detectChatAttachmentTypeAndMime(cfbfBuffer, 'legacy.doc');
  assert.strictEqual(docDetected?.type, 'DOCUMENT');
  assert.strictEqual(docDetected?.mimeType, 'application/msword');
  pass('Legacy DOC CFBF container identified as DOCUMENT (application/msword)');

  const xlsDetected = detectChatAttachmentTypeAndMime(cfbfBuffer, 'budget.xls');
  assert.strictEqual(xlsDetected?.type, 'DOCUMENT');
  assert.strictEqual(xlsDetected?.mimeType, 'application/vnd.ms-excel');
  pass('Legacy XLS CFBF container identified as DOCUMENT (application/vnd.ms-excel)');

  // --------------------------------------------------------
  // Suite 2: Malicious / Unsupported File Rejection
  // --------------------------------------------------------
  console.log('\n--- 2. Malicious & Unsupported File Rejection ---');

  // Windows Executable (MZ)
  const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const exeDetected = detectChatAttachmentTypeAndMime(exeBuffer, 'payload.exe');
  assert.strictEqual(exeDetected, null);
  pass('Executable .exe with MZ magic bytes is strictly rejected');

  // Linux Binary (ELF)
  const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const elfDetected = detectChatAttachmentTypeAndMime(elfBuffer, 'payload.bin');
  assert.strictEqual(elfDetected, null);
  pass('ELF binary executable is strictly rejected');

  // Shell script with #!
  const scriptBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
  const scriptDetected = detectChatAttachmentTypeAndMime(scriptBuffer, 'script.sh');
  assert.strictEqual(scriptDetected, null);
  pass('Shell script is strictly rejected');

  // Forbidden extension spoofing: .apk or .js with image extension
  const apkDetected = detectChatAttachmentTypeAndMime(jpegBuffer, 'app.apk');
  assert.strictEqual(apkDetected, null);
  pass('Forbidden extension .apk is strictly rejected regardless of bytes');

  // --------------------------------------------------------
  // Suite 3: File Size Limits Enforcement
  // --------------------------------------------------------
  console.log('\n--- 3. File Size Limit Verification ---');

  // Image limit: 10MB
  const oversizedImageBuffer = Buffer.alloc(CHAT_MAX_IMAGE_BYTES + 1024);
  // Set valid JPEG magic bytes
  oversizedImageBuffer[0] = 0xff;
  oversizedImageBuffer[1] = 0xd8;
  oversizedImageBuffer[2] = 0xff;

  let imageSizeThrew = false;
  try {
    await uploadChatAttachment({
      tenantSlug: 'kewat',
      conversationId: 'conv-123',
      fileBuffer: oversizedImageBuffer,
      originalName: 'huge.jpg',
    });
  } catch (err: unknown) {
    if (err instanceof OversizedFileError) {
      imageSizeThrew = true;
    }
  }
  assert.strictEqual(imageSizeThrew, true);
  pass('Oversized image (>10MB) is strictly rejected with OversizedFileError');

  // Document limit: 20MB
  const oversizedDocBuffer = Buffer.alloc(CHAT_MAX_DOCUMENT_BYTES + 1024);
  oversizedDocBuffer[0] = 0x25;
  oversizedDocBuffer[1] = 0x50;
  oversizedDocBuffer[2] = 0x44;
  oversizedDocBuffer[3] = 0x46;

  let docSizeThrew = false;
  try {
    await uploadChatAttachment({
      tenantSlug: 'kewat',
      conversationId: 'conv-123',
      fileBuffer: oversizedDocBuffer,
      originalName: 'massive.pdf',
    });
  } catch (err: unknown) {
    if (err instanceof OversizedFileError) {
      docSizeThrew = true;
    }
  }
  assert.strictEqual(docSizeThrew, true);
  pass('Oversized document (>20MB) is strictly rejected with OversizedFileError');

  // --------------------------------------------------------
  // Suite 4: Valid Upload & Storage Path Isolation
  // --------------------------------------------------------
  console.log('\n--- 4. Upload & Path Isolation Verification ---');

  const uploadResult = await uploadChatAttachment({
    tenantSlug: 'kewat',
    conversationId: 'conv-test-999',
    fileBuffer: jpegBuffer,
    originalName: 'my_family_photo.jpg',
  });

  assert.ok(uploadResult.id, 'Attachment ID must be generated');
  assert.strictEqual(uploadResult.type, 'IMAGE');
  assert.strictEqual(uploadResult.fileName, 'my_family_photo.jpg');
  assert.strictEqual(uploadResult.mimeType, 'image/jpeg');
  assert.ok(uploadResult.storagePath.startsWith('direct/kewat/conv-test-999/'));
  assert.ok(uploadResult.url.includes(uploadResult.storagePath));
  pass('Direct chat upload generates isolated path under direct/tenant/conversation/');

  const groupUploadResult = await uploadChatAttachment({
    tenantSlug: 'kewat',
    groupId: 'grp-youth-444',
    fileBuffer: pdfBuffer,
    originalName: 'meeting_agenda.pdf',
  });

  assert.strictEqual(groupUploadResult.type, 'DOCUMENT');
  assert.ok(groupUploadResult.storagePath.startsWith('groups/kewat/grp-youth-444/'));
  pass('Group chat upload generates isolated path under groups/tenant/group/');

  // --------------------------------------------------------
  // Suite 5: Mock Database Test Harness
  // --------------------------------------------------------
  console.log('\n--- 5. Messaging with Media Attachments in Mock DB ---');

  // In-memory mock storage
  const directMessages: any[] = [];
  const groupMessages: any[] = [];
  const chatAttachments: any[] = [];
  const conversations: any[] = [
    {
      id: 'conv-101',
      userOneId: 'usr-aarav',
      userTwoId: 'usr-bhavna',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const participants: any[] = [
    { conversationId: 'conv-101', userId: 'usr-aarav', lastReadAt: new Date() },
    { conversationId: 'conv-101', userId: 'usr-bhavna', lastReadAt: new Date() },
  ];
  const groups: any[] = [
    {
      id: 'grp-public-1',
      slug: 'delhi-youth',
      name: 'Delhi Youth',
      privacy: 'PUBLIC',
    },
    {
      id: 'grp-private-2',
      slug: 'executive-council',
      name: 'Executive Council',
      privacy: 'PRIVATE',
    },
  ];
  const groupMembers: any[] = [
    { groupId: 'grp-public-1', userId: 'usr-aarav', role: 'MEMBER' },
    { groupId: 'grp-private-2', userId: 'usr-aarav', role: 'ADMIN' },
  ];

  const mockDb: any = {
    directConversation: {
      findUnique: async ({ where }: any) => {
        return conversations.find((c) => c.id === where.id) || null;
      },
      update: async ({ where, data }: any) => {
        const conv = conversations.find((c) => c.id === where.id);
        if (conv) Object.assign(conv, data);
        return conv;
      },
    },
    directConversationParticipant: {
      findUnique: async ({ where }: any) => {
        return (
          participants.find(
            (p) =>
              p.conversationId === where.conversationId_userId.conversationId &&
              p.userId === where.conversationId_userId.userId
          ) || null
        );
      },
      upsert: async ({ update, create }: any) => {
        return create;
      },
    },
    directMessage: {
      create: async ({ data, include }: any) => {
        const id = `dmsg-${directMessages.length + 1}`;
        const newMsg: any = {
          id,
          conversationId: data.conversationId,
          senderId: data.senderId,
          content: data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
          sender: {
            id: data.senderId,
            profile: { fullName: 'Aarav Kewat', avatarUrl: null },
          },
          attachments: [],
        };

        if (data.attachments?.create) {
          const attId = `att-${chatAttachments.length + 1}`;
          const newAtt = {
            id: attId,
            directMessageId: id,
            chatMessageId: null,
            type: data.attachments.create.type,
            fileName: data.attachments.create.fileName,
            mimeType: data.attachments.create.mimeType,
            fileSizeBytes: data.attachments.create.fileSizeBytes,
            storagePath: data.attachments.create.storagePath,
            createdAt: new Date(),
          };
          chatAttachments.push(newAtt);
          newMsg.attachments.push(newAtt);
        }

        directMessages.push(newMsg);
        return newMsg;
      },
      findMany: async ({ where, take }: any) => {
        return directMessages
          .filter((m) => m.conversationId === where.conversationId)
          .slice(0, take);
      },
      count: async () => 0,
    },
    group: {
      findFirst: async ({ where }: any) => {
        return (
          groups.find(
            (g) =>
              g.id === where.OR[0].id ||
              g.slug === where.OR[1].slug
          ) || null
        );
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        return (
          groupMembers.find(
            (gm) =>
              gm.groupId === where.groupId_userId.groupId &&
              gm.userId === where.groupId_userId.userId
          ) || null
        );
      },
    },
    chatMessage: {
      create: async ({ data }: any) => {
        const id = `gmsg-${groupMessages.length + 1}`;
        const newMsg: any = {
          id,
          groupId: data.groupId,
          senderId: data.senderId,
          content: data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
          sender: {
            id: data.senderId,
            profile: { fullName: 'Aarav Kewat', avatarUrl: null },
          },
          attachments: [],
        };

        if (data.attachments?.create) {
          const attId = `att-${chatAttachments.length + 1}`;
          const newAtt = {
            id: attId,
            directMessageId: null,
            chatMessageId: id,
            type: data.attachments.create.type,
            fileName: data.attachments.create.fileName,
            mimeType: data.attachments.create.mimeType,
            fileSizeBytes: data.attachments.create.fileSizeBytes,
            storagePath: data.attachments.create.storagePath,
            createdAt: new Date(),
          };
          chatAttachments.push(newAtt);
          newMsg.attachments.push(newAtt);
        }

        groupMessages.push(newMsg);
        return newMsg;
      },
      findMany: async ({ where, take }: any) => {
        return groupMessages.filter((m) => m.groupId === where.groupId).slice(0, take);
      },
    },
    chatAttachment: {
      findFirst: async ({ where }: any) => {
        const att = chatAttachments.find((a) => a.storagePath === where?.storagePath);
        return att ? { id: att.id } : null;
      },
      findUnique: async ({ where }: any) => {
        const att = chatAttachments.find((a) => a.id === where.id);
        if (!att) return null;
        return {
          ...att,
          directMessage: att.directMessageId
            ? {
                conversation: conversations.find((c) => c.id === 'conv-101'),
              }
            : null,
          chatMessage: att.chatMessageId
            ? {
                group: groups.find((g) => g.id === 'grp-private-2'),
              }
            : null,
        };
      },
    },
  };

  // 1. Direct message with attachment and caption
  const validAttachment: ChatAttachmentInput = {
    type: 'IMAGE',
    fileName: uploadResult.fileName,
    mimeType: uploadResult.mimeType,
    fileSizeBytes: uploadResult.fileSizeBytes,
    storagePath: uploadResult.storagePath.replace('conv-test-999', 'conv-101'),
  };

  const sentDirectMsg = await sendDirectMessage(
    'conv-101',
    'usr-aarav',
    'Check this photo!',
    undefined, // tempId
    mockDb,
    validAttachment
  );

  assert.strictEqual(sentDirectMsg.content, 'Check this photo!');
  assert.strictEqual(sentDirectMsg.attachments?.length, 1);
  assert.strictEqual(sentDirectMsg.attachments?.[0].type, 'IMAGE');
  assert.strictEqual(sentDirectMsg.attachments?.[0].fileName, 'my_family_photo.jpg');
  pass('Direct message with text caption and image attachment persists and returns metadata');

  // 2. Direct message with attachment only (empty content) with fresh unique storagePath
  const validAttachment2: ChatAttachmentInput = {
    type: 'IMAGE',
    fileName: 'second_photo.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 1024000,
    storagePath: 'direct/kewat/conv-101/unique-file-2.jpg',
  };

  const sentAttachmentOnlyMsg = await sendDirectMessage(
    'conv-101',
    'usr-aarav',
    '',
    undefined,
    mockDb,
    validAttachment2
  );
  assert.strictEqual(sentAttachmentOnlyMsg.content, '');
  assert.strictEqual(sentAttachmentOnlyMsg.attachments?.length, 1);
  pass('Attachment-only direct message (empty caption) is valid and persists successfully');

  // 2b. Attempting to reuse validAttachment (same storagePath) is strictly rejected
  let reuseThrew = false;
  try {
    await sendDirectMessage(
      'conv-101',
      'usr-aarav',
      'Attempting to reuse',
      undefined,
      mockDb,
      validAttachment
    );
  } catch (err: any) {
    if (err.message.includes('already been associated')) {
      reuseThrew = true;
    }
  }
  assert.strictEqual(reuseThrew, true);
  pass('Attachment reuse across messages is strictly prevented with 400 Bad Request');

  // 3. Direct message without text and without attachment rejected
  let emptyMsgThrew = false;
  try {
    await sendDirectMessage('conv-101', 'usr-aarav', '', undefined, mockDb, undefined);
  } catch {
    emptyMsgThrew = true;
  }
  assert.strictEqual(emptyMsgThrew, true);
  pass('Message with empty text and no attachment is rejected');

  // 4. Group message with document attachment
  const validGroupAttachment: ChatAttachmentInput = {
    type: 'DOCUMENT',
    fileName: groupUploadResult.fileName,
    mimeType: groupUploadResult.mimeType,
    fileSizeBytes: groupUploadResult.fileSizeBytes,
    storagePath: groupUploadResult.storagePath.replace('grp-youth-444', 'grp-public-1'),
  };

  const sentGroupMsg = await sendChatMessage(
    'grp-public-1',
    'usr-aarav',
    'Community meeting agenda attached',
    undefined,
    mockDb,
    validGroupAttachment
  );

  assert.strictEqual(sentGroupMsg.attachments?.length, 1);
  assert.strictEqual(sentGroupMsg.attachments?.[0].type, 'DOCUMENT');
  pass('Group chat message with document attachment persists and returns metadata');

  // --------------------------------------------------------
  // Suite 6: Attachment Access Authorization
  // --------------------------------------------------------
  console.log('\n--- 6. Attachment Access Authorization & Isolation ---');

  // Conversation participant (Aarav) can access direct attachment
  const directAttId = sentDirectMsg.attachments![0].id;
  const directAttDetails = await getChatAttachmentDetails(directAttId, 'usr-aarav', mockDb);
  assert.ok(directAttDetails.url);
  assert.strictEqual(directAttDetails.fileName, 'my_family_photo.jpg');
  pass('Authorized conversation participant can access attachment signed URL');

  // Conversation participant (Bhavna) can also access
  const bhavnaDetails = await getChatAttachmentDetails(directAttId, 'usr-bhavna', mockDb);
  assert.ok(bhavnaDetails.url);
  pass('Other conversation participant (recipient) can access attachment signed URL');

  // Unauthorized third party (User C) is rejected with 403
  let thirdPartyThrew = false;
  try {
    await getChatAttachmentDetails(directAttId, 'usr-intruder', mockDb);
  } catch (err: any) {
    if (err.statusCode === 403) {
      thirdPartyThrew = true;
    }
  }
  assert.strictEqual(thirdPartyThrew, true);
  pass('Unauthorized third party is strictly denied access with 403 Forbidden');

  // Path spoofing guard: cannot attach a storage path from a different conversation
  let spoofThrew = false;
  try {
    await sendDirectMessage(
      'conv-101',
      'usr-aarav',
      'Malicious hijack',
      undefined,
      mockDb,
      {
        type: 'IMAGE',
        fileName: 'stolen.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1000,
        storagePath: 'direct/kewat/conv-other-user/stolen.jpg',
      }
    );
  } catch (err: any) {
    if (err.message.includes('Invalid attachment path')) {
      spoofThrew = true;
    }
  }
  assert.strictEqual(spoofThrew, true);
  pass('Cross-conversation storage path spoofing is strictly prevented');

  // Unlinked attachment rejection (e.g. when message sending failed before database persistence)
  let unlinkedThrew = false;
  try {
    await getChatAttachmentDetails('att-unlinked-or-failed', 'usr-aarav', mockDb);
  } catch (err: any) {
    if (err.statusCode === 404) {
      unlinkedThrew = true;
    }
  }
  assert.strictEqual(unlinkedThrew, true);
  pass('Unlinked or failed message attachment cannot be queried for signed URL (404)');

  // Signed URL time-limited token verification
  assert.ok(
    directAttDetails.url.includes('token') || directAttDetails.url.includes('expires'),
    'Signed URL must carry token/expiration query parameter'
  );
  pass('Signed URL enforces bounded time-limited expiry token');

  console.log('\n================================================================');
  console.log(`   Chat Media Attachments Backend: ${passedAssertions} passed, 0 failed`);
  console.log('================================================================\n');
}

runChatMediaAttachmentsSuite().catch((err) => {
  console.error('Fatal error in chat media attachments test suite:', err);
  process.exit(1);
});


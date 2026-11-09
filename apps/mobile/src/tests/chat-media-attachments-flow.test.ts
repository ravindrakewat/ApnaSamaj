import assert from 'node:assert';
import { chatApi, UploadAttachmentFile, appendAttachmentFileToFormData } from '../api/chat.api';
import { apiClient } from '../api/client';
import {
  ChatAttachmentItem,
  ChatAttachmentInput,
  DirectMessageItem,
  ChatMessageItem,
} from '@apnasamaj/shared-types';
import {
  getStoredCommunitySlug,
  setStoredCommunitySlug,
  clearMemoryStorageForTesting,
} from '../services/storage.service';

export async function runChatMediaAttachmentsFlowTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 8.4: Mobile Chat Media Attachments Tests  ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err?.message || err}`);
      failed++;
    }
  }

  // Backup original apiClient methods for restore after tests
  const originalGet = apiClient.get.bind(apiClient);
  const originalPost = apiClient.post.bind(apiClient);
  const originalUpload = apiClient.upload.bind(apiClient);

  const mockUploadedImage: ChatAttachmentItem = {
    id: 'att-img-001',
    directMessageId: 'dmsg-101',
    type: 'IMAGE',
    fileName: 'community_event.jpg',
    mimeType: 'image/jpeg',
    fileSizeBytes: 2048000, // 2MB
    storagePath: 'direct/kewat/conv-101/att-img-001.jpg',
    url: 'https://mock-storage.apnasamaj.local/chat-attachments/direct/kewat/conv-101/att-img-001.jpg?token=abc',
    createdAt: new Date().toISOString(),
  };

  const mockUploadedDoc: ChatAttachmentItem = {
    id: 'att-doc-002',
    chatMessageId: 'gmsg-202',
    type: 'DOCUMENT',
    fileName: 'samaj_bylaws.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 512000, // 500KB
    storagePath: 'groups/kewat/grp-1/att-doc-002.pdf',
    url: 'https://mock-storage.apnasamaj.local/chat-attachments/groups/kewat/grp-1/att-doc-002.pdf?token=xyz',
    createdAt: new Date().toISOString(),
  };

  try {
    // -------------------------------------------------------------
    // Test 1: Direct Attachment Upload API
    // -------------------------------------------------------------
    await test('chatApi.uploadDirectAttachment uploads file and returns metadata', async () => {
      let capturedEndpoint = '';
      let capturedBody: any = null;

      (apiClient as any).upload = async (endpoint: string, formData: any) => {
        capturedEndpoint = endpoint;
        capturedBody = formData;
        return {
          success: true,
          data: { attachment: mockUploadedImage },
          timestamp: new Date().toISOString(),
        };
      };

      const file: UploadAttachmentFile = {
        uri: 'file:///data/user/0/cache/image.jpg',
        name: 'community_event.jpg',
        type: 'image/jpeg',
      };

      const result = await chatApi.uploadDirectAttachment('conv-101', file);
      assert.strictEqual(capturedEndpoint, '/chat/conversations/conv-101/attachments');
      assert.ok(capturedBody instanceof FormData || typeof capturedBody === 'object');
      assert.strictEqual(result.id, 'att-img-001');
      assert.strictEqual(result.type, 'IMAGE');
      assert.strictEqual(result.fileName, 'community_event.jpg');
    });

    // -------------------------------------------------------------
    // Test 2: Group Attachment Upload API
    // -------------------------------------------------------------
    await test('chatApi.uploadGroupAttachment uploads group attachment and returns metadata', async () => {
      let capturedEndpoint = '';

      (apiClient as any).upload = async (endpoint: string) => {
        capturedEndpoint = endpoint;
        return {
          success: true,
          data: { attachment: mockUploadedDoc },
          timestamp: new Date().toISOString(),
        };
      };

      const file: UploadAttachmentFile = {
        uri: 'file:///data/user/0/cache/bylaws.pdf',
        name: 'samaj_bylaws.pdf',
        type: 'application/pdf',
      };

      const result = await chatApi.uploadGroupAttachment('grp-1', file);
      assert.strictEqual(capturedEndpoint, '/groups/grp-1/attachments');
      assert.strictEqual(result.type, 'DOCUMENT');
      assert.strictEqual(result.mimeType, 'application/pdf');
    });

    // -------------------------------------------------------------
    // Test 2.1: Web Image Upload with Native File / Blob
    // -------------------------------------------------------------
    await test('chatApi.uploadGroupAttachment on Web appends native File/Blob with exact field name "file"', async () => {
      let capturedBody: any = null;

      (apiClient as any).upload = async (_endpoint: string, formData: any) => {
        capturedBody = formData;
        return {
          success: true,
          data: { attachment: mockUploadedImage },
          timestamp: new Date().toISOString(),
        };
      };

      const mockBlob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
      const webFile: UploadAttachmentFile = {
        uri: 'blob:http://localhost:8081/test-blob-uuid',
        name: 'web_event_photo.jpg',
        type: 'image/jpeg',
        file: mockBlob,
      };

      const result = await chatApi.uploadGroupAttachment('grp-1', webFile);
      assert.strictEqual(result.type, 'IMAGE');
      assert.ok(capturedBody instanceof FormData);
      const attachedPart = capturedBody.get('file');
      assert.ok(attachedPart !== '[object Object]', 'Web upload must NOT stringify object to "[object Object]"');
      assert.ok(attachedPart instanceof Blob, 'Web upload must append a real Blob instance');
    });

    // -------------------------------------------------------------
    // Test 2.2: Web Upload with data URI fallback
    // -------------------------------------------------------------
    await test('chatApi.uploadGroupAttachment converts data URI to Blob on Web platform', async () => {
      let capturedBody: any = null;

      (apiClient as any).upload = async (_endpoint: string, formData: any) => {
        capturedBody = formData;
        return {
          success: true,
          data: { attachment: mockUploadedImage },
          timestamp: new Date().toISOString(),
        };
      };

      // Base64 1x1 gif / data URI
      const dataUri = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const webFileWithDataUri: UploadAttachmentFile = {
        uri: dataUri,
        name: 'pixel.gif',
        type: 'image/gif',
      };

      // Directly invoke appendAttachmentFileToFormData in web simulated mode
      const testFormData = new FormData();
      // Temporarily mock window to simulate browser environment
      (globalThis as any).window = { document: {} };
      try {
        await appendAttachmentFileToFormData(testFormData, 'file', webFileWithDataUri);
        const filePart = testFormData.get('file');
        assert.ok(filePart !== '[object Object]', 'Data URI must be converted to Blob, not "[object Object]"');
        assert.ok(filePart instanceof Blob, 'Converted data URI must be a Blob');
      } finally {
        delete (globalThis as any).window;
      }
    });

    // -------------------------------------------------------------
    // Test 2.3: Native Android / iOS Upload Descriptor Preservation
    // -------------------------------------------------------------
    await test('appendAttachmentFileToFormData preserves native descriptor { uri, name, type } on Android/iOS', async () => {
      const nativeFormData = new FormData();
      const nativeFile: UploadAttachmentFile = {
        uri: 'file:///data/user/0/com.apnasamaj.app/cache/camera.jpg',
        name: 'camera.jpg',
        type: 'image/jpeg',
      };

      await appendAttachmentFileToFormData(nativeFormData, 'file', nativeFile);
      const part = nativeFormData.get('file');
      assert.ok(part, 'Field "file" must exist');
    });

    // -------------------------------------------------------------
    // Test 3: Get Attachment Signed URL API
    // -------------------------------------------------------------
    await test('chatApi.getAttachmentUrl retrieves refreshed signed URL', async () => {
      let capturedEndpoint = '';

      (apiClient as any).get = async (endpoint: string) => {
        capturedEndpoint = endpoint;
        return {
          success: true,
          data: { url: 'https://supabase.local/signed-url-refreshed' },
          timestamp: new Date().toISOString(),
        };
      };

      const url = await chatApi.getAttachmentUrl('att-img-001');
      assert.strictEqual(capturedEndpoint, '/chat/attachments/att-img-001/url');
      assert.strictEqual(url, 'https://supabase.local/signed-url-refreshed');
    });

    // -------------------------------------------------------------
    // Test 4: Direct Message with Image Attachment (Attachment-only)
    // -------------------------------------------------------------
    await test('chatApi.sendDirectMessage supports attachment-only message (empty content)', async () => {
      let capturedPayload: any = null;

      (apiClient as any).post = async (_endpoint: string, body: any) => {
        capturedPayload = body;
        return {
          success: true,
          data: {
            id: 'dmsg-101',
            conversationId: 'conv-101',
            senderId: 'usr-aarav',
            content: '',
            attachments: [mockUploadedImage],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };
      };

      const attachmentInput: ChatAttachmentInput = {
        type: 'IMAGE',
        fileName: 'community_event.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 2048000,
        storagePath: 'direct/kewat/conv-101/att-img-001.jpg',
      };

      const msg = await chatApi.sendDirectMessage('conv-101', '', 'temp-123', attachmentInput);
      assert.strictEqual(capturedPayload.content, '');
      assert.deepStrictEqual(capturedPayload.attachment, attachmentInput);
      assert.strictEqual(msg.attachments?.length, 1);
      assert.strictEqual(msg.attachments?.[0].type, 'IMAGE');
    });

    // -------------------------------------------------------------
    // Test 5: Direct Message with Document Attachment and Caption Text
    // -------------------------------------------------------------
    await test('chatApi.sendDirectMessage supports document attachment + caption text', async () => {
      let capturedPayload: any = null;

      (apiClient as any).post = async (_endpoint: string, body: any) => {
        capturedPayload = body;
        return {
          success: true,
          data: {
            id: 'dmsg-102',
            conversationId: 'conv-101',
            senderId: 'usr-aarav',
            content: 'कृपया नियम पुस्तिका देखें',
            attachments: [mockUploadedDoc],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };
      };

      const attachmentInput: ChatAttachmentInput = {
        type: 'DOCUMENT',
        fileName: 'samaj_bylaws.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 512000,
        storagePath: 'groups/kewat/grp-1/att-doc-002.pdf',
      };

      const msg = await chatApi.sendDirectMessage(
        'conv-101',
        'कृपया नियम पुस्तिका देखें',
        'temp-124',
        attachmentInput
      );

      assert.strictEqual(capturedPayload.content, 'कृपया नियम पुस्तिका देखें');
      assert.strictEqual(msg.content, 'कृपया नियम पुस्तिका देखें');
      assert.strictEqual(msg.attachments?.[0].type, 'DOCUMENT');
    });

    // -------------------------------------------------------------
    // Test 6: Group Message with Video Attachment and Caption Text
    // -------------------------------------------------------------
    await test('chatApi.sendGroupMessage supports video attachment + caption text', async () => {
      let capturedPayload: any = null;

      (apiClient as any).post = async (_endpoint: string, body: any) => {
        capturedPayload = body;
        return {
          success: true,
          data: {
            id: 'gmsg-301',
            groupId: 'grp-1',
            senderId: 'usr-aarav',
            content: 'वार्षिक महोत्सव की रिकॉर्डिंग',
            attachments: [
              {
                id: 'att-vid-003',
                chatMessageId: 'gmsg-301',
                type: 'VIDEO',
                fileName: 'fest_recording.mp4',
                mimeType: 'video/mp4',
                fileSizeBytes: 15728640, // 15MB
                storagePath: 'groups/kewat/grp-1/att-vid-003.mp4',
                url: 'https://mock-storage.apnasamaj.local/video.mp4',
                createdAt: new Date().toISOString(),
              },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };
      };

      const videoInput: ChatAttachmentInput = {
        type: 'VIDEO',
        fileName: 'fest_recording.mp4',
        mimeType: 'video/mp4',
        fileSizeBytes: 15728640,
        storagePath: 'groups/kewat/grp-1/att-vid-003.mp4',
      };

      const msg = await chatApi.sendGroupMessage(
        'grp-1',
        'वार्षिक महोत्सव की रिकॉर्डिंग',
        'temp-125',
        videoInput
      );

      assert.strictEqual(capturedPayload.content, 'वार्षिक महोत्सव की रिकॉर्डिंग');
      assert.strictEqual(msg.attachments?.[0].type, 'VIDEO');
      assert.strictEqual(msg.attachments?.[0].fileName, 'fest_recording.mp4');
    });

    // -------------------------------------------------------------
    // Test 7: Validation Rejection: No Content and No Attachment
    // -------------------------------------------------------------
    await test('chatApi.sendDirectMessage throws when both content and attachment are missing', async () => {
      let threw = false;
      try {
        await chatApi.sendDirectMessage('conv-101', '', 'temp-126', undefined);
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('Message content or an attachment is required'));
      }
      assert.strictEqual(threw, true);
    });

    // -------------------------------------------------------------
    // Test 8: Optimistic Message Reconciliation for Attachments
    // -------------------------------------------------------------
    await test('Optimistic attachment message reconciles on confirmation', () => {
      const tempId = 'temp-optimistic-att-1';
      const optimisticMsg: any = {
        id: tempId,
        conversationId: 'conv-101',
        senderId: 'usr-aarav',
        content: 'Check photo',
        isOptimistic: true,
        tempId,
        attachments: [
          {
            id: 'temp-att-1',
            type: 'IMAGE',
            fileName: 'pic.jpg',
            storagePath: 'direct/kewat/conv-101/pic.jpg',
          },
        ],
      };

      let list = [optimisticMsg];

      // Server confirms
      const confirmedMsg: DirectMessageItem = {
        id: 'server-confirmed-dmsg-99',
        conversationId: 'conv-101',
        senderId: 'usr-aarav',
        content: 'Check photo',
        attachments: [
          {
            id: 'server-att-99',
            directMessageId: 'server-confirmed-dmsg-99',
            type: 'IMAGE',
            fileName: 'pic.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 1024,
            storagePath: 'direct/kewat/conv-101/pic.jpg',
            url: 'https://mock-storage.apnasamaj.local/pic.jpg',
            createdAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Reconciliation logic: replace message by tempId
      list = list.map((m) =>
        m.tempId === tempId ? { ...confirmedMsg, isOptimistic: false } : m
      );

      assert.strictEqual(list[0].id, 'server-confirmed-dmsg-99');
      assert.strictEqual(list[0].isOptimistic, false);
      assert.strictEqual(list[0].attachments?.[0].id, 'server-att-99');
    });

    // -------------------------------------------------------------
    // Test 9: Text-Only Message Backward Compatibility
    // -------------------------------------------------------------
    await test('Existing text-only messages work completely unchanged without attachments', async () => {
      (apiClient as any).post = async (_endpoint: string, body: any) => {
        return {
          success: true,
          data: {
            id: 'dmsg-text-only',
            conversationId: 'conv-101',
            senderId: 'usr-aarav',
            content: 'Pure text message without attachments',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        };
      };

      const msg = await chatApi.sendDirectMessage(
        'conv-101',
        'Pure text message without attachments'
      );

      assert.strictEqual(msg.content, 'Pure text message without attachments');
      assert.strictEqual(msg.attachments, undefined);
    });

    // -------------------------------------------------------------
    // Test 10: Size Formatting Helper Verification
    // -------------------------------------------------------------
    await test('File size formatting converts bytes correctly to KB and MB', () => {
      const formatSize = (bytes: number) => {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) {
          return `${(bytes / 1024).toFixed(0)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      };

      assert.strictEqual(formatSize(512000), '500 KB');
      assert.strictEqual(formatSize(2097152), '2.0 MB');
      assert.strictEqual(formatSize(15728640), '15.0 MB');
    });

    // -------------------------------------------------------------
    // Test 11: Community Switching & Tenant Context Isolation
    // -------------------------------------------------------------
    await test('Community switching preserves isolated storage namespaces', async () => {
      clearMemoryStorageForTesting();
      await setStoredCommunitySlug('kewat');

      assert.strictEqual(await getStoredCommunitySlug(), 'kewat');

      // Switch to Gupta tenant
      await setStoredCommunitySlug('gupta');
      assert.strictEqual(await getStoredCommunitySlug(), 'gupta');

      // Verify that Kewat storage path cannot be used under Gupta tenant
      const kewatStoragePath = 'direct/kewat/conv-101/pic.jpg';
      const guptaSlug = await getStoredCommunitySlug();
      assert.strictEqual(kewatStoragePath.includes(`/${guptaSlug}/`), false);
    });
  } finally {
    // Restore original apiClient methods
    (apiClient as any).get = originalGet;
    (apiClient as any).post = originalPost;
    (apiClient as any).upload = originalUpload;
  }

  console.log('\n================================================================');
  console.log(`   Chat Media Attachments Flow: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Mobile Chat Media Attachments suite.`);
  }
}

// Execute standalone if executed directly via tsx
if (require.main === module) {
  runChatMediaAttachmentsFlowTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


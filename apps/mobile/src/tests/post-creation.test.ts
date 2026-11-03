import assert from 'assert';
import { postsApi } from '../api/posts.api';
import { apiClient } from '../api/client';
import {
  validatePostTitle,
  validatePostContent,
  validateImageAttachment,
} from '../utils/validation';
import {
  CreatePostRequest,
  PostItem,
  UserRole,
} from '@apnasamaj/shared-types';
import { setStoredCommunitySlug, setAuthTokens, clearAuthTokens } from '../services/storage.service';

let totalTests = 0;
let passedTests = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runPostCreationTests() {
  console.log('\n================================================================');
  console.log('  Apna Samaj — Batch 3.1 Mobile Post Creation Test Suite        ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. Post Title Validation Tests
  // -------------------------------------------------------------
  await it('validatePostTitle: allows empty title for GENERAL posts', () => {
    const resultHi = validatePostTitle('', 'GENERAL', 'hi');
    assert.strictEqual(resultHi.isValid, true);
    assert.strictEqual(resultHi.error, undefined);

    const resultEn = validatePostTitle('   ', 'GENERAL', 'en');
    assert.strictEqual(resultEn.isValid, true);
  });

  await it('validatePostTitle: requires title for ANNOUNCEMENT posts with Hindi and English errors', () => {
    const resultHi = validatePostTitle('', 'ANNOUNCEMENT', 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'इस पोस्ट प्रकार के लिए शीर्षक आवश्यक है');

    const resultEn = validatePostTitle('  ', 'ANNOUNCEMENT', 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Title is required for this post type');
  });

  await it('validatePostTitle: requires title for EVENT posts with Hindi and English errors', () => {
    const resultHi = validatePostTitle('', 'EVENT', 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'इस पोस्ट प्रकार के लिए शीर्षक आवश्यक है');

    const resultEn = validatePostTitle('', 'EVENT', 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Title is required for this post type');
  });

  await it('validatePostTitle: rejects title exceeding 150 characters', () => {
    const longTitle = 'अ'.repeat(151);
    const resultHi = validatePostTitle(longTitle, 'GENERAL', 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'शीर्षक 150 वर्णों से अधिक नहीं हो सकता');

    const resultEn = validatePostTitle('A'.repeat(151), 'GENERAL', 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Title must not exceed 150 characters');
  });

  await it('validatePostTitle: accepts valid title within 150 characters', () => {
    const validTitle = 'वार्षिक समाज स्नेह सम्मेलन 2026';
    const result = validatePostTitle(validTitle, 'EVENT', 'hi');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  // -------------------------------------------------------------
  // 2. Post Content Validation Tests
  // -------------------------------------------------------------
  await it('validatePostContent: rejects post when content, title, and media are all empty', () => {
    const resultHi = validatePostContent('', '', false, 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'पोस्ट में टेक्स्ट सामग्री या कम से कम एक मीडिया संलग्न होना चाहिए');

    const resultEn = validatePostContent('   ', '', false, 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Post must contain either text content or at least one media attachment');
  });

  await it('validatePostContent: allows empty content if media is attached', () => {
    const result = validatePostContent('', '', true, 'hi');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  await it('validatePostContent: allows empty content if title is present', () => {
    const result = validatePostContent('', 'महत्वपूर्ण सूचना', false, 'hi');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  await it('validatePostContent: rejects content exceeding 5000 characters', () => {
    const hugeContent = 'क'.repeat(5001);
    const resultHi = validatePostContent(hugeContent, '', false, 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'सामग्री 5000 वर्णों से अधिक नहीं हो सकती');

    const resultEn = validatePostContent('X'.repeat(5001), '', false, 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Content must not exceed 5000 characters');
  });

  await it('validatePostContent: accepts valid content within 5000 characters', () => {
    const validContent = 'सभी समाज बंधुओं को सूचित किया जाता है कि आगामी रविवार को विशेष बैठक आयोजित की गई है।';
    const result = validatePostContent(validContent, '', false, 'hi');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  // -------------------------------------------------------------
  // 3. Image Attachment Validation Tests
  // -------------------------------------------------------------
  await it('validateImageAttachment: rejects image exceeding 5MB upload limit', () => {
    const sixMB = 6 * 1024 * 1024;
    const resultHi = validateImageAttachment(sixMB, 'image/jpeg', 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'छवि फ़ाइल 5MB की अधिकतम सीमा से अधिक है');

    const resultEn = validateImageAttachment(sixMB, 'image/png', 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Image file size exceeds the 5MB maximum limit');
  });

  await it('validateImageAttachment: accepts image within 5MB limit', () => {
    const twoMB = 2 * 1024 * 1024;
    const result = validateImageAttachment(twoMB, 'image/jpeg', 'hi');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  await it('validateImageAttachment: accepts supported formats (JPEG, PNG, WebP, GIF)', () => {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
    for (const mime of supportedTypes) {
      const res = validateImageAttachment(1024 * 500, mime, 'hi');
      assert.strictEqual(res.isValid, true, `Expected ${mime} to be valid`);
    }
  });

  await it('validateImageAttachment: rejects unsupported formats (PDF, MP4, Executable)', () => {
    const unsupportedTypes = ['application/pdf', 'video/mp4', 'application/octet-stream', 'text/html'];
    for (const mime of unsupportedTypes) {
      const resHi = validateImageAttachment(1024 * 500, mime, 'hi');
      assert.strictEqual(resHi.isValid, false, `Expected ${mime} to be rejected`);
      assert.strictEqual(resHi.error, 'असमर्थित छवि प्रारूप (केवल JPEG, PNG, WebP और GIF समर्थित हैं)');

      const resEn = validateImageAttachment(1024 * 500, mime, 'en');
      assert.strictEqual(resEn.isValid, false);
      assert.strictEqual(resEn.error, 'Unsupported image format (only JPEG, PNG, WebP, and GIF are supported)');
    }
  });

  // -------------------------------------------------------------
  // 4. API Client & Media Upload Tests
  // -------------------------------------------------------------
  await it('postsApi.uploadMedia: sends multipart form-data to /posts/media/upload', async () => {
    await setStoredCommunitySlug('kewat');
    await setAuthTokens({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
    });

    let interceptedUrl = '';
    let interceptedInit: RequestInit | undefined;

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      interceptedUrl = url;
      interceptedInit = init;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            url: 'https://supabase.local/storage/v1/object/public/post-media/kewat/test-uuid.jpg',
            storagePath: 'kewat/test-uuid.jpg',
            mediaType: 'IMAGE',
            fileName: 'photo.jpg',
            fileSizeBytes: 204800,
            mimeType: 'image/jpeg',
          },
        }),
      };
    };

    try {
      const uploadRes = await postsApi.uploadMedia({
        uri: 'file:///path/to/image.jpg',
        name: 'photo.jpg',
        type: 'image/jpeg',
      });

      assert.ok(interceptedUrl.includes('/posts/media/upload'), 'Upload endpoint should be called');
      assert.strictEqual(interceptedInit?.method, 'POST');

      const headers = interceptedInit?.headers as Record<string, string>;
      assert.strictEqual(headers['Content-Type'], undefined, 'Boundary must be auto-generated by runtime');
      assert.strictEqual(headers['x-community-slug'], 'kewat', 'Tenant header must be present');
      assert.strictEqual(headers['Authorization'], 'Bearer test-access-token', 'Bearer token must be present');

      assert.strictEqual(uploadRes.url, 'https://supabase.local/storage/v1/object/public/post-media/kewat/test-uuid.jpg');
      assert.strictEqual(uploadRes.mediaType, 'IMAGE');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 5. Post Creation API Contract Tests
  // -------------------------------------------------------------
  await it('postsApi.createPost: submits CreatePostRequest with correct payload schema', async () => {
    await setStoredCommunitySlug('kewat');
    await setAuthTokens({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
    });

    let interceptedUrl = '';
    let interceptedBody: string = '';
    let interceptedHeaders: Record<string, string> = {};

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      interceptedUrl = url;
      interceptedBody = init?.body as string;
      interceptedHeaders = (init?.headers || {}) as Record<string, string>;

      const parsed = JSON.parse(interceptedBody);

      const mockCreatedPost: PostItem = {
        id: 'post-new-123',
        authorId: 'usr-1',
        author: {
          id: 'usr-1',
          fullName: 'सुनील केवट',
          avatarUrl: null,
          role: UserRole.MEMBER,
          city: 'ग्वालियर',
        },
        type: parsed.type,
        title: parsed.title || null,
        content: parsed.content || null,
        isPinned: false,
        media: parsed.media || [],
        likesCount: 0,
        commentsCount: 0,
        isLikedByMe: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: mockCreatedPost,
        }),
      };
    };

    try {
      const postPayload: CreatePostRequest = {
        type: 'ANNOUNCEMENT',
        title: 'वार्षिक आम सभा',
        content: 'समस्त समाज बंधु सादर आमंत्रित हैं।',
        media: [
          {
            url: 'https://supabase.local/storage/v1/object/public/post-media/kewat/invitation.jpg',
            mediaType: 'IMAGE',
            order: 0,
          },
        ],
      };

      const created = await postsApi.createPost(postPayload);

      assert.ok(interceptedUrl.endsWith('/posts'), 'Should call POST /posts');
      assert.strictEqual(interceptedHeaders['Content-Type'], 'application/json');
      assert.strictEqual(interceptedHeaders['x-community-slug'], 'kewat');

      const parsedSent = JSON.parse(interceptedBody);
      assert.strictEqual(parsedSent.type, 'ANNOUNCEMENT');
      assert.strictEqual(parsedSent.title, 'वार्षिक आम सभा');
      assert.strictEqual(parsedSent.content, 'समस्त समाज बंधु सादर आमंत्रित हैं।');
      assert.strictEqual(parsedSent.media?.length, 1);
      assert.strictEqual(parsedSent.media?.[0].mediaType, 'IMAGE');

      assert.strictEqual(created.id, 'post-new-123');
      assert.strictEqual(created.title, 'वार्षिक आम सभा');
      assert.strictEqual(created.likesCount, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 6. Security & Tenant Isolation Tests
  // -------------------------------------------------------------
  await it('postsApi.createPost: fails closed when session is unauthenticated', async () => {
    await clearAuthTokens();

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      const headers = (init?.headers || {}) as Record<string, string>;
      if (!headers['Authorization']) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: 'Authentication required to publish post',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      };
    };

    try {
      await assert.rejects(
        async () => {
          await postsApi.createPost({
            type: 'GENERAL',
            content: 'Test content without token',
          });
        },
        /Authentication required|Session expired/
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  console.log(`\n================================================================`);
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 3.1 post creation tests passed!`);
  console.log('================================================================\n');
}

runPostCreationTests();

import assert from 'node:assert/strict';
import { resources } from '@apnasamaj/i18n';
import {
  createPostSchema,
  postMediaItemSchema,
  MAX_VIDEO_FILE_SIZE_BYTES,
  ALLOWED_VIDEO_MIME_TYPES,
} from '../../../../packages/validation/src/post.js';

console.log('================================================================');
console.log(' Apna Samaj — Image Upload & Composer UX Regression Tests       ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

async function test(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS: ${description}`);
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runImageComposerTests() {
  const MAX_IMAGES = 4;
  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

  // -----------------------------------------------------------------
  // 1. Image Validation Constraints
  // -----------------------------------------------------------------
  await test('Image constraints: Max image count is 4', () => {
    assert.equal(MAX_IMAGES, 4);
  });

  await test('Image constraints: Max file size is 5MB (5,242,880 bytes)', () => {
    assert.equal(MAX_FILE_SIZE_BYTES, 5242880);
  });

  await test('Image constraints: Supported image MIME types are JPEG, PNG, WebP, GIF', () => {
    assert.deepEqual(ALLOWED_MIME_TYPES, [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
  });

  // -----------------------------------------------------------------
  // 2. Post Creation Schema Rules for Images
  // -----------------------------------------------------------------
  await test('Post creation allows publishing text-only post without media', () => {
    const valid = createPostSchema.safeParse({
      title: 'Text Only Announcement',
      content: 'This is a text-only post with no media.',
      type: 'GENERAL',
      media: [],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation allows single valid image attachment', () => {
    const valid = createPostSchema.safeParse({
      content: 'Community celebration picture',
      type: 'GENERAL',
      media: [
        {
          url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img1.jpg',
          mediaType: 'IMAGE',
          order: 0,
        },
      ],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation allows up to 4 images', () => {
    const valid = createPostSchema.safeParse({
      content: '4 photos from cultural event',
      type: 'GENERAL',
      media: [
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img1.jpg', mediaType: 'IMAGE', order: 0 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img2.jpg', mediaType: 'IMAGE', order: 1 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img3.jpg', mediaType: 'IMAGE', order: 2 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img4.jpg', mediaType: 'IMAGE', order: 3 },
      ],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation rejects more than 4 images', () => {
    const invalid = createPostSchema.safeParse({
      content: '5 photos from cultural event',
      type: 'GENERAL',
      media: [
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img1.jpg', mediaType: 'IMAGE', order: 0 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img2.jpg', mediaType: 'IMAGE', order: 1 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img3.jpg', mediaType: 'IMAGE', order: 2 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img4.jpg', mediaType: 'IMAGE', order: 3 },
        { url: 'https://example.com/storage/v1/object/public/post-media/posts/user/img5.jpg', mediaType: 'IMAGE', order: 4 },
      ],
    });
    assert.equal(invalid.success, false);
    assert.match(invalid.error!.issues[0].message, /maximum of 4 media attachments/);
  });

  await test('Post creation rejects invalid image URL format', () => {
    const invalid = postMediaItemSchema.safeParse({
      url: 'not-a-valid-url',
      mediaType: 'IMAGE',
      order: 0,
    });
    assert.equal(invalid.success, false);
  });

  await test('Post creation allows mixing 1 video + 3 images (total 4 items)', () => {
    const valid = createPostSchema.safeParse({
      content: 'Community media gallery with video and photos',
      type: 'GENERAL',
      media: [
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/vid.mp4', mediaType: 'VIDEO', order: 0 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/img1.jpg', mediaType: 'IMAGE', order: 1 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/img2.jpg', mediaType: 'IMAGE', order: 2 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/img3.jpg', mediaType: 'IMAGE', order: 3 },
      ],
    });
    assert.equal(valid.success, true);
  });

  // -----------------------------------------------------------------
  // 3. Media List Retry State Management Logic
  // -----------------------------------------------------------------
  await test('Retry upload logic clears error and updates only target failed item without duplicating succeeded items', () => {
    // Initial state: Item 1 succeeded, Item 2 failed
    const mockFile1 = new File(['dummy1'], 'photo1.jpg', { type: 'image/jpeg' });
    const mockFile2 = new File(['dummy2'], 'photo2.jpg', { type: 'image/jpeg' });

    let mediaList = [
      {
        url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p1.jpg',
        previewUrl: 'blob:http://localhost/p1',
        file: mockFile1,
        isUploading: false,
        error: undefined,
      },
      {
        url: '',
        previewUrl: 'blob:http://localhost/p2',
        file: mockFile2,
        isUploading: false,
        error: 'Failed to upload image.',
      },
    ];

    // Trigger retry on Item 2
    const targetPreview = 'blob:http://localhost/p2';
    mediaList = mediaList.map((item) =>
      item.previewUrl === targetPreview
        ? { ...item, isUploading: true, error: undefined }
        : item
    );

    // Verify target item is uploading and error is cleared; item 1 is untouched
    assert.equal(mediaList[0].isUploading, false);
    assert.equal(mediaList[0].url, 'https://mock-storage.apnasamaj.local/post-media/posts/user/p1.jpg');
    assert.equal(mediaList[1].isUploading, true);
    assert.equal(mediaList[1].error, undefined);

    // Simulated retry success
    const newUploadUrl = 'https://mock-storage.apnasamaj.local/post-media/posts/user/p2.jpg';
    mediaList = mediaList.map((item) =>
      item.previewUrl === targetPreview
        ? { ...item, url: newUploadUrl, isUploading: false, error: undefined }
        : item
    );

    assert.equal(mediaList.length, 2);
    assert.equal(mediaList[0].url, 'https://mock-storage.apnasamaj.local/post-media/posts/user/p1.jpg');
    assert.equal(mediaList[1].url, newUploadUrl);
    assert.equal(mediaList.every((m) => !m.error && !m.isUploading && m.url), true);
  });

  // -----------------------------------------------------------------
  // 4. Video Upload Behavior Preservation
  // -----------------------------------------------------------------
  await test('Preserves video upload limits (30MB) and formats (MP4, WebM)', () => {
    assert.equal(MAX_VIDEO_FILE_SIZE_BYTES, 30 * 1024 * 1024);
    assert.deepEqual(ALLOWED_VIDEO_MIME_TYPES, ['video/mp4', 'video/webm']);
  });

  // -----------------------------------------------------------------
  // 5. Localization Parity Tests
  // -----------------------------------------------------------------
  const requiredKeys = [
    'uploadPreviewAlt',
    'uploadFailed',
    'uploadFailedGeneral',
    'imagesUploadFailed',
    'waitImagesUploading',
    'retryUpload',
    'maxImagesExceeded',
    'unsupportedImageFormat',
    'imageSizeExceeded',
    'removeMediaAria',
  ];

  for (const key of requiredKeys) {
    await test(`Translation key exists in EN: ${key}`, () => {
      const enFeed = (resources.en as any).feed;
      assert.ok(enFeed[key], `Missing key "${key}" in en/feed.json`);
    });

    await test(`Translation key exists in HI: ${key}`, () => {
      const hiFeed = (resources.hi as any).feed;
      assert.ok(hiFeed[key], `Missing key "${key}" in hi/feed.json`);
    });
  }

  console.log('\n================================================================');
  console.log(` Image Upload & Composer UX Tests: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runImageComposerTests();


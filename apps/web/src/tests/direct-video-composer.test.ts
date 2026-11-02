import assert from 'node:assert/strict';
import { resources } from '@apnasamaj/i18n';
import {
  MAX_VIDEO_FILE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  ALLOWED_VIDEO_MIME_TYPES,
  createPostSchema,
} from '../../../../packages/validation/src/post.js';
import { getVideoDuration } from '../utils/video.js';

console.log('================================================================');
console.log(' Apna Samaj — Batch 15G.2: Direct Video Composer & UX Tests     ');
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

async function runComposerTests() {
  // -----------------------------------------------------------------
  // 1. Validation Constraints
  // -----------------------------------------------------------------
  await test('Video constraints: Max size is 30 MB (31,457,280 bytes)', () => {
    assert.equal(MAX_VIDEO_FILE_SIZE_BYTES, 30 * 1024 * 1024);
  });

  await test('Video constraints: Max duration is 90 seconds', () => {
    assert.equal(MAX_VIDEO_DURATION_SECONDS, 90);
  });

  await test('Video constraints: Supported MIME types are video/mp4 and video/webm', () => {
    assert.deepEqual(ALLOWED_VIDEO_MIME_TYPES, ['video/mp4', 'video/webm']);
  });

  // -----------------------------------------------------------------
  // 2. Video Duration Metadata Helper Tests (Mock DOM)
  // -----------------------------------------------------------------
  await test('getVideoDuration resolves when onloadedmetadata fires', async () => {
    const originalCreateElement = (globalThis as any).document?.createElement;

    try {
      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'video') {
            const videoElem: any = {
              duration: 45.5,
              set src(_val: string) {
                setTimeout(() => {
                  if (videoElem.onloadedmetadata) videoElem.onloadedmetadata();
                }, 10);
              },
            };
            return videoElem;
          }
          return {};
        },
      };

      const mockFile = new File(['mock content'], 'test.mp4', { type: 'video/mp4' });
      const duration = await getVideoDuration(mockFile);
      assert.equal(duration, 45.5);
    } finally {
      if (originalCreateElement) {
        (globalThis as any).document.createElement = originalCreateElement;
      } else {
        delete (globalThis as any).document;
      }
    }
  });

  await test('getVideoDuration rejects when onerror fires', async () => {
    const originalCreateElement = (globalThis as any).document?.createElement;

    try {
      (globalThis as any).document = {
        createElement: (tag: string) => {
          if (tag === 'video') {
            const videoElem: any = {
              set src(_val: string) {
                setTimeout(() => {
                  if (videoElem.onerror) videoElem.onerror(new Error('Decode error'));
                }, 10);
              },
            };
            return videoElem;
          }
          return {};
        },
      };

      const mockFile = new File(['bad content'], 'corrupt.mp4', { type: 'video/mp4' });
      await assert.rejects(async () => {
        await getVideoDuration(mockFile);
      }, /Failed to read video metadata/);
    } finally {
      if (originalCreateElement) {
        (globalThis as any).document.createElement = originalCreateElement;
      } else {
        delete (globalThis as any).document;
      }
    }
  });

  // -----------------------------------------------------------------
  // 3. Post Creation Payload & Schema Rules
  // -----------------------------------------------------------------
  await test('Post creation allows single direct video attachment with .mp4 extension', () => {
    const valid = createPostSchema.safeParse({
      content: 'Here is our community event video!',
      type: 'EVENT',
      media: [
        {
          url: 'https://example.com/storage/v1/object/public/post-media/posts/user/vid.mp4',
          mediaType: 'VIDEO',
          order: 0,
        },
      ],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation allows single direct video attachment with .webm extension', () => {
    const valid = createPostSchema.safeParse({
      content: 'Here is our speech recording in WebM',
      type: 'GENERAL',
      media: [
        {
          url: 'https://example.com/storage/v1/object/public/post-media/posts/user/vid.webm',
          mediaType: 'VIDEO',
          order: 0,
        },
      ],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation allows direct video with mock-storage URL', () => {
    const valid = createPostSchema.safeParse({
      content: 'Dev test video',
      type: 'GENERAL',
      media: [
        {
          url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/vid.mp4',
          mediaType: 'VIDEO',
          order: 0,
        },
      ],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation blocks 2 videos (1 direct video + 1 YouTube)', () => {
    const invalid = createPostSchema.safeParse({
      content: 'Invalid dual video post',
      type: 'GENERAL',
      media: [
        {
          url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/vid.mp4',
          mediaType: 'VIDEO',
          order: 0,
        },
        {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          mediaType: 'VIDEO',
          order: 1,
        },
      ],
    });
    assert.equal(invalid.success, false);
    assert.match(invalid.error!.issues[0].message, /Only one video can be attached/);
  });

  await test('Post creation allows 1 direct video + 3 photos (total 4 items)', () => {
    const valid = createPostSchema.safeParse({
      content: 'Annual community gathering highlights',
      type: 'EVENT',
      media: [
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/vid.mp4', mediaType: 'VIDEO', order: 0 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p1.jpg', mediaType: 'IMAGE', order: 1 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p2.jpg', mediaType: 'IMAGE', order: 2 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p3.jpg', mediaType: 'IMAGE', order: 3 },
      ],
    });
    assert.equal(valid.success, true);
  });

  await test('Post creation rejects 1 direct video + 4 photos (total 5 items)', () => {
    const invalid = createPostSchema.safeParse({
      content: 'Too many items',
      type: 'GENERAL',
      media: [
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/vid.mp4', mediaType: 'VIDEO', order: 0 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p1.jpg', mediaType: 'IMAGE', order: 1 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p2.jpg', mediaType: 'IMAGE', order: 2 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p3.jpg', mediaType: 'IMAGE', order: 3 },
        { url: 'https://mock-storage.apnasamaj.local/post-media/posts/user/p4.jpg', mediaType: 'IMAGE', order: 4 },
      ],
    });
    assert.equal(invalid.success, false);
    assert.match(invalid.error!.issues[0].message, /maximum of 4 media attachments/);
  });

  // -----------------------------------------------------------------
  // 4. Translation Coverage for Video Upload UX
  // -----------------------------------------------------------------
  const videoKeys = [
    'composerVideo',
    'composerVideoTooltip',
    'composerVideoAttached',
    'composerVideoAttachedTooltip',
    'composerVideoDisabledTooltip',
    'composerYoutubeDisabledTooltip',
    'videoSizeExceeded',
    'videoDurationExceeded',
    'unsupportedVideoFormat',
    'videoMetadataError',
    'videoAttachedTitle',
    'removeVideoAria',
    'retryUpload',
    'videoUploading',
    'videoUploadingWait',
    'videoUploadFailedRemoveOrRetry',
    'videoPreviewAlt',
  ];

  for (const key of videoKeys) {
    await test(`Translation key exists in EN: ${key}`, () => {
      const enVal = (resources.en.feed as any)[key];
      assert.ok(typeof enVal === 'string' && enVal.length > 0, `Missing EN key: ${key}`);
    });

    await test(`Translation key exists in HI: ${key}`, () => {
      const hiVal = (resources.hi.feed as any)[key];
      assert.ok(typeof hiVal === 'string' && hiVal.length > 0, `Missing HI key: ${key}`);
    });
  }

  console.log('\n================================================================');
  console.log(` Direct Video Composer Tests: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
  console.log('================================================================\n');

  if (totalTests !== passedTests) {
    process.exit(1);
  }
}

runComposerTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

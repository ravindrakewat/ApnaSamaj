import assert from 'assert';
import { createPostSchema } from '../../../../packages/validation/src/post.ts';
import { PostType } from '../../../../packages/shared-types/src/post.ts';

function assertTest(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
  console.log(`✅ PASS: ${message}`);
}

async function runSocialComposerTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Batch 11.2: Web Social Composer Test Suite      ');
  console.log('================================================================\n');

  console.log('--- Test Suite 1: Multi-Photo Upload Parity (Up to 5 images) ---');

  // 1. Valid post with 5 images
  const postWith5Images = {
    title: 'Community Festival Photos',
    content: 'Here are the top 5 highlights from the festival celebration!',
    type: PostType.GENERAL,
    media: [
      { url: 'https://images.example.com/p1.jpg', order: 0, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p2.jpg', order: 1, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p3.jpg', order: 2, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p4.jpg', order: 3, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p5.jpg', order: 4, mediaType: 'IMAGE' as const },
    ],
  };

  const parse5Result = createPostSchema.safeParse(postWith5Images);
  assertTest(parse5Result.success, 'Allows up to 5 media images in a post');
  if (parse5Result.success) {
    assertTest(parse5Result.data.media?.length === 5, 'Retains all 5 media attachments');
  }

  // 2. Reject post with 6 images (strictly enforcing MAX 5)
  const postWith6Images = {
    content: 'Attempting to attach 6 images',
    type: PostType.GENERAL,
    media: [
      { url: 'https://images.example.com/p1.jpg', order: 0, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p2.jpg', order: 1, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p3.jpg', order: 2, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p4.jpg', order: 3, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p5.jpg', order: 4, mediaType: 'IMAGE' as const },
      { url: 'https://images.example.com/p6.jpg', order: 5, mediaType: 'IMAGE' as const },
    ],
  };

  const parse6Result = createPostSchema.safeParse(postWith6Images);
  assertTest(!parse6Result.success, 'Rejects posts exceeding 5 attachments');

  console.log('\n--- Test Suite 2: Group Targeted Posting ---');

  const postWithGroup = {
    content: 'Exclusive message to youth committee',
    type: PostType.GENERAL,
    groupId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
  };

  const parseGroupResult = createPostSchema.safeParse(postWithGroup);
  assertTest(parseGroupResult.success, 'Allows target group selection');
  if (parseGroupResult.success) {
    assertTest(
      parseGroupResult.data.groupId === 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      'Preserves selected group ID target'
    );
  }

  console.log('\n--- Test Suite 3: YouTube Video Embed Invariant ---');

  const postWithYoutube = {
    title: 'Community Annual Function Highlights',
    content: 'Watch full coverage on YouTube',
    type: PostType.ANNOUNCEMENT,
    media: [
      {
        url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
        thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        order: 0,
        mediaType: 'VIDEO' as const,
      },
    ],
  };

  const parseYoutubeResult = createPostSchema.safeParse(postWithYoutube);
  assertTest(parseYoutubeResult.success, 'Allows valid YouTube video attachment with thumbnail');

  console.log('\n================================================================');
  console.log('   All Batch 11.2 Web Social Composer tests passed cleanly!     ');
  console.log('================================================================\n');
}

runSocialComposerTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

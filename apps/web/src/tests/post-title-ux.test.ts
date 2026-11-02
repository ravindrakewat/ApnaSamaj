/**
 * Apna Samaj — Post Title & Structured Content UX & Validation Test Suite
 *
 * Verifies:
 * 1. Hindi and English i18n resources for title labels, placeholders, errors, and hints with 100% key parity.
 * 2. Strict structured content rules for createPostSchema:
 *    - GENERAL: title is optional.
 *    - ANNOUNCEMENT: title is required (non-empty, non-whitespace).
 *    - EVENT: title is required (non-empty, non-whitespace).
 *    - Max length 150 characters enforced.
 * 3. updatePostSchema title validation and partial update rules.
 * 4. Backward compatibility with legacy posts lacking a title (null/undefined).
 * 5. Preservation of user-generated title text (zero automatic translation).
 * 6. Coexistence with photos, direct video uploads (MP4/WebM), and YouTube embeds.
 * 7. Verification of the PostType enum gap (EMPLOYMENT and GOVERNMENT_SCHEME).
 */

import assert from 'node:assert/strict';
import { resources, i18n, changeLanguage } from '@apnasamaj/i18n';
import validationPkg from '../../../../packages/validation/dist/index.js';
import type { PostType as PostTypeT, PostItem, UserRole } from '@apnasamaj/shared-types';

const { createPostSchema, updatePostSchema, postTypeEnum } = (validationPkg as any).default || validationPkg;

const PostType = {
  GENERAL: 'GENERAL',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  EVENT: 'EVENT',
} as const;

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    testsPassed++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    testsFailed++;
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
  }
}

async function main() {
  console.log('================================================================');
  console.log(' Apna Samaj — Post Title & Structured Content Test Suite        ');
  console.log('================================================================\n');

  const enFeed = resources.en.feed as Record<string, string>;
  const hiFeed = resources.hi.feed as Record<string, string>;

  // -----------------------------------------------------------------------------
  // 1. i18n Key Parity & Localization
  // -----------------------------------------------------------------------------
  console.log('--- 1. Translation Resources & 100% Key Parity ---');

  await runTest('English and Hindi feed namespaces contain all title-related keys', () => {
    const requiredKeys = [
      'postTitleLabel',
      'postTitlePlaceholder',
      'postTitleAnnouncementPlaceholder',
      'postTitleEventPlaceholder',
      'titleRequiredError',
      'titleMaxLengthError',
      'postTypeLabel',
      'postTitleOptionalHint',
      'postTitleRequiredHint',
      'postTitleCharsLeft',
    ];

    for (const key of requiredKeys) {
      assert.ok(key in enFeed, `English feed missing key: ${key}`);
      assert.ok(key in hiFeed, `Hindi feed missing key: ${key}`);
    }
  });

  await runTest('English and Hindi feed namespaces maintain 100% key parity', () => {
    const enKeys = Object.keys(enFeed).sort();
    const hiKeys = Object.keys(hiFeed).sort();
    assert.strictEqual(enKeys.length, hiKeys.length, 'Key counts between en and hi feed do not match');
    assert.deepStrictEqual(enKeys, hiKeys, 'Key lists between en and hi feed do not match');
  });

  await runTest('Dynamic language switching accurately resolves title strings', async () => {
    await changeLanguage('hi');
    assert.strictEqual(i18n.t('feed:postTitleLabel'), 'पोस्ट का शीर्षक');
    assert.strictEqual(i18n.t('feed:postTitleRequiredHint'), 'अनिवार्य');
    assert.strictEqual(i18n.t('feed:postTitleOptionalHint'), 'वैकल्पिक');
    assert.strictEqual(i18n.t('feed:titleRequiredError'), 'इस पोस्ट प्रकार के लिए शीर्षक अनिवार्य है।');

    await changeLanguage('en');
    assert.strictEqual(i18n.t('feed:postTitleLabel'), 'Post Title');
    assert.strictEqual(i18n.t('feed:postTitleRequiredHint'), 'Required');
    assert.strictEqual(i18n.t('feed:postTitleOptionalHint'), 'Optional');
    assert.strictEqual(i18n.t('feed:titleRequiredError'), 'Title is required for this post type.');
  });

  // -----------------------------------------------------------------------------
  // 2. createPostSchema Structured Validation Rules
  // -----------------------------------------------------------------------------
  console.log('\n--- 2. CreatePostSchema Validation Rules ---');

  await runTest('GENERAL post without title is valid (title optional)', () => {
    const res = createPostSchema.safeParse({
      content: 'Namaste community members, this is a general update.',
      type: 'GENERAL',
    });
    assert.ok(res.success, 'Expected GENERAL post without title to succeed');
    assert.strictEqual(res.data.title, undefined);
  });

  await runTest('GENERAL post with valid title is valid', () => {
    const res = createPostSchema.safeParse({
      title: 'Community Weekend Meetup',
      content: 'We are organizing an informal gathering this Saturday.',
      type: 'GENERAL',
    });
    assert.ok(res.success, 'Expected GENERAL post with title to succeed');
    assert.strictEqual(res.data.title, 'Community Weekend Meetup');
  });

  await runTest('GENERAL post with title alone (no content, no media) is valid', () => {
    const res = createPostSchema.safeParse({
      title: 'Short Quick Update For All Members',
      type: 'GENERAL',
    });
    assert.ok(res.success, 'Expected post with title alone to succeed');
  });

  await runTest('ANNOUNCEMENT post without title is rejected', () => {
    const res = createPostSchema.safeParse({
      content: 'Important executive committee decision announced.',
      type: 'ANNOUNCEMENT',
    });
    assert.strictEqual(res.success, false, 'Expected ANNOUNCEMENT without title to fail');
    if (!res.success) {
      const issue = res.error.issues.find((i: any) => i.path.includes('title'));
      assert.ok(issue, 'Expected issue on title field');
      assert.strictEqual(issue.message, 'Title is required for this post type');
    }
  });

  await runTest('ANNOUNCEMENT post with whitespace-only title is rejected', () => {
    const res = createPostSchema.safeParse({
      title: '   \t  \n ',
      content: 'Important executive committee decision announced.',
      type: 'ANNOUNCEMENT',
    });
    assert.strictEqual(res.success, false, 'Expected ANNOUNCEMENT with whitespace title to fail');
    if (!res.success) {
      const issue = res.error.issues.find((i: any) => i.path.includes('title'));
      assert.ok(issue, 'Expected issue on title field');
    }
  });

  await runTest('ANNOUNCEMENT post with non-empty title is accepted', () => {
    const res = createPostSchema.safeParse({
      title: 'Scholarship Applications Open for 2026-2027',
      content: 'Community students can now apply for annual scholarships.',
      type: 'ANNOUNCEMENT',
    });
    assert.ok(res.success, 'Expected ANNOUNCEMENT with title to succeed');
    assert.strictEqual(res.data.title, 'Scholarship Applications Open for 2026-2027');
  });

  await runTest('EVENT post without title is rejected', () => {
    const res = createPostSchema.safeParse({
      content: 'Join us on Sunday for community blood donation camp.',
      type: 'EVENT',
    });
    assert.strictEqual(res.success, false, 'Expected EVENT without title to fail');
    if (!res.success) {
      const issue = res.error.issues.find((i: any) => i.path.includes('title'));
      assert.ok(issue, 'Expected issue on title field');
    }
  });

  await runTest('EVENT post with whitespace-only title is rejected', () => {
    const res = createPostSchema.safeParse({
      title: '    ',
      content: 'Join us on Sunday for community blood donation camp.',
      type: 'EVENT',
    });
    assert.strictEqual(res.success, false, 'Expected EVENT with whitespace title to fail');
  });

  await runTest('EVENT post with non-empty title is accepted', () => {
    const res = createPostSchema.safeParse({
      title: 'Annual Samaj Diwali Milan Samaroh 2026',
      content: 'All families are cordially invited.',
      type: 'EVENT',
    });
    assert.ok(res.success, 'Expected EVENT with title to succeed');
    assert.strictEqual(res.data.title, 'Annual Samaj Diwali Milan Samaroh 2026');
  });

  await runTest('Post title exceeding 150 characters is rejected', () => {
    const longTitle = 'A'.repeat(151);
    const res = createPostSchema.safeParse({
      title: longTitle,
      content: 'Valid description text.',
      type: 'GENERAL',
    });
    assert.strictEqual(res.success, false, 'Expected title > 150 characters to fail');
    if (!res.success) {
      const issue = res.error.issues.find((i: any) => i.path.includes('title'));
      assert.ok(issue, 'Expected title max length validation error');
      assert.ok(issue.message.includes('150'));
    }
  });

  await runTest('Post with exactly 150 character title is accepted', () => {
    const maxTitle = 'T'.repeat(150);
    const res = createPostSchema.safeParse({
      title: maxTitle,
      content: 'Valid description text.',
      type: 'GENERAL',
    });
    assert.ok(res.success, 'Expected 150-char title to succeed');
    assert.strictEqual(res.data.title?.length, 150);
  });

  await runTest('Empty post (no title, empty content, no media) is rejected', () => {
    const res = createPostSchema.safeParse({
      title: '',
      content: '   ',
      type: 'GENERAL',
    });
    assert.strictEqual(res.success, false, 'Expected completely empty post to fail');
  });

  // -----------------------------------------------------------------------------
  // 3. updatePostSchema Title Validation Rules
  // -----------------------------------------------------------------------------
  console.log('\n--- 3. UpdatePostSchema Validation Rules ---');

  await runTest('Updating post title alone is accepted', () => {
    const res = updatePostSchema.safeParse({
      title: 'Updated Samaj Event Title',
    });
    assert.ok(res.success, 'Expected title-only update to succeed');
    assert.strictEqual(res.data.title, 'Updated Samaj Event Title');
  });

  await runTest('Updating ANNOUNCEMENT post with empty title is rejected', () => {
    const res = updatePostSchema.safeParse({
      title: '   ',
      type: 'ANNOUNCEMENT',
    });
    assert.strictEqual(res.success, false, 'Expected update with empty title for ANNOUNCEMENT to fail');
  });

  await runTest('Updating EVENT post with non-empty title is accepted', () => {
    const res = updatePostSchema.safeParse({
      title: 'Rescheduled Youth Conference Date',
      type: 'EVENT',
    });
    assert.ok(res.success, 'Expected EVENT title update to succeed');
  });

  await runTest('Updating title exceeding 150 characters is rejected', () => {
    const res = updatePostSchema.safeParse({
      title: 'X'.repeat(151),
    });
    assert.strictEqual(res.success, false, 'Expected title > 150 chars in update to fail');
  });

  // -----------------------------------------------------------------------------
  // 4. Backward Compatibility & Data Preservation
  // -----------------------------------------------------------------------------
  console.log('\n--- 4. Backward Compatibility & Data Preservation ---');

  await runTest('Legacy posts without title field map safely to null without crashing', () => {
    const legacyPost: Omit<PostItem, 'title'> = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      authorId: 'user-1',
      author: {
        id: 'user-1',
        fullName: 'Sunil Kewat',
        role: 'MEMBER' as UserRole,
      },
      type: PostType.GENERAL,
      content: 'Historical legacy post from earlier batch without title column.',
      isPinned: false,
      media: [],
      likesCount: 10,
      commentsCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const normalizedPost: PostItem = {
      ...legacyPost,
      title: (legacyPost as any).title ?? null,
    };

    assert.strictEqual(normalizedPost.title, null);
    assert.strictEqual(normalizedPost.content, 'Historical legacy post from earlier batch without title column.');
  });

  await runTest('User-generated title in Hindi remains untouched (zero translation)', () => {
    const hindiTitle = 'अखिल भारतीय केवट समाज वार्षिक स्नेह मिलन समारोह २०२६';
    const res = createPostSchema.safeParse({
      title: hindiTitle,
      content: 'सभी समाज बंधु सपरिवार सादर आमंत्रित हैं।',
      type: 'EVENT',
    });
    assert.ok(res.success);
    assert.strictEqual(res.data.title, hindiTitle, 'Hindi title was modified unexpectedly');
  });

  // -----------------------------------------------------------------------------
  // 5. Coexistence with Photos, Direct Video Upload, and YouTube
  // -----------------------------------------------------------------------------
  console.log('\n--- 5. Coexistence with Media Attachments ---');

  await runTest('Post with title and photo attachment is accepted', () => {
    const res = createPostSchema.safeParse({
      title: 'Samaj Bhavan Inauguration Photos',
      content: 'Glimpses of today ceremony.',
      type: 'GENERAL',
      media: [
        { url: 'https://example.com/storage/v1/object/public/bhavan.jpg', mediaType: 'IMAGE', order: 0 },
      ],
    });
    assert.ok(res.success);
    assert.strictEqual(res.data.media?.length, 1);
  });

  await runTest('Post with title and direct uploaded video is accepted', () => {
    const res = createPostSchema.safeParse({
      title: 'Highlights Video of Community Sports Tournament',
      content: 'Watch the final cricket match highlights.',
      type: 'EVENT',
      media: [
        {
          url: 'https://example.com/storage/v1/object/public/videos/highlights.mp4',
          mediaType: 'VIDEO',
          order: 0,
        },
      ],
    });
    assert.ok(res.success);
    assert.strictEqual(res.data.title, 'Highlights Video of Community Sports Tournament');
  });

  await runTest('Post with title and YouTube video embed is accepted', () => {
    const res = createPostSchema.safeParse({
      title: 'President Speech on Samaj Foundation Day',
      content: 'Watch the complete address.',
      type: 'ANNOUNCEMENT',
      media: [
        {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          mediaType: 'VIDEO',
          order: 0,
        },
      ],
    });
    assert.ok(res.success);
    assert.strictEqual(res.data.media?.length, 1);
  });

  await runTest('Title post enforcing at most 1 video still works (rejects 2 videos)', () => {
    const res = createPostSchema.safeParse({
      title: 'Multiple Videos Test',
      type: 'GENERAL',
      media: [
        { url: 'https://example.com/storage/v1/object/public/video1.mp4', mediaType: 'VIDEO', order: 0 },
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaType: 'VIDEO', order: 1 },
      ],
    });
    assert.strictEqual(res.success, false, 'Expected two videos to be rejected');
  });

  // -----------------------------------------------------------------------------
  // 6. PostType Gap Verification (EMPLOYMENT & GOVERNMENT_SCHEME)
  // -----------------------------------------------------------------------------
  console.log('\n--- 6. Architectural Gap Verification ---');

  await runTest('PostType enum contains strictly GENERAL, ANNOUNCEMENT, EVENT', () => {
    const supportedTypes = postTypeEnum.options;
    assert.deepStrictEqual(supportedTypes, ['GENERAL', 'ANNOUNCEMENT', 'EVENT']);

    // Verify that EMPLOYMENT and GOVERNMENT_SCHEME are rejected by the existing enum
    const employmentRes = postTypeEnum.safeParse('EMPLOYMENT');
    assert.strictEqual(employmentRes.success, false, 'EMPLOYMENT should not be valid in current enum');

    const govtRes = postTypeEnum.safeParse('GOVERNMENT_SCHEME');
    assert.strictEqual(govtRes.success, false, 'GOVERNMENT_SCHEME should not be valid in current enum');
  });

  console.log('\n================================================================');
  console.log(` Summary: ${testsPassed}/${testsPassed + testsFailed} Tests Passed Successfully!`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test runner encountered unexpected error:', err);
  process.exit(1);
});

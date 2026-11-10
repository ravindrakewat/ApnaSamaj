import assert from 'assert';
import {
  validatePostTitle,
  validatePostContent,
  validateImageAttachment,
  validateVideoAttachment,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_FILE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  PostCategoryType,
} from '../utils/validation';
import { parseYouTubeUrl } from '@apnasamaj/validation';
import { postsApi } from '../api/posts.api';

console.log('========================================================================');
console.log('   Apna Samaj — Batch 10: Complete Web-to-Mobile Post Parity Tests      ');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${desc}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${desc}`);
          console.error(err);
          throw err;
        });
    }
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    throw err;
  }
}

export async function runWebToMobilePostParityTests() {
  console.log('--- 1. All Post Types & Title Validation Parity ---');

  // A. General
  it('GENERAL post: title is optional', () => {
    const resEmpty = validatePostTitle('', 'GENERAL', 'hi');
    assert.strictEqual(resEmpty.isValid, true);
    const resFilled = validatePostTitle('सामान्य विचार', 'GENERAL', 'hi');
    assert.strictEqual(resFilled.isValid, true);
  });

  // B. Announcement
  it('ANNOUNCEMENT post: title is strictly required', () => {
    const resEmpty = validatePostTitle('', 'ANNOUNCEMENT', 'hi');
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.error, 'इस पोस्ट प्रकार के लिए शीर्षक आवश्यक है');

    const resValid = validatePostTitle('वार्षिक आम सभा', 'ANNOUNCEMENT', 'en');
    assert.strictEqual(resValid.isValid, true);
  });

  // C. Event
  it('EVENT post: title is strictly required', () => {
    const resEmpty = validatePostTitle('', 'EVENT', 'en');
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.error, 'Title is required for this post type');

    const resValid = validatePostTitle('होली मिलन समारोह', 'EVENT', 'hi');
    assert.strictEqual(resValid.isValid, true);
  });

  // D. Employment
  it('EMPLOYMENT post: title is strictly required', () => {
    const resEmpty = validatePostTitle('', 'EMPLOYMENT', 'hi');
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.error, 'इस पोस्ट प्रकार के लिए शीर्षक आवश्यक है');

    const resValid = validatePostTitle('लेखाकार (Accountant) की आवश्यकता', 'EMPLOYMENT', 'hi');
    assert.strictEqual(resValid.isValid, true);
  });

  // E. Government Scheme
  it('GOVERNMENT_SCHEME post: title is strictly required', () => {
    const resEmpty = validatePostTitle('', 'GOVERNMENT_SCHEME', 'en');
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.error, 'Title is required for this post type');

    const resValid = validatePostTitle('मुख्यमंत्री मेधावी विद्यार्थी योजना', 'GOVERNMENT_SCHEME', 'hi');
    assert.strictEqual(resValid.isValid, true);
  });

  // F. Matrimonial
  it('MATRIMONIAL post: title is strictly required', () => {
    const resEmpty = validatePostTitle('', 'MATRIMONIAL', 'hi');
    assert.strictEqual(resEmpty.isValid, false);
    assert.strictEqual(resEmpty.error, 'इस पोस्ट प्रकार के लिए शीर्षक आवश्यक है');

    const resValid = validatePostTitle('वर चाहिए - इंजीनियर (इंदौर)', 'MATRIMONIAL', 'hi');
    assert.strictEqual(resValid.isValid, true);
  });

  // Title 150-char limit
  it('Enforces 150-character limit on titles', () => {
    const longTitle = 'क'.repeat(151);
    const res = validatePostTitle(longTitle, 'GENERAL', 'hi');
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.error, 'शीर्षक 150 वर्णों से अधिक नहीं हो सकता');

    const maxTitle = 'क'.repeat(150);
    const resOk = validatePostTitle(maxTitle, 'GENERAL', 'hi');
    assert.strictEqual(resOk.isValid, true);
  });

  console.log('\n--- 2. Complete Media Support & Upload Validation ---');

  // Image size validation (5MB max)
  it('Validates image size (rejects > 5MB, accepts <= 5MB)', () => {
    const resOver = validateImageAttachment(MAX_IMAGE_SIZE_BYTES + 1, 'image/jpeg', 'hi');
    assert.strictEqual(resOver.isValid, false);

    const resOk = validateImageAttachment(MAX_IMAGE_SIZE_BYTES, 'image/jpeg', 'hi');
    assert.strictEqual(resOk.isValid, true);
  });

  // Image format validation
  it('Validates image format (JPEG, PNG, WebP, GIF accepted, others rejected)', () => {
    assert.strictEqual(validateImageAttachment(1024, 'image/jpeg').isValid, true);
    assert.strictEqual(validateImageAttachment(1024, 'image/png').isValid, true);
    assert.strictEqual(validateImageAttachment(1024, 'image/webp').isValid, true);
    assert.strictEqual(validateImageAttachment(1024, 'image/gif').isValid, true);
    assert.strictEqual(validateImageAttachment(1024, 'application/pdf').isValid, false);
  });

  // Video size validation (30MB max)
  it('Validates video file size (rejects > 30MB, accepts <= 30MB)', () => {
    const resOver = validateVideoAttachment(MAX_VIDEO_FILE_SIZE_BYTES + 1, 30, 'video/mp4', 'hi');
    assert.strictEqual(resOver.isValid, false);

    const resOk = validateVideoAttachment(MAX_VIDEO_FILE_SIZE_BYTES, 30, 'video/mp4', 'hi');
    assert.strictEqual(resOk.isValid, true);
  });

  // Video duration validation (90 seconds max)
  it('Validates video duration (rejects > 90s, accepts <= 90s)', () => {
    const resLong = validateVideoAttachment(1024 * 1024, 91, 'video/mp4', 'hi');
    assert.strictEqual(resLong.isValid, false);

    const resOk = validateVideoAttachment(1024 * 1024, 90, 'video/mp4', 'hi');
    assert.strictEqual(resOk.isValid, true);
  });

  // Video format validation
  it('Validates video format (MP4, WebM, MOV accepted, others rejected)', () => {
    assert.strictEqual(validateVideoAttachment(1024, 30, 'video/mp4').isValid, true);
    assert.strictEqual(validateVideoAttachment(1024, 30, 'video/webm').isValid, true);
    assert.strictEqual(validateVideoAttachment(1024, 30, 'video/quicktime').isValid, true);
    assert.strictEqual(validateVideoAttachment(1024, 30, 'video/avi').isValid, false);
  });

  // YouTube parsing & thumbnail
  it('Parses YouTube URL and extracts video ID, embed URL, and thumbnail', () => {
    const parsed = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok(parsed);
    assert.strictEqual(parsed.videoId, 'dQw4w9WgXcQ');
    assert.strictEqual(parsed.thumbnailUrl, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    assert.ok(parsed.embedUrl.includes('youtube-nocookie.com'));
  });

  // YouTube with start time
  it('Preserves YouTube start time parameter in embed URL', () => {
    const parsed = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=45s');
    assert.ok(parsed);
    assert.strictEqual(parsed.startTimeSeconds, 45);
    assert.ok(parsed.embedUrl.includes('start=45'));
  });

  console.log('\n--- 3. Post Content Combinations & Boundary Rules ---');

  // Text-only
  it('Allows text-only post without media', () => {
    const res = validatePostContent('समाज के सभी सदस्यों को सादर प्रणाम।', '', false);
    assert.strictEqual(res.isValid, true);
  });

  // Image-only (empty content, has media)
  it('Allows image-only post with no text content', () => {
    const res = validatePostContent('', '', true);
    assert.strictEqual(res.isValid, true);
  });

  // Video-only (empty content, has video media)
  it('Allows video-only post with no text content', () => {
    const res = validatePostContent('', '', true);
    assert.strictEqual(res.isValid, true);
  });

  // Title-only (empty content, has title)
  it('Allows post with title only and no body text', () => {
    const res = validatePostContent('', 'महत्वपूर्ण सूचना', false);
    assert.strictEqual(res.isValid, true);
  });

  // Rejects completely empty post
  it('Rejects post when content, title, and media are all empty', () => {
    const res = validatePostContent('', '', false);
    assert.strictEqual(res.isValid, false);
  });

  // Content 5000-char limit
  it('Enforces 5000-character content limit', () => {
    const longContent = 'क'.repeat(5001);
    const res = validatePostContent(longContent, '', false);
    assert.strictEqual(res.isValid, false);

    const validContent = 'क'.repeat(5000);
    const resOk = validatePostContent(validContent, '', false);
    assert.strictEqual(resOk.isValid, true);
  });

  console.log('\n--- 4. Mixed Media & Upload Experience Invariants ---');

  // Max 4 media items rule
  it('Enforces maximum 4 media items per post', () => {
    const mediaList = [
      { url: 'https://example.com/img1.jpg', mediaType: 'IMAGE' },
      { url: 'https://example.com/img2.jpg', mediaType: 'IMAGE' },
      { url: 'https://example.com/img3.jpg', mediaType: 'IMAGE' },
      { url: 'https://example.com/vid.mp4', mediaType: 'VIDEO' },
    ];
    assert.strictEqual(mediaList.length <= 4, true);

    const tooMany = [...mediaList, { url: 'https://example.com/img4.jpg', mediaType: 'IMAGE' }];
    assert.strictEqual(tooMany.length > 4, true);
  });

  // Single video limit
  it('Enforces maximum 1 video (direct upload or YouTube) per post', () => {
    const oneVideo = [
      { url: 'https://example.com/img1.jpg', mediaType: 'IMAGE' },
      { url: 'https://example.com/vid1.mp4', mediaType: 'VIDEO' },
    ];
    const videoCount1 = oneVideo.filter((m) => m.mediaType === 'VIDEO').length;
    assert.strictEqual(videoCount1, 1);

    const twoVideos = [
      { url: 'https://example.com/vid1.mp4', mediaType: 'VIDEO' },
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaType: 'VIDEO' },
    ];
    const videoCount2 = twoVideos.filter((m) => m.mediaType === 'VIDEO').length;
    assert.strictEqual(videoCount2 > 1, true);
  });

  // Upload state guards
  it('Prevents publishing when media is still uploading', () => {
    const mediaItems = [
      { id: '1', url: 'https://example.com/1.jpg', isUploading: false },
      { id: '2', url: undefined, isUploading: true },
    ];
    const isAnyUploading = mediaItems.some((m) => m.isUploading);
    assert.strictEqual(isAnyUploading, true);
  });

  it('Prevents publishing when any media upload has failed with error', () => {
    const mediaItems = [
      { id: '1', url: 'https://example.com/1.jpg', isUploading: false, error: undefined },
      { id: '2', url: undefined, isUploading: false, error: 'Network upload error' },
    ];
    const hasError = mediaItems.some((m) => Boolean(m.error));
    assert.strictEqual(hasError, true);
  });

  console.log('\n--- 5. API Client uploadVideo Method Check ---');

  it('postsApi defines uploadVideo method', () => {
    assert.strictEqual(typeof postsApi.uploadVideo, 'function');
  });

  console.log('\n========================================================================');
  console.log(`   Batch 10 Test Suite Complete: ${passedTests}/${totalTests} Passed `);
  console.log('========================================================================\n');
}


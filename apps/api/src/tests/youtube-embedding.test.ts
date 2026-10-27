import assert from 'node:assert';
import {
  parseYouTubeUrl,
  parseYouTubeStartTime,
  createPostSchema,
  updatePostSchema,
} from '@apnasamaj/validation';
import { PostMediaType, PostType, UserRole } from '@apnasamaj/shared-types';
import { createPost, updatePost } from '../modules/posts/posts.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.2: YouTube Video Embedding Tests');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('--- Phase 6.1: YouTube URL Parser Unit Tests ---');

  // 1. Standard watch URL
  const watchResult = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assertTest(watchResult !== null, 'Parses standard https://www.youtube.com/watch?v=VIDEO_ID');
  assertTest(watchResult?.videoId === 'dQw4w9WgXcQ', 'Extracts exact 11-char video ID from watch URL');
  assertTest(
    watchResult?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'Generates canonical privacy-enhanced embed URL for watch URL'
  );
  assertTest(
    watchResult?.thumbnailUrl === 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'Generates high-quality thumbnail URL from video ID'
  );
  assertTest(
    watchResult?.watchUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Generates canonical fallback watch URL'
  );

  // 2. Mobile URL
  const mobileResult = parseYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ');
  assertTest(mobileResult !== null, 'Parses mobile https://m.youtube.com/watch?v=VIDEO_ID');
  assertTest(mobileResult?.videoId === 'dQw4w9WgXcQ', 'Extracts video ID from mobile URL');
  assertTest(
    mobileResult?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'Generates canonical embed URL from mobile URL'
  );

  // 3. Short URL (youtu.be)
  const shortResult = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
  assertTest(shortResult !== null, 'Parses short https://youtu.be/VIDEO_ID');
  assertTest(shortResult?.videoId === 'dQw4w9WgXcQ', 'Extracts video ID from youtu.be');

  // 4. Shorts URL
  const shortsResult = parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  assertTest(shortsResult !== null, 'Parses YouTube shorts https://www.youtube.com/shorts/VIDEO_ID');
  assertTest(shortsResult?.videoId === 'dQw4w9WgXcQ', 'Extracts video ID from shorts URL');

  // 5. Standard embed URL
  const embedResult = parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
  assertTest(embedResult !== null, 'Parses existing embed https://www.youtube.com/embed/VIDEO_ID');
  assertTest(embedResult?.videoId === 'dQw4w9WgXcQ', 'Extracts video ID from embed URL');

  // 6. Privacy-enhanced embed URL
  const nocookieResult = parseYouTubeUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assertTest(nocookieResult !== null, 'Parses privacy-enhanced https://www.youtube-nocookie.com/embed/VIDEO_ID');
  assertTest(nocookieResult?.videoId === 'dQw4w9WgXcQ', 'Extracts video ID from youtube-nocookie.com');

  // 7. Valid timestamp handling
  const timeResult1 = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120');
  assertTest(timeResult1?.startTimeSeconds === 120, 'Parses numeric timestamp ?t=120');
  assertTest(
    timeResult1?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=120',
    'Appends ?start=120 to embed URL'
  );

  const timeResult2 = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=120s');
  assertTest(timeResult2?.startTimeSeconds === 120, 'Parses seconds-suffixed timestamp ?t=120s');

  const timeResult3 = parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m30s');
  assertTest(timeResult3?.startTimeSeconds === 3750, 'Parses compound timestamp 1h2m30s (3750s)');

  const timeResult4 = parseYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?start=45');
  assertTest(timeResult4?.startTimeSeconds === 45, 'Parses ?start=45 parameter');

  // 8. Tracking parameter removal
  const trackingResult = parseYouTubeUrl(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=tracking123&feature=share&ab_channel=OfficialArtist'
  );
  assertTest(trackingResult !== null, 'Parses URL containing tracking parameters');
  assertTest(
    trackingResult?.embedUrl === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'Strips si, feature, and ab_channel tracking parameters from embed URL'
  );

  // 9. Invalid video ID
  assertTest(parseYouTubeUrl('https://www.youtube.com/watch?v=short') === null, 'Rejects video ID < 11 chars');
  assertTest(
    parseYouTubeUrl('https://www.youtube.com/watch?v=waytoolongvideoid123') === null,
    'Rejects video ID > 11 chars'
  );
  assertTest(
    parseYouTubeUrl('https://www.youtube.com/watch?v=invalid!@#$%') === null,
    'Rejects video ID with invalid characters'
  );

  // 10. Malformed URL
  assertTest(parseYouTubeUrl('not-a-url') === null, 'Rejects arbitrary string');
  assertTest(parseYouTubeUrl('') === null, 'Rejects empty string');

  // 11. Non-YouTube domain
  assertTest(parseYouTubeUrl('https://vimeo.com/123456789') === null, 'Rejects Vimeo domain');
  assertTest(parseYouTubeUrl('https://dailymotion.com/video/x7tg90') === null, 'Rejects Dailymotion domain');

  // 12. Deceptive hostname
  assertTest(
    parseYouTubeUrl('https://notyoutube.com/watch?v=dQw4w9WgXcQ') === null,
    'Rejects deceptive domain notyoutube.com'
  );
  assertTest(
    parseYouTubeUrl('https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ') === null,
    'Rejects subdomain takeover deceptive host youtube.com.attacker.com'
  );

  // 13. HTTP URL rejection (HTTPS only)
  assertTest(
    parseYouTubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ') === null,
    'Rejects insecure HTTP protocol'
  );

  // 14. javascript: URL rejection
  assertTest(parseYouTubeUrl('javascript:alert(1)') === null, 'Rejects javascript: scheme');
  assertTest(
    parseYouTubeUrl('javascript://www.youtube.com/watch?v=dQw4w9WgXcQ') === null,
    'Rejects disguised javascript: scheme'
  );

  // 15. HTML/iframe/script injection rejection
  assertTest(
    parseYouTubeUrl('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>') === null,
    'Rejects raw iframe tag'
  );
  assertTest(
    parseYouTubeUrl('<script>alert("xss")</script>') === null,
    'Rejects script injection'
  );

  console.log('\n--- Phase 6.2: Zod Post Validation Schema Tests ---');

  // Text-only post regression
  const textOnlyParsed = createPostSchema.safeParse({
    content: 'A wonderful day in Apna Samaj!',
    type: 'GENERAL',
  });
  assertTest(textOnlyParsed.success, 'Allows text-only post without media');

  // Post with YouTube video
  const postWithYt = createPostSchema.safeParse({
    content: 'Check out this video!',
    type: 'GENERAL',
    media: [
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        mediaType: 'VIDEO',
        order: 0,
      },
    ],
  });
  assertTest(postWithYt.success, 'Validates post with valid YouTube video URL');

  // Post with YouTube video only (no content)
  const videoOnlyParsed = createPostSchema.safeParse({
    content: '',
    type: 'GENERAL',
    media: [
      {
        url: 'https://youtu.be/dQw4w9WgXcQ',
        mediaType: 'VIDEO',
        order: 0,
      },
    ],
  });
  assertTest(videoOnlyParsed.success, 'Allows post with YouTube video even if content is empty');

  // Neither text nor media rejected
  const emptyPost = createPostSchema.safeParse({
    content: '   ',
    type: 'GENERAL',
    media: [],
  });
  assertTest(!emptyPost.success, 'Rejects post with neither text content nor media');

  // Post with invalid YouTube URL rejected
  const invalidYtPost = createPostSchema.safeParse({
    content: 'Bad link post',
    type: 'GENERAL',
    media: [
      {
        url: 'https://malicious.com/fake-video',
        mediaType: 'VIDEO',
        order: 0,
      },
    ],
  });
  assertTest(!invalidYtPost.success, 'Rejects post with non-YouTube video URL');

  // Max 1 video policy enforced
  const multiVideoPost = createPostSchema.safeParse({
    content: 'Two videos test',
    type: 'GENERAL',
    media: [
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        mediaType: 'VIDEO',
        order: 0,
      },
      {
        url: 'https://youtu.be/9bZkp7q19f0',
        mediaType: 'VIDEO',
        order: 1,
      },
    ],
  });
  assertTest(!multiVideoPost.success, 'Enforces maximum of 1 video attachment per post');

  // 1 Video + 3 Photos allowed (total 4)
  const videoPlusPhotos = createPostSchema.safeParse({
    content: 'Video plus photos',
    type: 'GENERAL',
    media: [
      {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        mediaType: 'VIDEO',
        order: 0,
      },
      {
        url: 'https://supabase.co/storage/v1/object/public/post-media/photo1.jpg',
        mediaType: 'IMAGE',
        order: 1,
      },
      {
        url: 'https://supabase.co/storage/v1/object/public/post-media/photo2.jpg',
        mediaType: 'IMAGE',
        order: 2,
      },
    ],
  });
  assertTest(videoPlusPhotos.success, 'Allows 1 video combined with image attachments');

  // Exceeding 4 media attachments rejected
  const fiveMediaPost = createPostSchema.safeParse({
    content: 'Too many media',
    type: 'GENERAL',
    media: [
      { url: 'https://youtu.be/dQw4w9WgXcQ', mediaType: 'VIDEO', order: 0 },
      { url: 'https://example.com/1.jpg', mediaType: 'IMAGE', order: 1 },
      { url: 'https://example.com/2.jpg', mediaType: 'IMAGE', order: 2 },
      { url: 'https://example.com/3.jpg', mediaType: 'IMAGE', order: 3 },
      { url: 'https://example.com/4.jpg', mediaType: 'IMAGE', order: 4 },
    ],
  });
  assertTest(!fiveMediaPost.success, 'Rejects more than 4 media attachments total');

  console.log('\n--- Phase 6.3: Backend Service Logic & Isolation Tests ---');

  // Mock Tenant Database
  let persistedPostData: any = null;
  let persistedMediaData: any[] = [];
  const mockTenantDb: any = {
    $transaction: async (fn: any) => fn(mockTenantDb),
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id === 'suspended-user') {
          return { id: 'suspended-user', status: 'SUSPENDED', role: 'MEMBER' };
        }
        return { id: 'active-user', status: 'ACTIVE', role: 'MEMBER' };
      },
    },
    group: {
      findUnique: async ({ where }: any) => {
        if (where.id === 'private-group') {
          return { id: 'private-group', privacy: 'PRIVATE', status: 'ACTIVE', members: [] };
        }
        return null;
      },
    },
    groupMember: {
      findUnique: async () => null, // User is NOT a member of the group
    },
    postMedia: {
      createMany: async ({ data }: any) => {
        persistedMediaData = data.map((d: any, idx: number) => ({
          id: `media-${idx + 1}`,
          createdAt: new Date(),
          ...d,
        }));
        return { count: data.length };
      },
      deleteMany: async () => {
        persistedMediaData = [];
        return { count: 0 };
      },
    },
    post: {
      create: async ({ data }: any) => {
        persistedPostData = data;
        return {
          id: 'post-101',
          content: data.content,
          type: data.type,
          authorId: data.authorId,
          groupId: data.groupId || null,
          isPinned: false,
          viewsCount: 0,
          uniqueViewsCount: 0,
          likesCount: 0,
          commentsCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      update: async ({ data }: any) => {
        persistedPostData = { ...persistedPostData, ...data };
        return persistedPostData;
      },
      findUnique: async () => {
        return {
          id: 'post-101',
          content: persistedPostData?.content,
          type: persistedPostData?.type,
          authorId: persistedPostData?.authorId,
          groupId: persistedPostData?.groupId || null,
          isPinned: false,
          viewsCount: 0,
          uniqueViewsCount: 0,
          likesCount: 0,
          commentsCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: {
            id: 'active-user',
            fullName: 'Active User',
            avatarUrl: null,
            city: 'Bhopal',
            state: 'MP',
            role: 'MEMBER',
            status: 'ACTIVE',
          },
          media: persistedMediaData,
          group: null,
          likes: [],
        };
      },
    },
  };

  // Test 1: Service persistence with arbitrary YouTube URL converts to canonical embed URL
  persistedPostData = null;
  const createdPost = await createPost(
    'active-user',
    UserRole.MEMBER,
    {
      content: 'Sharing a video',
      type: PostType.GENERAL,
      media: [
        {
          url: 'https://youtu.be/dQw4w9WgXcQ?t=90',
          mediaType: PostMediaType.VIDEO,
          order: 0,
        },
      ],
    },
    mockTenantDb
  );

  assertTest(createdPost.id === 'post-101', 'createPost executes successfully');
  assertTest(persistedMediaData.length === 1, 'Post media data was passed to mock tenant db');
  const savedMedia = persistedMediaData[0];
  assertTest(
    savedMedia.url === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
    'Persists canonical privacy-enhanced embed URL in database'
  );
  assertTest(
    savedMedia.thumbnail === 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'Persists generated high-quality thumbnail in database'
  );
  assertTest(
    savedMedia.mediaType === PostMediaType.VIDEO,
    'Persists mediaType as PostMediaType.VIDEO'
  );
  assertTest(savedMedia.order === 0, 'Preserves media ordering');

  // Test 2: Announcement authorization for normal member
  try {
    await createPost(
      'active-user',
      UserRole.MEMBER,
      {
        content: 'Unauthorized announcement post',
        type: PostType.ANNOUNCEMENT,
        media: [],
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for regular member creating announcement post');
  } catch (err: any) {
    assertTest(err.statusCode === 403, 'Rejects regular member publishing announcement with 403 Forbidden');
  }

  // Test 3: Private group authorization
  try {
    await createPost(
      'active-user',
      UserRole.MEMBER,
      {
        content: 'Unauthorized group post',
        type: PostType.GENERAL,
        groupId: 'private-group',
        media: [],
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for non-member posting to private group');
  } catch (err: any) {
    assertTest(
      err.statusCode === 403,
      'Rejects non-member posting to private group with 403 Forbidden'
    );
  }

  // Test 4: Rejection of multiple videos in service layer
  try {
    await createPost(
      'active-user',
      UserRole.MEMBER,
      {
        content: 'Two videos payload',
        type: PostType.GENERAL,
        media: [
          { url: 'https://youtu.be/dQw4w9WgXcQ', mediaType: PostMediaType.VIDEO, order: 0 },
          { url: 'https://youtu.be/9bZkp7q19f0', mediaType: PostMediaType.VIDEO, order: 1 },
        ],
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for multiple video attachments');
  } catch (err: any) {
    assertTest(
      err.statusCode === 400 && /only one video/i.test(err.message),
      'Service layer rejects multiple video attachments with 400 Bad Request'
    );
  }

  // Test 5: Existing uploaded images regression
  persistedPostData = null;
  const imagePost = await createPost(
    'active-user',
    UserRole.MEMBER,
    {
      content: 'Images only post',
      type: PostType.GENERAL,
      media: [
        {
          url: 'https://example.com/uploads/photo1.png',
          thumbnail: 'https://example.com/uploads/photo1_thumb.png',
          mediaType: PostMediaType.IMAGE,
          order: 0,
        },
      ],
    },
    mockTenantDb
  );
  assertTest(
    persistedMediaData[0].url === 'https://example.com/uploads/photo1.png',
    'Preserves existing direct image URL without alteration'
  );
  assertTest(
    persistedMediaData[0].mediaType === PostMediaType.IMAGE,
    'Preserves IMAGE mediaType for direct images'
  );

  // Test 6: Rejection of invalid direct video URL (not storage and not video extension)
  try {
    await createPost(
      'active-user',
      UserRole.MEMBER,
      {
        content: 'Invalid video URL post',
        type: PostType.GENERAL,
        media: [
          {
            url: 'https://malicious.com/fake-stream',
            mediaType: PostMediaType.VIDEO,
            order: 0,
          },
        ],
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for invalid direct video URL');
  } catch (err: any) {
    assertTest(
      err.statusCode === 400 && err.message.includes('Invalid video URL'),
      'Rejects invalid non-YouTube non-storage video URL with 400 Bad Request'
    );
  }

  // Test 7: Post editing - update post media to YouTube embed
  const updatedPost = await updatePost(
    'post-101',
    'active-user',
    UserRole.MEMBER,
    {
      content: 'Updated post content with YouTube embed',
      media: [
        {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=45',
          mediaType: PostMediaType.VIDEO,
          order: 0,
        },
      ],
    },
    mockTenantDb
  );
  assertTest(updatedPost !== null, 'updatePost executes successfully');
  assertTest(
    persistedMediaData.length === 1 &&
      persistedMediaData[0].url === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=45',
    'updatePost replaces post media with canonical YouTube embed URL'
  );
  assertTest(
    persistedMediaData[0].thumbnail === 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    'updatePost persists generated thumbnail on update'
  );

  // Test 8: Post editing - reject >1 video on update
  try {
    await updatePost(
      'post-101',
      'active-user',
      UserRole.MEMBER,
      {
        media: [
          { url: 'https://youtu.be/dQw4w9WgXcQ', mediaType: PostMediaType.VIDEO, order: 0 },
          { url: 'https://youtu.be/9bZkp7q19f0', mediaType: PostMediaType.VIDEO, order: 1 },
        ],
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for multiple video attachments on update');
  } catch (err: any) {
    assertTest(
      err.statusCode === 400 && /only one video/i.test(err.message),
      'updatePost rejects multiple video attachments with 400 Bad Request'
    );
  }

  // Test 9: Post editing - reject unauthorized user update (not author and not moderator)
  try {
    await updatePost(
      'post-101',
      'another-user',
      UserRole.MEMBER,
      {
        content: 'Tampered content',
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for unauthorized post update');
  } catch (err: any) {
    assertTest(
      err.statusCode === 403,
      'updatePost enforces authorization: rejects non-owner update with 403 Forbidden'
    );
  }

  // Test 10: Post editing - reject >4 media items on update
  try {
    await updatePost(
      'post-101',
      'active-user',
      UserRole.MEMBER,
      {
        media: [
          { url: 'https://example.com/1.jpg', mediaType: PostMediaType.IMAGE, order: 0 },
          { url: 'https://example.com/2.jpg', mediaType: PostMediaType.IMAGE, order: 1 },
          { url: 'https://example.com/3.jpg', mediaType: PostMediaType.IMAGE, order: 2 },
          { url: 'https://example.com/4.jpg', mediaType: PostMediaType.IMAGE, order: 3 },
          { url: 'https://example.com/5.jpg', mediaType: PostMediaType.IMAGE, order: 4 },
        ],
      },
      mockTenantDb
    );
    assertTest(false, 'Should throw for >4 media items on update');
  } catch (err: any) {
    assertTest(
      err.statusCode === 400,
      'updatePost enforces maximum 4 media items limit with 400 Bad Request'
    );
  }

  console.log('\n================================================================');
  console.log(`Test Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

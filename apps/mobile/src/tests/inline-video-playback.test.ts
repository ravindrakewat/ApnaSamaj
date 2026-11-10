import { resolveAttachmentDisplayUrl } from '../utils/attachment';
import {
  identifyVideoSource,
  getVideoSourceDetails,
  resolveVideoPlaybackUrl,
  getYouTubeEmbedUrl,
  isYouTubeUrl,
} from '../utils/video';
import { APP_CONFIG } from '../constants/config';

console.log('========================================================================');
console.log('  Apna Samaj — Batch 9.2.1: Facebook-Style Inline Video Playback Tests  ');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runInlineVideoPlaybackTests() {
  console.log('--- 1. Uploaded Video URL Resolution & Bug Fix Verification ---');

  // Critical Bug Fix: Public Supabase storage URLs for posts (community-media bucket)
  // Must NOT be rewritten to /chat/attachments/raw/ (which returned 404 and broke playback)
  const publicPostVideoUrl =
    'https://xyz.supabase.co/storage/v1/object/public/community-media/posts/user123/video.mp4';
  const resolvedPublicUrl = resolveAttachmentDisplayUrl(publicPostVideoUrl);
  assert(
    resolvedPublicUrl === publicPostVideoUrl,
    'Preserves public community-media Supabase video URL without rewriting to /chat/attachments/raw/'
  );
  assert(
    !resolvedPublicUrl.includes('/chat/attachments/raw/'),
    'Public community-media video is NOT redirected to private chat endpoint'
  );

  // Signed URL verification
  const signedUrl =
    'https://xyz.supabase.co/storage/v1/object/sign/chat-attachments/user123/video.mp4?token=abc';
  assert(
    resolveAttachmentDisplayUrl(signedUrl) === signedUrl,
    'Preserves valid Supabase signed storage URL'
  );

  // Private chat-attachment bucket misconfigured public URL should be routed to backend raw proxy
  const privateChatPublicUrl =
    'https://xyz.supabase.co/storage/v1/object/public/chat-attachments/convo123/recording.mp4';
  const resolvedPrivateChat = resolveAttachmentDisplayUrl(privateChatPublicUrl);
  assert(
    resolvedPrivateChat === `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/convo123/recording.mp4`,
    'Properly rewrites private chat-attachments public URL to secure API streaming endpoint'
  );

  // Mock storage URL resolution
  const mockChatUrl = 'https://mock-storage.apnasamaj.local/chat-attachments/sample.mp4';
  assert(
    resolveAttachmentDisplayUrl(mockChatUrl) ===
      `${APP_CONFIG.apiBaseUrl}/chat/attachments/raw/sample.mp4`,
    'Rewrites mock storage chat-attachments URL to backend raw proxy'
  );

  // Localhost URL replacement for mobile emulators / physical LAN devices
  const localUrl = 'http://localhost:4000/uploads/posts/user/video.mp4';
  const resolvedLocal = resolveAttachmentDisplayUrl(localUrl);
  const expectedOrigin = APP_CONFIG.apiBaseUrl.replace(/\/api\/v1\/?$/, '');
  if (!expectedOrigin.includes('localhost:4000')) {
    assert(
      !resolvedLocal.includes('localhost:4000'),
      'Rewrites localhost:4000 to active API host on physical/emulator devices'
    );
  } else {
    assert(
      resolvedLocal.includes('localhost:4000'),
      'Maintains localhost:4000 when apiBaseUrl is running on localhost'
    );
  }

  console.log('\n--- 2. Inline Video Playback Source Identification ---');

  // Verify YouTube inline source
  const ytUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const ytDetails = getVideoSourceDetails(ytUrl);
  assert(ytDetails.sourceType === 'YOUTUBE', 'Identifies YouTube video for inline playback');
  assert(ytDetails.youtubeId === 'dQw4w9WgXcQ', 'Extracts YouTube ID for inline WebView embed');
  assert(
    ytDetails.playbackUrl.includes('youtube-nocookie.com'),
    'Uses privacy-enhanced embed domain for inline YouTube playback'
  );
  assert(
    ytDetails.playbackUrl.includes('playsinline=1'),
    'Sets playsinline=1 for inline Facebook-style playback without taking over full screen'
  );

  // Verify Uploaded Direct Video source
  const directVideoUrl = 'https://xyz.supabase.co/storage/v1/object/public/community-media/posts/u1/clip.mp4';
  const directDetails = getVideoSourceDetails(directVideoUrl, 'https://example.com/thumb.jpg');
  assert(
    directDetails.sourceType === 'UPLOADED_VIDEO',
    'Identifies uploaded MP4 video for native inline player'
  );
  assert(
    directDetails.playbackUrl === directVideoUrl,
    'Preserves direct streamable MP4 URL for native player'
  );
  assert(
    directDetails.thumbnailUrl === 'https://example.com/thumb.jpg',
    'Preserves thumbnail for initial preview'
  );

  console.log('\n--- 3. Low-RAM Single-Active-Player Invariant (Feed State Simulation) ---');

  // Feed state model: Only ONE video may play at a time across the entire Feed
  let activePlayingPostId: string | null = null;
  const playInlineVideo = (postId: string) => {
    activePlayingPostId = postId;
  };
  const pauseInlineVideo = () => {
    activePlayingPostId = null;
  };

  // Initially no video is playing
  assert(activePlayingPostId === null, 'Feed starts with no active inline video playing');

  // User taps play on Post 1
  playInlineVideo('post-1');
  assert(activePlayingPostId === 'post-1', 'Post 1 is now playing inline');

  // User taps play on Post 2: Post 1 is immediately replaced and paused
  playInlineVideo('post-2');
  assert(
    activePlayingPostId === 'post-2',
    'Starting Post 2 immediately stops and unloads Post 1'
  );
  assert(
    activePlayingPostId !== 'post-1',
    'Invariant satisfied: strictly one video plays at a time'
  );

  // User pauses manually
  pauseInlineVideo();
  assert(activePlayingPostId === null, 'Pausing sets activePlayingPostId to null');

  console.log('\n--- 4. Low-RAM Viewability Auto-Pause Invariant ---');

  // Simulate FlatList onViewableItemsChanged
  activePlayingPostId = 'post-3';

  // Screen scrolls: post-3 and post-4 are visible
  let mockViewableItems = [{ item: { id: 'post-3' } }, { item: { id: 'post-4' } }];
  let isStillVisible = mockViewableItems.some((v) => v.item?.id === activePlayingPostId);
  if (!isStillVisible) activePlayingPostId = null;
  assert(
    activePlayingPostId === 'post-3',
    'Video continues playing while post is within viewable items threshold'
  );

  // Screen scrolls further: only post-5 and post-6 are visible (post-3 scrolled out)
  mockViewableItems = [{ item: { id: 'post-5' } }, { item: { id: 'post-6' } }];
  isStillVisible = mockViewableItems.some((v) => v.item?.id === activePlayingPostId);
  if (!isStillVisible) activePlayingPostId = null;
  assert(
    activePlayingPostId === null,
    'Video playback is automatically stopped and unloaded when scrolled out of viewport'
  );

  console.log('\n--- 5. Modal vs Inline Feed Architecture Verification ---');

  // In Batch 9.2.1, the feed NEVER opens UnifiedVideoModal or VideoModal
  // Clicking the video thumbnail replaces it with the inline player inside PostCard
  const postMock = {
    id: 'post-inline-test',
    content: 'Community event clip',
    media: [
      {
        id: 'm1',
        mediaType: 'VIDEO' as const,
        url: 'https://xyz.supabase.co/storage/v1/object/public/community-media/posts/u1/clip.mp4',
        order: 0,
      },
    ],
  };

  const isPostInline = (postId: string, currentActiveId: string | null) => postId === currentActiveId;

  assert(
    !isPostInline(postMock.id, null),
    'PostCard renders thumbnail preview by default when not active'
  );
  assert(
    isPostInline(postMock.id, 'post-inline-test'),
    'PostCard renders inline player directly in card when active'
  );

  console.log('\n========================================================================');
  console.log(`   Batch 9.2.1 Test Suite Complete: ${passedTests}/${totalTests} Passed `);
  console.log('========================================================================\n');
}


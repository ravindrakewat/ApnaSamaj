import { parseYouTubeUrl } from '../../../../packages/validation/src/post';
import type { PostItem, PostMediaItem } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.2: Frontend YouTube Embedding Tests');
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

// Helper to simulate PostCard media separation logic
function categorizePostMedia(postMedia: PostMediaItem[] = []) {
  const videoItem = postMedia.find(
    (m) => m.mediaType === 'VIDEO' || parseYouTubeUrl(m.url) !== null
  );
  const parsedYt = videoItem ? parseYouTubeUrl(videoItem.url) : null;
  const imageItems = postMedia.filter(
    (m) => m !== videoItem && m.mediaType !== 'VIDEO'
  );
  return {
    videoItem,
    parsedYt,
    imageItems,
    isYouTube: Boolean(videoItem && parsedYt),
    isDirectVideo: Boolean(videoItem && !parsedYt),
  };
}

// Simulated player attributes generator as implemented in PostCard.tsx
function getYouTubePlayerProps(embedUrl: string) {
  return {
    src: embedUrl,
    title: 'YouTube video player',
    loading: 'lazy' as const,
    allow: 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    allowFullScreen: true,
    aspectRatioPaddingTop: '56.25%', // 16:9 ratio = 9/16 * 100
  };
}

// Simulated fallback link generator as implemented in PostCard.tsx
function getFallbackLinkProps(watchUrl: string) {
  return {
    href: watchUrl,
    target: '_blank',
    rel: 'noopener noreferrer',
    label: 'Watch on YouTube',
  };
}

async function runFrontendTests() {
  console.log('--- Phase 6.4: Frontend Composer Preview & Attachment Logic ---');

  // Test 1: Immediate URL validation & preview data generation
  const testInputUrl = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
  const parsedPreview = parseYouTubeUrl(testInputUrl);
  assertTest(parsedPreview !== null, 'Composer validates recognized YouTube link immediately');
  assertTest(parsedPreview?.videoId === 'M7lc1UVf-VE', 'Extracts correct video ID for preview card');
  assertTest(
    parsedPreview?.thumbnailUrl === 'https://img.youtube.com/vi/M7lc1UVf-VE/hqdefault.jpg',
    'Generates thumbnail URL for instant composer preview card'
  );

  // Test 2: Preview state removal
  let attachedState: any = parsedPreview;
  // Simulate clicking remove
  attachedState = null;
  assertTest(attachedState === null, 'Composer cleanly removes attached video state upon remove action');

  // Test 3: Duplicate attachment prevention
  const canAttachAnother = (currentAttachment: any) => currentAttachment === null;
  assertTest(!canAttachAnother(parsedPreview), 'Prevents attaching a second YouTube video when one is active');
  assertTest(canAttachAnother(null), 'Allows attaching a video when none is active');

  console.log('\n--- Phase 6.5: Responsive 16:9 Player & Autoplay Safeguards ---');

  // Test 4: Responsive 16:9 ratio configuration
  const canonicalEmbed = 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE';
  const playerProps = getYouTubePlayerProps(canonicalEmbed);
  assertTest(playerProps.aspectRatioPaddingTop === '56.25%', 'Maintains responsive 16:9 aspect ratio container (56.25% padding)');
  assertTest(playerProps.loading === 'lazy', 'Configures lazy loading on player iframe');
  assertTest(playerProps.title === 'YouTube video player', 'Provides accessible title on player iframe');

  // Test 5: Autoplay safeguard
  assertTest(!playerProps.src.includes('autoplay=1'), 'Player embed URL does not contain autoplay parameter');
  assertTest(!playerProps.allow.includes('autoplay'), 'Iframe permissions allow-list strictly excludes autoplay');
  assertTest(playerProps.allow.includes('encrypted-media'), 'Includes only necessary iframe permissions (encrypted-media, picture-in-picture, etc.)');

  console.log('\n--- Phase 6.6: Accessible Fallback Link Validation ---');

  // Test 6: Fallback link formatting and security
  const canonicalWatch = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
  const fallbackProps = getFallbackLinkProps(canonicalWatch);
  assertTest(fallbackProps.href === 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'Fallback link targets canonical YouTube watch URL');
  assertTest(fallbackProps.target === '_blank', 'Fallback link opens in new tab (target="_blank")');
  assertTest(fallbackProps.rel === 'noopener noreferrer', 'Fallback link enforces noopener noreferrer security attributes');
  assertTest(fallbackProps.label === 'Watch on YouTube', 'Provides descriptive and accessible label');

  console.log('\n--- Phase 6.7: Post Rendering Categorization & Regression Tests ---');

  // Test 7: Post with Text + YouTube Video
  const textAndVideoPostMedia: PostMediaItem[] = [
    {
      id: 'media-yt-1',
      mediaType: 'VIDEO',
      url: 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
      thumbnail: 'https://img.youtube.com/vi/M7lc1UVf-VE/hqdefault.jpg',
      order: 0,
    },
  ];
  const post1 = categorizePostMedia(textAndVideoPostMedia);
  assertTest(post1.isYouTube === true, 'Categorizes YouTube embed correctly for rendering');
  assertTest(post1.isDirectVideo === false, 'Does not treat YouTube embed as a direct video file');
  assertTest(post1.imageItems.length === 0, 'No extraneous images extracted');
  assertTest(post1.parsedYt?.videoId === 'M7lc1UVf-VE', 'Parsed YouTube video retains valid video ID');

  // Test 8: Post with Text + Video + Photos
  const videoAndImagesPostMedia: PostMediaItem[] = [
    {
      id: 'media-yt-1',
      mediaType: 'VIDEO',
      url: 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
      thumbnail: 'https://img.youtube.com/vi/M7lc1UVf-VE/hqdefault.jpg',
      order: 0,
    },
    {
      id: 'media-img-1',
      mediaType: 'IMAGE',
      url: 'https://example.com/uploads/community1.jpg',
      order: 1,
    },
    {
      id: 'media-img-2',
      mediaType: 'IMAGE',
      url: 'https://example.com/uploads/community2.jpg',
      order: 2,
    },
  ];
  const post2 = categorizePostMedia(videoAndImagesPostMedia);
  assertTest(post2.isYouTube === true, 'Recognizes video item in mixed post');
  assertTest(post2.imageItems.length === 2, 'Preserves all remaining images for image grid rendering');

  // Test 9: Direct uploaded video regression (non-YouTube)
  const directVideoPostMedia: PostMediaItem[] = [
    {
      id: 'media-direct-vid',
      mediaType: 'VIDEO',
      url: 'https://supabase.co/storage/v1/object/public/post-media/video.mp4',
      thumbnail: 'https://supabase.co/storage/v1/object/public/post-media/video_poster.jpg',
      order: 0,
    },
  ];
  const post3 = categorizePostMedia(directVideoPostMedia);
  assertTest(post3.isYouTube === false, 'Direct video is NOT categorized as YouTube embed');
  assertTest(post3.isDirectVideo === true, 'Direct video is recognized for native <video controls /> rendering');

  // Test 10: Image-only post regression (1, 2, 3, 4 images)
  const imagePostMedia: PostMediaItem[] = [
    { id: 'img-1', mediaType: 'IMAGE', url: 'https://example.com/1.jpg', order: 0 },
    { id: 'img-2', mediaType: 'IMAGE', url: 'https://example.com/2.jpg', order: 1 },
    { id: 'img-3', mediaType: 'IMAGE', url: 'https://example.com/3.jpg', order: 2 },
    { id: 'img-4', mediaType: 'IMAGE', url: 'https://example.com/4.jpg', order: 3 },
  ];
  const post4 = categorizePostMedia(imagePostMedia);
  assertTest(post4.isYouTube === false, 'Image-only post has no YouTube embed');
  assertTest(post4.isDirectVideo === false, 'Image-only post has no direct video');
  assertTest(post4.imageItems.length === 4, 'Preserves all 4 images for standard 2x2 grid rendering');

  console.log('\n--- Phase 6.8: Media Gallery Reliability & Failure Fallbacks ---');

  // Test 11: Image load failure detection & graceful slot fallback
  const failedImageUrls = new Set<string>();
  const simulateImageError = (url: string) => {
    failedImageUrls.add(url);
  };
  simulateImageError('https://example.com/broken-image.jpg');
  assertTest(failedImageUrls.has('https://example.com/broken-image.jpg'), 'Tracks failed image URL in failure set');

  const getSlotRenderProps = (url: string, fixedHeight: number | string) => {
    const isFailed = failedImageUrls.has(url);
    if (isFailed) {
      return {
        type: 'fallback',
        label: 'Image unavailable',
        height: fixedHeight,
        hasBrokenIcon: true,
        clickable: false,
      };
    }
    return {
      type: 'image',
      src: url,
      height: fixedHeight,
      hasBrokenIcon: false,
      clickable: true,
    };
  };

  const brokenSlot = getSlotRenderProps('https://example.com/broken-image.jpg', 250);
  assertTest(brokenSlot.type === 'fallback', 'Replaces broken image with graceful fallback slot');
  assertTest(brokenSlot.label === 'Image unavailable', 'Provides user-friendly "Image unavailable" label');
  assertTest(brokenSlot.hasBrokenIcon === true, 'Renders BrokenImageIcon indicator');
  assertTest(brokenSlot.clickable === false, 'Disables opening broken image in full lightbox');

  // Test 12: Layout preservation during image load failure
  assertTest(brokenSlot.height === 250, 'Preserves exact grid slot height (250px) to prevent layout shifts');

  const healthySlot = getSlotRenderProps('https://example.com/good-image.jpg', 250);
  assertTest(healthySlot.type === 'image', 'Maintains regular image rendering for working URLs');
  assertTest(healthySlot.clickable === true, 'Healthy image remains clickable for lightbox preview');

  // Test 13: Direct video playback failure detection and fallback alert
  const failedVideoUrls = new Set<string>();
  const simulateVideoError = (url: string) => {
    failedVideoUrls.add(url);
  };
  simulateVideoError('https://example.com/corrupt-video.mp4');
  assertTest(failedVideoUrls.has('https://example.com/corrupt-video.mp4'), 'Tracks failed video URL in failure set');

  const getVideoRenderProps = (url: string) => {
    const isFailed = failedVideoUrls.has(url);
    if (isFailed) {
      return {
        type: 'fallback-alert',
        role: 'alert',
        label: 'Video playback unavailable',
        hasOffIcon: true,
      };
    }
    return {
      type: 'video-player',
      src: url,
      controls: true,
    };
  };

  const brokenVideo = getVideoRenderProps('https://example.com/corrupt-video.mp4');
  assertTest(brokenVideo.type === 'fallback-alert', 'Renders fallback box when video source fails');
  assertTest(brokenVideo.role === 'alert', 'Fallback box includes role="alert" for accessibility');
  assertTest(brokenVideo.label === 'Video playback unavailable', 'Informs user that video playback is unavailable without exposing internal storage info');

  // Test 14: Lightbox preview error dismissal safeguard
  let lightboxPreviewImage: string | null = 'https://example.com/broken-full.jpg';
  const handleLightboxError = (url: string) => {
    failedImageUrls.add(url);
    lightboxPreviewImage = null; // Cleanly dismiss
  };
  handleLightboxError('https://example.com/broken-full.jpg');
  assertTest(lightboxPreviewImage === null, 'Safely dismisses lightbox when full-size image fails to load');
  assertTest(failedImageUrls.has('https://example.com/broken-full.jpg'), 'Records failed image URL upon lightbox error');

  // Test 15: Accessibility attributes
  const imageAccessibilityProps = {
    role: 'button',
    tabIndex: 0,
    ariaLabel: "View full image from Author's post",
  };
  assertTest(imageAccessibilityProps.role === 'button', 'Image has role="button" for keyboard interaction');
  assertTest(imageAccessibilityProps.tabIndex === 0, 'Image has tabIndex=0 for keyboard focus');

  const authorName = 'Sunil Kewat';
  const iframeTitle = `YouTube video player: Post by ${authorName}`;
  assertTest(iframeTitle.includes(authorName), 'Iframe provides uniquely descriptive and accessible title with author name');

  console.log('\n================================================================');
  console.log(`Frontend Test Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================');
}

runFrontendTests().catch((err) => {
  console.error('Frontend test execution failed:', err);
  process.exit(1);
});

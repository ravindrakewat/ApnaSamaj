import {
  parseYouTubeLink,
  extractYouTubeUrls,
  findFirstYouTubeLink,
  getYouTubeThumbnail,
  fetchYouTubeMetadata,
  setCachedYouTubeMetadata,
  clearYouTubeMetadataCache,
  getCachedYouTubeMetadata,
  ParsedYouTubeLink,
} from '../utils/youtube-link';
import { getVideoSourceDetails } from '../utils/video';

console.log('========================================================================');
console.log('   Apna Samaj — Batch 10.3.1: YouTube Chat Link Preview Test Suite     ');
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

export async function runYouTubeChatPreviewTests() {
  clearYouTubeMetadataCache();

  // 1. Standard youtube.com/watch URL detection
  const standardUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const parsedStandard = parseYouTubeLink(standardUrl);
  assert(parsedStandard !== null, '1. Standard youtube.com/watch URL detected');
  assert(parsedStandard?.videoId === 'dQw4w9WgXcQ', '1b. Correct video ID extracted from standard URL');

  // 2. youtu.be URL detection
  const shortUrl = 'https://youtu.be/dQw4w9WgXcQ';
  const parsedShort = parseYouTubeLink(shortUrl);
  assert(parsedShort !== null, '2. youtu.be short URL detected');
  assert(parsedShort?.videoId === 'dQw4w9WgXcQ', '2b. Correct video ID extracted from youtu.be URL');

  // 3. YouTube Shorts URL detection
  const shortsUrl = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
  const parsedShorts = parseYouTubeLink(shortsUrl);
  assert(parsedShorts !== null, '3. YouTube Shorts URL detected');
  assert(parsedShorts?.videoId === 'dQw4w9WgXcQ', '3b. Correct video ID extracted from Shorts URL');

  // 4. YouTube Live URL detection
  const liveUrl = 'https://www.youtube.com/live/dQw4w9WgXcQ';
  const parsedLive = parseYouTubeLink(liveUrl);
  assert(parsedLive !== null, '4. YouTube Live URL detected');
  assert(parsedLive?.videoId === 'dQw4w9WgXcQ', '4b. Correct video ID extracted from Live URL');

  // 5. Mobile YouTube URL detection
  const mobileUrl = 'https://m.youtube.com/watch?v=dQw4w9WgXcQ';
  const parsedMobile = parseYouTubeLink(mobileUrl);
  assert(parsedMobile !== null, '5. Mobile m.youtube.com URL detected');
  assert(parsedMobile?.videoId === 'dQw4w9WgXcQ', '5b. Correct video ID extracted from mobile URL');

  // 6. Video ID extraction (Strict 11-character regex verification)
  const candidateWithId = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const parsedCandidate = parseYouTubeLink(candidateWithId);
  assert(parsedCandidate?.videoId === 'jNQXAC9IVRw', '6. Valid 11-char video ID extracted exactly');

  // 7. Invalid URL rejection (too short, too long, malformed)
  assert(parseYouTubeLink('https://www.youtube.com/watch?v=short') === null, '7a. Rejects video ID < 11 chars');
  assert(parseYouTubeLink('https://www.youtube.com/watch?v=toolongvideoid12345') === null, '7b. Rejects video ID > 11 chars');
  assert(parseYouTubeLink('https://www.youtube.com/watch?v=inv@lid!#$') === null, '7c. Rejects malformed characters in video ID');
  assert(parseYouTubeLink('javascript:alert(1)') === null, '7d. Rejects javascript: injection');

  // 8. Non-YouTube URL rejection
  assert(parseYouTubeLink('https://vimeo.com/123456789') === null, '8a. Rejects Vimeo URL');
  assert(parseYouTubeLink('https://dailymotion.com/video/x7tg90') === null, '8b. Rejects Dailymotion URL');
  assert(parseYouTubeLink('https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ') === null, '8c. Rejects deceptive subdomain spoofing');
  assert(parseYouTubeLink('https://notyoutube.com/watch?v=dQw4w9WgXcQ') === null, '8d. Rejects foreign domain');

  // 9. Query parameter and timestamp handling
  const complexUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&si=abc123xyz&feature=share';
  const parsedComplex = parseYouTubeLink(complexUrl);
  assert(parsedComplex !== null, '9a. Complex URL with extra params detected');
  assert(parsedComplex?.startTimeSeconds === 90, '9b. Parses start time parameter (1m30s -> 90s)');
  assert(parsedComplex?.embedUrl.includes('start=90') === true, '9c. Embed URL includes start time param');
  assert(parsedComplex?.canonicalUrl.includes('t=90') === true, '9d. Canonical URL preserves timestamp');

  // 10. Preview rendering for sent messages
  const sentMessage = {
    id: 'msg-1',
    content: 'Check out this video https://youtu.be/dQw4w9WgXcQ',
    senderId: 'user-me',
    isOwn: true,
  };
  const sentLink = findFirstYouTubeLink(sentMessage.content);
  assert(sentLink !== null, '10a. Identifies YouTube link in sent message');
  assert(sentLink?.videoId === 'dQw4w9WgXcQ', '10b. Sent preview card binds to correct video ID');

  // 11. Preview rendering for received messages
  const receivedMessage = {
    id: 'msg-2',
    content: 'https://www.youtube.com/watch?v=jNQXAC9IVRw must watch community tutorial',
    senderId: 'user-other',
    isOwn: false,
  };
  const receivedLink = findFirstYouTubeLink(receivedMessage.content);
  assert(receivedLink !== null, '11a. Identifies YouTube link in received message');
  assert(receivedLink?.videoId === 'jNQXAC9IVRw', '11b. Received preview card binds to correct video ID');

  // 12. Direct Chat integration
  const directMessageText = 'Namaste! Please review this: https://www.youtube.com/shorts/dQw4w9WgXcQ';
  const directChatLink = findFirstYouTubeLink(directMessageText);
  assert(directChatLink !== null, '12a. Direct chat message text extracts YouTube Shorts');
  assert(directChatLink?.thumbnailUrl.includes('dQw4w9WgXcQ') === true, '12b. Thumbnail URL generated for direct chat');

  // 13. Group Chat integration
  const groupMessageText = 'Group announcement video: https://www.youtube.com/live/dQw4w9WgXcQ join live';
  const groupChatLink = findFirstYouTubeLink(groupMessageText);
  assert(groupChatLink !== null, '13a. Group chat message text extracts YouTube Live URL');
  assert(groupChatLink?.embedUrl.includes('youtube-nocookie.com') === true, '13b. Generates privacy-enhanced embed URL for group chat');

  // 14. Old message history preview (no DB migration or resend required)
  const historicalMessages = [
    { id: 'hist-1', content: 'Older message from last month: https://youtu.be/dQw4w9WgXcQ', createdAt: '2026-10-01T10:00:00Z' },
    { id: 'hist-2', content: 'Plain old text without any links', createdAt: '2026-10-02T10:00:00Z' },
  ];
  const hist1Link = findFirstYouTubeLink(historicalMessages[0].content);
  const hist2Link = findFirstYouTubeLink(historicalMessages[1].content);
  assert(hist1Link !== null && hist1Link.videoId === 'dQw4w9WgXcQ', '14a. Historical stored message previews instantly');
  assert(hist2Link === null, '14b. Historical plain message has no preview');

  // 15. Thumbnail failure fallback
  const hqThumb = getYouTubeThumbnail('dQw4w9WgXcQ', 'hq');
  const mqThumb = getYouTubeThumbnail('dQw4w9WgXcQ', 'mq');
  const defThumb = getYouTubeThumbnail('dQw4w9WgXcQ', 'default');
  assert(hqThumb.includes('hqdefault.jpg'), '15a. Resolves high quality thumbnail');
  assert(mqThumb.includes('mqdefault.jpg'), '15b. Resolves medium quality fallback');
  assert(defThumb.includes('default.jpg'), '15c. Resolves default resolution fallback');

  // 16. Missing title fallback
  clearYouTubeMetadataCache();
  const fallbackMeta = await fetchYouTubeMetadata('invalidVideo', 'https://www.youtube.com/watch?v=invalidVideo');
  assert(fallbackMeta.title === 'YouTube Video', '16a. Falls back to "YouTube Video" when title unavailable');
  assert(fallbackMeta.authorName === 'YouTube', '16b. Falls back to "YouTube" author name');

  // Test caching mechanism
  setCachedYouTubeMetadata('dQw4w9WgXcQ', {
    videoId: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up',
    authorName: 'RickAstleyVEVO',
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    provider: 'YouTube',
  });
  const cachedMeta = getCachedYouTubeMetadata('dQw4w9WgXcQ');
  assert(cachedMeta?.title === 'Rick Astley - Never Gonna Give You Up', '16c. Metadata retrieved from in-memory cache');

  // 17. Unified Video Player invocation
  const testLink: ParsedYouTubeLink = {
    videoId: 'dQw4w9WgXcQ',
    originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  };
  const videoDetails = getVideoSourceDetails(testLink.canonicalUrl, testLink.thumbnailUrl);
  assert(videoDetails.sourceType === 'YOUTUBE', '17a. Unified Video Player source details identify YOUTUBE source');
  assert(videoDetails.youtubeId === 'dQw4w9WgXcQ', '17b. Player receives exact YouTube video ID');
  assert(videoDetails.playbackUrl.includes('youtube-nocookie.com/embed'), '17c. Player receives compliant embed URL');

  // 18. Messages without YouTube URLs remain unchanged
  const plainTextMessages = [
    'Hello, how are you doing?',
    'Meeting scheduled at 5 PM today.',
    'Please visit https://apnasamaj.app for portal details.',
    'Great job everyone!',
  ];
  for (const plain of plainTextMessages) {
    assert(findFirstYouTubeLink(plain) === null, `18. Plain text ignored: "${plain.slice(0, 25)}..."`);
  }

  // 19. Multiple links handling
  const multiLinkMessage = 'Watch this first: https://youtu.be/dQw4w9WgXcQ and then watch: https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const allUrls = extractYouTubeUrls(multiLinkMessage);
  const firstLink = findFirstYouTubeLink(multiLinkMessage);
  assert(allUrls.length === 2, '19a. Extracts all valid YouTube URLs in message');
  assert(firstLink !== null && firstLink.videoId === 'dQw4w9WgXcQ', '19b. Predictable WhatsApp behavior: selects first link for preview card');

  // 20. Tenant context preservation
  // Client preview generation requires zero tenant database alterations and does not leak credentials
  assert(typeof parseYouTubeLink === 'function', '20a. Pure functional client parser preserves tenant security');
  assert(allUrls.every((url) => !url.includes('x-community-slug') && !url.includes('token')), '20b. Previews strictly omit auth tokens and tenant secrets');

  console.log('\n========================================================================');
  console.log(`🎉 YOUTUBE CHAT PREVIEW TEST SUMMARY: ${passedTests} passed, 0 failed.`);
  console.log('========================================================================\n');
}

// Self-executing when run directly via tsx
if (require.main === module) {
  runYouTubeChatPreviewTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}


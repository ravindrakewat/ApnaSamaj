import assert from 'node:assert';
import {
  extractUrlsFromText,
  detectLinkProvider,
  extractAmazonAsin,
  parseYouTubeUrl,
  linkPreviewSchema,
  createPostSchema,
} from '@apnasamaj/validation';
import {
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateOrBlockedIp,
  validateUrlForSsrf,
  parseHtmlMetadata,
  fetchLinkPreview,
  clearLinkPreviewCache,
  LinkPreviewError,
} from '../services/link-preview.service';
import {
  encodeLinkPreviewInContent,
  extractLinkPreviewFromContent,
} from '../modules/posts/posts.service';
import { LinkPreviewMetadata, PostType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 12.0.1: Automatic Link Preview Tests');
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
  // -------------------------------------------------------------------------
  // 1. URL Detection & Parsing
  // -------------------------------------------------------------------------
  console.log('--- 1. URL Detection & Provider Identification Tests ---');

  // 1.1 Extract URLs from text
  const multiUrlText = `Check out this product https://www.amazon.in/dp/B08N5WRWNW and watch https://www.youtube.com/watch?v=dQw4w9WgXcQ! Also visit https://example.com/about.`;
  const extracted = extractUrlsFromText(multiUrlText);
  assertTest(extracted.length === 3, `Extracts exact 3 URLs from mixed text (found: ${extracted.length})`);
  assertTest(extracted[0] === 'https://www.amazon.in/dp/B08N5WRWNW', 'Extracts Amazon URL without trailing punctuation');
  assertTest(extracted[1] === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Extracts YouTube URL without exclamation mark');
  assertTest(extracted[2] === 'https://example.com/about', 'Extracts general website URL without trailing dot');

  // 1.2 Duplicate URLs in text
  const duplicateText = `First link: https://example.com/page, second link: https://example.com/page, duplicate!`;
  const deduplicated = extractUrlsFromText(duplicateText);
  assertTest(deduplicated.length === 1, 'Deduplicates identical URLs in post text');

  // 1.3 Invalid or empty URLs
  assertTest(extractUrlsFromText('No links here! Just text.').length === 0, 'Returns empty array when no URLs present');
  assertTest(extractUrlsFromText('ftp://ftp.example.com/file').length === 0, 'Rejects non-HTTP(S) URLs in extraction');

  // 1.4 Provider detection
  assertTest(detectLinkProvider('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'youtube', 'Identifies standard YouTube watch URL');
  assertTest(detectLinkProvider('https://youtu.be/dQw4w9WgXcQ') === 'youtube', 'Identifies youtu.be short URL');
  assertTest(detectLinkProvider('https://www.youtube.com/shorts/dQw4w9WgXcQ') === 'youtube', 'Identifies YouTube Shorts URL');
  assertTest(detectLinkProvider('https://www.youtube.com/embed/dQw4w9WgXcQ') === 'youtube', 'Identifies YouTube embed URL');
  assertTest(detectLinkProvider('https://www.amazon.in/dp/B08N5WRWNW') === 'amazon', 'Identifies Amazon.in product URL');
  assertTest(detectLinkProvider('https://www.amazon.com/gp/product/B08N5WRWNW?ref=abc') === 'amazon', 'Identifies Amazon.com product URL with query params');
  assertTest(detectLinkProvider('https://news.ycombinator.com') === 'general', 'Identifies general news site as general provider');
  assertTest(detectLinkProvider('https://github.com/facebook/react') === 'general', 'Identifies GitHub URL as general provider');

  // 1.5 Amazon ASIN extraction
  assertTest(extractAmazonAsin('https://www.amazon.in/dp/B08N5WRWNW') === 'B08N5WRWNW', 'Extracts 10-char ASIN from /dp/ URL');
  assertTest(extractAmazonAsin('https://www.amazon.com/Some-Product-Title/dp/B08N5WRWNW/ref=sr_1_1') === 'B08N5WRWNW', 'Extracts ASIN from slugged /dp/ URL');
  assertTest(extractAmazonAsin('https://www.amazon.com/gp/product/B09XYZ1234') === 'B09XYZ1234', 'Extracts ASIN from /gp/product/ URL');
  assertTest(extractAmazonAsin('https://www.amazon.in/not-a-product') === null, 'Returns null for non-product Amazon URL');

  // -------------------------------------------------------------------------
  // 2. SSRF Protection & Network Security Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 2. SSRF Protection & Security Invariant Tests ---');

  // 2.1 IPv4 private/loopback/cloud ranges
  assertTest(isPrivateIPv4('127.0.0.1') === true, 'Blocks IPv4 loopback (127.0.0.1)');
  assertTest(isPrivateIPv4('127.1.2.3') === true, 'Blocks full 127.0.0.0/8 loopback subnet');
  assertTest(isPrivateIPv4('10.0.0.1') === true, 'Blocks Class A private IP (10.0.0.1)');
  assertTest(isPrivateIPv4('10.254.1.1') === true, 'Blocks full 10.0.0.0/8 subnet');
  assertTest(isPrivateIPv4('172.16.0.1') === true, 'Blocks Class B private IP start (172.16.0.1)');
  assertTest(isPrivateIPv4('172.31.255.254') === true, 'Blocks Class B private IP end (172.31.255.254)');
  assertTest(isPrivateIPv4('172.32.0.1') === false, 'Allows public IP outside Class B private (172.32.0.1)');
  assertTest(isPrivateIPv4('192.168.1.1') === true, 'Blocks Class C private IP (192.168.1.1)');
  assertTest(isPrivateIPv4('169.254.169.254') === true, 'Blocks Cloud metadata link-local IP (169.254.169.254)');
  assertTest(isPrivateIPv4('0.0.0.0') === true, 'Blocks 0.0.0.0');
  assertTest(isPrivateIPv4('8.8.8.8') === false, 'Allows valid public IP (8.8.8.8)');
  assertTest(isPrivateIPv4('1.1.1.1') === false, 'Allows valid public IP (1.1.1.1)');

  // 2.2 IPv6 private/loopback
  assertTest(isPrivateIPv6('::1') === true, 'Blocks IPv6 loopback (::1)');
  assertTest(isPrivateIPv6('fe80::1') === true, 'Blocks IPv6 link-local (fe80::1)');
  assertTest(isPrivateIPv6('fc00::1') === true, 'Blocks IPv6 unique local (fc00::1)');
  assertTest(isPrivateIPv6('fd12:3456:789a::1') === true, 'Blocks IPv6 unique local fd::');
  assertTest(isPrivateIPv6('::ffff:127.0.0.1') === true, 'Blocks IPv4-mapped loopback in IPv6 (::ffff:127.0.0.1)');
  assertTest(isPrivateIPv6('::ffff:192.168.1.1') === true, 'Blocks IPv4-mapped private in IPv6');
  assertTest(isPrivateIPv6('2607:f8b0:4005:805::200e') === false, 'Allows valid public IPv6 address');

  // 2.3 SSRF URL Validation
  let caughtSsrf = false;
  try {
    await validateUrlForSsrf('http://localhost:3000');
  } catch (err: any) {
    caughtSsrf = true;
    assertTest(
      err.statusCode === 400 || err.statusCode === 403,
      'Rejects localhost with 400 or 403 Forbidden status code'
    );
  }
  assertTest(caughtSsrf, 'validateUrlForSsrf throws on localhost');

  caughtSsrf = false;
  try {
    await validateUrlForSsrf('http://127.0.0.1:8080/admin');
  } catch (err: any) {
    caughtSsrf = true;
  }
  assertTest(caughtSsrf, 'validateUrlForSsrf throws on direct 127.0.0.1 IP');

  caughtSsrf = false;
  try {
    await validateUrlForSsrf('http://169.254.169.254/latest/meta-data/');
  } catch (err: any) {
    caughtSsrf = true;
  }
  assertTest(caughtSsrf, 'validateUrlForSsrf throws on cloud metadata IP');

  caughtSsrf = false;
  try {
    await validateUrlForSsrf('ftp://public.mirror.org/file.iso');
  } catch (err: any) {
    caughtSsrf = true;
  }
  assertTest(caughtSsrf, 'validateUrlForSsrf throws on unsupported non-HTTP protocol');

  caughtSsrf = false;
  try {
    await validateUrlForSsrf('javascript:alert(1)');
  } catch (err: any) {
    caughtSsrf = true;
  }
  assertTest(caughtSsrf, 'validateUrlForSsrf throws on javascript: pseudo-protocol');

  // -------------------------------------------------------------------------
  // 3. HTML & Open Graph Metadata Parser Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 3. HTML Metadata & Open Graph Extractor Tests ---');

  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Default HTML Title &amp; More</title>
      <meta name="description" content="A fallback page description for test cases.">
      <meta property="og:title" content="Social Open Graph Title &quot;Cool&quot;">
      <meta property="og:description" content="Social Open Graph Description for rich cards.">
      <meta property="og:image" content="/images/og-banner.jpg">
      <meta property="og:site_name" content="Apna Samaj Test">
      <link rel="icon" href="/favicon.ico">
    </head>
    <body>
      <h1>Main content heading</h1>
    </body>
    </html>
  `;

  const parsed = parseHtmlMetadata(sampleHtml, 'https://example.com/articles/news');
  assertTest(parsed.title === 'Social Open Graph Title "Cool"', 'Prefers og:title and decodes HTML entities');
  assertTest(parsed.description === 'Social Open Graph Description for rich cards.', 'Extracts og:description');
  assertTest(parsed.thumbnailUrl === 'https://example.com/images/og-banner.jpg', 'Resolves relative og:image against baseUrl');
  assertTest(parsed.favIcon === 'https://example.com/favicon.ico', 'Resolves relative favicon against baseUrl');
  assertTest(parsed.siteName === 'Apna Samaj Test', 'Extracts og:site_name');

  // Fallback to <title> and <meta name="description"> when OG tags absent
  const plainHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Plain Page Title &#8212; Subtitle</title>
      <meta name="description" content="Plain meta description tag content.">
    </head>
    <body></body>
    </html>
  `;
  const parsedPlain = parseHtmlMetadata(plainHtml, 'https://plain.org');
  assertTest(parsedPlain.title?.includes('Plain Page Title'), 'Falls back to standard <title> tag');
  assertTest(parsedPlain.description === 'Plain meta description tag content.', 'Falls back to <meta name="description">');

  // -------------------------------------------------------------------------
  // 4. In-Memory Cache & Provider Handling Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Cache & Post Content Encoding Tests ---');

  clearLinkPreviewCache();

  // Test YouTube preview generation
  const ytResult = await fetchLinkPreview('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assertTest(ytResult.provider === 'youtube', 'fetchLinkPreview identifies YouTube provider');
  assertTest(Boolean(ytResult.thumbnailUrl), 'fetchLinkPreview provides thumbnail for YouTube');
  assertTest(Boolean(ytResult.title), 'fetchLinkPreview provides title for YouTube');

  // Test Amazon preview generation (clean branded fallback)
  const amzResult = await fetchLinkPreview('https://www.amazon.in/dp/B08N5WRWNW');
  assertTest(amzResult.provider === 'amazon', 'fetchLinkPreview identifies Amazon provider');
  assertTest(amzResult.productId === 'B08N5WRWNW', 'fetchLinkPreview extracts ASIN for Amazon');
  assertTest(amzResult.siteName === 'Amazon', 'fetchLinkPreview sets siteName to Amazon');

  // -------------------------------------------------------------------------
  // 5. Post Content Base64 Storage & Strip Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Content Base64 Envelope & Extraction Tests ---');

  const originalContent = 'This is my community post update with an embedded preview.';
  const testPreview: LinkPreviewMetadata = {
    url: 'https://example.com/sample',
    normalizedUrl: 'https://example.com/sample',
    provider: 'general',
    title: 'Sample Open Graph Title',
    description: 'Sample description of the webpage.',
    thumbnailUrl: 'https://example.com/sample.jpg',
    siteName: 'Example',
    authorName: null,
    productId: null,
    mediaType: null,
    favIcon: 'https://example.com/favicon.ico',
  };

  const encodedContent = encodeLinkPreviewInContent(originalContent, testPreview);
  assertTest(encodedContent.includes('<!--apnasamaj:link-preview:'), 'Encodes link preview comment in content');

  const { cleanContent, linkPreview: decodedPreview } = extractLinkPreviewFromContent(encodedContent);
  assertTest(cleanContent === originalContent, 'Strips HTML comment leaving clean post content');
  assertTest(decodedPreview !== null, 'Decodes link preview object successfully');
  assertTest(decodedPreview?.title === testPreview.title, 'Preserves title across encode/decode roundtrip');
  assertTest(decodedPreview?.url === testPreview.url, 'Preserves URL across encode/decode roundtrip');
  assertTest(decodedPreview?.provider === testPreview.provider, 'Preserves provider across encode/decode roundtrip');

  // Verify posts with no preview comment decode cleanly
  const noCommentContent = 'Just regular post text without link preview.';
  const extractedNoComment = extractLinkPreviewFromContent(noCommentContent);
  assertTest(extractedNoComment.cleanContent === noCommentContent, 'Leaves plain content unchanged');
  assertTest(extractedNoComment.linkPreview === null, 'Returns null preview when comment absent');

  // -------------------------------------------------------------------------
  // 6. Schema Validation Tests
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Schema Validation Tests ---');

  const schemaResult = linkPreviewSchema.safeParse(testPreview);
  assertTest(schemaResult.success === true, 'linkPreviewSchema successfully validates LinkPreviewMetadata');

  const postPayloadWithPreview = {
    title: 'Test Post Title',
    content: originalContent,
    type: PostType.GENERAL,
    linkPreview: testPreview,
  };
  const createPostResult = createPostSchema.safeParse(postPayloadWithPreview);
  assertTest(createPostResult.success === true, 'createPostSchema validates payload containing linkPreview');

  console.log('\n================================================================');
  console.log(`   Tests Completed: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

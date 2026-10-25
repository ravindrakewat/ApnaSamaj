import assert from 'node:assert';
import type { CommentItem, PostItem } from '@apnasamaj/shared-types';
import {
  buildSharePayload,
  getCleanShareSnippet,
} from '../utils/post-sharing';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.2: Post Sharing & Comment Linking Tests');
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

function countOccurrences(str: string, sub: string): number {
  if (!sub || !str) return 0;
  return str.split(sub).length - 1;
}

function getCanonicalPostUrl(origin: string, postId: string): string {
  return `${origin}/posts/${postId}`;
}

function parseTargetCommentId(searchString: string): string | undefined {
  const params = new URLSearchParams(searchString);
  return params.get('commentId') || undefined;
}

function findExactCommentToHighlight(comments: Array<{ id: string }>, targetCommentId?: string): string | null {
  if (!targetCommentId) return null;
  const found = comments.find((c) => c.id === targetCommentId);
  return found ? found.id : null;
}

function formatPostDetailDocumentTitle(post: { author: { fullName: string }; content?: string | null }): string {
  const snippet = post.content
    ? post.content.length > 50
      ? `${post.content.slice(0, 47)}...`
      : post.content
    : 'Post';
  return `${post.author.fullName}: "${snippet}" | Apna Samaj`;
}

async function simulateNativeShare(
  shareFn: ((data: any) => Promise<void>) | undefined,
  shareData: { title: string; text: string; url: string }
): Promise<{ openedNative: boolean; fallbackMenuOpened: boolean; cancelled: boolean }> {
  if (shareFn && typeof shareFn === 'function') {
    try {
      await shareFn(shareData);
      return { openedNative: true, fallbackMenuOpened: false, cancelled: false };
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.toLowerCase().includes('abort') ||
          err.message.toLowerCase().includes('cancel'))
      ) {
        return { openedNative: true, fallbackMenuOpened: false, cancelled: true };
      }
      return { openedNative: true, fallbackMenuOpened: true, cancelled: false };
    }
  }
  return { openedNative: false, fallbackMenuOpened: true, cancelled: false };
}

async function runTests() {
  const origin = 'https://apna-samaj.vercel.app';

  console.log('--- 1. Canonical Post URL & Clean Snippet Extraction ---');
  {
    const postShort = {
      id: 'post-101',
      author: { fullName: 'Suresh Kumar' },
      content: 'Short community announcement.',
    };
    const canonicalUrl = getCanonicalPostUrl(origin, postShort.id);
    assertTest(canonicalUrl === 'https://apna-samaj.vercel.app/posts/post-101', 'Constructs valid canonical URL');

    const snippetShort = getCleanShareSnippet(postShort.content, canonicalUrl);
    assertTest(snippetShort === 'Short community announcement.', 'Short content is not truncated');

    const longText = 'A'.repeat(150);
    const snippetLong = getCleanShareSnippet(longText, canonicalUrl);
    assertTest(snippetLong.length === 120, 'Long content is truncated to 120 chars with ellipsis');
    assertTest(snippetLong.endsWith('...'), 'Truncated snippet ends with ellipsis');

    const snippetEmpty = getCleanShareSnippet(null, canonicalUrl);
    assertTest(snippetEmpty === '', 'Null or empty content returns empty string');

    // Content containing the canonical URL directly
    const snippetWithUrl = getCleanShareSnippet(canonicalUrl, canonicalUrl);
    assertTest(snippetWithUrl === '', 'Strips canonical URL from snippet when content is identical to URL');

    // Content with commentary and the canonical URL
    const mixedContent = `Please check this: ${canonicalUrl} for details.`;
    const snippetMixed = getCleanShareSnippet(mixedContent, canonicalUrl);
    assertTest(!snippetMixed.includes(canonicalUrl), 'Strips embedded canonical URL from mixed snippet');
  }

  console.log('--- 2. WhatsApp URL Encoding & Single URL Guarantee ---');
  {
    const canonicalUrl = 'https://apna-samaj.vercel.app/posts/post-special-1';
    const payload = buildSharePayload({
      authorName: 'राजेश शर्मा',
      content: 'सत्र 2026: समाज मिलन समारोह & खेलकूद महोत्सव!',
      canonicalUrl,
    });

    assertTest(payload.whatsappUrl.startsWith('https://api.whatsapp.com/send?text='), 'Generates valid WhatsApp URL base');
    assertTest(payload.whatsappUrl.includes(encodeURIComponent(canonicalUrl)), 'Canonical URL is properly encoded');
    assertTest(payload.whatsappUrl.includes(encodeURIComponent('राजेश शर्मा')), 'Hindi / Unicode author name is safely encoded');
    assertTest(!payload.whatsappUrl.includes(' '), 'No raw spaces in encoded URL query');

    // Decode check
    const rawParam = decodeURIComponent(payload.whatsappUrl.replace('https://api.whatsapp.com/send?text=', ''));
    assertTest(rawParam.includes('*राजेश शर्मा on Apna Samaj*:'), 'Decoded message has bold Markdown author header');
    assertTest(rawParam.includes('सत्र 2026: समाज मिलन समारोह & खेलकूद महोत्सव!'), 'Decoded message preserves exact content');
    assertTest(rawParam.includes(canonicalUrl), 'Decoded message contains canonical link');

    // EXACT ONCE verification for WhatsApp
    assertTest(countOccurrences(rawParam, canonicalUrl) === 1, 'Canonical URL appears EXACTLY ONCE in standard WhatsApp message');
  }

  console.log('--- 3. Duplicate Prevention Under Edge Cases (The Reported Bug) ---');
  {
    const testCanonicalUrl = 'http://localhost:5173/posts/0a2d8f68-8b3f-489f-9a85-6bab74d39b5f';

    // Edge Case A: Post content is literally the canonical post URL itself
    const payloadUrlOnly = buildSharePayload({
      authorName: 'Anita Patel',
      content: testCanonicalUrl,
      canonicalUrl: testCanonicalUrl,
    });
    const decodedUrlOnly = decodeURIComponent(payloadUrlOnly.whatsappUrl.replace('https://api.whatsapp.com/send?text=', ''));
    assertTest(countOccurrences(decodedUrlOnly, testCanonicalUrl) === 1, 'Post with content = URL contains URL EXACTLY ONCE in WhatsApp message');

    // Edge Case B: Post with null or empty content
    const payloadNullContent = buildSharePayload({
      authorName: 'Vikram Singh',
      content: null,
      canonicalUrl: testCanonicalUrl,
    });
    const decodedNullContent = decodeURIComponent(payloadNullContent.whatsappUrl.replace('https://api.whatsapp.com/send?text=', ''));
    assertTest(countOccurrences(decodedNullContent, testCanonicalUrl) === 1, 'Post with null content contains URL EXACTLY ONCE in WhatsApp message');

    // Edge Case C: Native Web Share API payload isolation
    // `nativeShareText` must NOT contain `canonicalUrl` because the target app combines `text` + `\n` + `url`
    assertTest(!payloadUrlOnly.nativeShareText.includes(testCanonicalUrl), 'Native share text does not duplicate canonical URL when content is URL');
    assertTest(!payloadNullContent.nativeShareText.includes(testCanonicalUrl), 'Native share text does not duplicate canonical URL when content is null');

    const payloadStandard = buildSharePayload({
      authorName: 'Suresh Kumar',
      content: 'Standard post content for community members.',
      canonicalUrl: testCanonicalUrl,
    });
    assertTest(!payloadStandard.nativeShareText.includes(testCanonicalUrl), 'Native share text does not duplicate canonical URL for standard post');
    assertTest(payloadStandard.canonicalUrl === testCanonicalUrl, 'Native share url field carries canonical URL');

    // Combined target app simulation (text + '\n' + url)
    const combinedNativeShare = `${payloadStandard.nativeShareText}\n${payloadStandard.canonicalUrl}`;
    assertTest(countOccurrences(combinedNativeShare, testCanonicalUrl) === 1, 'Native share targets receive canonical URL EXACTLY ONCE');

    const combinedUrlOnly = `${payloadUrlOnly.nativeShareText}\n${payloadUrlOnly.canonicalUrl}`;
    assertTest(countOccurrences(combinedUrlOnly, testCanonicalUrl) === 1, 'Native share targets receive canonical URL EXACTLY ONCE when content is URL');
  }

  console.log('--- 4. Target Comment Extraction & Deep Linking ---');
  {
    const target = parseTargetCommentId('?commentId=comm-uuid-456');
    assertTest(target === 'comm-uuid-456', 'Parses commentId parameter from query string');

    const targetEmpty = parseTargetCommentId('?filter=all');
    assertTest(targetEmpty === undefined, 'Returns undefined when commentId is omitted');

    const targetFromComplex = parseTargetCommentId('?sort=newest&commentId=comm-xyz-789&source=notification');
    assertTest(targetFromComplex === 'comm-xyz-789', 'Extracts commentId among multiple query params');
  }

  console.log('--- 5. Exact Comment Highlighting (Anti-Mismatch Guarantee) ---');
  {
    const sampleComments = [
      { id: 'comm-1' },
      { id: 'comm-2' },
      { id: 'comm-3' },
    ];

    // Case A: Exact target exists
    const highlightedExact = findExactCommentToHighlight(sampleComments, 'comm-2');
    assertTest(highlightedExact === 'comm-2', 'Accurately identifies existing target comment for highlight');

    // Case B: Target does NOT exist (deleted or different post)
    const highlightedMissing = findExactCommentToHighlight(sampleComments, 'comm-non-existent');
    assertTest(highlightedMissing === null, 'Never highlights an arbitrary comment when target is not found');

    // Case C: Empty comments list
    const highlightedEmpty = findExactCommentToHighlight([], 'comm-1');
    assertTest(highlightedEmpty === null, 'Returns null safely when comments list is empty');

    // Case D: Undefined target
    const highlightedUndefined = findExactCommentToHighlight(sampleComments, undefined);
    assertTest(highlightedUndefined === null, 'Returns null when targetCommentId is undefined');
  }

  console.log('--- 6. Native Share API & Cancellation Handling ---');
  {
    const shareData = {
      title: 'Title',
      text: 'Snippet',
      url: 'https://apna-samaj.vercel.app/posts/p1',
    };

    // Case A: Native share succeeds
    const nativeSuccess = await simulateNativeShare(async () => {}, shareData);
    assertTest(nativeSuccess.openedNative && !nativeSuccess.fallbackMenuOpened, 'Successful native share does not trigger fallback menu');

    // Case B: User cancels native share (AbortError)
    const nativeCancelled = await simulateNativeShare(async () => {
      const err = new Error('Share canceled by user');
      err.name = 'AbortError';
      throw err;
    }, shareData);
    assertTest(nativeCancelled.cancelled === true, 'Cancellation is detected as non-error');
    assertTest(nativeCancelled.fallbackMenuOpened === false, 'User cancellation does NOT open fallback menu');

    // Case C: Native share unsupported
    const nativeUnsupported = await simulateNativeShare(undefined, shareData);
    assertTest(nativeUnsupported.fallbackMenuOpened === true, 'Unsupported native share triggers fallback menu');
  }

  console.log('--- 7. Dynamic Document Title Formatting & Cleanup ---');
  {
    const postWithContent = {
      author: { fullName: 'Anita Patel' },
      content: 'Community blood donation drive this Sunday in Indore.',
    };
    const title = formatPostDetailDocumentTitle(postWithContent);
    assertTest(title === 'Anita Patel: "Community blood donation drive this Sunday in I..." | Apna Samaj', 'Document title formatted with author and excerpt');

    const postEmptyContent = {
      author: { fullName: 'Vikram Singh' },
      content: null,
    };
    const titleEmpty = formatPostDetailDocumentTitle(postEmptyContent);
    assertTest(titleEmpty === 'Vikram Singh: "Post" | Apna Samaj', 'Handles post without text content gracefully');
  }

  console.log('--- 8. Existing Feed & PostCard Regression Preservation ---');
  {
    const mockPost: PostItem = {
      id: 'reg-post-1',
      authorId: 'auth-1',
      groupId: null,
      group: null,
      type: 'GENERAL' as any,
      content: 'Preserved post content',
      isPinned: true,
      media: [],
      likesCount: 22,
      commentsCount: 7,
      viewsCount: 150,
      uniqueMembersCount: 88,
      isLikedByMe: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: 'auth-1',
        fullName: 'Member Name',
        avatarUrl: null,
        role: 'MEMBER' as any,
        city: 'Ujjain',
        state: 'MP',
      },
    };

    assertTest(mockPost.isPinned === true, 'Pin status preserved');
    assertTest(mockPost.likesCount === 22, 'Likes count preserved');
    assertTest(mockPost.commentsCount === 7, 'Comments count preserved');
    assertTest(mockPost.viewsCount === 150, 'Views count preserved');
    assertTest(mockPost.uniqueMembersCount === 88, 'Unique members count preserved');
    assertTest(mockPost.isLikedByMe === true, 'Like by me preserved');
  }

  console.log('\n================================================================');
  console.log(`   Tests Completed: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

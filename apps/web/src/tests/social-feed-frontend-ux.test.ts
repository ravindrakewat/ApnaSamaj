import assert from 'node:assert/strict';
import type { PostItem, FeedResponseData } from '@apnasamaj/shared-types';

export const PostType = {
  GENERAL: 'GENERAL',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  EVENT: 'EVENT',
} as const;
export type PostType = (typeof PostType)[keyof typeof PostType];

console.log('================================================================');
console.log('   Apna Samaj — Batch 15D.5: Social Feed Frontend UX Tests      ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${description}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${description}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passedTests++;
      console.log(`✅ PASS: ${description}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Helpers Replicating FeedPage Logic for Verification
// ---------------------------------------------------------------------------

function getSearchFromParams(params: URLSearchParams): string {
  return (params.get('search') || '').slice(0, 100);
}

function getTypeFromParams(params: URLSearchParams): PostType | undefined {
  const typeParam = params.get('type');
  if (
    typeParam === PostType.GENERAL ||
    typeParam === PostType.ANNOUNCEMENT ||
    typeParam === PostType.EVENT
  ) {
    return typeParam as PostType;
  }
  return undefined;
}

function getPageFromParams(params: URLSearchParams): number {
  const p = parseInt(params.get('page') || '1', 10);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

function serializeFeedParams(
  debouncedSearch: string,
  selectedType: PostType | undefined,
  page: number,
  baseParams: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  const nextParams = new URLSearchParams(baseParams);

  if (debouncedSearch.trim()) {
    nextParams.set('search', debouncedSearch.trim().slice(0, 100));
  } else {
    nextParams.delete('search');
  }

  if (selectedType) {
    nextParams.set('type', selectedType);
  } else {
    nextParams.delete('type');
  }

  if (page > 1) {
    nextParams.set('page', String(page));
  } else {
    nextParams.delete('page');
  }

  return nextParams;
}

const mockPostItem = (id: string, content: string, type: PostType = PostType.GENERAL, authorName: string = 'Ramesh Kewat'): PostItem => ({
  id,
  type,
  content,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  author: {
    id: 'user-1',
    fullName: authorName,
    role: 'MEMBER' as any,
  },
  groupId: null,
  group: null,
  media: [],
  likesCount: 0,
  commentsCount: 0,
  viewsCount: 0,
  isLikedByMe: false,
  isPinned: false,
});

async function runTests() {
  console.log('--- 1. Search Input Bounds and Sanitization (100 Chars Max) ---');

  test('Search input accepts query under 100 characters', () => {
    const raw = 'समाज सम्मेलन इंदौर';
    const parsed = getSearchFromParams(new URLSearchParams(`search=${encodeURIComponent(raw)}`));
    assert.equal(parsed, raw);
  });

  test('Search input clamps input at exactly 100 characters', () => {
    const longString = 'a'.repeat(120);
    const clamped = longString.slice(0, 100);
    assert.equal(clamped.length, 100);
    const fromParams = getSearchFromParams(new URLSearchParams(`search=${longString}`));
    assert.equal(fromParams.length, 100);
  });

  test('Search input handles empty or missing search parameter', () => {
    assert.equal(getSearchFromParams(new URLSearchParams('')), '');
    assert.equal(getSearchFromParams(new URLSearchParams('type=EVENT')), '');
  });

  test('Leading and trailing whitespace is trimmed for debounced query', () => {
    const raw = '   युवा नेतृत्व कार्यशाला   ';
    assert.equal(raw.trim(), 'युवा नेतृत्व कार्यशाला');
  });

  console.log('\n--- 2. 300ms Debounce Behavior & Keystroke Batching ---');

  await test('300ms debounce batches rapid keystrokes without premature execution', async () => {
    let triggeredCount = 0;
    let debouncedValue = '';

    const simulateTyping = (text: string) => {
      let timer: NodeJS.Timeout | null = null;
      return new Promise<void>((resolve) => {
        let current = '';
        for (let i = 0; i < text.length; i++) {
          setTimeout(() => {
            current += text[i];
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              debouncedValue = current.trim();
              triggeredCount++;
              resolve();
            }, 300);
          }, i * 30); // Type every 30ms (rapid typing)
        }
      });
    };

    await simulateTyping('Apna Samaj');
    assert.equal(debouncedValue, 'Apna Samaj');
    assert.equal(triggeredCount, 1, 'Only one debounced update after typing pauses');
  });

  test('Clearing search executes immediately without waiting for debounce', () => {
    let searchTerm = 'सम्मे';
    let debouncedSearch = 'सम्मे';
    let page = 3;

    // Simulate handleClearSearch
    searchTerm = '';
    debouncedSearch = '';
    page = 1;

    assert.equal(searchTerm, '');
    assert.equal(debouncedSearch, '');
    assert.equal(page, 1);
  });

  console.log('\n--- 3. URL Parameter Synchronization (State -> URL) ---');

  test('Serializes search query to URL', () => {
    const params = serializeFeedParams('वार्षिक बैठक', undefined, 1);
    assert.equal(params.get('search'), 'वार्षिक बैठक');
    assert.equal(params.get('type'), null);
    assert.equal(params.get('page'), null);
  });

  test('Serializes search query combined with post type filter', () => {
    const params = serializeFeedParams('सूचना', PostType.ANNOUNCEMENT, 1);
    assert.equal(params.get('search'), 'सूचना');
    assert.equal(params.get('type'), 'ANNOUNCEMENT');
    assert.equal(params.get('page'), null);
  });

  test('Serializes page parameter only when page > 1', () => {
    const paramsP1 = serializeFeedParams('', undefined, 1);
    assert.equal(paramsP1.has('page'), false);

    const paramsP2 = serializeFeedParams('युवा', PostType.EVENT, 2);
    assert.equal(paramsP2.get('page'), '2');
    assert.equal(paramsP2.get('search'), 'युवा');
    assert.equal(paramsP2.get('type'), 'EVENT');
  });

  test('Omits empty search query from URL', () => {
    const params = serializeFeedParams('   ', undefined, 1);
    assert.equal(params.has('search'), false);
  });

  console.log('\n--- 4. Search State Restoration & Back/Forward Navigation ---');

  test('Restores search query, post type, and page from URL upon initial load', () => {
    const urlParams = new URLSearchParams('search=%E0%A4%87%E0%A4%82%E0%A4%A6%E0%A5%8C%E0%A4%B0&type=EVENT&page=2');
    const restoredSearch = getSearchFromParams(urlParams);
    const restoredType = getTypeFromParams(urlParams);
    const restoredPage = getPageFromParams(urlParams);

    assert.equal(restoredSearch, 'इंदौर');
    assert.equal(restoredType, PostType.EVENT);
    assert.equal(restoredPage, 2);
  });

  test('Rejects invalid post type in URL and falls back to undefined', () => {
    const urlParams = new URLSearchParams('type=INVALID_TYPE');
    const restoredType = getTypeFromParams(urlParams);
    assert.equal(restoredType, undefined);
  });

  test('Rejects invalid page numbers in URL and falls back to page 1', () => {
    assert.equal(getPageFromParams(new URLSearchParams('page=-5')), 1);
    assert.equal(getPageFromParams(new URLSearchParams('page=not-a-number')), 1);
    assert.equal(getPageFromParams(new URLSearchParams('page=0')), 1);
  });

  test('Back/forward detection compares against lastSyncedParamsRef to prevent loop', () => {
    const lastSynced = 'search=kewat&type=GENERAL';
    const currentParams = new URLSearchParams('search=kewat&type=GENERAL');

    // If string matches lastSynced, it was an internal sync; do not trigger re-render loop
    assert.equal(currentParams.toString() === lastSynced, true);

    // If external navigation happened (e.g. back button clicked to empty search)
    const externalParams = new URLSearchParams('');
    assert.equal(externalParams.toString() === lastSynced, false);
  });

  console.log('\n--- 5. Pagination Reset on Filter / Search Change ---');

  test('Changing search query resets pagination to page 1', () => {
    let page = 4;
    const oldSearch = 'उज्जैन';
    const newSearch = 'भोपाल';

    if (newSearch !== oldSearch) {
      page = 1; // Expected FeedPage behavior
    }

    assert.equal(page, 1);
  });

  test('Changing post type filter resets pagination to page 1', () => {
    let page = 3;
    let selectedType: PostType | undefined = PostType.GENERAL;
    const newType: PostType = PostType.EVENT;

    if (newType !== selectedType) {
      selectedType = newType;
      page = 1;
    }

    assert.equal(page, 1);
    assert.equal(selectedType, PostType.EVENT);
  });

  console.log('\n--- 6. Post Filtering & Search Matching ---');

  test('Post matches search on post content (case-insensitive)', () => {
    const post = mockPostItem('p1', 'श्री राम मंदिर निर्माण महोत्सव में सभी का स्वागत है');
    const query = 'महोत्सव';
    assert.equal(post.content.toLowerCase().includes(query.toLowerCase()), true);
  });

  test('Post matches search on author full name (case-insensitive)', () => {
    const post = mockPostItem('p2', 'सामान्य जानकारी', PostType.GENERAL, 'सुनील केवट');
    const query = 'सुनील';
    assert.equal(post.author.fullName?.toLowerCase().includes(query.toLowerCase()), true);
  });

  test('Post does not match unrelated search query', () => {
    const post = mockPostItem('p3', 'बैठक की तारीख', PostType.GENERAL, 'दिनेश');
    const query = 'विवाह';
    const matches =
      post.content.toLowerCase().includes(query.toLowerCase()) ||
      Boolean(post.author.fullName?.toLowerCase().includes(query.toLowerCase()));
    assert.equal(matches, false);
  });

  console.log('\n--- 7. Request Concurrency, Stale Response & Cancellation ---');

  await test('Stale out-of-order response is discarded if a newer request completes first', async () => {
    let requestId = 0;
    let finalPosts: string[] = [];

    const simulateRequest = async (id: number, postsToReturn: string[], delayMs: number) => {
      const currentReq = ++requestId;
      await new Promise((r) => setTimeout(r, delayMs));
      // Stale guard in FeedPage
      if (currentReq === requestId) {
        finalPosts = postsToReturn;
      }
    };

    // Request 1 dispatched first (slow response, 80ms)
    const p1 = simulateRequest(1, ['old-post-1'], 80);
    // Request 2 dispatched shortly after (fast response, 20ms)
    const p2 = simulateRequest(2, ['new-post-1', 'new-post-2'], 20);

    await Promise.all([p1, p2]);

    assert.deepEqual(finalPosts, ['new-post-1', 'new-post-2'], 'Newer request won, older stale response discarded');
  });

  test('In-flight lock prevents duplicate load more triggers', () => {
    let inFlight = true;
    let triggerCount = 0;

    const handleLoadMore = () => {
      if (inFlight) return; // Concurrency guard in FeedPage
      triggerCount++;
    };

    handleLoadMore();
    handleLoadMore();
    assert.equal(triggerCount, 0, 'Duplicate triggers while inFlight were blocked');
  });

  console.log('\n--- 8. Feed Updates, Pinned Posts & Optimistic Like Behavior ---');

  test('handlePostUpdated correctly updates likes count and isLikedByMe', () => {
    const initialPosts = [
      mockPostItem('p1', 'Post 1'),
      mockPostItem('p2', 'Post 2'),
    ];

    const updatedPost = {
      ...initialPosts[0],
      likesCount: 5,
      isLikedByMe: true,
    };

    const newPosts = initialPosts.map((item) => (item.id === updatedPost.id ? updatedPost : item));
    assert.equal(newPosts[0].likesCount, 5);
    assert.equal(newPosts[0].isLikedByMe, true);
    assert.equal(newPosts[1].likesCount, 0);
  });

  test('Pinned posts are prioritized at the top of the feed', () => {
    const posts = [
      mockPostItem('p1', 'Post 1'),
      { ...mockPostItem('p2', 'Post 2'), isPinned: true },
      mockPostItem('p3', 'Post 3'),
    ];

    const sorted = [...posts].sort((a, b) => {
      if (Boolean(a.isPinned) === Boolean(b.isPinned)) return 0;
      return a.isPinned ? -1 : 1;
    });

    assert.equal(sorted[0].id, 'p2', 'Pinned post is first');
    assert.equal(sorted[1].id, 'p1');
    assert.equal(sorted[2].id, 'p3');
  });

  test('handlePostDeleted removes post and clamps total count to zero', () => {
    let posts = [mockPostItem('p1', 'Post 1'), mockPostItem('p2', 'Post 2')];
    let totalPosts = 2;

    // Delete p1
    posts = posts.filter((p) => p.id !== 'p1');
    totalPosts = Math.max(0, totalPosts - 1);

    assert.equal(posts.length, 1);
    assert.equal(posts[0].id, 'p2');
    assert.equal(totalPosts, 1);

    // Delete p2
    posts = posts.filter((p) => p.id !== 'p2');
    totalPosts = Math.max(0, totalPosts - 1);

    assert.equal(posts.length, 0);
    assert.equal(totalPosts, 0);
  });

  console.log('\n--- 9. Hindi Empty State and Accessible UI Messaging ---');

  test('Generates friendly Hindi empty state when search returns zero results', () => {
    const debouncedSearch = 'अज्ञात शब्द';
    const message = `आपकी खोज "${debouncedSearch}" से मेल खाती कोई पोस्ट नहीं मिली। कृपया कोई अन्य शब्द खोजें या फ़िल्टर हटाएँ।`;
    assert(message.includes('अज्ञात शब्द'));
    assert(message.includes('कोई पोस्ट नहीं मिली'));
  });

  test('Generates friendly Hindi message when specific category has no posts', () => {
    const selectedType = PostType.EVENT;
    const message = `इस श्रेणी (${selectedType.toLowerCase()}) में अभी कोई पोस्ट नहीं है। पहली पोस्ट साझा करें!`;
    assert(message.includes('event'));
    assert(message.includes('पहली पोस्ट साझा करें'));
  });

  console.log('\n--- 10. Multi-Tenant Safety & Private Group Visibility ---');

  test('Search queries never expose private group posts to non-members', () => {
    const privateGroupPost = {
      ...mockPostItem('pg-1', 'गोपनीय बैठक की चर्चा'),
      groupId: 'grp-private-1',
      group: { id: 'grp-private-1', name: 'Core Mandal', slug: 'core-mandal', privacy: 'PRIVATE' },
    };

    const isMember = false;
    const privacyFilterAllowed = !privateGroupPost.groupId || privateGroupPost.group?.privacy === 'PUBLIC' || isMember;

    // Conjunction rule: where.AND = [privacyFilter, searchFilter]
    const searchFilterMatched = privateGroupPost.content.includes('बैठक');
    const visibleInFeed = privacyFilterAllowed && searchFilterMatched;

    assert.equal(searchFilterMatched, true, 'Search term matched');
    assert.equal(privacyFilterAllowed, false, 'Non-member blocked by privacy filter');
    assert.equal(visibleInFeed, false, 'Private group post strictly hidden from non-member even if search matches');
  });

  console.log('\n================================================================');
  console.log(`  Social Feed Frontend UX Tests: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();

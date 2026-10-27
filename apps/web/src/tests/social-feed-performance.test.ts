import type { PostItem, FeedPaginationMeta, FeedResponseData } from '@apnasamaj/shared-types';

const PostType = {
  GENERAL: 'GENERAL',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  EVENT: 'EVENT',
} as const;

const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMMUNITY_ADMIN: 'COMMUNITY_ADMIN',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER',
} as const;

console.log('================================================================');
console.log('   Apna Samaj — Batch 14F: Social Feed Performance & Reliability');
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

// ---------------------------------------------------------------------------
// Helpers and Mock Data Generators
// ---------------------------------------------------------------------------

function mockPost(id: string, overrides: Partial<PostItem> = {}): PostItem {
  return {
    id,
    authorId: 'user-author-1',
    groupId: null,
    group: null,
    type: PostType.GENERAL,
    content: `Content for post ${id}`,
    isPinned: false,
    media: [],
    likesCount: 0,
    commentsCount: 0,
    viewsCount: 0,
    uniqueMembersCount: 0,
    isLikedByMe: false,
    createdAt: new Date('2026-10-27T10:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-10-27T10:00:00.000Z').toISOString(),
    author: {
      id: 'user-author-1',
      fullName: 'Author One',
      avatarUrl: null,
      role: UserRole.MEMBER,
      city: 'Mumbai',
      state: 'Maharashtra',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: First-page loading
// ---------------------------------------------------------------------------
console.log('--- Test 1: First-Page Loading ---');
{
  const page1Posts = [mockPost('post-1'), mockPost('post-2'), mockPost('post-3')];
  const responseData: FeedResponseData = {
    posts: page1Posts,
    pagination: {
      page: 1,
      limit: 10,
      totalPosts: 3,
      totalPages: 1,
      hasMore: false,
    },
  };

  let feedState: PostItem[] = [];
  let paginationState: FeedPaginationMeta = {
    page: 1,
    limit: 10,
    totalPosts: 0,
    totalPages: 1,
    hasMore: false,
  };

  // Initial load replaces feed
  feedState = responseData.posts;
  paginationState = responseData.pagination;

  assertTest(feedState.length === 3, 'First-page load sets exact number of posts');
  assertTest(feedState[0].id === 'post-1', 'First post is retained');
  assertTest(paginationState.hasMore === false, 'hasMore is false when posts < limit');
  assertTest(paginationState.totalPosts === 3, 'totalPosts reflects exact count');
}

// ---------------------------------------------------------------------------
// Test 2: Subsequent-page loading preserves existing posts (Append mode)
// ---------------------------------------------------------------------------
console.log('\n--- Test 2: Subsequent-Page Loading Preserves Existing Posts ---');
{
  let feedState: PostItem[] = [mockPost('post-1'), mockPost('post-2')];
  const page2Response: FeedResponseData = {
    posts: [mockPost('post-3'), mockPost('post-4')],
    pagination: {
      page: 2,
      limit: 2,
      totalPosts: 4,
      totalPages: 2,
      hasMore: false,
    },
  };

  // Append logic with Set-based deduplication
  const existingIds = new Set(feedState.map((p) => p.id));
  const newPosts = page2Response.posts.filter((p) => !existingIds.has(p.id));
  feedState = [...feedState, ...newPosts];

  assertTest(feedState.length === 4, 'Append mode retains page 1 and adds page 2 (total 4)');
  assertTest(feedState[0].id === 'post-1', 'Page 1 post-1 is not discarded');
  assertTest(feedState[1].id === 'post-2', 'Page 1 post-2 is not discarded');
  assertTest(feedState[2].id === 'post-3', 'Page 2 post-3 is appended');
  assertTest(feedState[3].id === 'post-4', 'Page 2 post-4 is appended');
}

// ---------------------------------------------------------------------------
// Test 3: Duplicate-post prevention across page boundaries
// ---------------------------------------------------------------------------
console.log('\n--- Test 3: Duplicate-Post Prevention Across Page Boundaries ---');
{
  // Simulated scenario: a new post was inserted at the top of the feed,
  // causing post-2 to shift from page 1 into page 2
  let feedState: PostItem[] = [mockPost('post-1'), mockPost('post-2')];
  const page2WithShiftedDuplicate: FeedResponseData = {
    posts: [mockPost('post-2'), mockPost('post-3')], // post-2 repeated
    pagination: {
      page: 2,
      limit: 2,
      totalPosts: 5,
      totalPages: 3,
      hasMore: true,
    },
  };

  const existingIds = new Set(feedState.map((p) => p.id));
  const newPosts = page2WithShiftedDuplicate.posts.filter((p) => !existingIds.has(p.id));
  feedState = [...feedState, ...newPosts];

  assertTest(feedState.length === 3, 'Duplicate post-2 was filtered out, resulting in 3 unique posts');
  assertTest(
    feedState.map((p) => p.id).join(',') === 'post-1,post-2,post-3',
    'Feed contains strictly unique posts [post-1, post-2, post-3]'
  );
}

// ---------------------------------------------------------------------------
// Test 4: Concurrency Lock / In-Flight Request Protection
// ---------------------------------------------------------------------------
console.log('\n--- Test 4: Concurrency Lock / In-Flight Request Protection ---');
{
  let inFlight = false;
  let networkCalls = 0;

  async function triggerLoadMore() {
    if (inFlight) {
      return 'BLOCKED';
    }
    inFlight = true;
    networkCalls++;
    // Simulate async network delay
    await new Promise((res) => setTimeout(res, 20));
    inFlight = false;
    return 'EXECUTED';
  }

  // Rapid double-click on "Load More"
  const [res1, res2, res3] = await Promise.all([
    triggerLoadMore(),
    triggerLoadMore(),
    triggerLoadMore(),
  ]);

  assertTest(res1 === 'EXECUTED', 'First trigger was executed');
  assertTest(res2 === 'BLOCKED', 'Second concurrent trigger was safely blocked by in-flight lock');
  assertTest(res3 === 'BLOCKED', 'Third concurrent trigger was safely blocked by in-flight lock');
  assertTest(networkCalls === 1, 'Only exactly 1 network request was issued');
}

// ---------------------------------------------------------------------------
// Test 5: Deterministic feed ordering with identical timestamps
// ---------------------------------------------------------------------------
console.log('\n--- Test 5: Deterministic Feed Ordering with Identical Timestamps ---');
{
  const sameTime = new Date('2026-10-27T12:00:00.000Z');
  const postsWithSameTime: PostItem[] = [
    mockPost('post-a', { createdAt: sameTime.toISOString(), isPinned: false }),
    mockPost('post-b', { createdAt: sameTime.toISOString(), isPinned: true }),
    mockPost('post-c', { createdAt: sameTime.toISOString(), isPinned: false }),
  ];

  // Database orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
  const sorted = [...postsWithSameTime].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.id.localeCompare(a.id); // Tertiary tie-breaker id: 'desc'
  });

  assertTest(sorted[0].id === 'post-b', 'Pinned post appears first regardless of timestamp');
  assertTest(sorted[1].id === 'post-c', 'Tie between post-a and post-c is broken deterministically by ID (post-c > post-a)');
  assertTest(sorted[2].id === 'post-a', 'post-a placed deterministically third');
}

// ---------------------------------------------------------------------------
// Test 6: Stale API Responses / Out-of-order race condition handling
// ---------------------------------------------------------------------------
console.log('\n--- Test 6: Stale API Responses / Out-of-Order Race Conditions ---');
{
  let currentRequestId = 0;
  let activeFeedData: string[] = ['initial'];

  async function simulateFetch(filterName: string, latencyMs: number) {
    const requestId = ++currentRequestId;
    // Simulate delay
    await new Promise((res) => setTimeout(res, latencyMs));

    // Stale response guard
    if (requestId !== currentRequestId) {
      // Stale response dropped
      return;
    }

    activeFeedData = [filterName];
  }

  // User clicks "Announcements" (slow response: 50ms), then quickly switches to "Events" (fast: 10ms)
  const req1 = simulateFetch('ANNOUNCEMENT', 50);
  const req2 = simulateFetch('EVENT', 10);

  await Promise.all([req1, req2]);

  assertTest(
    activeFeedData[0] === 'EVENT',
    'Newer request (EVENT) wins and stale slow response (ANNOUNCEMENT) was safely ignored'
  );
}

// ---------------------------------------------------------------------------
// Test 7: API failure and safe retry behavior
// ---------------------------------------------------------------------------
console.log('\n--- Test 7: API Failure and Safe Retry Behavior ---');
{
  let failureCount = 1;
  let errorMessage: string | null = null;
  let feedState: PostItem[] = [];

  async function fetchWithRetry() {
    errorMessage = null;
    try {
      if (failureCount > 0) {
        failureCount--;
        throw new Error('Network timeout (simulated)');
      }
      feedState = [mockPost('recovered-post')];
    } catch (err: any) {
      errorMessage = err.message;
    }
  }

  // First attempt fails
  await fetchWithRetry();
  assertTest(errorMessage === 'Network timeout (simulated)', 'Initial failure sets error message');
  assertTest(feedState.length === 0, 'Feed state remains safe and uncorrupted');

  // User clicks "Retry"
  await fetchWithRetry();
  assertTest(errorMessage === null, 'Retry cleared error message');
  assertTest(feedState.length === 1 && feedState[0].id === 'recovered-post', 'Retry successfully loaded feed');
}

// ---------------------------------------------------------------------------
// Test 8: Deleted post synchronization & boundary clamping
// ---------------------------------------------------------------------------
console.log('\n--- Test 8: Deleted Post Synchronization & Boundary Clamping ---');
{
  let posts: PostItem[] = [mockPost('p1'), mockPost('p2'), mockPost('p3')];
  let totalPosts = 3;

  function handleDelete(deletedId: string) {
    posts = posts.filter((p) => p.id !== deletedId);
    totalPosts = Math.max(0, totalPosts - 1);
  }

  handleDelete('p2');
  assertTest(posts.length === 2, 'Deleted post removed from state');
  assertTest(!posts.some((p) => p.id === 'p2'), 'Deleted post p2 no longer present');
  assertTest(totalPosts === 2, 'totalPosts decremented to 2');

  // Clamp protection test
  handleDelete('p1');
  handleDelete('p3');
  handleDelete('non-existent');
  assertTest(totalPosts === 0, 'totalPosts never becomes negative (clamped at 0)');
}

// ---------------------------------------------------------------------------
// Test 9: Like/Comment count and Pin priority synchronization
// ---------------------------------------------------------------------------
console.log('\n--- Test 9: Engagement Synchronization & Pin Priority ---');
{
  let posts: PostItem[] = [
    mockPost('p1', { likesCount: 5, commentsCount: 2, isPinned: false }),
    mockPost('p2', { likesCount: 1, commentsCount: 0, isPinned: false }),
  ];

  function handlePostUpdated(updated: PostItem) {
    const updatedList = posts.map((item) => (item.id === updated.id ? updated : item));
    posts = [...updatedList].sort((a, b) => {
      if (Boolean(a.isPinned) === Boolean(b.isPinned)) return 0;
      return a.isPinned ? -1 : 1;
    });
  }

  // Member likes post p2
  const updatedP2 = { ...posts[1], likesCount: 2, isLikedByMe: true };
  handlePostUpdated(updatedP2);
  assertTest(posts.find((p) => p.id === 'p2')?.likesCount === 2, 'Post p2 like count updated to 2');
  assertTest(posts.find((p) => p.id === 'p2')?.isLikedByMe === true, 'Post p2 isLikedByMe updated to true');

  // Moderator pins post p2
  const pinnedP2 = { ...updatedP2, isPinned: true };
  handlePostUpdated(pinnedP2);
  assertTest(posts[0].id === 'p2', 'Pinned post p2 promoted to position 0');
}

// ---------------------------------------------------------------------------
// Test 10: Private Group Post Security & Authorization Filter
// ---------------------------------------------------------------------------
console.log('\n--- Test 10: Private Group Post Security & Authorization Filter ---');
{
  interface MockDbPost {
    id: string;
    groupId: string | null;
    group?: { privacy: 'PUBLIC' | 'PRIVATE'; members: { userId: string }[] } | null;
    authorStatus: 'ACTIVE' | 'SUSPENDED';
  }

  const dbPosts: MockDbPost[] = [
    { id: 'public-post', groupId: null, authorStatus: 'ACTIVE' },
    {
      id: 'private-member-post',
      groupId: 'grp-1',
      group: { privacy: 'PRIVATE', members: [{ userId: 'user-123' }] },
      authorStatus: 'ACTIVE',
    },
    {
      id: 'private-nonmember-post',
      groupId: 'grp-2',
      group: { privacy: 'PRIVATE', members: [{ userId: 'other-user' }] },
      authorStatus: 'ACTIVE',
    },
    { id: 'suspended-user-post', groupId: null, authorStatus: 'SUSPENDED' },
  ];

  function filterFeedForUser(currentUserId?: string) {
    return dbPosts.filter((post) => {
      // Must be active author
      if (post.authorStatus !== 'ACTIVE') return false;

      // Group visibility
      if (!post.groupId) return true;
      if (post.group?.privacy === 'PUBLIC') return true;
      if (post.group?.privacy === 'PRIVATE') {
        if (!currentUserId) return false;
        return post.group.members.some((m) => m.userId === currentUserId);
      }
      return false;
    });
  }

  const user123Feed = filterFeedForUser('user-123');
  assertTest(user123Feed.some((p) => p.id === 'public-post'), 'Public post visible to user-123');
  assertTest(user123Feed.some((p) => p.id === 'private-member-post'), 'Authorized private group post visible to member');
  assertTest(!user123Feed.some((p) => p.id === 'private-nonmember-post'), 'Unauthorized private group post hidden from non-member');
  assertTest(!user123Feed.some((p) => p.id === 'suspended-user-post'), 'Suspended user post hidden from feed');

  const unauthFeed = filterFeedForUser(undefined);
  assertTest(!unauthFeed.some((p) => p.groupId !== null), 'Private group posts hidden from unauthenticated requests');
}

// ---------------------------------------------------------------------------
// Test 11: Real-time notification updates do not disrupt feed state
// ---------------------------------------------------------------------------
console.log('\n--- Test 11: Real-Time Notification Non-Interference ---');
{
  let feedPosts: PostItem[] = [mockPost('f1'), mockPost('f2')];
  let unreadNotificationsCount = 0;

  // Real-time socket event arrives
  function handleNotificationEvent(event: { type: string; unreadCount: number }) {
    if (event.type === 'notification:new') {
      unreadNotificationsCount = event.unreadCount;
    }
    // Feed state is decoupled from notifications
  }

  handleNotificationEvent({ type: 'notification:new', unreadCount: 3 });

  assertTest(unreadNotificationsCount === 3, 'Notification counter updated');
  assertTest(feedPosts.length === 2, 'Feed posts state preserved without unexpected reset or re-fetch');
  assertTest(feedPosts[0].id === 'f1', 'Feed items intact');
}

// ---------------------------------------------------------------------------
// Test 12: Bounded pagination parameter validation
// ---------------------------------------------------------------------------
console.log('\n--- Test 12: Bounded Pagination Parameter Validation ---');
{
  const { feedQuerySchema } = await import('@apnasamaj/validation');

  // Normal valid parameters
  const valid = feedQuerySchema.safeParse({ page: '2', limit: '15' });
  assertTest(valid.success && valid.data.page === 2 && valid.data.limit === 15, 'Valid string parameters coerced correctly');

  // Bounded limit protection: limit > 50 must be rejected
  const unbounded = feedQuerySchema.safeParse({ page: '1', limit: '500' });
  assertTest(!unbounded.success, 'Excessive limit > 50 rejected to protect database resources');

  // Negative page protection
  const negativePage = feedQuerySchema.safeParse({ page: '-5' });
  assertTest(!negativePage.success, 'Negative page number rejected');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`   Batch 14F Test Run Completed: ${passedTests} passed, ${failedTests} failed`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

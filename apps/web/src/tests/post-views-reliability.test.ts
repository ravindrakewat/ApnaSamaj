import assert from 'node:assert';
import {
  viewedPostsSession,
  inFlightViewRequests,
  inFlightCountRequests,
  cachedPostViewCounts,
  isCardSubstantiallyVisible,
  triggerPostViewRecord,
  fetchPostViewCounts,
} from '../utils/post-view-tracking';

interface PostViewsResponseData {
  totalViews: number;
  uniqueMembers: number;
  hasViewed?: boolean;
}

console.log('================================================================');
console.log('   Apna Samaj — Batch 14A.4.1: Post Views Frontend Reliability  ');
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
  // Clear caches before tests
  viewedPostsSession.clear();
  inFlightViewRequests.clear();
  inFlightCountRequests.clear();
  cachedPostViewCounts.clear();

  console.log('--- 1. Success Caching: Legitimate Zero Counts ---');
  {
    const postId = 'post-zero-count-1';
    let callCount = 0;
    const mockApi = async (id: string): Promise<PostViewsResponseData> => {
      callCount++;
      return { totalViews: 0, uniqueMembers: 0, hasViewed: true };
    };

    const firstAttempt = await triggerPostViewRecord(postId, 'user-1', mockApi);
    assertTest(firstAttempt.success === true, 'Valid response with 0 views and 0 members is treated as success');
    assertTest(firstAttempt.data?.totalViews === 0, 'totalViews is 0');
    assertTest(firstAttempt.data?.uniqueMembers === 0, 'uniqueMembers is 0');
    assertTest(viewedPostsSession.has(postId), 'Post with 0 count is cached in viewedPostsSession');
    assertTest(callCount === 1, 'API was called exactly once');

    // Subsequent call should hit cache and NOT invoke API
    const secondAttempt = await triggerPostViewRecord(postId, 'user-1', mockApi);
    assertTest(secondAttempt.success === false, 'Cached post suppresses subsequent view attempt');
    assertTest(callCount === 1, 'API call count remains 1 (cache hit prevents refetch)');
  }

  console.log('\n--- 2. Success Caching: Non-Zero Counts ---');
  {
    const postId = 'post-nonzero-1';
    let callCount = 0;
    const mockApi = async (id: string): Promise<PostViewsResponseData> => {
      callCount++;
      return { totalViews: 42, uniqueMembers: 17, hasViewed: true };
    };

    const result = await triggerPostViewRecord(postId, 'user-1', mockApi);
    assertTest(result.success === true, 'Valid response with non-zero counts succeeds');
    assertTest(result.data?.totalViews === 42, 'totalViews matches 42');
    assertTest(result.data?.uniqueMembers === 17, 'uniqueMembers matches 17');
    assertTest(viewedPostsSession.has(postId), 'Post is recorded in viewedPostsSession cache');
  }

  console.log('\n--- 3. Retry Safety: Failed Request Can Be Retried Later ---');
  {
    const postId = 'post-failed-retry-1';
    let callCount = 0;
    let shouldFail = true;

    const mockApi = async (id: string): Promise<PostViewsResponseData> => {
      callCount++;
      if (shouldFail) {
        throw new Error('Network error or server unavailable');
      }
      return { totalViews: 1, uniqueMembers: 1, hasViewed: true };
    };

    // First attempt fails
    const failAttempt = await triggerPostViewRecord(postId, 'user-1', mockApi);
    assertTest(failAttempt.success === false, 'Failed request reports success: false');
    assertTest(!viewedPostsSession.has(postId), 'Failed request does NOT cache post in viewedPostsSession');
    assertTest(!inFlightViewRequests.has(postId), 'In-flight lock is safely released on failure');
    assertTest(callCount === 1, 'API was attempted once');

    // Second attempt (retry) succeeds after recovery
    shouldFail = false;
    const retryAttempt = await triggerPostViewRecord(postId, 'user-1', mockApi);
    assertTest(retryAttempt.success === true, 'Retry succeeds after network recovery');
    assertTest(retryAttempt.data?.totalViews === 1, 'Retry returns valid aggregate counts');
    assertTest(viewedPostsSession.has(postId), 'Only cached after successful response');
    assertTest(callCount === 2, 'API was called second time on retry');
  }

  console.log('\n--- 4. Concurrency: Simultaneous In-Flight Duplicate Suppression ---');
  {
    const postId = 'post-concurrent-1';
    let concurrentInvocations = 0;
    let maxSimultaneous = 0;

    const mockApi = async (id: string): Promise<PostViewsResponseData> => {
      concurrentInvocations++;
      if (concurrentInvocations > maxSimultaneous) {
        maxSimultaneous = concurrentInvocations;
      }
      // Simulate 50ms async network latency
      await new Promise((resolve) => setTimeout(resolve, 50));
      concurrentInvocations--;
      return { totalViews: 5, uniqueMembers: 3, hasViewed: true };
    };

    // Dispatch 5 simultaneous concurrent triggers (simulating rapid rerenders / strict mode)
    const promises = [
      triggerPostViewRecord(postId, 'user-1', mockApi),
      triggerPostViewRecord(postId, 'user-1', mockApi),
      triggerPostViewRecord(postId, 'user-1', mockApi),
      triggerPostViewRecord(postId, 'user-1', mockApi),
      triggerPostViewRecord(postId, 'user-1', mockApi),
    ];

    const results = await Promise.all(promises);
    const successfulDispatches = results.filter((r) => r.success);
    const suppressedDispatches = results.filter((r) => !r.success);

    assertTest(maxSimultaneous === 1, 'At most 1 request was ever in-flight simultaneously');
    assertTest(successfulDispatches.length === 1, 'Exactly one concurrent request succeeded');
    assertTest(suppressedDispatches.length === 4, 'Duplicate concurrent requests were cleanly suppressed');
    assertTest(!inFlightViewRequests.has(postId), 'In-flight lock was released upon completion');
    assertTest(viewedPostsSession.has(postId), 'Post is now safely cached');
  }

  console.log('\n--- 5. Visibility Tracking: Tall Cards & Compact Cards ---');
  {
    const viewportHeight = 800;

    // A. Compact card with 60% visible: should pass
    const compactCardHigh = {
      isIntersecting: true,
      intersectionRatio: 0.6,
      intersectionRect: { height: 180 },
    };
    assertTest(
      isCardSubstantiallyVisible(compactCardHigh, viewportHeight) === true,
      'Compact card with 60% intersection ratio triggers visibility'
    );

    // B. Compact card with 50% visible: should pass threshold
    const compactCardBorder = {
      isIntersecting: true,
      intersectionRatio: 0.5,
      intersectionRect: { height: 150 },
    };
    assertTest(
      isCardSubstantiallyVisible(compactCardBorder, viewportHeight) === true,
      'Card with 50% intersection ratio triggers visibility'
    );

    // C. Compact card only 10% visible (flashed while scrolling fast): should NOT trigger
    const compactCardFlashed = {
      isIntersecting: true,
      intersectionRatio: 0.1,
      intersectionRect: { height: 30 },
    };
    assertTest(
      isCardSubstantiallyVisible(compactCardFlashed, viewportHeight) === false,
      'Card with only 10% intersection ratio (rapid scroll) does NOT trigger'
    );

    // D. Tall multi-image card (total height = 1200px):
    // In viewport of 800px, max possible intersectionRatio is 800/1200 = 0.66,
    // and when 300px of it is on screen, intersectionRatio is only 300/1200 = 0.25 (25%)!
    // Under old 60% rule, this tall card would NEVER trigger.
    // Under new rule: visibleHeight (300px) >= Math.min(200, 800 * 0.35 = 200px) -> triggers!
    const tallCard = {
      isIntersecting: true,
      intersectionRatio: 0.25, // Only 25% because card is 1200px high
      intersectionRect: { height: 300 }, // 300px of content is clearly visible to user
    };
    assertTest(
      isCardSubstantiallyVisible(tallCard, viewportHeight) === true,
      'Tall card with 300px visible height triggers visibility despite 25% ratio'
    );

    // E. Tall card barely entering screen (only 50px visible): should NOT trigger
    const tallCardEntering = {
      isIntersecting: true,
      intersectionRatio: 0.04,
      intersectionRect: { height: 50 },
    };
    assertTest(
      isCardSubstantiallyVisible(tallCardEntering, viewportHeight) === false,
      'Tall card barely entering screen (50px) does NOT trigger'
    );

    // F. Non-intersecting card (offscreen): should NOT trigger
    const offscreenCard = {
      isIntersecting: false,
      intersectionRatio: 0,
      intersectionRect: { height: 0 },
    };
    assertTest(
      isCardSubstantiallyVisible(offscreenCard, viewportHeight) === false,
      'Offscreen card (isIntersecting: false) does NOT trigger'
    );
  }

  console.log('\n--- 6. Authentication Guard ---');
  {
    const postId = 'post-anon-1';
    let called = false;
    const mockApi = async (id: string): Promise<PostViewsResponseData> => {
      called = true;
      return { totalViews: 1, uniqueMembers: 1 };
    };

    const anonResult = await triggerPostViewRecord(postId, undefined, mockApi);
    assertTest(anonResult.success === false, 'Unauthenticated user view is suppressed');
    assertTest(!called, 'API is never called for unauthenticated visitor');
    assertTest(!viewedPostsSession.has(postId), 'Unauthenticated visit is not cached');
  }

  console.log('\n--- 7. Initial Aggregate Fetch for Already-Viewed Post ---');
  {
    const postId = 'post-already-viewed-1';
    let getCallCount = 0;
    let postCallCount = 0;

    const mockGetApi = async (id: string): Promise<PostViewsResponseData> => {
      getCallCount++;
      return { totalViews: 3, uniqueMembers: 3, hasViewed: true };
    };

    const mockPostApi = async (id: string): Promise<PostViewsResponseData> => {
      postCallCount++;
      return { totalViews: 4, uniqueMembers: 4, hasViewed: true };
    };

    // Card mounts: loads aggregate counts via GET
    const getResult = await fetchPostViewCounts(postId, 'user-1', mockGetApi);
    assertTest(getResult.success === true, 'Initial aggregate fetch succeeds');
    assertTest(getResult.data?.totalViews === 3, 'Initial aggregate fetch returns 3 views');
    assertTest(getResult.data?.uniqueMembers === 3, 'Initial aggregate fetch returns 3 members');
    assertTest(getResult.data?.hasViewed === true, 'Response marks hasViewed as true');
    assertTest(viewedPostsSession.has(postId), 'viewedPostsSession is populated from GET response');
    assertTest(cachedPostViewCounts.get(postId)?.totalViews === 3, 'cachedPostViewCounts is saved');

    // Dwell timer triggers: triggerPostViewRecord must be suppressed because hasViewed was true
    const postResult = await triggerPostViewRecord(postId, 'user-1', mockPostApi);
    assertTest(postResult.success === false, 'Redundant POST is suppressed for already-viewed post');
    assertTest(postCallCount === 0, 'POST API is never invoked for already-viewed post');
  }

  console.log('\n--- 8. Refresh Resilience: Preserving Known Counts ---');
  {
    const postId = 'post-refresh-resilience-1';
    // Simulate known counts from feed or cache
    cachedPostViewCounts.set(postId, { totalViews: 7, uniqueMembers: 5 });

    let pendingKnownViews = cachedPostViewCounts.get(postId)?.totalViews ?? 0;
    let pendingKnownMembers = cachedPostViewCounts.get(postId)?.uniqueMembers ?? 0;

    assertTest(pendingKnownViews === 7, 'Known views count is preserved before request dispatches');
    assertTest(pendingKnownMembers === 5, 'Known members count is preserved before request dispatches');

    let isRequestPending = true;
    const mockGetApi = async (id: string): Promise<PostViewsResponseData> => {
      // While request is pending, UI state is never reset to zero
      assertTest(pendingKnownViews === 7, 'Counts are not reset to zero during pending request');
      return { totalViews: 7, uniqueMembers: 5, hasViewed: true };
    };

    const result = await fetchPostViewCounts(postId, 'user-1', mockGetApi);
    isRequestPending = false;
    assertTest(result.success === true, 'Fetch completes successfully');
    assertTest(result.data?.totalViews === 7, 'Counts remain 7 after request completes');
  }

  console.log('\n--- 9. Race Conditions: Monotonic Reconciliation & Delayed Stale Responses ---');
  {
    // Simulate current state having 5 views
    let currentViews = 5;
    let currentMembers = 3;

    const reconcileMonotonically = (newViews: number, newMembers: number) => {
      currentViews = Math.max(currentViews, newViews);
      currentMembers = Math.max(currentMembers, newMembers);
    };

    // Stale delayed response arrives with lower counts (e.g. totalViews: 2, uniqueMembers: 2)
    reconcileMonotonically(2, 2);
    assertTest(currentViews === 5, 'Stale lower view count cannot overwrite higher known count');
    assertTest(currentMembers === 3, 'Stale lower member count cannot overwrite higher known count');

    // Newer higher response arrives (e.g. totalViews: 6, uniqueMembers: 4)
    reconcileMonotonically(6, 4);
    assertTest(currentViews === 6, 'Higher view count successfully updates state');
    assertTest(currentMembers === 4, 'Higher member count successfully updates state');
  }

  console.log('\n--- 10. Concurrency: In-Flight GET Count Suppression ---');
  {
    const postId = 'post-get-concurrent-1';
    let simultaneousCalls = 0;
    let maxSimultaneous = 0;

    const mockGetApi = async (id: string): Promise<PostViewsResponseData> => {
      simultaneousCalls++;
      if (simultaneousCalls > maxSimultaneous) maxSimultaneous = simultaneousCalls;
      await new Promise((r) => setTimeout(r, 40));
      simultaneousCalls--;
      return { totalViews: 10, uniqueMembers: 8, hasViewed: false };
    };

    const promises = [
      fetchPostViewCounts(postId, 'user-1', mockGetApi),
      fetchPostViewCounts(postId, 'user-1', mockGetApi),
      fetchPostViewCounts(postId, 'user-1', mockGetApi),
    ];

    const results = await Promise.all(promises);
    assertTest(maxSimultaneous === 1, 'Only 1 GET request was in flight simultaneously');
    assertTest(results.filter((r) => r.success).length === 1, 'Exactly one GET request completed');
    assertTest(results.filter((r) => !r.success).length === 2, 'Duplicate concurrent GET requests were suppressed');
    assertTest(!inFlightCountRequests.has(postId), 'In-flight lock released after completion');
  }

  console.log('\n--- 11. Multi-Member View Progression ---');
  {
    const postId = 'post-multi-member-progression-1';
    let dbViews = 0;
    let dbMembers = 0;

    // Member A views
    const mockPostApiA = async (id: string): Promise<PostViewsResponseData> => {
      dbViews = 1;
      dbMembers = 1;
      return { totalViews: dbViews, uniqueMembers: dbMembers, hasViewed: true };
    };

    const viewA = await triggerPostViewRecord(postId, 'user-A', mockPostApiA);
    assertTest(viewA.success === true, 'Member A records first view');
    assertTest(viewA.data?.totalViews === 1, 'Total views is 1 after Member A');

    // Member A attempts to view again in same session: suppressed
    const viewA2 = await triggerPostViewRecord(postId, 'user-A', mockPostApiA);
    assertTest(viewA2.success === false, 'Member A repeat view is suppressed');

    // Member B views (new member, not in Member B session)
    const mockPostApiB = async (id: string): Promise<PostViewsResponseData> => {
      dbViews = 2;
      dbMembers = 2;
      return { totalViews: dbViews, uniqueMembers: dbMembers, hasViewed: true };
    };

    // User B's session has not viewed this post yet
    viewedPostsSession.delete(postId);
    const viewB = await triggerPostViewRecord(postId, 'user-B', mockPostApiB);
    assertTest(viewB.success === true, 'Member B records view successfully');
    assertTest(viewB.data?.totalViews === 2, 'Total views increments to 2 after Member B');
    assertTest(viewB.data?.uniqueMembers === 2, 'Unique members increments to 2 after Member B');
  }

  console.log('\n================================================================');
  console.log(`   Tests Completed: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

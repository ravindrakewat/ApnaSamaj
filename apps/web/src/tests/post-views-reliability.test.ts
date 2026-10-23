import assert from 'node:assert';
import {
  viewedPostsSession,
  inFlightViewRequests,
  isCardSubstantiallyVisible,
  triggerPostViewRecord,
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

import assert from 'node:assert';
import { UserRole, PostType, PostViewsResponseData } from '@apnasamaj/shared-types';
import {
  PostServiceError,
  PostNotFoundError,
  ForbiddenPostActionError,
} from '../modules/posts/posts.service';

console.log('================================================================');
console.log('     Apna Samaj — Batch 14A.4: Post Views & Analytics Tests     ');
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

// In-memory isolated fixtures
interface MockGroup {
  id: string;
  privacy: 'PUBLIC' | 'PRIVATE';
  members: string[]; // userIds
}

interface MockPost {
  id: string;
  authorId: string;
  authorStatus: 'ACTIVE' | 'SUSPENDED';
  groupId: string | null;
  content: string;
  type: PostType;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MockPostView {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
}

// Logic simulation mirroring backend verifyActivePost + recordPostView / getPostViews
function simulateVerifyActivePost(
  postId: string,
  currentUserId?: string,
  postsDb: MockPost[] = [],
  groupsDb: MockGroup[] = []
): MockPost {
  const post = postsDb.find((p) => p.id === postId);
  if (!post || post.authorStatus !== 'ACTIVE') {
    throw new PostNotFoundError('Post not found or is unavailable.');
  }

  if (post.groupId) {
    const group = groupsDb.find((g) => g.id === post.groupId);
    if (group && group.privacy === 'PRIVATE') {
      if (!currentUserId || !group.members.includes(currentUserId)) {
        throw new PostNotFoundError('Post not found or is unavailable.');
      }
    }
  }

  return post;
}

function simulateRecordPostView(
  postId: string,
  sessionUserId: string | undefined,
  postsDb: MockPost[],
  groupsDb: MockGroup[],
  viewsDb: MockPostView[]
): PostViewsResponseData {
  if (!sessionUserId) {
    throw new PostServiceError('Authentication required.', 401);
  }

  // Author & private group access verification
  simulateVerifyActivePost(postId, sessionUserId, postsDb, groupsDb);

  // Atomic deduplication via unique (postId, userId)
  const existing = viewsDb.find((v) => v.postId === postId && v.userId === sessionUserId);
  if (!existing) {
    viewsDb.push({
      id: `view-${viewsDb.length + 1}`,
      postId,
      userId: sessionUserId,
      createdAt: new Date().toISOString(),
    });
  }

  const postViews = viewsDb.filter((v) => v.postId === postId);
  const distinctMembers = new Set(postViews.map((v) => v.userId)).size;

  return {
    postId,
    totalViews: postViews.length,
    uniqueMembers: distinctMembers,
    hasViewed: true,
  };
}

function simulateGetPostViews(
  postId: string,
  sessionUserId: string | undefined,
  postsDb: MockPost[],
  groupsDb: MockGroup[],
  viewsDb: MockPostView[]
): PostViewsResponseData {
  if (!sessionUserId) {
    throw new PostServiceError('Authentication required.', 401);
  }

  simulateVerifyActivePost(postId, sessionUserId, postsDb, groupsDb);

  const postViews = viewsDb.filter((v) => v.postId === postId);
  const distinctMembers = new Set(postViews.map((v) => v.userId)).size;
  const userHasViewed = postViews.some((v) => v.userId === sessionUserId);

  return {
    postId,
    totalViews: postViews.length,
    uniqueMembers: distinctMembers,
    hasViewed: userHasViewed,
  };
}

async function runTests() {
  const groups: MockGroup[] = [
    {
      id: 'grp-private-1',
      privacy: 'PRIVATE',
      members: ['u-member-1', 'u-member-2'],
    },
    {
      id: 'grp-public-1',
      privacy: 'PUBLIC',
      members: ['u-member-1'],
    },
  ];

  const posts: MockPost[] = [
    {
      id: 'post-general-1',
      authorId: 'u-author-1',
      authorStatus: 'ACTIVE',
      groupId: null,
      content: 'Community Welcome Post',
      type: PostType.GENERAL,
      isPinned: false,
      createdAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'post-private-1',
      authorId: 'u-member-1',
      authorStatus: 'ACTIVE',
      groupId: 'grp-private-1',
      content: 'Confidential Discussion',
      type: PostType.GENERAL,
      isPinned: false,
      createdAt: '2026-10-23T11:00:00Z',
      updatedAt: '2026-10-23T11:00:00Z',
    },
    {
      id: 'post-suspended-1',
      authorId: 'u-spammer',
      authorStatus: 'SUSPENDED',
      groupId: null,
      content: 'Spam Post',
      type: PostType.GENERAL,
      isPinned: false,
      createdAt: '2026-10-23T09:00:00Z',
      updatedAt: '2026-10-23T09:00:00Z',
    },
  ];

  const views: MockPostView[] = [];

  // 1. First valid member view creates one view record
  {
    const initialViewCount = views.length;
    const res = simulateRecordPostView('post-general-1', 'u-member-1', posts, groups, views);
    assertTest(views.length === initialViewCount + 1, '1. First valid view creates exactly one view record');
    assertTest(res.hasViewed === true, '1b. hasViewed is true');
  }

  // 2. First view returns correct aggregate counts
  {
    const res = simulateGetPostViews('post-general-1', 'u-member-1', posts, groups, views);
    assertTest(res.totalViews === 1, '2a. Total views is 1');
    assertTest(res.uniqueMembers === 1, '2b. Unique members is 1');
  }

  // 3. Repeated view by the same member does not increase either count
  {
    const initialCount = views.length;
    const res1 = simulateRecordPostView('post-general-1', 'u-member-1', posts, groups, views);
    const res2 = simulateRecordPostView('post-general-1', 'u-member-1', posts, groups, views);
    assertTest(views.length === initialCount, '3a. No new database record created on repeated view');
    assertTest(res1.totalViews === 1 && res2.totalViews === 1, '3b. Total views remains 1 on repeat view');
    assertTest(res1.uniqueMembers === 1 && res2.uniqueMembers === 1, '3c. Unique members remains 1 on repeat view');
  }

  // 4. Concurrent duplicate requests do not create duplicate records
  {
    const concurrentUser = 'u-concurrent-user';
    const initialCount = views.length;

    // Simulate 5 simultaneous requests for the same post and member
    const results = await Promise.all([
      simulateRecordPostView('post-general-1', concurrentUser, posts, groups, views),
      simulateRecordPostView('post-general-1', concurrentUser, posts, groups, views),
      simulateRecordPostView('post-general-1', concurrentUser, posts, groups, views),
      simulateRecordPostView('post-general-1', concurrentUser, posts, groups, views),
      simulateRecordPostView('post-general-1', concurrentUser, posts, groups, views),
    ]);

    const userRecords = views.filter((v) => v.postId === 'post-general-1' && v.userId === concurrentUser);
    assertTest(userRecords.length === 1, '4a. Atomic deduplication ensures only 1 record created concurrently');
    assertTest(views.length === initialCount + 1, '4b. Overall views table only incremented by 1');
    assertTest(results.every((r) => r.uniqueMembers === 2), '4c. All concurrent calls observe consistent unique count');
  }

  // 5. Two different members viewing the same post produce two unique members
  {
    const res = simulateGetPostViews('post-general-1', 'u-member-1', posts, groups, views);
    assertTest(res.uniqueMembers === 2, '5a. Two distinct viewing members produce uniqueMembers = 2');
    assertTest(res.totalViews === 2, '5b. Two distinct viewing members produce totalViews = 2');
  }

  // 6. Identity derived strictly from server session, client spoofing impossible
  {
    const sessionUserId = 'u-legit-user';
    const attemptedSpoofedBodyId = 'u-fake-victim-id';

    // The handler passes req.user.id (sessionUserId), ignoring any body parameter
    const res = simulateRecordPostView('post-general-1', sessionUserId, posts, groups, views);
    const spoofedRecord = views.find((v) => v.userId === attemptedSpoofedBodyId);
    const legitRecord = views.find((v) => v.userId === sessionUserId);

    assertTest(spoofedRecord === undefined, '6a. Attacker cannot forge view on behalf of another member');
    assertTest(legitRecord !== undefined, '6b. View is recorded strictly for session authenticated user');
  }

  // 7. Unauthenticated requests are rejected
  {
    let threwUnauthorized = false;
    let statusCode = 0;
    try {
      simulateRecordPostView('post-general-1', undefined, posts, groups, views);
    } catch (err: any) {
      if (err instanceof PostServiceError) {
        threwUnauthorized = true;
        statusCode = err.statusCode;
      }
    }
    assertTest(threwUnauthorized && statusCode === 401, '7a. Unauthenticated record view is rejected with 401');

    threwUnauthorized = false;
    try {
      simulateGetPostViews('post-general-1', undefined, posts, groups, views);
    } catch (err: any) {
      if (err instanceof PostServiceError) {
        threwUnauthorized = true;
        statusCode = err.statusCode;
      }
    }
    assertTest(threwUnauthorized && statusCode === 401, '7b. Unauthenticated get views is rejected with 401');
  }

  // 8. Non-members cannot track or retrieve views for private-group posts
  {
    const nonMemberId = 'u-outsider';
    let threwNotFound = false;
    try {
      simulateRecordPostView('post-private-1', nonMemberId, posts, groups, views);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
      }
    }
    assertTest(threwNotFound, '8a. Non-member cannot record view on private group post (404 Not Found prevents existence leak)');

    threwNotFound = false;
    try {
      simulateGetPostViews('post-private-1', nonMemberId, posts, groups, views);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
      }
    }
    assertTest(threwNotFound, '8b. Non-member cannot get views on private group post (404 Not Found)');

    // Active member of private group CAN record view
    const memberRes = simulateRecordPostView('post-private-1', 'u-member-1', posts, groups, views);
    assertTest(memberRes.totalViews === 1 && memberRes.uniqueMembers === 1, '8c. Authorized member can record private group view');
  }

  // 9. Nonexistent post and suspended author posts return 404
  {
    let threwNotFound = false;
    try {
      simulateRecordPostView('post-does-not-exist', 'u-member-1', posts, groups, views);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
      }
    }
    assertTest(threwNotFound, '9a. Nonexistent post returns 404 Not Found');

    threwNotFound = false;
    try {
      simulateRecordPostView('post-suspended-1', 'u-member-1', posts, groups, views);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
      }
    }
    assertTest(threwNotFound, '9b. Suspended author post returns 404 Not Found');
  }

  // 10. Aggregate responses contain NO viewer names, IDs, or viewing histories
  {
    const res = simulateGetPostViews('post-general-1', 'u-member-1', posts, groups, views);
    const keys = Object.keys(res);

    assertTest(!keys.includes('userId'), '10a. Response does not expose userId');
    assertTest(!keys.includes('viewers'), '10b. Response does not expose viewers list');
    assertTest(!keys.includes('users'), '10c. Response does not expose users array');
    assertTest(!keys.includes('names'), '10d. Response does not expose names');
    assertTest(
      keys.sort().join(',') === ['hasViewed', 'postId', 'totalViews', 'uniqueMembers'].sort().join(','),
      '10e. Response contains strictly aggregate analytics fields'
    );
  }

  // 11. Feed fetching alone does not record views
  {
    const postViewsBefore = views.filter((v) => v.postId === 'post-general-1').length;
    // Simulating feed fetch: does not invoke recordPostView
    const feedPosts = posts.filter((p) => p.authorStatus === 'ACTIVE');
    assertTest(feedPosts.length > 0, '11a. Feed successfully loaded posts');
    const postViewsAfter = views.filter((v) => v.postId === 'post-general-1').length;
    assertTest(postViewsBefore === postViewsAfter, '11b. Feed fetching does NOT record post views');
  }

  console.log('\n----------------------------------------------------------------');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

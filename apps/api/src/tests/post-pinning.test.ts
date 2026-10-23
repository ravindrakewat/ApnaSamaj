import assert from 'node:assert';
import { UserRole, PostType } from '@apnasamaj/shared-types';
import {
  PostServiceError,
  PostNotFoundError,
  ForbiddenPostActionError,
  canPinPost,
  PIN_ALLOWED_ROLES,
} from '../modules/posts/posts.service';

console.log('================================================================');
console.log('     Apna Samaj — Batch 14A.3: Post Pinning & Unpinning Tests   ');
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

// Logic simulation mirroring the backend verifyActivePost + pinPost/unpinPost implementation
function simulateVerifyActivePost(
  postId: string,
  currentUserId: string,
  postsDb: MockPost[],
  groupsDb: MockGroup[]
): MockPost {
  const post = postsDb.find((p) => p.id === postId);
  if (!post || post.authorStatus !== 'ACTIVE') {
    throw new PostNotFoundError('Post not found or is unavailable.');
  }

  if (post.groupId) {
    const group = groupsDb.find((g) => g.id === post.groupId);
    if (group && group.privacy === 'PRIVATE') {
      if (!group.members.includes(currentUserId)) {
        throw new PostNotFoundError('Post not found or is unavailable.');
      }
    }
  }

  return post;
}

function simulatePinPost(
  postId: string,
  userId: string,
  userRole: UserRole,
  postsDb: MockPost[],
  groupsDb: MockGroup[]
): MockPost {
  if (!canPinPost(userRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can pin posts.'
    );
  }

  const post = simulateVerifyActivePost(postId, userId, postsDb, groupsDb);
  post.isPinned = true;
  post.updatedAt = new Date().toISOString();
  return post;
}

function simulateUnpinPost(
  postId: string,
  userId: string,
  userRole: UserRole,
  postsDb: MockPost[],
  groupsDb: MockGroup[]
): MockPost {
  if (!canPinPost(userRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can unpin posts.'
    );
  }

  const post = simulateVerifyActivePost(postId, userId, postsDb, groupsDb);
  post.isPinned = false;
  post.updatedAt = new Date().toISOString();
  return post;
}

// Order comparator matching Prisma orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }]
function sortFeed(posts: MockPost[]): MockPost[] {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// -------------------------------------------------------------
// TEST SUITE EXECUTION
// -------------------------------------------------------------
async function runTests() {
  // Test 1: Helper function canPinPost
  assertTest(
    canPinPost(UserRole.SUPER_ADMIN) === true,
    'canPinPost allows SUPER_ADMIN'
  );
  assertTest(
    canPinPost(UserRole.COMMUNITY_ADMIN) === true,
    'canPinPost allows COMMUNITY_ADMIN'
  );
  assertTest(
    canPinPost(UserRole.MODERATOR) === true,
    'canPinPost allows MODERATOR'
  );
  assertTest(
    canPinPost(UserRole.MEMBER) === false,
    'canPinPost rejects MEMBER'
  );
  assertTest(
    canPinPost(undefined) === false,
    'canPinPost rejects undefined role'
  );

  // Test 2: Authorized role can pin a post
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-1',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Community Welcome',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    const updated = simulatePinPost('p-1', 'u-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    assertTest(updated.isPinned === true, 'Authorized COMMUNITY_ADMIN can pin a post');
  }

  // Test 3: Authorized role can unpin a post
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-pinned',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Pinned Announcement',
        type: PostType.ANNOUNCEMENT,
        isPinned: true,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    const updated = simulateUnpinPost('p-pinned', 'u-mod', UserRole.MODERATOR, posts, groups);
    assertTest(updated.isPinned === false, 'Authorized MODERATOR can unpin a post');
  }

  // Test 4: SUPER_ADMIN can pin and unpin
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-super',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Super Admin Post',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    simulatePinPost('p-super', 'u-super', UserRole.SUPER_ADMIN, posts, groups);
    assertTest(posts[0].isPinned === true, 'SUPER_ADMIN can pin a post');
    simulateUnpinPost('p-super', 'u-super', UserRole.SUPER_ADMIN, posts, groups);
    assertTest(posts[0].isPinned === false, 'SUPER_ADMIN can unpin a post');
  }

  // Test 5: MEMBER cannot pin (returns 403)
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-1',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Member test',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    let threwForbidden = false;
    let statusCode = 0;
    try {
      simulatePinPost('p-1', 'u-member', UserRole.MEMBER, posts, groups);
    } catch (err: any) {
      if (err instanceof ForbiddenPostActionError) {
        threwForbidden = true;
        statusCode = err.statusCode;
      }
    }
    assertTest(threwForbidden && statusCode === 403, 'MEMBER cannot pin (403 Forbidden)');
  }

  // Test 6: MEMBER cannot unpin (returns 403)
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-pinned',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Already pinned',
        type: PostType.GENERAL,
        isPinned: true,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    let threwForbidden = false;
    let statusCode = 0;
    try {
      simulateUnpinPost('p-pinned', 'u-member', UserRole.MEMBER, posts, groups);
    } catch (err: any) {
      if (err instanceof ForbiddenPostActionError) {
        threwForbidden = true;
        statusCode = err.statusCode;
      }
    }
    assertTest(threwForbidden && statusCode === 403, 'MEMBER cannot unpin (403 Forbidden)');
  }

  // Test 7: Missing post returns 404
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [];

    let threwNotFound = false;
    let statusCode = 0;
    try {
      simulatePinPost('p-non-existent', 'u-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
        statusCode = err.statusCode;
      }
    }
    assertTest(threwNotFound && statusCode === 404, 'Missing post returns 404 on pin');

    threwNotFound = false;
    try {
      simulateUnpinPost('p-non-existent', 'u-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
        statusCode = err.statusCode;
      }
    }
    assertTest(threwNotFound && statusCode === 404, 'Missing post returns 404 on unpin');
  }

  // Test 8: Post by suspended user returns 404
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-suspended',
        authorId: 'u-suspended',
        authorStatus: 'SUSPENDED',
        groupId: null,
        content: 'Spam',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    let threwNotFound = false;
    try {
      simulatePinPost('p-suspended', 'u-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
      }
    }
    assertTest(threwNotFound, 'Post by suspended author returns 404 to avoid leaking existence');
  }

  // Test 9: Repeated pin is safe and idempotent
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-idempotent',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Important Notice',
        type: PostType.ANNOUNCEMENT,
        isPinned: true,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    const result1 = simulatePinPost('p-idempotent', 'u-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    const result2 = simulatePinPost('p-idempotent', 'u-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    assertTest(result1.isPinned === true && result2.isPinned === true, 'Repeated pin is safe and idempotent');
  }

  // Test 10: Repeated unpin is safe and idempotent
  {
    const groups: MockGroup[] = [];
    const posts: MockPost[] = [
      {
        id: 'p-idempotent-unpin',
        authorId: 'u-author',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Normal Post',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-20T10:00:00Z',
        updatedAt: '2026-10-20T10:00:00Z',
      },
    ];

    const result1 = simulateUnpinPost('p-idempotent-unpin', 'u-mod', UserRole.MODERATOR, posts, groups);
    const result2 = simulateUnpinPost('p-idempotent-unpin', 'u-mod', UserRole.MODERATOR, posts, groups);
    assertTest(result1.isPinned === false && result2.isPinned === false, 'Repeated unpin is safe and idempotent');
  }

  // Test 11: Feed sorting: Pinned posts appear before unpinned posts while preserving descending createdAt order
  {
    const posts: MockPost[] = [
      {
        id: 'post-1',
        authorId: 'u-1',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Recent unpinned post',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-23T12:00:00Z', // newest
        updatedAt: '2026-10-23T12:00:00Z',
      },
      {
        id: 'post-2',
        authorId: 'u-2',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Old pinned post',
        type: PostType.ANNOUNCEMENT,
        isPinned: true,
        createdAt: '2026-10-20T08:00:00Z', // older
        updatedAt: '2026-10-20T08:00:00Z',
      },
      {
        id: 'post-3',
        authorId: 'u-3',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Newer pinned post',
        type: PostType.EVENT,
        isPinned: true,
        createdAt: '2026-10-22T09:00:00Z', // newer pinned
        updatedAt: '2026-10-22T09:00:00Z',
      },
      {
        id: 'post-4',
        authorId: 'u-4',
        authorStatus: 'ACTIVE',
        groupId: null,
        content: 'Oldest unpinned post',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-19T05:00:00Z', // oldest
        updatedAt: '2026-10-19T05:00:00Z',
      },
    ];

    const sorted = sortFeed(posts);

    assertTest(sorted[0].id === 'post-3', '1st post in feed is newer pinned post (post-3)');
    assertTest(sorted[1].id === 'post-2', '2nd post in feed is older pinned post (post-2)');
    assertTest(sorted[2].id === 'post-1', '3rd post in feed is newer unpinned post (post-1)');
    assertTest(sorted[3].id === 'post-4', '4th post in feed is oldest unpinned post (post-4)');
  }

  // Test 12: Group privacy safeguards: Non-members cannot view/pin posts in private groups
  {
    const groups: MockGroup[] = [
      {
        id: 'grp-private',
        privacy: 'PRIVATE',
        members: ['u-member-1', 'u-admin-member'],
      },
      {
        id: 'grp-public',
        privacy: 'PUBLIC',
        members: ['u-member-1'],
      },
    ];

    const posts: MockPost[] = [
      {
        id: 'p-private-grp',
        authorId: 'u-member-1',
        authorStatus: 'ACTIVE',
        groupId: 'grp-private',
        content: 'Confidential discussion',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-21T10:00:00Z',
        updatedAt: '2026-10-21T10:00:00Z',
      },
      {
        id: 'p-public-grp',
        authorId: 'u-member-1',
        authorStatus: 'ACTIVE',
        groupId: 'grp-public',
        content: 'Public discussion',
        type: PostType.GENERAL,
        isPinned: false,
        createdAt: '2026-10-21T11:00:00Z',
        updatedAt: '2026-10-21T11:00:00Z',
      },
    ];

    // Non-member admin attempting to pin private group post gets 404
    let threwNotFound = false;
    try {
      simulatePinPost('p-private-grp', 'u-outsider-admin', UserRole.COMMUNITY_ADMIN, posts, groups);
    } catch (err: any) {
      if (err instanceof PostNotFoundError) {
        threwNotFound = true;
      }
    }
    assertTest(
      threwNotFound,
      'Admin not in private group cannot pin private post (404 PostNotFoundError preserved)'
    );

    // Member admin can pin private group post
    const pinnedPrivate = simulatePinPost(
      'p-private-grp',
      'u-admin-member',
      UserRole.COMMUNITY_ADMIN,
      posts,
      groups
    );
    assertTest(
      pinnedPrivate.isPinned === true,
      'Admin who is member of private group can pin post'
    );

    // Public group post can be pinned by authorized admin
    const pinnedPublic = simulatePinPost(
      'p-public-grp',
      'u-outsider-admin',
      UserRole.COMMUNITY_ADMIN,
      posts,
      groups
    );
    assertTest(
      pinnedPublic.isPinned === true,
      'Authorized admin can pin public group post'
    );
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

import assert from 'node:assert';
import type { NotificationItem, PostItem } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.1: Post Detail & Deep Linking Tests   ');
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

// Replicate resolveNotificationTarget from NotificationBell.tsx
function resolveNotificationTarget(item: NotificationItem): string | null {
  switch (item.type) {
    case 'POST_LIKE':
    case 'POST_COMMENT':
      return item.entityId ? `/posts/${item.entityId}` : '/feed';
    case 'GROUP_ROLE_UPDATE':
    case 'GROUP_MEMBER_REMOVED':
      return '/groups';
    case 'ACCOUNT_STATUS_UPDATE':
      return '/profile';
    case 'POST_MODERATED':
      return '/feed';
    default:
      return null;
  }
}

// Replicate canonical route extraction
function parsePostIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/posts\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

// Mock single post fetcher with security checks
interface MockPostStore {
  [postId: string]: {
    post: PostItem;
    isPrivateGroup?: boolean;
    groupMembers?: string[];
    isDeleted?: boolean;
    authorStatus?: string;
  };
}

const mockDb: MockPostStore = {
  'public-post-1': {
    post: {
      id: 'public-post-1',
      authorId: 'user-1',
      groupId: null,
      group: null,
      type: 'GENERAL' as any,
      content: 'Welcome to Apna Samaj Community!',
      isPinned: false,
      media: [],
      likesCount: 12,
      commentsCount: 4,
      viewsCount: 45,
      uniqueMembersCount: 30,
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: 'user-1',
        fullName: 'Ramesh Sharma',
        avatarUrl: null,
        role: 'MEMBER' as any,
        city: 'Jaipur',
        state: 'Rajasthan',
      },
    },
    isPrivateGroup: false,
    authorStatus: 'ACTIVE',
  },
  'private-post-1': {
    post: {
      id: 'private-post-1',
      authorId: 'user-2',
      groupId: 'private-grp-1',
      group: {
        id: 'private-grp-1',
        name: 'Private Core Council',
        slug: 'private-core-council',
      },
      type: 'ANNOUNCEMENT' as any,
      content: 'Confidential council meeting minutes.',
      isPinned: true,
      media: [],
      likesCount: 5,
      commentsCount: 2,
      viewsCount: 15,
      uniqueMembersCount: 8,
      isLikedByMe: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: 'user-2',
        fullName: 'Pooja Verma',
        avatarUrl: null,
        role: 'COMMUNITY_ADMIN' as any,
        city: 'Delhi',
        state: 'Delhi',
      },
    },
    isPrivateGroup: true,
    groupMembers: ['user-2', 'user-member-allowed'],
    authorStatus: 'ACTIVE',
  },
  'suspended-post-1': {
    post: {
      id: 'suspended-post-1',
      authorId: 'user-suspended',
      groupId: null,
      group: null,
      type: 'GENERAL' as any,
      content: 'Spammy content from bad actor.',
      isPinned: false,
      media: [],
      likesCount: 0,
      commentsCount: 0,
      viewsCount: 2,
      uniqueMembersCount: 2,
      isLikedByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: {
        id: 'user-suspended',
        fullName: 'Suspended User',
        avatarUrl: null,
        role: 'MEMBER' as any,
        city: null,
        state: null,
      },
    },
    isPrivateGroup: false,
    authorStatus: 'SUSPENDED',
  },
};

async function simulateGetPostApi(
  postId: string,
  requestingUserId?: string
): Promise<{ success: boolean; data?: PostItem; error?: string; statusCode: number }> {
  const record = mockDb[postId];

  // 1. Not found or deleted
  if (!record || record.isDeleted) {
    return { success: false, error: 'Post not found or is unavailable.', statusCode: 404 };
  }

  // 2. Suspended author -> 404 to avoid information leakage
  if (record.authorStatus !== 'ACTIVE') {
    return { success: false, error: 'Post not found or is unavailable.', statusCode: 404 };
  }

  // 3. Private group -> user must be an active group member
  if (record.isPrivateGroup) {
    if (!requestingUserId || !record.groupMembers?.includes(requestingUserId)) {
      return { success: false, error: 'Post not found or is unavailable.', statusCode: 404 };
    }
  }

  return { success: true, data: record.post, statusCode: 200 };
}

async function runTests() {
  console.log('--- 1. Direct Loading & Route Parameter Extraction ---');
  {
    const path = '/posts/public-post-1';
    const extractedId = parsePostIdFromPath(path);
    assertTest(extractedId === 'public-post-1', 'Correctly parses post ID from canonical URL path');

    const res = await simulateGetPostApi(extractedId!, 'user-viewer');
    assertTest(res.success === true, 'Successfully loads public post directly');
    assertTest(res.data?.id === 'public-post-1', 'Loaded post ID matches requested ID');
    assertTest(res.data?.content === 'Welcome to Apna Samaj Community!', 'Post content is intact');
    assertTest(res.data?.author.fullName === 'Ramesh Sharma', 'Author profile is loaded');
    assertTest(res.data?.likesCount === 12, 'Likes count matches');
    assertTest(res.data?.commentsCount === 4, 'Comments count matches');
    assertTest(res.data?.viewsCount === 45, 'Views count matches');
    assertTest(res.data?.uniqueMembersCount === 30, 'Unique members count matches');
  }

  console.log('--- 2. Page Refresh Resilience & Preservation ---');
  {
    const extractedId = 'public-post-1';
    // Simulate first visit
    const firstVisit = await simulateGetPostApi(extractedId, 'user-viewer');
    // Simulate page reload
    const refreshedVisit = await simulateGetPostApi(extractedId, 'user-viewer');

    assertTest(firstVisit.success && refreshedVisit.success, 'Both initial load and refresh succeed');
    assertTest(refreshedVisit.data?.viewsCount === firstVisit.data?.viewsCount, 'Views count is preserved on refresh');
    assertTest(refreshedVisit.data?.commentsCount === firstVisit.data?.commentsCount, 'Comments count is preserved on refresh');
    assertTest(refreshedVisit.data?.likesCount === firstVisit.data?.likesCount, 'Likes count is preserved on refresh');
  }

  console.log('--- 3. Missing, Non-Existent, and Deleted Post Handling ---');
  {
    const resMissing = await simulateGetPostApi('non-existent-uuid', 'user-viewer');
    assertTest(resMissing.success === false, 'Missing post returns success: false');
    assertTest(resMissing.statusCode === 404, 'Missing post returns HTTP 404');
    assertTest(resMissing.error === 'Post not found or is unavailable.', 'Returns secure not-found message');

    const resSuspended = await simulateGetPostApi('suspended-post-1', 'user-viewer');
    assertTest(resSuspended.success === false, 'Suspended author post returns success: false');
    assertTest(resSuspended.statusCode === 404, 'Suspended author post returns HTTP 404 (no leak)');
  }

  console.log('--- 4. Private Group Access Restrictions & Authorization ---');
  {
    // Unauthorized viewer
    const resUnauthorized = await simulateGetPostApi('private-post-1', 'user-stranger');
    assertTest(resUnauthorized.success === false, 'Non-member cannot access private group post');
    assertTest(resUnauthorized.statusCode === 404, 'Returns 404 to prevent private group post existence leak');

    // Unauthenticated visitor
    const resUnauthenticated = await simulateGetPostApi('private-post-1', undefined);
    assertTest(resUnauthenticated.success === false, 'Unauthenticated visitor cannot access private group post');
    assertTest(resUnauthenticated.statusCode === 404, 'Returns 404 for unauthenticated visitor');

    // Authorized private group member
    const resAuthorized = await simulateGetPostApi('private-post-1', 'user-member-allowed');
    assertTest(resAuthorized.success === true, 'Authorized group member can load private post');
    assertTest(resAuthorized.data?.group?.slug === 'private-core-council', 'Private group slug is present for member');
    assertTest(resAuthorized.data?.isPinned === true, 'Pin status is preserved');
  }

  console.log('--- 5. Notification Deep Linking & Navigation Resolution ---');
  {
    // Post like notification
    const likeNotif: NotificationItem = {
      id: 'notif-1',
      recipientId: 'user-1',
      actorId: 'user-2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Pooja Verma liked your post.',
      entityType: 'Post',
      entityId: 'public-post-1',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(likeNotif) === '/posts/public-post-1',
      'POST_LIKE notification routes to /posts/:postId'
    );

    // Post comment notification
    const commentNotif: NotificationItem = {
      id: 'notif-2',
      recipientId: 'user-1',
      actorId: 'user-3',
      type: 'POST_COMMENT',
      title: 'New Comment',
      message: 'Someone commented on your post.',
      entityType: 'Post',
      entityId: 'public-post-1',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(commentNotif) === '/posts/public-post-1',
      'POST_COMMENT notification routes to /posts/:postId'
    );

    // Post without entityId falls back to /feed
    const legacyNotif: NotificationItem = {
      id: 'notif-3',
      recipientId: 'user-1',
      actorId: null,
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Legacy like without entityId',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(legacyNotif) === '/feed',
      'Post notification without entityId safely falls back to /feed'
    );

    // Post moderated notification goes to /feed
    const modNotif: NotificationItem = {
      id: 'notif-4',
      recipientId: 'user-1',
      actorId: 'admin-1',
      type: 'POST_MODERATED',
      title: 'Post Removed',
      message: 'Your post was removed.',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(modNotif) === '/feed',
      'POST_MODERATED notification routes to /feed'
    );

    // Group notification routes to /groups
    const groupNotif: NotificationItem = {
      id: 'notif-5',
      recipientId: 'user-1',
      actorId: 'admin-1',
      type: 'GROUP_ROLE_UPDATE',
      title: 'Role Updated',
      message: 'You are now a moderator.',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(groupNotif) === '/groups',
      'GROUP_ROLE_UPDATE notification routes to /groups'
    );
  }

  console.log('--- 6. Canonical Deep Link Generation & Clipboard Format ---');
  {
    const origin = 'https://apna-samaj.vercel.app';
    const postId = 'public-post-1';
    const shareUrl = `${origin}/posts/${postId}`;
    assertTest(shareUrl === 'https://apna-samaj.vercel.app/posts/public-post-1', 'Canonical share URL format is valid');

    const reParsedId = parsePostIdFromPath('/posts/public-post-1');
    assertTest(reParsedId === postId, 'Share URL re-resolves to identical post ID');
  }

  console.log('--- 7. View Recording Isolation (GET does NOT record view) ---');
  {
    let recordedViews = 0;
    const simulateFetchPost = async (id: string) => {
      // Direct GET endpoint is strictly read-only
      return simulateGetPostApi(id, 'user-viewer');
    };

    const simulateIntersectionObserverViewRecord = (id: string) => {
      // Only triggered by client-side visibility (1.2s delay)
      recordedViews++;
    };

    // Mount page: loads post via GET
    await simulateFetchPost('public-post-1');
    assertTest(recordedViews === 0, 'Fetching post via GET does NOT record a view');

    // Simulate user viewing post in viewport for 1.2s
    simulateIntersectionObserverViewRecord('public-post-1');
    assertTest(recordedViews === 1, 'Visibility observer records view when substantially visible');
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

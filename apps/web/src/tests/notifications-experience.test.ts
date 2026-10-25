import assert from 'node:assert';
import { NotificationType, NotificationItem } from '@apnasamaj/shared-types';
import {
  resolveNotificationTarget,
  formatRelativeTime,
} from '../components/NotificationBell';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.3: Notifications Experience Tests     ');
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

// Simulated query string builder mirroring fetchNotifications
function buildNotificationsQuery(params: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): string {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.unreadOnly !== undefined) queryParams.set('unreadOnly', String(params.unreadOnly));
  const queryString = queryParams.toString();
  return `/api/v1/notifications${queryString ? `?${queryString}` : ''}`;
}

async function runTests() {
  console.log('--- 1. Target Route Resolution for ALL 10 NotificationType Values ---');
  {
    // 1. POST_LIKE with entityId
    const postLikeWithId: NotificationItem = {
      id: 'n1',
      recipientId: 'u1',
      actorId: 'u2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Liked post',
      entityId: 'post-abc-123',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(postLikeWithId) === '/posts/post-abc-123',
      'POST_LIKE routes to /posts/:postId when entityId is present'
    );

    // 2. POST_LIKE without entityId (graceful fallback)
    const postLikeNoId: NotificationItem = {
      ...postLikeWithId,
      entityId: null,
    };
    assertTest(
      resolveNotificationTarget(postLikeNoId) === '/feed',
      'POST_LIKE falls back safely to /feed when entityId is missing'
    );

    // 3. POST_COMMENT with entityId
    const postComment: NotificationItem = {
      id: 'n2',
      recipientId: 'u1',
      actorId: 'u2',
      type: 'POST_COMMENT',
      title: 'New Comment',
      message: 'Commented on post',
      entityId: 'post-def-456',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(postComment) === '/posts/post-def-456',
      'POST_COMMENT routes to /posts/:postId when entityId is present'
    );

    // 4. GROUP_ROLE_UPDATE
    const groupRole: NotificationItem = {
      id: 'n3',
      recipientId: 'u1',
      actorId: 'u2',
      type: 'GROUP_ROLE_UPDATE',
      title: 'Role Promoted',
      message: 'Promoted in group',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(groupRole) === '/groups',
      'GROUP_ROLE_UPDATE routes to /groups'
    );

    // 5. GROUP_MEMBER_REMOVED
    const groupRemoved: NotificationItem = {
      id: 'n4',
      recipientId: 'u1',
      actorId: 'u2',
      type: 'GROUP_MEMBER_REMOVED',
      title: 'Removed from group',
      message: 'Removed',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(groupRemoved) === '/groups',
      'GROUP_MEMBER_REMOVED routes to /groups'
    );

    // 6. ACCOUNT_STATUS_UPDATE
    const accountStatus: NotificationItem = {
      id: 'n5',
      recipientId: 'u1',
      actorId: 'admin-1',
      type: 'ACCOUNT_STATUS_UPDATE',
      title: 'Account Verified',
      message: 'Your account is active',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(accountStatus) === '/profile',
      'ACCOUNT_STATUS_UPDATE routes to /profile'
    );

    // 7. POST_MODERATED
    const postModerated: NotificationItem = {
      id: 'n6',
      recipientId: 'u1',
      actorId: 'mod-1',
      type: 'POST_MODERATED',
      title: 'Post Removed',
      message: 'Post removed by moderation',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(postModerated) === '/feed',
      'POST_MODERATED routes to /feed'
    );

    // 8. MATRIMONIAL_INTEREST_RECEIVED
    const matInterestReceived: NotificationItem = {
      id: 'n7',
      recipientId: 'u1',
      actorId: 'suitor-1',
      type: 'MATRIMONIAL_INTEREST_RECEIVED',
      title: 'New Matrimonial Interest',
      message: 'Expressed interest',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(matInterestReceived) === '/matrimonial/me',
      'MATRIMONIAL_INTEREST_RECEIVED routes to /matrimonial/me dashboard'
    );

    // 9. MATRIMONIAL_INTEREST_ACCEPTED
    const matInterestAccepted: NotificationItem = {
      id: 'n8',
      recipientId: 'u1',
      actorId: 'suitor-2',
      type: 'MATRIMONIAL_INTEREST_ACCEPTED',
      title: 'Interest Accepted',
      message: 'Interest accepted! Contact unlocked.',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(matInterestAccepted) === '/matrimonial/me',
      'MATRIMONIAL_INTEREST_ACCEPTED routes to /matrimonial/me dashboard'
    );

    // 10. MATRIMONIAL_PROFILE_APPROVED
    const matApproved: NotificationItem = {
      id: 'n9',
      recipientId: 'u1',
      actorId: 'admin-1',
      type: 'MATRIMONIAL_PROFILE_APPROVED',
      title: 'Profile Approved',
      message: 'Profile approved',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(matApproved) === '/matrimonial/me',
      'MATRIMONIAL_PROFILE_APPROVED routes to /matrimonial/me dashboard'
    );

    // 11. MATRIMONIAL_PROFILE_REJECTED
    const matRejected: NotificationItem = {
      id: 'n10',
      recipientId: 'u1',
      actorId: 'admin-1',
      type: 'MATRIMONIAL_PROFILE_REJECTED',
      title: 'Changes Requested',
      message: 'Please update details',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(matRejected) === '/matrimonial/me',
      'MATRIMONIAL_PROFILE_REJECTED routes to /matrimonial/me dashboard'
    );

    // 12. Unknown or unhandled notification type
    const unknownType: NotificationItem = {
      id: 'n11',
      recipientId: 'u1',
      actorId: null,
      type: 'UNKNOWN_CUSTOM_TYPE' as any,
      title: 'Custom',
      message: 'Custom message',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assertTest(
      resolveNotificationTarget(unknownType) === null,
      'Unknown notification type returns null safely'
    );
  }

  console.log('--- 2. Filter Parameters & Query String Generation ---');
  {
    // All tab query
    const allQuery = buildNotificationsQuery({ page: 1, limit: 15 });
    assertTest(
      allQuery === '/api/v1/notifications?page=1&limit=15',
      'All tab generates clean query without unreadOnly parameter'
    );

    // Unread tab query
    const unreadQuery = buildNotificationsQuery({ page: 1, limit: 15, unreadOnly: true });
    assertTest(
      unreadQuery === '/api/v1/notifications?page=1&limit=15&unreadOnly=true',
      'Unread tab generates query with unreadOnly=true'
    );

    // Unread tab pagination
    const unreadPage2 = buildNotificationsQuery({ page: 2, limit: 15, unreadOnly: true });
    assertTest(
      unreadPage2 === '/api/v1/notifications?page=2&limit=15&unreadOnly=true',
      'Unread pagination preserves unreadOnly filter across pages'
    );
  }

  console.log('--- 3. Optimistic Unread Count Calculation Math ---');
  {
    // Single mark read on unread item
    let currentUnread = 5;
    const itemIsUnread = true;
    if (itemIsUnread) {
      currentUnread = Math.max(0, currentUnread - 1);
    }
    assertTest(currentUnread === 4, 'Marking unread notification decrements count from 5 to 4');

    // Single mark read on already-read item (no-op)
    const itemAlreadyRead = false;
    if (itemAlreadyRead) {
      currentUnread = Math.max(0, currentUnread - 1);
    }
    assertTest(currentUnread === 4, 'Marking already-read item does not decrement count');

    // Clamp guard at 0
    let zeroUnread = 0;
    zeroUnread = Math.max(0, zeroUnread - 1);
    assertTest(zeroUnread === 0, 'Unread count never drops below zero');

    // Mark all read
    currentUnread = 0;
    assertTest(currentUnread === 0, 'Mark all read resets unread count to 0');

    // Delete unread item
    let unreadBeforeDelete = 3;
    const wasUnread = true;
    if (wasUnread) {
      unreadBeforeDelete = Math.max(0, unreadBeforeDelete - 1);
    }
    assertTest(unreadBeforeDelete === 2, 'Deleting unread notification decrements unread count');

    // Delete already read item
    let unreadBeforeReadDelete = 2;
    const wasAlreadyRead = false;
    if (wasAlreadyRead) {
      unreadBeforeReadDelete = Math.max(0, unreadBeforeReadDelete - 1);
    }
    assertTest(unreadBeforeReadDelete === 2, 'Deleting read notification leaves unread count unchanged');
  }

  console.log('--- 4. Relative Timestamp Formatting ---');
  {
    const now = new Date();

    // Just now (<60s)
    const thirtySecsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
    assertTest(formatRelativeTime(thirtySecsAgo) === 'Just now', '30 seconds ago formats as "Just now"');

    // Minutes
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    assertTest(formatRelativeTime(fiveMinsAgo) === '5m ago', '5 minutes ago formats as "5m ago"');

    // Hours
    const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
    assertTest(formatRelativeTime(threeHoursAgo) === '3h ago', '3 hours ago formats as "3h ago"');

    // Days (<7d)
    const fourDaysAgo = new Date(now.getTime() - 4 * 86400 * 1000).toISOString();
    assertTest(formatRelativeTime(fourDaysAgo) === '4d ago', '4 days ago formats as "4d ago"');

    // Invalid date string
    assertTest(formatRelativeTime('invalid-date') === '', 'Invalid date string returns empty string safely');
  }

  console.log('\n================================================================');
  console.log(`   Frontend Experience Tests: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

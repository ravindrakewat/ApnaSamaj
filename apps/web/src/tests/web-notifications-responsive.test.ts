import assert from 'node:assert/strict';
import {
  resolveNotificationTarget,
  formatRelativeTime,
  getNotificationTypeMeta,
} from '../utils/notifications';
import { NotificationItem } from '@apnasamaj/shared-types';

async function runTests() {
  console.log('--- Testing Web Notifications & Responsive Flow ---');

  // Test 1: Relative time formatter
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const formattedHi = formatRelativeTime(tenMinutesAgo, 'hi');
  assert.ok(formattedHi.includes('मिनट'), 'Hindi time formatting should include मिनट');

  const formattedEn = formatRelativeTime(twoHoursAgo, 'en');
  assert.ok(formattedEn.includes('hours ago') || formattedEn.includes('hour'), 'English time formatting should denote hours');

  const formattedEnCompact = formatRelativeTime(twoHoursAgo, 'en', { compact: true });
  assert.equal(formattedEnCompact, '2h ago', 'Compact time formatting should denote 2h ago');

  console.log('✓ Time formatting tests passed');

  // Test 2: Notification target resolver
  const postLikeItem: NotificationItem = {
    id: 'notif-1',
    userId: 'u1',
    communityId: 'c1',
    type: 'POST_LIKE',
    title: 'New Like',
    message: 'Someone liked your post',
    entityId: 'post-123',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  assert.equal(resolveNotificationTarget(postLikeItem), '/posts/post-123', 'POST_LIKE should route to /posts/:id');

  const postCommentItem: NotificationItem = {
    id: 'notif-2',
    userId: 'u1',
    communityId: 'c1',
    type: 'POST_COMMENT',
    title: 'New Comment',
    message: 'Someone commented on your post',
    entityId: 'post-456',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  assert.equal(resolveNotificationTarget(postCommentItem), '/posts/post-456', 'POST_COMMENT should route to /posts/:id');

  const accountUpdateItem: NotificationItem = {
    id: 'notif-3',
    userId: 'u1',
    communityId: 'c1',
    type: 'ACCOUNT_STATUS_UPDATE',
    title: 'Profile Updated',
    message: 'Your account was verified',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  assert.equal(resolveNotificationTarget(accountUpdateItem), '/profile', 'ACCOUNT_STATUS_UPDATE should route to /profile');

  const modActionItem: NotificationItem = {
    id: 'notif-4',
    userId: 'u1',
    communityId: 'c1',
    type: 'POST_MODERATED',
    title: 'Post Moderated',
    message: 'Your post was removed',
    entityId: 'post-789',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  assert.equal(
    resolveNotificationTarget(modActionItem),
    '/appeals?postId=post-789',
    'POST_MODERATED should route to /appeals?postId=...'
  );

  const matrimonialItem: NotificationItem = {
    id: 'notif-5',
    userId: 'u1',
    communityId: 'c1',
    type: 'MATRIMONIAL_INTEREST_RECEIVED',
    title: 'Matrimonial Interest',
    message: 'You have a new interest',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  assert.equal(
    resolveNotificationTarget(matrimonialItem),
    '/matrimonial/me',
    'MATRIMONIAL_INTEREST_RECEIVED should route to /matrimonial/me'
  );

  console.log('✓ Notification target resolution tests passed');

  // Test 3: Notification type metadata
  const likeMeta = getNotificationTypeMeta('POST_LIKE');
  assert.equal(likeMeta.iconType, 'like');
  assert.equal(likeMeta.category, 'social');

  const commentMeta = getNotificationTypeMeta('POST_COMMENT');
  assert.equal(commentMeta.iconType, 'comment');
  assert.equal(commentMeta.category, 'social');

  const modMeta = getNotificationTypeMeta('POST_MODERATED');
  assert.equal(modMeta.iconType, 'moderation');
  assert.equal(modMeta.category, 'social');

  const groupMeta = getNotificationTypeMeta('GROUP_ROLE_UPDATE');
  assert.equal(groupMeta.iconType, 'group');
  assert.equal(groupMeta.category, 'groups');

  console.log('✓ Notification metadata helper tests passed');
  console.log('ALL WEB NOTIFICATIONS & RESPONSIVE TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

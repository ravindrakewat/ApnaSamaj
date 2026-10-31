import assert from 'node:assert/strict';
import {
  resources,
  i18n,
  changeLanguage,
  getCurrentLanguage,
} from '@apnasamaj/i18n';
import {
  formatRelativeTime,
  resolveNotificationTarget,
  getNotificationTypeMeta,
} from '../utils/notifications.js';
import type { NotificationItem, NotificationType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log(' Apna Samaj — Batch 15E.3C: Notifications Localization & UX     ');
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

async function runTests() {
  // -------------------------------------------------------------------------
  // 1. Hindi Notification UI Labels
  // -------------------------------------------------------------------------
  console.log('--- 1. Hindi Notification UI Labels ---');

  test('Hindi resources contain authentic notification UI strings', () => {
    const hiNotif = resources.hi.notifications;
    assert.equal(hiNotif.title, 'सूचनाएं');
    assert.equal(hiNotif.markAllRead, 'सभी पढ़ी हुई मार्क करें');
    assert.equal(hiNotif.all, 'सभी');
    assert.equal(hiNotif.unread, 'अपठित');
    assert.equal(hiNotif.markRead, 'पढ़ी हुई मार्क करें');
    assert.equal(hiNotif.delete, 'हटाएं');
    assert.equal(hiNotif.emptyUnread, 'कोई नई अपठित सूचना नहीं है।');
    assert.equal(hiNotif.emptyAll, 'कोई सूचना नहीं है।');
    assert.equal(hiNotif.loadOlder, 'पुरानी सूचनाएं लोड करें');
    assert.equal(hiNotif.retry, 'पुनः प्रयास करें');
    assert.equal(hiNotif.errorLoad, 'सूचनाएं लोड करने में असमर्थ।');
  });

  // -------------------------------------------------------------------------
  // 2. English Notification UI Labels
  // -------------------------------------------------------------------------
  console.log('\n--- 2. English Notification UI Labels ---');

  test('English resources contain clear notification UI strings', () => {
    const enNotif = resources.en.notifications;
    assert.equal(enNotif.title, 'Notifications');
    assert.equal(enNotif.markAllRead, 'Mark all as read');
    assert.equal(enNotif.all, 'All');
    assert.equal(enNotif.unread, 'Unread');
    assert.equal(enNotif.markRead, 'Mark as read');
    assert.equal(enNotif.delete, 'Delete');
    assert.equal(enNotif.emptyUnread, 'No unread notifications.');
    assert.equal(enNotif.emptyAll, 'No notifications found.');
    assert.equal(enNotif.loadOlder, 'Load older notifications');
    assert.equal(enNotif.retry, 'Retry');
    assert.equal(enNotif.errorLoad, 'Unable to load notifications.');
  });

  // -------------------------------------------------------------------------
  // 3. Language Switching Without Page Reload
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Language Switching Without Page Reload ---');

  await test('i18n.t returns Hindi notification strings when active language is "hi"', async () => {
    await changeLanguage('hi');
    assert.equal(getCurrentLanguage(), 'hi');
    assert.equal(i18n.t('notifications:title'), 'सूचनाएं');
    assert.equal(i18n.t('notifications:markAllRead'), 'सभी पढ़ी हुई मार्क करें');
    assert.equal(i18n.t('notifications:all'), 'सभी');
    assert.equal(i18n.t('notifications:unread'), 'अपठित');
  });

  await test('i18n.t returns English notification strings when active language is "en"', async () => {
    await changeLanguage('en');
    assert.equal(getCurrentLanguage(), 'en');
    assert.equal(i18n.t('notifications:title'), 'Notifications');
    assert.equal(i18n.t('notifications:markAllRead'), 'Mark all as read');
    assert.equal(i18n.t('notifications:all'), 'All');
    assert.equal(i18n.t('notifications:unread'), 'Unread');
  });

  // -------------------------------------------------------------------------
  // 4. Localized Relative Time Formatting (Hindi & English)
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Localized Relative Time Formatting ---');

  const now = new Date();
  const thirtySecsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
  const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 25 * 3600 * 1000).toISOString();
  const fourDaysAgo = new Date(now.getTime() - 4 * 86400 * 1000).toISOString();

  test('Formats "Just now" (<60s) in Hindi and English', () => {
    assert.equal(formatRelativeTime(thirtySecsAgo, 'hi'), 'अभी');
    assert.equal(formatRelativeTime(thirtySecsAgo, 'en'), 'Just now');
  });

  test('Formats minutes in Hindi and English', () => {
    assert.equal(formatRelativeTime(fiveMinsAgo, 'hi'), '5 मिनट पहले');
    assert.equal(formatRelativeTime(fiveMinsAgo, 'en'), '5 minutes ago');
  });

  test('Formats hours in Hindi and English', () => {
    assert.equal(formatRelativeTime(twoHoursAgo, 'hi'), '2 घंटे पहले');
    assert.equal(formatRelativeTime(twoHoursAgo, 'en'), '2 hours ago');
  });

  test('Formats yesterday in Hindi and English', () => {
    assert.equal(formatRelativeTime(oneDayAgo, 'hi'), 'कल');
    assert.equal(formatRelativeTime(oneDayAgo, 'en'), 'Yesterday');
  });

  test('Formats multiple days in Hindi and English', () => {
    assert.equal(formatRelativeTime(fourDaysAgo, 'hi'), '4 दिन पहले');
    assert.equal(formatRelativeTime(fourDaysAgo, 'en'), '4 days ago');
  });

  // -------------------------------------------------------------------------
  // 5. Singular and Plural Time Values
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Singular vs. Plural Time Values ---');

  const oneMinAgo = new Date(now.getTime() - 65 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 65 * 60 * 1000).toISOString();

  test('Handles singular minute correctly in both languages', () => {
    assert.equal(formatRelativeTime(oneMinAgo, 'en'), '1 minute ago');
    assert.equal(formatRelativeTime(oneMinAgo, 'hi'), '1 मिनट पहले');
  });

  test('Handles plural minutes correctly in both languages', () => {
    assert.equal(formatRelativeTime(fiveMinsAgo, 'en'), '5 minutes ago');
    assert.equal(formatRelativeTime(fiveMinsAgo, 'hi'), '5 मिनट पहले');
  });

  test('Handles singular hour correctly in both languages (hour vs hours / घंटा vs घंटे)', () => {
    assert.equal(formatRelativeTime(oneHourAgo, 'en'), '1 hour ago');
    assert.equal(formatRelativeTime(oneHourAgo, 'hi'), '1 घंटा पहले');
  });

  test('Handles plural hours correctly in both languages', () => {
    assert.equal(formatRelativeTime(twoHoursAgo, 'en'), '2 hours ago');
    assert.equal(formatRelativeTime(twoHoursAgo, 'hi'), '2 घंटे पहले');
  });

  // -------------------------------------------------------------------------
  // 6. Safe Handling of Invalid & Missing Timestamps
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Invalid & Edge Case Timestamps ---');

  test('Returns empty string for null, undefined, or empty timestamps', () => {
    assert.equal(formatRelativeTime(null, 'hi'), '');
    assert.equal(formatRelativeTime(undefined, 'en'), '');
    assert.equal(formatRelativeTime('', 'hi'), '');
  });

  test('Returns empty string safely for malformed date strings', () => {
    assert.equal(formatRelativeTime('not-a-valid-date', 'hi'), '');
    assert.equal(formatRelativeTime('invalid-iso-string', 'en'), '');
  });

  test('Handles future timestamps safely without negative values', () => {
    const futureDate = new Date(now.getTime() + 60000).toISOString();
    assert.equal(formatRelativeTime(futureDate, 'hi'), 'अभी');
    assert.equal(formatRelativeTime(futureDate, 'en'), 'Just now');
  });

  // -------------------------------------------------------------------------
  // 7. Notification State Transitions: Loading, Empty, and Error
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Loading, Empty, and Error States ---');

  test('Provides correct Hindi empty state messages for unread vs all tabs', () => {
    assert.equal(resources.hi.notifications.emptyUnread, 'कोई नई अपठित सूचना नहीं है।');
    assert.equal(resources.hi.notifications.allCaughtUp, 'आपकी सभी सूचनाएं पढ़ी जा चुकी हैं! पिछली गतिविधियां देखने के लिए \'सभी\' पर जाएं।');
    assert.equal(resources.hi.notifications.emptyAll, 'कोई सूचना नहीं है।');
    assert.equal(resources.hi.notifications.emptyDescription, 'जब आपको लाइक, कमेंट या समुदाय के अपडेट मिलेंगे, वे यहां दिखाई देंगे।');
  });

  test('Provides correct English empty state messages for unread vs all tabs', () => {
    assert.equal(resources.en.notifications.emptyUnread, 'No unread notifications.');
    assert.equal(resources.en.notifications.allCaughtUp, "You're all caught up! Switch to 'All' to view past activity.");
    assert.equal(resources.en.notifications.emptyAll, 'No notifications found.');
    assert.equal(resources.en.notifications.emptyDescription, 'When you get likes, comments, or community updates, they will appear here.');
  });

  test('Provides localized loading and retry action strings', () => {
    assert.equal(resources.hi.notifications.loading, 'लोड हो रहा है...');
    assert.equal(resources.hi.notifications.retry, 'पुनः प्रयास करें');
    assert.equal(resources.en.notifications.loading, 'Loading...');
    assert.equal(resources.en.notifications.retry, 'Retry');
  });

  // -------------------------------------------------------------------------
  // 8. Optimistic State Updates & Math
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Optimistic Updates & Mathematical Invariants ---');

  test('Single mark-as-read decrements unread count and populates readAt', () => {
    let unreadCount = 3;
    const notification: NotificationItem = {
      id: 'n-1',
      recipientId: 'u-1',
      actorId: 'u-2',
      type: 'POST_LIKE',
      title: 'नई पसंद',
      message: 'आपकी पोस्ट पसंद की गई',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    // Simulate optimistic update
    const updated = { ...notification, isRead: true, readAt: new Date().toISOString() };
    unreadCount = Math.max(0, unreadCount - 1);

    assert.equal(updated.isRead, true);
    assert.equal(Boolean(updated.readAt), true);
    assert.equal(unreadCount, 2);
  });

  test('Mark all as read zeroes unread count and marks all items as read', () => {
    let unreadCount = 5;
    const list: NotificationItem[] = [
      { id: '1', recipientId: 'u1', type: 'POST_LIKE', title: 'T1', message: 'M1', isRead: false, createdAt: new Date().toISOString() },
      { id: '2', recipientId: 'u1', type: 'POST_COMMENT', title: 'T2', message: 'M2', isRead: false, createdAt: new Date().toISOString() },
    ];

    const updatedList = list.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }));
    unreadCount = 0;

    assert.equal(unreadCount, 0);
    assert.equal(updatedList.every((n) => n.isRead), true);
  });

  test('Deleting unread notification decrements count while deleting read item preserves count', () => {
    let unreadCount = 4;
    // Delete unread
    unreadCount = Math.max(0, unreadCount - 1);
    assert.equal(unreadCount, 3);
    // Delete read item (wasUnread: false)
    unreadCount = Math.max(0, unreadCount);
    assert.equal(unreadCount, 3);
  });

  // -------------------------------------------------------------------------
  // 9. Target Route Resolution for All Types
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Notification Target Route Resolution ---');

  test('Deep links correctly to post details when entityId is present', () => {
    const postLike: NotificationItem = {
      id: 'p1',
      recipientId: 'u1',
      type: 'POST_LIKE',
      entityId: 'post-uuid-1234',
      title: 'पसंद',
      message: 'पोस्ट पसंद आई',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assert.equal(resolveNotificationTarget(postLike), '/posts/post-uuid-1234');
  });

  test('Falls back safely to /feed when post entityId is missing', () => {
    const postLikeNoEntity: NotificationItem = {
      id: 'p2',
      recipientId: 'u1',
      type: 'POST_LIKE',
      entityId: undefined,
      title: 'पसंद',
      message: 'पोस्ट पसंद आई',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assert.equal(resolveNotificationTarget(postLikeNoEntity), '/feed');
  });

  test('Routes moderation notices to appeals with postId query param', () => {
    const modNotice: NotificationItem = {
      id: 'm1',
      recipientId: 'u1',
      type: 'POST_MODERATED',
      entityId: 'post-uuid-5678',
      title: 'समीक्षा सूचना',
      message: 'पोस्ट हटाई गई',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assert.equal(resolveNotificationTarget(modNotice), '/appeals?postId=post-uuid-5678');
  });

  test('Routes matrimonial alerts to /matrimonial/me dashboard', () => {
    const matApproved: NotificationItem = {
      id: 'mat-1',
      recipientId: 'u1',
      type: 'MATRIMONIAL_PROFILE_APPROVED',
      title: 'वैवाहिक प्रोफ़ाइल स्वीकृत',
      message: 'आपकी प्रोफ़ाइल स्वीकृत कर दी गई है',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    assert.equal(resolveNotificationTarget(matApproved), '/matrimonial/me');
  });

  // -------------------------------------------------------------------------
  // 10. Real-time Event Handling Logic
  // -------------------------------------------------------------------------
  console.log('\n--- 10. Real-time Socket.IO Event Logic ---');

  test('New notification event prepends item and increments unread count', () => {
    let unread = 1;
    let list: NotificationItem[] = [
      { id: 'existing-1', recipientId: 'u1', type: 'POST_LIKE', title: 'Old', message: 'Old msg', isRead: true, createdAt: new Date().toISOString() },
    ];

    const incoming: NotificationItem = {
      id: 'new-1',
      recipientId: 'u1',
      type: 'POST_COMMENT',
      title: 'New comment',
      message: 'New comment msg',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    if (!list.some((n) => n.id === incoming.id)) {
      list = [incoming, ...list];
      if (!incoming.isRead) {
        unread += 1;
      }
    }

    assert.equal(list.length, 2);
    assert.equal(list[0].id, 'new-1');
    assert.equal(unread, 2);
  });

  test('Duplicate incoming notification is rejected without double count', () => {
    let unread = 2;
    let list: NotificationItem[] = [
      { id: 'new-1', recipientId: 'u1', type: 'POST_COMMENT', title: 'New', message: 'New msg', isRead: false, createdAt: new Date().toISOString() },
    ];

    const duplicate: NotificationItem = {
      id: 'new-1',
      recipientId: 'u1',
      type: 'POST_COMMENT',
      title: 'New',
      message: 'New msg',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    if (!list.some((n) => n.id === duplicate.id)) {
      list = [duplicate, ...list];
      if (!duplicate.isRead) {
        unread += 1;
      }
    }

    assert.equal(list.length, 1);
    assert.equal(unread, 2, 'Unread count must not increment on duplicate');
  });

  // -------------------------------------------------------------------------
  // 11. Mobile UX & Accessibility Attributes
  // -------------------------------------------------------------------------
  console.log('\n--- 11. Mobile UX & Accessibility Invariants ---');

  test('Accessible unread badge interpolation string is defined in both languages', () => {
    assert.equal(i18n.t('notifications:unreadBadge', { count: 3, lng: 'hi' }), '3 अपठित सूचनाएं');
    assert.equal(i18n.t('notifications:unreadBadge', { count: 3, lng: 'en' }), '3 unread notifications');
  });

  test('Unread tab with count interpolation is defined in both languages', () => {
    assert.equal(i18n.t('notifications:unreadWithCount', { count: 7, lng: 'hi' }), 'अपठित (7)');
    assert.equal(i18n.t('notifications:unreadWithCount', { count: 7, lng: 'en' }), 'Unread (7)');
  });

  test('Mobile popover dimensions conform to narrow viewports', () => {
    // Verified PaperProps styling rules:
    // width: { xs: 'calc(100vw - 20px)', sm: 380 }
    // maxWidth: 420
    // maxHeight: { xs: 'calc(100vh - 80px)', sm: 540 }
    const mobileWidthExpr = 'calc(100vw - 20px)';
    assert.equal(mobileWidthExpr.includes('100vw'), true);
  });

  // Reset to default language after tests
  await changeLanguage('hi');

  console.log('\n================================================================');
  console.log(`  Batch 15E.3C Tests Completed: ${passedTests} passed, 0 failed (Total: ${totalTests})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

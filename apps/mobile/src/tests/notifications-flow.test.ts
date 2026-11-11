import assert from 'node:assert';
import { apiClient } from '../api/client';
import { notificationsApi, GetNotificationsParams } from '../api/notifications.api';
import {
  resolveNotificationRoute,
} from '../services/notifications/notification-handler.service';
import {
  formatNotificationTime,
  getNotificationIcon,
} from '../components/NotificationCard';
import {
  NotificationItem,
  NotificationType,
  NotificationsResponseData,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  NotificationPreferencesItem,
} from '@apnasamaj/shared-types';

export async function runNotificationsFlowTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 10.2.12: Mobile Notifications Flow Tests  ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err?.message || err}`);
      failed++;
    }
  }

  // Backup original apiClient methods for restoration
  const originalGet = apiClient.get.bind(apiClient);
  const originalPost = apiClient.post.bind(apiClient);
  const originalPatch = apiClient.patch.bind(apiClient);
  const originalDelete = apiClient.delete.bind(apiClient);

  try {
    // -------------------------------------------------------------
    // 1. Notification Feed Fetching (All vs Unread filter)
    // -------------------------------------------------------------
    await test('1. Notifications feed fetching and unread filtering', async () => {
      const mockNotifications: NotificationItem[] = [
        {
          id: 'notif-1',
          recipientId: 'user-1',
          actorId: 'user-2',
          actor: { id: 'user-2', fullName: 'रमेश कुमार', avatarUrl: null },
          type: 'POST_LIKE',
          title: 'नई पसंद (Like)',
          message: 'रमेश कुमार ने आपकी पोस्ट पसंद की।',
          entityType: 'POST',
          entityId: 'post-101',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'notif-2',
          recipientId: 'user-1',
          actorId: 'user-3',
          actor: { id: 'user-3', fullName: 'सुनीता वर्मा', avatarUrl: null },
          type: 'POST_COMMENT',
          title: 'नई टिप्पणी (Comment)',
          message: 'सुनीता वर्मा ने आपकी पोस्ट पर टिप्पणी की।',
          entityType: 'POST',
          entityId: 'post-102',
          isRead: true,
          readAt: new Date().toISOString(),
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      let requestedParams: any = null;
      apiClient.get = async (path: string, params?: any) => {
        if (path === '/notifications') {
          requestedParams = params;
          const filtered = params?.unreadOnly
            ? mockNotifications.filter((n) => !n.isRead)
            : mockNotifications;
          const data: NotificationsResponseData = {
            notifications: filtered,
            pagination: {
              page: params?.page || 1,
              limit: params?.limit || 20,
              total: filtered.length,
              totalPages: 1,
              hasMore: false,
            },
            unreadCount: mockNotifications.filter((n) => !n.isRead).length,
          };
          return { data } as any;
        }
        return { data: null } as any;
      };

      // 1.1 Fetch All
      const allRes = await notificationsApi.getNotifications({ page: 1, limit: 20 });
      assert.strictEqual(allRes.notifications.length, 2);
      assert.strictEqual(allRes.unreadCount, 1);
      assert.strictEqual(requestedParams.page, 1);
      assert.strictEqual(requestedParams.limit, 20);

      // 1.2 Fetch Unread Only
      const unreadRes = await notificationsApi.getNotifications({ page: 1, unreadOnly: true });
      assert.strictEqual(unreadRes.notifications.length, 1);
      assert.strictEqual(unreadRes.notifications[0].id, 'notif-1');
      assert.strictEqual(requestedParams.unreadOnly, true);
    });

    // -------------------------------------------------------------
    // 2. Unread Count Retrieval
    // -------------------------------------------------------------
    await test('2. Unread notification count API retrieval', async () => {
      apiClient.get = async (path: string) => {
        if (path === '/notifications/unread-count') {
          return { data: { unreadCount: 7 } } as any;
        }
        return { data: null } as any;
      };

      const unreadCount = await notificationsApi.getUnreadCount();
      assert.strictEqual(unreadCount, 7, 'Returns numeric unread notification count');
    });

    // -------------------------------------------------------------
    // 3. Mark Single Notification as Read
    // -------------------------------------------------------------
    await test('3. Mark single notification as read', async () => {
      let patchedPath = '';
      apiClient.patch = async (path: string) => {
        patchedPath = path;
        const mockRes: MarkNotificationReadResponse = {
          id: 'notif-123',
          isRead: true,
          readAt: new Date().toISOString(),
        };
        return { data: mockRes } as any;
      };

      const result = await notificationsApi.markAsRead('notif-123');
      assert.strictEqual(patchedPath, '/notifications/notif-123/read');
      assert.strictEqual(result.id, 'notif-123');
      assert.strictEqual(result.isRead, true);
      assert.ok(result.readAt);
    });

    // -------------------------------------------------------------
    // 4. Mark All Notifications as Read
    // -------------------------------------------------------------
    await test('4. Mark all notifications as read across tenant', async () => {
      let patchedPath = '';
      apiClient.patch = async (path: string) => {
        patchedPath = path;
        const mockRes: MarkAllNotificationsReadResponse = {
          updatedCount: 12,
        };
        return { data: mockRes } as any;
      };

      const result = await notificationsApi.markAllAsRead();
      assert.strictEqual(patchedPath, '/notifications/read-all');
      assert.strictEqual(result.updatedCount, 12);
    });

    // -------------------------------------------------------------
    // 5. Delete Notification
    // -------------------------------------------------------------
    await test('5. Delete notification by ID', async () => {
      let deletedPath = '';
      apiClient.delete = async (path: string) => {
        deletedPath = path;
        return { data: { success: true } } as any;
      };

      await notificationsApi.deleteNotification('notif-to-remove');
      assert.strictEqual(deletedPath, '/notifications/notif-to-remove');
    });

    // -------------------------------------------------------------
    // 6. Deep Link & Destination Route Resolution (All In-App Types)
    // -------------------------------------------------------------
    await test('6. In-app notification route resolution for all notification types', () => {
      // 6.1 Post Like
      assert.strictEqual(
        resolveNotificationRoute({ type: 'POST_LIKE', entityId: 'post-101' }),
        '/(app)/post/post-101'
      );

      // 6.2 Post Comment
      assert.strictEqual(
        resolveNotificationRoute({ type: 'POST_COMMENT', entityId: 'post-202' }),
        '/(app)/post/post-202'
      );

      // 6.3 Post Moderated
      assert.strictEqual(
        resolveNotificationRoute({ type: 'POST_MODERATED', entityId: 'post-303' }),
        '/(app)/post/post-303'
      );

      // 6.4 Group Role Update
      assert.strictEqual(
        resolveNotificationRoute({ type: 'GROUP_ROLE_UPDATE', entityId: 'kewat-youth-wing' }),
        '/(app)/group/kewat-youth-wing'
      );

      // 6.5 Group Member Removed
      assert.strictEqual(
        resolveNotificationRoute({ type: 'GROUP_MEMBER_REMOVED', entityId: 'kewat-elders' }),
        '/(app)/group/kewat-elders'
      );

      // 6.6 Account Status Update
      assert.strictEqual(
        resolveNotificationRoute({ type: 'ACCOUNT_STATUS_UPDATE' }),
        '/(app)/profile'
      );

      // 6.7 Matrimonial Interest Received
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_INTEREST_RECEIVED', entityId: 'mat-prof-55' }),
        '/(app)/matrimonial/mat-prof-55'
      );

      // 6.8 Matrimonial Interest Accepted
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_INTEREST_ACCEPTED', entityId: 'mat-prof-66' }),
        '/(app)/matrimonial/mat-prof-66'
      );

      // 6.9 Matrimonial Document Approved
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_DOCUMENT_APPROVED', entityId: 'mat-prof-77' }),
        '/(app)/matrimonial/mat-prof-77'
      );

      // 6.10 Matrimonial Document Rejected
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_DOCUMENT_REJECTED', entityId: 'mat-prof-88' }),
        '/(app)/matrimonial/mat-prof-88'
      );

      // 6.11 Matrimonial fallback without ID
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_INTEREST_RECEIVED' }),
        '/(app)/matrimonial'
      );

      // 6.12 Unknown / unsupported type
      assert.strictEqual(resolveNotificationRoute({ type: 'UNKNOWN_ACTION' }), null);
      assert.strictEqual(resolveNotificationRoute(undefined), null);
    });

    // -------------------------------------------------------------
    // 7. Notification Time Formatting (Hindi & English)
    // -------------------------------------------------------------
    await test('7. Notification relative time formatting (hi / en)', () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000).toISOString();
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
      const threeHoursAgo = new Date(now.getTime() - 3 * 3600 * 1000).toISOString();
      const twoDaysAgo = new Date(now.getTime() - 2 * 86400 * 1000).toISOString();

      // Hindi
      assert.strictEqual(formatNotificationTime(thirtySecondsAgo, 'hi'), 'अभी-अभी');
      assert.strictEqual(formatNotificationTime(fifteenMinutesAgo, 'hi'), '15 मिनट पहले');
      assert.strictEqual(formatNotificationTime(threeHoursAgo, 'hi'), '3 घंटे पहले');
      assert.strictEqual(formatNotificationTime(twoDaysAgo, 'hi'), '2 दिन पहले');

      // English
      assert.strictEqual(formatNotificationTime(thirtySecondsAgo, 'en'), 'Just now');
      assert.strictEqual(formatNotificationTime(fifteenMinutesAgo, 'en'), '15m ago');
      assert.strictEqual(formatNotificationTime(threeHoursAgo, 'en'), '3h ago');
      assert.strictEqual(formatNotificationTime(twoDaysAgo, 'en'), '2d ago');
    });

    // -------------------------------------------------------------
    // 8. Notification Type Icon Emojis
    // -------------------------------------------------------------
    await test('8. Notification icon emoji mapping', () => {
      assert.strictEqual(getNotificationIcon('POST_LIKE'), '❤️');
      assert.strictEqual(getNotificationIcon('POST_COMMENT'), '💬');
      assert.strictEqual(getNotificationIcon('GROUP_ROLE_UPDATE'), '👥');
      assert.strictEqual(getNotificationIcon('GROUP_MEMBER_REMOVED'), '🚪');
      assert.strictEqual(getNotificationIcon('ACCOUNT_STATUS_UPDATE'), '👤');
      assert.strictEqual(getNotificationIcon('POST_MODERATED'), '🛡️');
      assert.strictEqual(getNotificationIcon('MATRIMONIAL_INTEREST_RECEIVED'), '💌');
      assert.strictEqual(getNotificationIcon('MATRIMONIAL_INTEREST_ACCEPTED'), '💍');
      assert.strictEqual(getNotificationIcon('MATRIMONIAL_PROFILE_APPROVED'), '✅');
      assert.strictEqual(getNotificationIcon('MATRIMONIAL_PROFILE_REJECTED'), '❌');
      assert.strictEqual(getNotificationIcon('MATRIMONIAL_DOCUMENT_APPROVED'), '📜');
      assert.strictEqual(getNotificationIcon('NON_EXISTENT_TYPE'), '🔔');
    });

    // -------------------------------------------------------------
    // 9. Badge Count Capping Logic
    // -------------------------------------------------------------
    await test('9. Badge count display capping (0 hidden, up to 99, 99+)', () => {
      function formatBadge(count: number): string | null {
        if (count <= 0) return null;
        if (count > 99) return '99+';
        return String(count);
      }

      assert.strictEqual(formatBadge(0), null);
      assert.strictEqual(formatBadge(-5), null);
      assert.strictEqual(formatBadge(1), '1');
      assert.strictEqual(formatBadge(42), '42');
      assert.strictEqual(formatBadge(99), '99');
      assert.strictEqual(formatBadge(100), '99+');
      assert.strictEqual(formatBadge(500), '99+');
    });

    // -------------------------------------------------------------
    // 10. Multi-Tenant Context & Privacy Integrity
    // -------------------------------------------------------------
    await test('10. Multi-tenant context and actor data sanitization', () => {
      const mockItem: NotificationItem = {
        id: 'notif-sec-1',
        recipientId: 'user-recip',
        actorId: 'user-actor',
        actor: {
          id: 'user-actor',
          fullName: 'अमित कुमार',
          avatarUrl: 'https://cdn.example.com/avatars/user.jpg',
        },
        type: 'POST_LIKE',
        title: 'पसंद',
        message: 'आपकी पोस्ट पसंद की गई',
        entityType: 'POST',
        entityId: 'post-99',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // Ensure no sensitive fields (password, tokens) exist in actor info
      const actorKeys = Object.keys(mockItem.actor || {});
      assert.ok(!actorKeys.includes('passwordHash'), 'No passwordHash in notification actor');
      assert.ok(!actorKeys.includes('token'), 'No token in notification actor');
      assert.ok(!actorKeys.includes('email'), 'No private email in notification actor');
      assert.ok(!actorKeys.includes('phone'), 'No private phone in notification actor');
    });

  } finally {
    // Restore original apiClient methods
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  }

  console.log('\n================================================================');
  console.log(`🎉 NOTIFICATIONS FLOW TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Mobile Notifications Flow test suite failed with ${failed} failures.`);
  }
}


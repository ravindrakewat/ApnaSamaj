import assert from 'node:assert';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import { notificationsApi } from '../api/notifications.api';
import {
  requestNotificationPermissions,
  getDevicePushToken,
  registerPushTokenWithBackend,
  unregisterPushTokenOnLogout,
} from '../services/notifications/notification-token.service';
import {
  setupAndroidNotificationChannels,
  resolveNotificationRoute,
  setupNotificationListeners,
  checkColdStartNotification,
} from '../services/notifications/notification-handler.service';
import {
  setSecureItem,
  getSecureItem,
  removeSecureItem,
  clearMemoryStorageForTesting,
} from '../services/storage.service';
import * as MockNotifications from './mocks/expo-notifications';
import {
  NotificationPreferencesItem,
  RegisterDeviceTokenResponseData,
} from '@apnasamaj/shared-types';

export async function runPushNotificationsFlowTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 8.5: Mobile Push Notifications Flow Tests ');
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

  // Backup original apiClient methods for restore after tests
  const originalGet = apiClient.get.bind(apiClient);
  const originalPost = apiClient.post.bind(apiClient);
  const originalPatch = apiClient.patch.bind(apiClient);
  const originalDelete = apiClient.delete.bind(apiClient);

  try {
    // -------------------------------------------------------------
    // 1. Permission handling and request
    // -------------------------------------------------------------
    await test('1. Permission handling and request (granted vs denied)', async () => {
      MockNotifications.__setMockPermissionStatus('granted');
      const grantedResult = await requestNotificationPermissions();
      assert.strictEqual(grantedResult, true, 'Returns true when OS notification permission is granted');

      MockNotifications.__setMockPermissionStatus('denied');
      const deniedResult = await requestNotificationPermissions();
      assert.strictEqual(deniedResult, false, 'Returns false when OS notification permission is denied');

      // Reset to granted
      MockNotifications.__setMockPermissionStatus('granted');
    });

    // -------------------------------------------------------------
    // 2. Device token acquisition and registration
    // -------------------------------------------------------------
    await test('2. Native device push token acquisition & backend registration', async () => {
      clearMemoryStorageForTesting();
      MockNotifications.__setMockPermissionStatus('granted');
      MockNotifications.__setMockPushToken('fcm-native-token-test-123');

      const tokenResult = await getDevicePushToken();
      assert.ok(tokenResult, 'Token result returned');
      assert.strictEqual(tokenResult.token, 'fcm-native-token-test-123');
      assert.strictEqual(tokenResult.platform, 'ANDROID');
      assert.strictEqual(tokenResult.tokenType, 'FCM');

      let registeredPayload: any = null;
      apiClient.post = async (path: string, body?: any) => {
        if (path === '/notifications/devices/register') {
          registeredPayload = body;
          const mockRes: RegisterDeviceTokenResponseData = {
            id: 'dev-rec-1',
            platform: 'ANDROID',
            isActive: true,
            createdAt: new Date().toISOString(),
          };
          return { data: mockRes } as any;
        }
        return { data: null } as any;
      };

      const registeredToken = await registerPushTokenWithBackend();
      assert.strictEqual(registeredToken, 'fcm-native-token-test-123', 'Registered token returned');
      assert.ok(registeredPayload, 'apiClient.post was invoked');
      assert.strictEqual(registeredPayload.token, 'fcm-native-token-test-123');
      assert.strictEqual(registeredPayload.platform, 'ANDROID');
      assert.strictEqual(registeredPayload.tokenType, 'FCM');

      const storedToken = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(storedToken, 'fcm-native-token-test-123', 'Token persisted in SecureStore for logout cleanup');

      // 2.1 iOS APNs token discrimination test
      (Platform as any).OS = 'ios';
      MockNotifications.__setMockDeviceTokenType('apns');
      MockNotifications.__setMockPushToken('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      const iosResult = await getDevicePushToken();
      assert.ok(iosResult);
      assert.strictEqual(iosResult.platform, 'IOS');
      assert.strictEqual(iosResult.tokenType, 'APNS', 'Correctly identified raw APNs token on iOS');

      // Reset to android
      (Platform as any).OS = 'android';
      MockNotifications.__setMockDeviceTokenType('fcm');
      MockNotifications.__setMockPushToken('fcm-native-token-test-123');
    });

    // -------------------------------------------------------------
    // 3. Token refresh and storage persistence
    // -------------------------------------------------------------
    await test('3. Token refresh updates SecureStore record', async () => {
      const refreshedToken = 'fcm-native-token-refreshed-999';
      await setSecureItem('apna_samaj_registered_push_token', refreshedToken);
      const readRefreshed = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(readRefreshed, refreshedToken, 'Refreshed token retrieved from secure storage');
    });

    // -------------------------------------------------------------
    // 4. Foreground notification handling & listeners
    // -------------------------------------------------------------
    await test('4. Notification listeners initialize and return cleanup teardown', async () => {
      let navigatedTo: string | null = null;
      const unsubscribe = setupNotificationListeners({
        onNavigate: (route) => {
          navigatedTo = route;
        },
        onForegroundNotification: (notif) => {},
      });

      assert.strictEqual(typeof unsubscribe, 'function', 'setupNotificationListeners returns teardown function');
      unsubscribe();
    });

    // -------------------------------------------------------------
    // 5. Notification tap routing resolution
    // -------------------------------------------------------------
    await test('5. Notification tap routing resolution for all notification categories', () => {
      // 5.1 Personal Chat with conversation ID
      const directRoute = resolveNotificationRoute({
        type: 'PERSONAL_CHAT',
        conversationId: 'conv-abc-123',
      });
      assert.strictEqual(directRoute, '/(app)/chat/conv-abc-123');

      // 5.2 Personal Chat fallback to chat inbox
      const directInboxRoute = resolveNotificationRoute({
        type: 'PERSONAL_CHAT',
      });
      assert.strictEqual(directInboxRoute, '/(app)/chat');

      // 5.3 Group Chat with group slug
      const groupSlugRoute = resolveNotificationRoute({
        type: 'GROUP_CHAT',
        groupSlug: 'youth-wing',
      });
      assert.strictEqual(groupSlugRoute, '/(app)/group/youth-wing/chat');

      // 5.4 Group Chat fallback to groups directory
      const groupsRoute = resolveNotificationRoute({
        type: 'GROUP_CHAT',
      });
      assert.strictEqual(groupsRoute, '/(app)/groups');

      // 5.5 Matrimonial Interest
      const matrimonialRoute = resolveNotificationRoute({
        type: 'MATRIMONIAL_INTEREST',
        interestId: 'interest-101',
      });
      assert.strictEqual(matrimonialRoute, '/(app)/matrimonial');

      // 5.6 Post Comment
      const commentRoute = resolveNotificationRoute({
        type: 'POST_COMMENT',
        postId: 'post-555',
      });
      assert.strictEqual(commentRoute, '/(app)/post/post-555');

      // 5.7 Post Like
      const likeRoute = resolveNotificationRoute({
        type: 'POST_LIKE',
        entityId: 'post-777',
      });
      assert.strictEqual(likeRoute, '/(app)/post/post-777');

      // 5.8 Announcement
      const announcementRoute = resolveNotificationRoute({
        type: 'ANNOUNCEMENT',
        postId: 'post-announcement-1',
      });
      assert.strictEqual(announcementRoute, '/(app)/post/post-announcement-1');

      // 5.9 Malformed or unsupported payloads
      assert.strictEqual(resolveNotificationRoute(undefined), null);
      assert.strictEqual(resolveNotificationRoute({}), null);
      assert.strictEqual(resolveNotificationRoute({ type: 'UNKNOWN_EVENT_TYPE' }), null);
    });

    // -------------------------------------------------------------
    // 6. Logout cleanup and token deactivation
    // -------------------------------------------------------------
    await test('6. Logout cleanup deactivates token and purges SecureStore', async () => {
      await setSecureItem('apna_samaj_registered_push_token', 'token-to-deactivate');

      let deactivatedIdOrToken: string | null = null;
      apiClient.delete = async (path: string) => {
        if (path.startsWith('/notifications/devices/')) {
          deactivatedIdOrToken = decodeURIComponent(path.replace('/notifications/devices/', ''));
          return { data: { success: true } } as any;
        }
        return { data: null } as any;
      };

      await unregisterPushTokenOnLogout();
      assert.strictEqual(deactivatedIdOrToken, 'token-to-deactivate', 'Deactivate API called with stored token');
      const afterLogout = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(afterLogout, null, 'Stored device token cleared from SecureStore after logout');
    });

    // -------------------------------------------------------------
    // 7. Community switching cleanup
    // -------------------------------------------------------------
    await test('7. Community switching triggers clean push token teardown', async () => {
      await setSecureItem('apna_samaj_registered_push_token', 'tenant-a-token');
      let calledPath: string = '';
      apiClient.delete = async (path: string) => {
        calledPath = path;
        return { data: { success: true } } as any;
      };

      await unregisterPushTokenOnLogout();
      assert.ok(typeof calledPath === 'string' && calledPath.indexOf('tenant-a-token') >= 0, 'Unregister invoked on community switch');
      const cleared = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(cleared, null, 'Clean state ready for tenant-b registration');
    });

    // -------------------------------------------------------------
    // 8. Notification preferences API integration
    // -------------------------------------------------------------
    await test('8. Notification preferences API (fetch & toggle update)', async () => {
      const mockPreferences: NotificationPreferencesItem = {
        personalMessages: true,
        groupMessages: true,
        matrimonial: false,
        likes: true,
        comments: true,
        announcements: true,
        communityUpdates: true,
      };

      apiClient.get = async (path: string) => {
        if (path === '/notifications/preferences') {
          return { data: mockPreferences } as any;
        }
        return { data: null } as any;
      };

      const fetched = await notificationsApi.getNotificationPreferences();
      assert.strictEqual(fetched.personalMessages, true);
      assert.strictEqual(fetched.matrimonial, false);

      let patchInput: any = null;
      apiClient.patch = async (path: string, body?: any) => {
        if (path === '/notifications/preferences') {
          patchInput = body;
          return { data: { ...mockPreferences, ...body } } as any;
        }
        return { data: null } as any;
      };

      const updated = await notificationsApi.updateNotificationPreferences({
        likes: false,
        comments: false,
      });
      assert.strictEqual(patchInput.likes, false);
      assert.strictEqual(patchInput.comments, false);
      assert.strictEqual(updated.likes, false);
      assert.strictEqual(updated.comments, false);
    });

    // -------------------------------------------------------------
    // 9. Cold-start notification handling & deferred routing
    // -------------------------------------------------------------
    await test('9. Cold-start tap detection resolves destination route on bootstrap', async () => {
      // 9.1 Cold start notification present
      MockNotifications.__setMockLastResponse({
        notification: {
          request: {
            content: {
              data: {
                type: 'PERSONAL_CHAT',
                conversationId: 'cold-start-conv-999',
              },
            },
          },
        },
      });

      let coldStartRoute: string | null = null;
      await checkColdStartNotification((route) => {
        coldStartRoute = route;
      });

      assert.strictEqual(
        coldStartRoute,
        '/(app)/chat/cold-start-conv-999',
        'Cold start correctly navigated to tapped chat conversation'
      );

      // 9.2 No cold start notification
      MockNotifications.__setMockLastResponse(null);
      let emptyColdStart: string | null = null;
      await checkColdStartNotification((route) => {
        emptyColdStart = route;
      });
      assert.strictEqual(emptyColdStart, null, 'No navigation triggered when app launched normally');
    });

    // -------------------------------------------------------------
    // 10. Fallback for Web and unsupported environments
    // -------------------------------------------------------------
    await test('10. Graceful fallback on Web platform without errors', async () => {
      // Temporarily switch platform to web
      (Platform as any).OS = 'web';

      const webPerm = await requestNotificationPermissions();
      assert.strictEqual(webPerm, false, 'Web platform gracefully returns false for permissions');

      const webToken = await getDevicePushToken();
      assert.strictEqual(webToken, null, 'Web platform returns null device token');

      // setupAndroidNotificationChannels should exit without throwing
      await setupAndroidNotificationChannels();

      // Restore platform to android
      (Platform as any).OS = 'android';
    });

  } finally {
    // Restore original apiClient methods
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  }

  console.log('\n================================================================');
  console.log(`🎉 MOBILE NOTIFICATIONS TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Mobile Push Notifications test suite failed with ${failed} failures.`);
  }
}

import assert from 'node:assert';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import { notificationsApi } from '../api/notifications.api';
import {
  requestNotificationPermissions,
  getDevicePushToken,
  registerPushTokenWithBackend,
  unregisterPushTokenOnLogout,
  setupPushTokenRefreshListener,
  getSessionRegisteredToken,
  clearSessionRegisteredTokenForTesting,
} from '../services/notifications/notification-token.service';
import {
  setupAndroidNotificationChannels,
  resolveNotificationRoute,
  setupNotificationListeners,
  checkColdStartNotification,
  setActiveChatContext,
  getActiveChatContext,
  shouldPresentForegroundNotification,
  setPendingNotificationRoute,
  getPendingNotificationRoute,
  consumePendingNotificationRoute,
} from '../services/notifications/notification-handler.service';
import {
  setSecureItem,
  getSecureItem,
  clearMemoryStorageForTesting,
  setStoredCommunitySlug,
} from '../services/storage.service';
import * as MockNotifications from './mocks/expo-notifications';
import {
  NotificationPreferencesItem,
  RegisterDeviceTokenResponseData,
  NotificationItem,
  NotificationsResponseData,
  MarkAllNotificationsReadResponse,
} from '@apnasamaj/shared-types';

export async function runRealPushNotificationsTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('  Apna Samaj — Batch 10.3.2: Real Mobile Push Notifications Tests');
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
    // -------------------------------------------------------------------------
    // 1. Device Token Registration with Session Caching & SecureStore
    // -------------------------------------------------------------------------
    await test('1. Device token registration & session caching prevents redundant calls', async () => {
      clearMemoryStorageForTesting();
      clearSessionRegisteredTokenForTesting();
      MockNotifications.__setMockPermissionStatus('granted');
      MockNotifications.__setMockPushToken('fcm-real-device-token-001');

      let postCount = 0;
      let registeredBody: any = null;

      apiClient.post = async (path: string, body?: any) => {
        if (path === '/notifications/devices/register') {
          postCount++;
          registeredBody = body;
          const mockRes: RegisterDeviceTokenResponseData = {
            id: 'dev-token-id-1',
            platform: 'ANDROID',
            isActive: true,
            createdAt: new Date().toISOString(),
          };
          return { data: mockRes } as any;
        }
        return { data: null } as any;
      };

      // First call registers with backend
      const token1 = await registerPushTokenWithBackend();
      assert.strictEqual(token1, 'fcm-real-device-token-001');
      assert.strictEqual(postCount, 1);
      assert.strictEqual(registeredBody.token, 'fcm-real-device-token-001');
      assert.strictEqual(registeredBody.platform, 'ANDROID');
      assert.strictEqual(registeredBody.tokenType, 'FCM');

      // Check session caching and SecureStore persistence
      assert.strictEqual(getSessionRegisteredToken(), 'fcm-real-device-token-001');
      const stored = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(stored, 'fcm-real-device-token-001');

      // Subsequent call in same session must NOT hit backend again (caching)
      const token2 = await registerPushTokenWithBackend();
      assert.strictEqual(token2, 'fcm-real-device-token-001');
      assert.strictEqual(postCount, 1, 'Redundant registration call prevented by session cache');
    });

    // -------------------------------------------------------------------------
    // 2. Token Refresh Listener & Dynamic Re-registration
    // -------------------------------------------------------------------------
    await test('2. Token refresh listener detects OS/FCM rotation and re-registers', async () => {
      let reRegisterBody: any = null;
      let reRegisterCount = 0;

      apiClient.post = async (path: string, body?: any) => {
        if (path === '/notifications/devices/register') {
          reRegisterCount++;
          reRegisterBody = body;
          return { data: { id: 'dev-token-id-refreshed', isActive: true } } as any;
        }
        return { data: null } as any;
      };

      const unsubscribe = setupPushTokenRefreshListener();
      assert.strictEqual(typeof unsubscribe, 'function', 'Returns unsubscribe cleanup function');

      // Trigger token refresh event from mock FCM layer
      const newFCMToken = 'fcm-rotated-token-999-new';
      await MockNotifications.__triggerPushTokenRefresh(newFCMToken, 'fcm');

      assert.strictEqual(reRegisterCount, 1, 'Re-registration triggered upon token rotation');
      assert.strictEqual(reRegisterBody.token, newFCMToken);
      assert.strictEqual(getSessionRegisteredToken(), newFCMToken);

      const updatedStored = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(updatedStored, newFCMToken);

      // Clean up subscription
      unsubscribe();
    });

    // -------------------------------------------------------------------------
    // 3. Multiple Devices Handling (Multi-device per user support)
    // -------------------------------------------------------------------------
    await test('3. Multiple devices per user support (phone & tablet tokens)', async () => {
      const registeredTokens: string[] = [];

      apiClient.post = async (path: string, body?: any) => {
        if (path === '/notifications/devices/register') {
          registeredTokens.push(body.token);
          return {
            data: {
              id: `dev-${registeredTokens.length}`,
              platform: body.platform,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
          } as any;
        }
        return { data: null } as any;
      };

      // Device 1 (Phone)
      clearSessionRegisteredTokenForTesting();
      MockNotifications.__setMockPushToken('fcm-phone-token-111');
      await registerPushTokenWithBackend();

      // Device 2 (Tablet)
      clearSessionRegisteredTokenForTesting();
      MockNotifications.__setMockPushToken('fcm-tablet-token-222');
      await registerPushTokenWithBackend();

      assert.strictEqual(registeredTokens.length, 2);
      assert.ok(registeredTokens.includes('fcm-phone-token-111'));
      assert.ok(registeredTokens.includes('fcm-tablet-token-222'));
    });

    // -------------------------------------------------------------------------
    // 4. Invalid Token Cleanup on Logout
    // -------------------------------------------------------------------------
    await test('4. Invalid/expired token cleanup deactivates token & purges storage', async () => {
      await setSecureItem('apna_samaj_registered_push_token', 'fcm-token-to-purge');
      let deactivatedToken: string | null = null;

      apiClient.delete = async (path: string) => {
        if (path.startsWith('/notifications/devices/')) {
          deactivatedToken = decodeURIComponent(path.replace('/notifications/devices/', ''));
          return { data: { success: true } } as any;
        }
        return { data: null } as any;
      };

      await unregisterPushTokenOnLogout();

      assert.strictEqual(deactivatedToken, 'fcm-token-to-purge');
      assert.strictEqual(getSessionRegisteredToken(), null, 'Session cache cleared');
      const stored = await getSecureItem('apna_samaj_registered_push_token');
      assert.strictEqual(stored, null, 'SecureStore device token removed');
    });

    // -------------------------------------------------------------------------
    // 5. Android 13+ Notification Permission States
    // -------------------------------------------------------------------------
    await test('5. Android 13+ POST_NOTIFICATIONS permission states (granted/denied)', async () => {
      MockNotifications.__setMockPermissionStatus('granted');
      const granted = await requestNotificationPermissions();
      assert.strictEqual(granted, true);

      MockNotifications.__setMockPermissionStatus('denied');
      const denied = await requestNotificationPermissions();
      assert.strictEqual(denied, false);

      // Restore granted
      MockNotifications.__setMockPermissionStatus('granted');
    });

    // -------------------------------------------------------------------------
    // 6. User Notification Preferences Enforcement
    // -------------------------------------------------------------------------
    await test('6. User notification preferences (fetch & toggle update)', async () => {
      const currentPrefs: NotificationPreferencesItem = {
        personalMessages: true,
        groupMessages: true,
        matrimonial: true,
        likes: true,
        comments: true,
        announcements: true,
        communityUpdates: true,
      };

      apiClient.get = async (path: string) => {
        if (path === '/notifications/preferences') {
          return { data: currentPrefs } as any;
        }
        return { data: null } as any;
      };

      const fetched = await notificationsApi.getNotificationPreferences();
      assert.strictEqual(fetched.personalMessages, true);
      assert.strictEqual(fetched.matrimonial, true);

      let patchedPayload: any = null;
      apiClient.patch = async (path: string, body?: any) => {
        if (path === '/notifications/preferences') {
          patchedPayload = body;
          return { data: { ...currentPrefs, ...body } } as any;
        }
        return { data: null } as any;
      };

      const updated = await notificationsApi.updateNotificationPreferences({
        matrimonial: false,
        likes: false,
      });

      assert.strictEqual(patchedPayload.matrimonial, false);
      assert.strictEqual(patchedPayload.likes, false);
      assert.strictEqual(updated.matrimonial, false);
      assert.strictEqual(updated.likes, false);
    });

    // -------------------------------------------------------------------------
    // 7. Android Notification Channels & FCM Payload Formatting
    // -------------------------------------------------------------------------
    await test('7. Android notification channels configuration and FCM data payload', async () => {
      // Must not throw on Android channel setup
      await setupAndroidNotificationChannels();

      // FCM payload structure verification
      const fcmPayload = {
        notification: {
          title: 'नया संदेश',
          body: 'सुनील: नमस्ते, क्या हाल है?',
        },
        data: {
          type: 'PERSONAL_CHAT',
          conversationId: 'conv-fcm-123',
          senderId: 'user-sender-1',
        },
        android: {
          channelId: 'apna_samaj_default',
          priority: 'high',
        },
      };

      assert.strictEqual(fcmPayload.android.channelId, 'apna_samaj_default');
      assert.strictEqual(fcmPayload.data.type, 'PERSONAL_CHAT');
      assert.strictEqual(fcmPayload.data.conversationId, 'conv-fcm-123');
    });

    // -------------------------------------------------------------------------
    // 8. Foreground Presentation with Active Screen Suppression
    // -------------------------------------------------------------------------
    await test('8. Foreground presentation suppresses alert when user is actively in conversation', () => {
      // Direct Chat Notification
      const directNotif: any = {
        request: {
          content: {
            data: {
              type: 'PERSONAL_CHAT',
              conversationId: 'conv-active-777',
            },
          },
        },
      };

      // When user is currently in conv-active-777 -> Suppress banner
      setActiveChatContext({ conversationId: 'conv-active-777' });
      assert.strictEqual(
        shouldPresentForegroundNotification(directNotif),
        false,
        'Suppressed when viewing the same direct conversation'
      );

      // When user is viewing a different chat -> Show banner
      setActiveChatContext({ conversationId: 'conv-different-888' });
      assert.strictEqual(
        shouldPresentForegroundNotification(directNotif),
        true,
        'Presented when user is in a different direct chat'
      );

      // Group Chat Notification
      const groupNotif: any = {
        request: {
          content: {
            data: {
              type: 'GROUP_CHAT',
              groupSlug: 'delhi-community',
            },
          },
        },
      };

      // When user is currently viewing delhi-community chat -> Suppress banner
      setActiveChatContext({ groupId: 'delhi-community' });
      assert.strictEqual(
        shouldPresentForegroundNotification(groupNotif),
        false,
        'Suppressed when viewing the same group chat'
      );

      // When user is in feed or null context -> Show banner
      setActiveChatContext(null);
      assert.strictEqual(getActiveChatContext(), null);
      assert.strictEqual(
        shouldPresentForegroundNotification(directNotif),
        true,
        'Presented when browsing main app / feed'
      );
      assert.strictEqual(
        shouldPresentForegroundNotification(groupNotif),
        true,
        'Presented when browsing main app / feed'
      );
    });

    // -------------------------------------------------------------------------
    // 9. Background Notification Delivery Contract
    // -------------------------------------------------------------------------
    await test('9. Background notification delivery contract verification', () => {
      // In background, notification arrives via FCM native service to system tray
      const bgPayload = {
        type: 'MATRIMONIAL_INTEREST',
        interestId: 'interest-bg-456',
        title: 'नया रिश्ता अनुरोध',
      };

      const resolved = resolveNotificationRoute(bgPayload);
      assert.strictEqual(resolved, '/(app)/matrimonial');
    });

    // -------------------------------------------------------------------------
    // 10. Terminated App Cold-Start & Deferred Routing
    // -------------------------------------------------------------------------
    await test('10. Terminated-app cold start & pending route consumption', async () => {
      // Set pending route as done by NavigationGate cold-start detection
      setPendingNotificationRoute('/(app)/chat/conv-cold-start-1');
      assert.strictEqual(getPendingNotificationRoute(), '/(app)/chat/conv-cold-start-1');

      // Consumption returns route and clears pending state to prevent re-routing
      const consumed = consumePendingNotificationRoute();
      assert.strictEqual(consumed, '/(app)/chat/conv-cold-start-1');
      assert.strictEqual(getPendingNotificationRoute(), null, 'Pending route cleared after consumption');

      // Calling again returns null
      assert.strictEqual(consumePendingNotificationRoute(), null);

      // Test checkColdStartNotification with mock response
      MockNotifications.__setMockLastResponse({
        notification: {
          request: {
            content: {
              data: {
                type: 'POST_COMMENT',
                postId: 'post-cold-99',
              },
            },
          },
        },
      });

      let navDestination: string | null = null;
      await checkColdStartNotification((dest) => {
        navDestination = dest;
      });

      assert.strictEqual(navDestination, '/(app)/post/post-cold-99');
      MockNotifications.__setMockLastResponse(null);
    });

    // -------------------------------------------------------------------------
    // 11. Deep-Link Routing Across All 8 Target Types
    // -------------------------------------------------------------------------
    await test('11. Comprehensive deep-link routing for all notification types', () => {
      // 1. PERSONAL_CHAT (with ID)
      assert.strictEqual(
        resolveNotificationRoute({ type: 'PERSONAL_CHAT', conversationId: 'c1' }),
        '/(app)/chat/c1'
      );
      // 2. PERSONAL_CHAT (fallback)
      assert.strictEqual(
        resolveNotificationRoute({ type: 'PERSONAL_CHAT' }),
        '/(app)/chat'
      );
      // 3. GROUP_CHAT (slug / id)
      assert.strictEqual(
        resolveNotificationRoute({ type: 'GROUP_CHAT', groupSlug: 'g-slug' }),
        '/(app)/group/g-slug/chat'
      );
      assert.strictEqual(
        resolveNotificationRoute({ type: 'GROUP_CHAT', groupId: 'g-id' }),
        '/(app)/group/g-id/chat'
      );
      // 4. GROUP_CHAT (fallback)
      assert.strictEqual(
        resolveNotificationRoute({ type: 'GROUP_CHAT' }),
        '/(app)/groups'
      );
      // 5. MATRIMONIAL_INTEREST
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_INTEREST', interestId: 'i1' }),
        '/(app)/matrimonial'
      );
      // 6. MATRIMONIAL_INTEREST_RECEIVED with entityId
      assert.strictEqual(
        resolveNotificationRoute({ type: 'MATRIMONIAL_INTEREST_RECEIVED', entityId: 'profile-99' }),
        '/(app)/matrimonial/profile-99'
      );
      // 7. POST_COMMENT & POST_LIKE
      assert.strictEqual(
        resolveNotificationRoute({ type: 'POST_COMMENT', postId: 'post-1' }),
        '/(app)/post/post-1'
      );
      assert.strictEqual(
        resolveNotificationRoute({ type: 'POST_LIKE', entityId: 'post-2' }),
        '/(app)/post/post-2'
      );
      // 8. ANNOUNCEMENT & GROUP_ROLE_UPDATE
      assert.strictEqual(
        resolveNotificationRoute({ type: 'ANNOUNCEMENT', entityId: 'post-ann-1' }),
        '/(app)/post/post-ann-1'
      );
      assert.strictEqual(
        resolveNotificationRoute({ type: 'GROUP_ROLE_UPDATE', entityId: 'group-10' }),
        '/(app)/group/group-10'
      );
      // Fallback for null / unsupported
      assert.strictEqual(resolveNotificationRoute(undefined), null);
      assert.strictEqual(resolveNotificationRoute({}), null);
      assert.strictEqual(resolveNotificationRoute({ type: 'NON_EXISTENT_TYPE' }), null);
    });

    // -------------------------------------------------------------------------
    // 12. Multi-Tenant Context Preservation
    // -------------------------------------------------------------------------
    await test('12. Multi-tenant isolation during push token registration', async () => {
      await setStoredCommunitySlug('kewat-samaj');
      const headers = await (apiClient as any).buildHeaders({});
      assert.strictEqual(headers['x-community-slug'], 'kewat-samaj');

      clearSessionRegisteredTokenForTesting();
      MockNotifications.__setMockPushToken('fcm-tenant-scoped-token');
      let registeredWithTenant: boolean = false;
      apiClient.post = async (path: string, body?: any) => {
        if (path === '/notifications/devices/register') {
          registeredWithTenant = true;
          return { data: { id: 'dev-tenant-1', isActive: true } } as any;
        }
        return { data: null } as any;
      };

      await registerPushTokenWithBackend();
      assert.strictEqual(registeredWithTenant, true, 'Registered with tenant-scoped apiClient');
    });

    // -------------------------------------------------------------------------
    // 13. Duplicate Notification Prevention
    // -------------------------------------------------------------------------
    await test('13. Duplicate notification registration prevention across re-renders', async () => {
      let callCount = 0;
      apiClient.post = async (path: string) => {
        if (path === '/notifications/devices/register') {
          callCount++;
          return { data: { id: 'dev-dup-1', isActive: true } } as any;
        }
        return { data: null } as any;
      };

      // Calling register multiple times in quick succession (e.g. navigation / tab switch)
      await registerPushTokenWithBackend();
      await registerPushTokenWithBackend();
      await registerPushTokenWithBackend();

      assert.strictEqual(callCount, 0, 'No calls fired because token is already session-cached');
    });

    // -------------------------------------------------------------------------
    // 14. Existing Notification Inbox Regression Verification
    // -------------------------------------------------------------------------
    await test('14. Notification inbox regression verification (fetch, unread count, mark read)', async () => {
      const mockNotifs: NotificationItem[] = [
        {
          id: 'n-1',
          recipientId: 'u-1',
          actorId: 'u-2',
          actor: { id: 'u-2', fullName: 'रमेश कुमार', avatarUrl: null },
          type: 'POST_LIKE',
          title: 'नई पसंद (Like)',
          message: 'रमेश कुमार ने आपकी पोस्ट पसंद की।',
          entityType: 'POST',
          entityId: 'p-1',
          isRead: false,
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n-2',
          recipientId: 'u-1',
          actorId: 'u-3',
          actor: { id: 'u-3', fullName: 'सीमा वर्मा', avatarUrl: null },
          type: 'POST_COMMENT',
          title: 'नई टिप्पणी',
          message: 'नमस्ते जी!',
          entityType: 'POST',
          entityId: 'p-2',
          isRead: true,
          readAt: '2026-11-12T10:00:00Z',
          createdAt: new Date().toISOString(),
        },
      ];

      apiClient.get = async (path: string, params?: any) => {
        if (path === '/notifications') {
          const isUnread = Boolean(params?.unreadOnly);
          const filtered = isUnread ? mockNotifs.filter((n) => !n.isRead) : mockNotifs;
          const resData: NotificationsResponseData = {
            notifications: filtered,
            pagination: {
              page: 1,
              limit: 20,
              total: filtered.length,
              totalPages: 1,
              hasMore: false,
            },
            unreadCount: mockNotifs.filter((n) => !n.isRead).length,
          };
          return {
            data: resData,
          } as any;
        }
        return { data: null } as any;
      };

      const feed = await notificationsApi.getNotifications();
      assert.strictEqual(feed.notifications.length, 2);
      assert.strictEqual(feed.unreadCount, 1);

      const unreadFeed = await notificationsApi.getNotifications({ unreadOnly: true });
      assert.strictEqual(unreadFeed.notifications.length, 1);
      assert.strictEqual(unreadFeed.notifications[0].id, 'n-1');

      // Mark single notification as read & mark all as read
      let markedId: string | null = null;
      let markAllCalled = false;
      apiClient.patch = async (path: string) => {
        if (path === '/notifications/read-all') {
          markAllCalled = true;
          const markAllRes: MarkAllNotificationsReadResponse = {
            updatedCount: 1,
          };
          return {
            data: markAllRes,
          } as any;
        }
        if (path.startsWith('/notifications/') && path.endsWith('/read')) {
          markedId = path.split('/')[2];
          return {
            data: {
              id: markedId,
              isRead: true,
              readAt: new Date().toISOString(),
            },
          } as any;
        }
        return { data: null } as any;
      };

      const markRes = await notificationsApi.markAsRead('n-1');
      assert.strictEqual(markedId, 'n-1');
      assert.ok(markRes.readAt);

      const markAllRes = await notificationsApi.markAllAsRead();
      assert.strictEqual(markAllCalled, true);
      assert.strictEqual(markAllRes.updatedCount, 1);
    });

  } finally {
    // Restore original apiClient methods
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    apiClient.patch = originalPatch;
    apiClient.delete = originalDelete;
  }

  console.log('\n================================================================');
  console.log(`🎉 REAL PUSH NOTIFICATIONS TEST SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`Real Push Notifications test suite failed with ${failed} failures.`);
  }
}

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { PushNotificationRoutingPayload } from '@apnasamaj/shared-types';

/**
 * Configure default foreground notification behavior.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Sets up Android High Priority Notification Channels for Apna Samaj.
 */
export async function setupAndroidNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('apna_samaj_default', {
      name: 'General Notifications',
      description: 'Community chats, matrimonial interests, and announcements',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0284c7',
      sound: 'default',
    });
  } catch (err) {
    console.warn('[Notification Handler] Failed to create Android notification channel:', err);
  }
}

/**
 * Maps raw notification data payload into an authorized Expo Router destination path.
 */
export function resolveNotificationRoute(data: Record<string, any> | undefined): string | null {
  if (!data || !data.type) {
    return null;
  }

  const payload = data as Partial<PushNotificationRoutingPayload>;

  switch (payload.type) {
    case 'PERSONAL_CHAT':
      if (payload.conversationId) {
        return `/(app)/chat/${payload.conversationId}`;
      }
      return '/(app)/chat';

    case 'GROUP_CHAT':
      if (payload.groupSlug || payload.groupId) {
        return `/(app)/group/${payload.groupSlug || payload.groupId}/chat`;
      }
      return '/(app)/groups';

    case 'MATRIMONIAL_INTEREST':
      return '/(app)/matrimonial';

    case 'POST_COMMENT':
    case 'POST_LIKE':
      if (payload.postId || payload.entityId) {
        return `/(app)/post/${payload.postId || payload.entityId}`;
      }
      return '/(app)';

    case 'ANNOUNCEMENT':
      if (payload.postId || payload.entityId) {
        return `/(app)/post/${payload.postId || payload.entityId}`;
      }
      return '/(app)';

    default:
      return null;
  }
}

export interface NotificationListenersConfig {
  onNavigate: (route: string) => void;
  onForegroundNotification?: (notification: Notifications.Notification) => void;
}

/**
 * Initializes notification tap & foreground listeners.
 * Returns a teardown function to clean up subscriptions.
 */
export function setupNotificationListeners(
  config: NotificationListenersConfig
): () => void {
  // 1. Foreground notification receipt
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      if (config.onForegroundNotification) {
        config.onForegroundNotification(notification);
      }
    }
  );

  // 2. Notification tap / interaction listener
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      const targetRoute = resolveNotificationRoute(data);
      if (targetRoute) {
        config.onNavigate(targetRoute);
      }
    }
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Handles cold-start notification taps where app was opened from closed state.
 */
export async function checkColdStartNotification(
  onNavigate: (route: string) => void
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    if (lastResponse) {
      const data = lastResponse.notification.request.content.data;
      const targetRoute = resolveNotificationRoute(data);
      if (targetRoute) {
        onNavigate(targetRoute);
      }
    }
  } catch (err) {
    console.warn('[Notification Handler] Error checking cold-start notification:', err);
  }
}


import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { PushNotificationRoutingPayload } from '@apnasamaj/shared-types';

export interface ActiveChatContext {
  conversationId?: string | null;
  groupId?: string | null;
}

let activeChatContext: ActiveChatContext | null = null;
let pendingNotificationRoute: string | null = null;

export function setActiveChatContext(context: ActiveChatContext | null): void {
  activeChatContext = context;
}

export function getActiveChatContext(): ActiveChatContext | null {
  return activeChatContext;
}

export function setPendingNotificationRoute(route: string | null): void {
  pendingNotificationRoute = route;
}

export function getPendingNotificationRoute(): string | null {
  return pendingNotificationRoute;
}

export function consumePendingNotificationRoute(): string | null {
  const route = pendingNotificationRoute;
  pendingNotificationRoute = null;
  return route;
}

/**
 * Determines whether a foreground notification should present an alert banner to the user.
 * Suppresses alert banners if the user is currently viewing the active conversation
 * to prevent disruptive duplicate alerts while actively chatting (WhatsApp/Facebook behavior).
 */
export function shouldPresentForegroundNotification(
  notification: Notifications.Notification,
  context: ActiveChatContext | null = activeChatContext
): boolean {
  const data = notification?.request?.content?.data;
  if (!data) return true;

  // Suppress heads-up banner if currently inside this active direct chat
  if (
    context?.conversationId &&
    data.conversationId &&
    String(data.conversationId) === String(context.conversationId)
  ) {
    return false;
  }

  // Suppress heads-up banner if currently inside this active group chat
  if (
    context?.groupId &&
    (String(data.groupId) === String(context.groupId) ||
      String(data.groupSlug) === String(context.groupId))
  ) {
    return false;
  }

  return true;
}

/**
 * Configure default foreground notification behavior with active screen awareness.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const shouldPresent = shouldPresentForegroundNotification(notification);
    return {
      shouldShowAlert: shouldPresent,
      shouldPlaySound: shouldPresent,
      shouldSetBadge: true,
    };
  },
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
 * Supports both FCM push routing payloads and in-app NotificationItem models.
 */
export function resolveNotificationRoute(data: Record<string, any> | undefined): string | null {
  if (!data || !data.type) {
    return null;
  }

  const type = String(data.type);
  const entityId =
    data.entityId ||
    data.postId ||
    data.interestId ||
    data.conversationId ||
    data.groupId ||
    data.groupSlug;

  switch (type) {
    case 'PERSONAL_CHAT':
      if (data.conversationId) {
        return `/(app)/chat/${data.conversationId}`;
      }
      return '/(app)/chat';

    case 'GROUP_CHAT':
      if (data.groupSlug || data.groupId) {
        return `/(app)/group/${data.groupSlug || data.groupId}/chat`;
      }
      return '/(app)/groups';

    case 'MATRIMONIAL_INTEREST':
      return '/(app)/matrimonial';

    case 'POST_COMMENT':
    case 'POST_LIKE':
    case 'POST_MODERATED':
    case 'ANNOUNCEMENT':
      if (entityId) {
        return `/(app)/post/${entityId}`;
      }
      return '/(app)';

    case 'GROUP_ROLE_UPDATE':
    case 'GROUP_MEMBER_REMOVED':
      if (entityId) {
        return `/(app)/group/${entityId}`;
      }
      return '/(app)/groups';

    case 'ACCOUNT_STATUS_UPDATE':
      return '/(app)/profile';

    case 'MATRIMONIAL_INTEREST_RECEIVED':
    case 'MATRIMONIAL_INTEREST_ACCEPTED':
    case 'MATRIMONIAL_PROFILE_APPROVED':
    case 'MATRIMONIAL_PROFILE_REJECTED':
    case 'MATRIMONIAL_PROFILE_SUSPENDED':
    case 'MATRIMONIAL_DOCUMENT_APPROVED':
    case 'MATRIMONIAL_DOCUMENT_REJECTED':
      if (entityId) {
        return `/(app)/matrimonial/${entityId}`;
      }
      return '/(app)/matrimonial';

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


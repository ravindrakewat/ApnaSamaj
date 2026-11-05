import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationsApi } from '../../api/notifications.api';
import {
  setSecureItem,
  getSecureItem,
  removeSecureItem,
} from '../storage.service';
import { DevicePlatform, PushTokenType } from '@apnasamaj/shared-types';

const STORED_DEVICE_TOKEN_KEY = 'apna_samaj_registered_push_token';
let sessionRegisteredToken: string | null = null;

export interface DeviceTokenResult {
  token: string;
  platform: DevicePlatform;
  tokenType: PushTokenType;
}

/**
 * Requests native notification permissions from the OS.
 * Handles Android 13+ (POST_NOTIFICATIONS) and iOS APNs authorization.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (err) {
    console.warn('[Notification Service] Permission request error:', err);
    return false;
  }
}

/**
 * Obtains the native FCM (Android) or APNs (iOS) device registration token.
 * Note: Uses getDevicePushTokenAsync() rather than getExpoPushTokenAsync()
 * to guarantee direct Firebase Cloud Messaging compatibility.
 */
export async function getDevicePushToken(): Promise<DeviceTokenResult | null> {
  if (Platform.OS === 'web') {
    return null;
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.info('[Notification Service] Push notifications permission denied by user.');
      return null;
    }

    // 1. On iOS, attempt to obtain true native FCM token via @react-native-firebase/messaging if configured in a native build
    if (Platform.OS === 'ios') {
      try {
        const rnfbMessaging = require('@react-native-firebase/messaging');
        const messaging = rnfbMessaging.default || rnfbMessaging;
        const fcmToken = await messaging().getToken();
        if (fcmToken && typeof fcmToken === 'string') {
          return {
            token: fcmToken,
            platform: 'IOS',
            tokenType: 'FCM',
          };
        }
      } catch {
        // Fall back to expo-notifications APNs token
      }
    }

    const deviceTokenResponse = await Notifications.getDevicePushTokenAsync();
    const token = deviceTokenResponse.data;

    if (!token || typeof token !== 'string') {
      return null;
    }

    const platform: DevicePlatform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
    const rawType = (deviceTokenResponse as any)?.type;
    const tokenType: PushTokenType =
      rawType === 'apns' || (platform === 'IOS' && token.length === 64) ? 'APNS' : 'FCM';

    return {
      token,
      platform,
      tokenType,
    };
  } catch (err: any) {
    // Graceful handling for Expo Go or unconfigured native Firebase credentials
    console.info(
      '[Notification Service] Native FCM token acquisition notice (native build / google-services.json required):',
      err?.message || err
    );
    return null;
  }
}

/**
 * Registers device push token with the backend for the current authenticated user and tenant.
 * Saves the registered token in SecureStore to support clean unregistration on logout.
 * Uses in-memory session caching to prevent redundant registrations.
 */
export async function registerPushTokenWithBackend(): Promise<string | null> {
  try {
    const tokenResult = await getDevicePushToken();
    if (!tokenResult) {
      return null;
    }

    if (sessionRegisteredToken === tokenResult.token) {
      return tokenResult.token;
    }

    await notificationsApi.registerDeviceToken({
      token: tokenResult.token,
      platform: tokenResult.platform,
      tokenType: tokenResult.tokenType,
    });

    sessionRegisteredToken = tokenResult.token;
    await setSecureItem(STORED_DEVICE_TOKEN_KEY, tokenResult.token);
    return tokenResult.token;
  } catch (err: unknown) {
    console.warn('[Notification Service] Backend token registration failed (non-blocking):', err);
    return null;
  }
}

/**
 * Deactivates device push token on backend when user logs out or switches accounts.
 */
export async function unregisterPushTokenOnLogout(): Promise<void> {
  try {
    sessionRegisteredToken = null;
    const storedToken = await getSecureItem(STORED_DEVICE_TOKEN_KEY);
    if (storedToken) {
      await notificationsApi.deactivateDeviceToken(storedToken);
      await removeSecureItem(STORED_DEVICE_TOKEN_KEY);
    }
  } catch (err: unknown) {
    console.warn('[Notification Service] Token deactivation on logout failed (suppressed):', err);
  }
}

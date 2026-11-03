import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Apna Samaj Mobile Runtime Environment Configuration
 * Base URLs, timeouts, and platform-specific network fallbacks.
 */
function resolveDefaultApiBaseUrl(): string {
  // 1. Explicit environment variable override
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. Physical Android / iOS device over LAN via Expo Go
  // Automatically extracts the development workstation's LAN IP from Metro hostUri
  const hostUri = Constants?.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:5000/api/v1`;
    }
  }

  // 3. Android Emulator fallback (maps to host loopback 127.0.0.1)
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api/v1';
  }

  // 4. iOS Simulator / Web fallback
  return 'http://localhost:5000/api/v1';
}

export const APP_CONFIG = {
  appName: 'Apna Samaj',
  appVersion: '1.0.0',
  androidPackage: 'com.apnasamaj.app',
  apiBaseUrl: resolveDefaultApiBaseUrl(),
  defaultCommunitySlug: process.env.EXPO_PUBLIC_DEFAULT_COMMUNITY_SLUG || 'demo',
  requestTimeoutMs: 15000,
  tokenRefreshMarginSeconds: 60,
  defaultPageSize: 10,
} as const;


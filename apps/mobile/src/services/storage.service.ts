import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { APP_CONFIG } from '../constants/config';

// In-memory fallback if persistent storage is unavailable in the environment
const memoryStorage = new Map<string, string>();

/**
 * Prefix for browser localStorage keys to prevent namespace collisions with other apps.
 */
const WEB_STORAGE_PREFIX = '@apnasamaj:';

/**
 * Returns the browser's localStorage if accessible, or null if restricted/unavailable.
 */
function getWebStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // LocalStorage access may be restricted by browser security policies or sandboxes
  }
  return null;
}

/**
 * Checks whether the current runtime is Expo Web / browser environment.
 */
export function isWeb(): boolean {
  return (
    Platform.OS === 'web' ||
    (typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      Platform.OS !== 'android' &&
      Platform.OS !== 'ios')
  );
}

/**
 * Checks whether native SecureStore is available.
 * Returns false immediately on Web to avoid calling unsupported native APIs.
 */
async function isSecureStoreAvailable(): Promise<boolean> {
  if (isWeb()) {
    return false;
  }
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Returns which underlying storage engine is active for diagnostics and testing.
 */
export async function getActiveStorageEngine(): Promise<'secure-store' | 'local-storage' | 'in-memory'> {
  if (isWeb() && getWebStorage()) {
    return 'local-storage';
  }
  const secureAvailable = await isSecureStoreAvailable();
  if (secureAvailable) {
    return 'secure-store';
  }
  return 'in-memory';
}

/**
 * Clears in-memory storage fallback. Used in unit tests to simulate a fresh app start.
 */
export function clearMemoryStorageForTesting(): void {
  memoryStorage.clear();
}

/**
 * Reads a secure/persisted value from device Keychain/Keystore (native) or localStorage (web).
 */
export async function getSecureItem(key: string): Promise<string | null> {
  if (isWeb()) {
    const webStorage = getWebStorage();
    if (webStorage) {
      try {
        const value =
          webStorage.getItem(`${WEB_STORAGE_PREFIX}${key}`) ??
          webStorage.getItem(key);
        if (value !== null) {
          return value;
        }
      } catch (err) {
        console.warn(`[StorageService] Failed to read ${key} from localStorage:`, err);
      }
    }
    return memoryStorage.get(key) || null;
  }

  try {
    const available = await isSecureStoreAvailable();
    if (available) {
      return await SecureStore.getItemAsync(key);
    }
  } catch (err) {
    console.warn(`[StorageService] Failed to read ${key} from SecureStore:`, err);
  }
  return memoryStorage.get(key) || null;
}

/**
 * Writes an encrypted/persisted value to device Keychain/Keystore (native) or localStorage (web).
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isWeb()) {
    const webStorage = getWebStorage();
    if (webStorage) {
      try {
        webStorage.setItem(`${WEB_STORAGE_PREFIX}${key}`, value);
      } catch (err) {
        console.warn(`[StorageService] Failed to set ${key} in localStorage:`, err);
      }
    }
    memoryStorage.set(key, value);
    return;
  }

  try {
    const available = await isSecureStoreAvailable();
    if (available) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
  } catch (err) {
    console.warn(`[StorageService] Failed to set ${key} in SecureStore:`, err);
  }
  memoryStorage.set(key, value);
}

/**
 * Safely removes a key from Keychain/Keystore (native) or localStorage (web).
 */
export async function removeSecureItem(key: string): Promise<void> {
  if (isWeb()) {
    const webStorage = getWebStorage();
    if (webStorage) {
      try {
        webStorage.removeItem(`${WEB_STORAGE_PREFIX}${key}`);
        webStorage.removeItem(key);
      } catch (err) {
        console.warn(`[StorageService] Failed to delete ${key} from localStorage:`, err);
      }
    }
    memoryStorage.delete(key);
    return;
  }

  try {
    const available = await isSecureStoreAvailable();
    if (available) {
      await SecureStore.deleteItemAsync(key);
      return;
    }
  } catch (err) {
    console.warn(`[StorageService] Failed to delete ${key} from SecureStore:`, err);
  }
  memoryStorage.delete(key);
}

/**
 * Convenience helpers for session management
 */
export async function getAuthTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const [accessToken, refreshToken] = await Promise.all([
    getSecureItem(STORAGE_KEYS.ACCESS_TOKEN),
    getSecureItem(STORAGE_KEYS.REFRESH_TOKEN),
  ]);
  return { accessToken, refreshToken };
}

export async function setAuthTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  await Promise.all([
    setSecureItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken),
    setSecureItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken),
  ]);
}

export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    removeSecureItem(STORAGE_KEYS.ACCESS_TOKEN),
    removeSecureItem(STORAGE_KEYS.REFRESH_TOKEN),
    removeSecureItem(STORAGE_KEYS.USER_PROFILE),
  ]);
}

export async function getStoredCommunitySlug(): Promise<string> {
  const slug = await getSecureItem(STORAGE_KEYS.COMMUNITY_SLUG);
  return slug || APP_CONFIG.defaultCommunitySlug;
}

export async function setStoredCommunitySlug(slug: string): Promise<void> {
  await setSecureItem(STORAGE_KEYS.COMMUNITY_SLUG, slug);
}



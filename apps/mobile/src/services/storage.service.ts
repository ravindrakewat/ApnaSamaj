import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { APP_CONFIG } from '../constants/config';

// In-memory fallback if SecureStore is unavailable in a runtime environment
const memoryStorage = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Reads a secure value from device Keychain / Keystore.
 */
export async function getSecureItem(key: string): Promise<string | null> {
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
 * Writes an encrypted value to device Keychain / Keystore.
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
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
 * Safely removes a key from Keychain / Keystore.
 */
export async function removeSecureItem(key: string): Promise<void> {
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


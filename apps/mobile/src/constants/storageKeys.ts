/**
 * Storage Keys for SecureStore and persistent mobile preferences.
 * All authentication tokens MUST strictly use SecureStore.
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'apnasamaj_access_token',
  REFRESH_TOKEN: 'apnasamaj_refresh_token',
  COMMUNITY_SLUG: 'apnasamaj_community_slug',
  USER_PROFILE: 'apnasamaj_user_profile',
  APP_LANGUAGE: 'apnasamaj_app_language',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];


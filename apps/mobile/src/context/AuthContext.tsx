import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, LoginResponseData, RegisterResponseData } from '@apnasamaj/shared-types';
import { authApi, LoginPayload, RegisterPayload } from '../api/auth.api';
import { ApiError } from '../api/types';
import { onTokenUpdated, onSessionPurged } from '../api/client';
import {
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getStoredCommunitySlug,
  setStoredCommunitySlug,
  getSecureItem,
  setSecureItem,
} from '../services/storage.service';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { APP_CONFIG } from '../constants/config';
import { unregisterPushTokenOnLogout } from '../services/notifications';
import { outboxQueueService, chatPersistenceService } from '../services';

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  communitySlug: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (payload: LoginPayload, communitySlug?: string) => Promise<LoginResponseData>;
  register: (payload: RegisterPayload, communitySlug?: string) => Promise<RegisterResponseData>;
  logout: () => Promise<void>;
  switchCommunity: (newSlug: string) => Promise<void>;
  updateUser: (updatedFields: Partial<AuthUser>) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [communitySlug, setCommunitySlugState] = useState<string>(APP_CONFIG.defaultCommunitySlug);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Synchronize with background token rotations and session purges from ApiClient
  useEffect(() => {
    const unsubToken = onTokenUpdated(({ accessToken: freshAccess }) => {
      setAccessToken(freshAccess);
    });

    const unsubPurge = onSessionPurged(() => {
      setUser(null);
      setAccessToken(null);
    });

    return () => {
      unsubToken();
      unsubPurge();
    };
  }, []);

  // Restore authenticated session and community context on launch / page refresh
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const [rawSavedSlug, tokens, cachedUser] = await Promise.all([
          getSecureItem(STORAGE_KEYS.COMMUNITY_SLUG),
          getAuthTokens(),
          getSecureItem(STORAGE_KEYS.USER_PROFILE),
        ]);

        let parsedUser: AuthUser | null = null;
        if (cachedUser) {
          try {
            parsedUser = JSON.parse(cachedUser) as AuthUser;
          } catch {
            parsedUser = null;
          }
        }

        const hasTokens = Boolean(tokens.accessToken || tokens.refreshToken);
        let activeSlug: string | null = rawSavedSlug ? rawSavedSlug.trim().toLowerCase() : null;

        if (hasTokens) {
          // If authenticated tokens exist, verify tenant context unambiguously
          if (!activeSlug && parsedUser?.communitySlug) {
            // Recover user's authentic community slug rather than silently falling back to 'demo'
            activeSlug = parsedUser.communitySlug.trim().toLowerCase();
            await setStoredCommunitySlug(activeSlug);
          } else if (!activeSlug && !parsedUser?.communitySlug) {
            // Missing community slug with authenticated tokens: NEVER silently fallback to 'demo'
            console.warn(
              '[AuthContext] Authenticated session found without verified community slug. Purging ambiguous session.'
            );
            await clearAuthTokens();
            if (isMounted) {
              setUser(null);
              setAccessToken(null);
              setIsLoading(false);
            }
            return;
          } else if (
            activeSlug &&
            parsedUser?.communitySlug &&
            activeSlug !== parsedUser.communitySlug.trim().toLowerCase()
          ) {
            // Cross-tenant mismatch: stored community slug does not match cached profile
            console.warn(
              `[AuthContext] Cross-tenant mismatch: stored "${activeSlug}" != profile "${parsedUser.communitySlug}". Purging session.`
            );
            await clearAuthTokens();
            if (isMounted) {
              setUser(null);
              setAccessToken(null);
              setIsLoading(false);
            }
            return;
          }
        } else {
          // Unauthenticated user: default to 'demo' for login screen
          if (!activeSlug) {
            activeSlug = APP_CONFIG.defaultCommunitySlug;
          }
        }

        if (isMounted && activeSlug) {
          setCommunitySlugState(activeSlug);
        }

        let restoredUser: AuthUser | null = parsedUser;

        // 2. Token Restoration & Session Validation
        let activeAccess = tokens.accessToken;

        // If no access token but refresh token exists, proactively renew session
        if (!activeAccess && tokens.refreshToken && activeSlug) {
          try {
            const refreshData = await authApi.refresh(tokens.refreshToken, activeSlug);
            activeAccess = refreshData.accessToken;
            const newRefresh = refreshData.refreshToken || tokens.refreshToken;
            await setAuthTokens({ accessToken: activeAccess, refreshToken: newRefresh });
            if (refreshData.user) {
              restoredUser = refreshData.user;
              await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(refreshData.user));
            }
          } catch (refreshErr) {
            if (
              refreshErr instanceof ApiError &&
              (refreshErr.status === 401 || refreshErr.status === 403)
            ) {
              await clearAuthTokens();
              if (isMounted) {
                setUser(null);
                setAccessToken(null);
                setIsLoading(false);
              }
              return;
            }
          }
        }

        // If an access token exists (either directly restored or just renewed)
        if (activeAccess) {
          // Optimistically populate state to avoid blank flash
          if (isMounted) {
            if (restoredUser) {
              setUser(restoredUser);
            }
            setAccessToken(activeAccess);
          }

          // Validate active token with backend and update profile
          try {
            const freshUser = await authApi.getMe();
            if (isMounted) {
              // Verify fresh profile matches tenant context
              if (
                freshUser.communitySlug &&
                activeSlug &&
                freshUser.communitySlug.toLowerCase() !== activeSlug.toLowerCase()
              ) {
                console.warn(
                  '[AuthContext] Backend profile belongs to different community. Purging session.'
                );
                await clearAuthTokens();
                setUser(null);
                setAccessToken(null);
                setIsLoading(false);
                return;
              }
              // Read latest token from storage (in case getMe triggered an automatic 401 refresh retry)
              const latestTokens = await getAuthTokens();
              setUser(freshUser);
              setAccessToken(latestTokens.accessToken || activeAccess);
              await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(freshUser));
              if (activeSlug && freshUser.id) {
                outboxQueueService.initialize(activeSlug, freshUser.id).catch(console.warn);
              }
            }
          } catch (err: unknown) {
            // If token is explicitly revoked/expired and cannot be renewed:
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
              await clearAuthTokens();
              if (isMounted) {
                setUser(null);
                setAccessToken(null);
              }
            } else {
              // Network error or 400/500: maintain cached session so user is not logged out offline
              console.warn(
                '[AuthContext] Backend validation skipped due to network or non-auth error. Preserving offline session:',
                err
              );
            }
          }
        } else {
          // No tokens found
          if (isMounted) {
            setUser(null);
            setAccessToken(null);
          }
        }
      } catch (err) {
        console.warn('[AuthContext] Session restore encountered error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(
    async (payload: LoginPayload, slug?: string): Promise<LoginResponseData> => {
      setIsLoading(true);
      setError(null);
      try {
        const targetSlug = slug || communitySlug;
        const result = await authApi.login(payload, targetSlug);

        // Store tokens securely in Keychain / Keystore
        await setAuthTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || '',
        });
        await setStoredCommunitySlug(targetSlug);
        await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(result.user));

        setAccessToken(result.accessToken);
        setUser(result.user);
        setCommunitySlugState(targetSlug);
        outboxQueueService.initialize(targetSlug, result.user.id).catch(console.warn);

        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Login failed.';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [communitySlug]
  );

  const register = useCallback(
    async (payload: RegisterPayload, slug?: string): Promise<RegisterResponseData> => {
      setIsLoading(true);
      setError(null);
      try {
        const targetSlug = slug || communitySlug;
        const result = await authApi.register(payload, targetSlug);

        // Store tokens securely in Keychain / Keystore
        await setAuthTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || '',
        });
        await setStoredCommunitySlug(targetSlug);
        await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(result.user));

        setAccessToken(result.accessToken);
        setUser(result.user);
        setCommunitySlugState(targetSlug);
        outboxQueueService.initialize(targetSlug, result.user.id).catch(console.warn);

        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed.';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [communitySlug]
  );

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      outboxQueueService.teardown();
      chatPersistenceService.evictMemorySession();
      await unregisterPushTokenOnLogout().catch(console.warn);
      const { refreshToken } = await getAuthTokens();
      await authApi.logout(refreshToken || undefined);
    } finally {
      await clearAuthTokens();
      setUser(null);
      setAccessToken(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  const switchCommunity = useCallback(
    async (newSlug: string): Promise<void> => {
      const clean = newSlug.trim().toLowerCase();
      if (clean === communitySlug) return;

      // Stop old queue worker and evict in-memory session cache (preserves persistent outbox in original tenant namespace)
      outboxQueueService.teardown();
      chatPersistenceService.evictMemorySession();

      // If user is currently authenticated with another community,
      // terminate the old session so old tokens and profile never leak into the new community context
      if (accessToken || user) {
        try {
          await unregisterPushTokenOnLogout().catch(console.warn);
          const { refreshToken } = await getAuthTokens();
          await authApi.logout(refreshToken || undefined);
        } catch {
          // Ignore logout network failures during tenant switch
        }
        await clearAuthTokens();
        setUser(null);
        setAccessToken(null);
      }

      await setStoredCommunitySlug(clean);
      setCommunitySlugState(clean);
    },
    [communitySlug, accessToken, user]
  );

  const updateUser = useCallback(async (updatedFields: Partial<AuthUser>): Promise<void> => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updatedFields };
      setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updated)).catch(console.warn);
      return updated;
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        communitySlug,
        isAuthenticated: Boolean(accessToken && user),
        isLoading,
        error,
        login,
        register,
        logout,
        switchCommunity,
        updateUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

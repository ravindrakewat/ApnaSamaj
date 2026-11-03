import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, LoginResponseData, RegisterResponseData } from '@apnasamaj/shared-types';
import { authApi, LoginPayload, RegisterPayload } from '../api/auth.api';
import { ApiError } from '../api/types';
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
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [communitySlug, setCommunitySlugState] = useState<string>(APP_CONFIG.defaultCommunitySlug);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Restore authenticated session and community context on launch
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const [tokens, savedSlug, cachedUser] = await Promise.all([
          getAuthTokens(),
          getStoredCommunitySlug(),
          getSecureItem(STORAGE_KEYS.USER_PROFILE),
        ]);

        if (isMounted) {
          if (savedSlug) {
            setCommunitySlugState(savedSlug);
          }
          if (tokens.accessToken) {
            if (cachedUser) {
              try {
                const parsed = JSON.parse(cachedUser);
                const activeSlug = savedSlug || APP_CONFIG.defaultCommunitySlug;
                // Cross-tenant guard: verify cached profile matches active tenant context
                if (!parsed.communitySlug || parsed.communitySlug.toLowerCase() === activeSlug.toLowerCase()) {
                  setUser(parsed);
                  setAccessToken(tokens.accessToken);
                } else {
                  // Purge stale cross-tenant tokens
                  await clearAuthTokens();
                }
              } catch {
                // Ignore parse errors
              }
            } else {
              setAccessToken(tokens.accessToken);
            }
          }
        }

        // Verify active token with backend if network is available
        if (tokens.accessToken) {
          try {
            const freshUser = await authApi.getMe();
            if (isMounted) {
              setUser(freshUser);
              await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(freshUser));
            }
          } catch (err: unknown) {
            // If token is expired or forbidden (cross-tenant mismatch), purge session immediately
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
              await clearAuthTokens();
              if (isMounted) {
                setUser(null);
                setAccessToken(null);
              }
            }
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

      // If user is currently authenticated with another community,
      // terminate the old session so old tokens and profile never leak into the new community context
      if (accessToken || user) {
        try {
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

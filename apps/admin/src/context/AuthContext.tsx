import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser, UserRole, UserStatus } from '@apnasamaj/shared-types';
import { loginApi, refreshApi, getMeApi, logoutApi } from '../services/auth.service';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Attempt session restoration on initial app load via HttpOnly refresh cookie
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        // 1. Attempt token refresh using browser HttpOnly cookie
        const refreshResult = await refreshApi();
        if (!isMounted) return;

        const userProfile = refreshResult.user;

        // 2. Ensure user has administrative privileges and active status
        const isPrivileged =
          userProfile.role === UserRole.SUPER_ADMIN ||
          userProfile.role === UserRole.COMMUNITY_ADMIN ||
          userProfile.role === UserRole.MODERATOR;

        if (!isPrivileged || userProfile.status !== UserStatus.ACTIVE) {
          await logoutApi();
          if (isMounted) {
            setUser(null);
            setError('Access denied: Active administrative or moderator privilege required.');
          }
          return;
        }

        setUser(userProfile);
        setError(null);
      } catch {
        // Unauthenticated or expired cookie - safe initial state
        if (isMounted) {
          setUser(null);
        }
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

  const login = async (phone: string, password: string): Promise<void> => {
    setError(null);
    try {
      const result = await loginApi(phone, password);

      // Verify administrative access
      const isPrivileged =
        result.user.role === UserRole.SUPER_ADMIN ||
        result.user.role === UserRole.COMMUNITY_ADMIN ||
        result.user.role === UserRole.MODERATOR;

      if (!isPrivileged || result.user.status !== UserStatus.ACTIVE) {
        await logoutApi();
        setUser(null);
        throw new Error('Access denied: Admin Control Center requires an active SUPER_ADMIN, COMMUNITY_ADMIN, or MODERATOR account.');
      }

      setUser(result.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
      setError(null);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, logout, clearError }}>
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

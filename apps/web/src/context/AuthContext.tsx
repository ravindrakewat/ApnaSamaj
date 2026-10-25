import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '@apnasamaj/shared-types';
import { RegisterInput } from '@apnasamaj/validation';
import { loginApi, registerApi, refreshApi, getMeApi, logoutApi } from '../services/auth.service';
import { disconnectChatSocket } from '../services/chat.socket';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (phone: string, password: string, communitySlug?: string) => Promise<void>;
  register: (data: RegisterInput, communitySlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
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
        const refreshResult = await refreshApi();
        if (!isMounted) return;

        setUser(refreshResult.user);
        setError(null);
      } catch {
        // Unauthenticated or expired session - normal initial state
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

  const login = async (phone: string, password: string, communitySlug?: string): Promise<void> => {
    setError(null);
    try {
      const result = await loginApi(phone, password, communitySlug);
      setUser(result.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
      throw err;
    }
  };

  const register = async (data: RegisterInput, communitySlug?: string): Promise<void> => {
    setError(null);
    try {
      const result = await registerApi(data, communitySlug);
      setUser(result.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(message);
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await logoutApi();
    } finally {
      disconnectChatSocket();
      setUser(null);
      setError(null);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        login,
        register,
        logout,
        clearError,
        setUser,
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

import { apiClient } from './client';
import { ApiResponse } from './types';
import {
  LoginResponseData,
  RegisterResponseData,
  RefreshResponseData,
  AuthUser,
} from '@apnasamaj/shared-types';

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface RegisterPayload {
  phone: string;
  password: string;
  fullName: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  city?: string;
  state?: string;
  subCaste?: string;
  gotra?: string;
}

/**
 * Authentication Endpoints matching backend `/api/v1/auth` contracts.
 */
export const authApi = {
  /**
   * Logs in with phone and password.
   * Receives accessToken, refreshToken, and basic User profile.
   */
  async login(payload: LoginPayload, communitySlug?: string): Promise<LoginResponseData> {
    const response = await apiClient.post<ApiResponse<LoginResponseData>>(
      '/auth/login',
      payload,
      { skipAuth: true, communitySlug }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Login failed.');
    }
    return response.data;
  },

  /**
   * Registers a new member account.
   */
  async register(payload: RegisterPayload, communitySlug?: string): Promise<RegisterResponseData> {
    const response = await apiClient.post<ApiResponse<RegisterResponseData>>(
      '/auth/register',
      payload,
      { skipAuth: true, communitySlug }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Registration failed.');
    }
    return response.data;
  },

  /**
   * Fetches the current authenticated user profile and permissions.
   */
  async getMe(): Promise<AuthUser> {
    const response = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch current user profile.');
    }
    return response.data;
  },

  /**
   * Rotates session refresh token. Returns new access token, rotated refresh token, and user profile.
   */
  async refresh(refreshToken: string, communitySlug?: string): Promise<RefreshResponseData> {
    const response = await apiClient.post<ApiResponse<RefreshResponseData>>(
      '/auth/refresh',
      { refreshToken },
      { skipAuth: true, communitySlug }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to refresh authentication session.');
    }
    return response.data;
  },

  /**
   * Logs out from server session and revokes refresh token on backend.
   */
  async logout(refreshToken?: string): Promise<void> {
    try {
      await apiClient.post<ApiResponse<void>>(
        '/auth/logout',
        refreshToken ? { refreshToken } : undefined
      );
    } catch {
      // Best-effort server notification; local session will be purged regardless
    }
  },

  /**
   * Requests password reset instructions for the provided phone number.
   * Returns a generic anti-enumeration response matching the backend contract.
   */
  async forgotPassword(phone: string, communitySlug?: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<ApiResponse<void>>(
      '/auth/forgot-password',
      { phone },
      { skipAuth: true, communitySlug }
    );
    return {
      success: true,
      message:
        response.message ||
        'If an account is associated with this phone number, password reset instructions have been sent.',
    };
  },

  /**
   * Verifies whether a password reset token is active and unexpired.
   */
  async verifyResetToken(token: string, communitySlug?: string): Promise<boolean> {
    const response = await apiClient.post<ApiResponse<{ valid: boolean }>>(
      '/auth/verify-reset-token',
      { token },
      { skipAuth: true, communitySlug }
    );
    if (!response.success || !response.data?.valid) {
      throw new Error(response.error || 'Invalid or expired reset token.');
    }
    return true;
  },

  /**
   * Redeems a valid reset token to update the member's password.
   */
  async resetPassword(
    token: string,
    newPassword: string,
    communitySlug?: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post<ApiResponse<void>>(
      '/auth/reset-password',
      { token, newPassword },
      { skipAuth: true, communitySlug }
    );
    if (!response.success) {
      throw new Error(response.error || 'Failed to reset password.');
    }
    return {
      success: true,
      message:
        response.message ||
        'Password has been reset successfully. Please log in with your new password.',
    };
  },
};

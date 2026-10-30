import {
  AuthUser,
  LoginResponseData,
  RegisterResponseData,
  RefreshResponseData,
  VerifyResetTokenResponseData,
  ResetPasswordRequest,
} from '@apnasamaj/shared-types';
import { RegisterInput } from '@apnasamaj/validation';
import {
  apiFetch,
  setInMemoryToken,
  clearAuthSession,
  executeTokenRefresh,
  setActiveCommunitySlug,
} from './api.client';

export async function loginApi(
  phone: string,
  password: string,
  communitySlug?: string
): Promise<LoginResponseData> {
  if (communitySlug) {
    setActiveCommunitySlug(communitySlug);
  }

  const response = await apiFetch<LoginResponseData>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Authentication failed. Please check your credentials.');
  }

  setInMemoryToken(response.data.accessToken);
  if (response.data.user.communitySlug) {
    setActiveCommunitySlug(response.data.user.communitySlug);
  }
  return response.data;
}

export async function registerApi(
  data: RegisterInput,
  communitySlug?: string
): Promise<RegisterResponseData> {
  if (communitySlug) {
    setActiveCommunitySlug(communitySlug);
  }

  const response = await apiFetch<RegisterResponseData>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Registration failed. Please check your input.');
  }

  setInMemoryToken(response.data.accessToken);
  if (response.data.user.communitySlug) {
    setActiveCommunitySlug(response.data.user.communitySlug);
  }
  return response.data;
}

export async function refreshApi(): Promise<RefreshResponseData> {
  return executeTokenRefresh();
}

export async function getMeApi(): Promise<AuthUser> {
  const response = await apiFetch<AuthUser>('/api/v1/auth/me', {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to retrieve authenticated user profile.');
  }

  return response.data;
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch('/api/v1/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearAuthSession();
  }
}

/**
 * Initiates the self-service password reset flow by providing the registered phone number.
 * Always returns generic message to prevent account enumeration.
 */
export async function forgotPasswordApi(
  phone: string,
  communitySlug?: string
): Promise<{ message: string }> {
  if (communitySlug) {
    setActiveCommunitySlug(communitySlug);
  }

  const response = await apiFetch<{ message?: string }>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to submit password reset request. Please try again.');
  }

  return {
    message:
      response.message ||
      'If an account is associated with this phone number, password reset instructions have been sent.',
  };
}

/**
 * Preflight token usability check to determine whether the reset link is valid and active.
 */
export async function verifyResetTokenApi(
  token: string,
  communitySlug?: string
): Promise<VerifyResetTokenResponseData> {
  if (communitySlug) {
    setActiveCommunitySlug(communitySlug);
  }

  const response = await apiFetch<VerifyResetTokenResponseData>('/api/v1/auth/verify-reset-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

  if (!response.success || !response.data) {
    throw new Error(
      response.error || 'The password reset link is invalid, has expired, or has already been used.'
    );
  }

  return response.data;
}

/**
 * Submits the new password with the one-time reset token.
 */
export async function resetPasswordApi(
  data: ResetPasswordRequest,
  communitySlug?: string
): Promise<{ message: string }> {
  if (communitySlug) {
    setActiveCommunitySlug(communitySlug);
  }

  const response = await apiFetch<{ message?: string }>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success) {
    throw new Error(
      response.error || 'The password reset link is invalid, has expired, or has already been used.'
    );
  }

  return {
    message:
      response.message ||
      'Password has been reset successfully. Please log in with your new password.',
  };
}

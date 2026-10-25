import {
  AuthUser,
  LoginResponseData,
  RegisterResponseData,
  RefreshResponseData,
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

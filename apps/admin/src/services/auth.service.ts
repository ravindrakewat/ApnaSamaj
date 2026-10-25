import { ApiResponse, AuthUser, LoginResponseData, RefreshResponseData } from '@apnasamaj/shared-types';
import { apiFetch, setInMemoryToken, clearAuthSession, executeTokenRefresh } from './api.client';

export async function loginApi(phone: string, password: string): Promise<LoginResponseData> {
  const response = await apiFetch<LoginResponseData>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Authentication failed. Please check your credentials.');
  }

  setInMemoryToken(response.data.accessToken);
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

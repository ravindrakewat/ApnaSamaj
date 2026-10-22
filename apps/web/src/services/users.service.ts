import { CurrentMemberProfile, PublicMemberProfile } from '@apnasamaj/shared-types';
import { UpdateProfileInput } from '@apnasamaj/validation';
import { apiFetch } from './api.client';

export async function getMyProfileApi(): Promise<CurrentMemberProfile> {
  const response = await apiFetch<CurrentMemberProfile>('/api/v1/users/me/profile', {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch member profile.');
  }

  return response.data;
}

export async function updateMyProfileApi(
  data: UpdateProfileInput
): Promise<CurrentMemberProfile> {
  const response = await apiFetch<CurrentMemberProfile>('/api/v1/users/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update profile.');
  }

  return response.data;
}

export async function uploadAvatarApi(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch<{ avatarUrl: string }>('/api/v1/users/me/avatar', {
    method: 'POST',
    body: formData,
  });

  if (!response.success || !response.data?.avatarUrl) {
    throw new Error(response.error || 'Failed to upload profile avatar.');
  }

  return response.data.avatarUrl;
}

export async function getPublicProfileApi(userId: string): Promise<PublicMemberProfile> {
  const response = await apiFetch<PublicMemberProfile>(`/api/v1/users/${userId}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch member profile.');
  }

  return response.data;
}


import { CurrentMemberProfile } from '@apnasamaj/shared-types';
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

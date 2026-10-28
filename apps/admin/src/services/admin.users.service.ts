import { AdminUserDetails, ListUsersResponseData } from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export async function fetchAdminUsers(params: ListUsersParams = {}): Promise<ListUsersResponseData> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());
  if (params.role) queryParams.set('role', params.role);
  if (params.status) queryParams.set('status', params.status);

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/admin/users${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<ListUsersResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch members list.');
  }

  return response.data;
}

export async function fetchAdminUserDetails(userId: string): Promise<AdminUserDetails> {
  const response = await apiFetch<AdminUserDetails>(`/api/v1/admin/users/${userId}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch member details.');
  }

  return response.data;
}

export async function updateAdminUserStatus(
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED',
  reason?: string
): Promise<AdminUserDetails> {
  const response = await apiFetch<AdminUserDetails>(`/api/v1/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update member status.');
  }

  return response.data;
}

export async function updateAdminUserRole(
  userId: string,
  role: 'MEMBER' | 'MODERATOR' | 'COMMUNITY_ADMIN',
  reason?: string
): Promise<AdminUserDetails> {
  const response = await apiFetch<AdminUserDetails>(`/api/v1/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role, reason }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update member role.');
  }

  return response.data;
}


import {
  GroupListItem,
  GroupDetails,
  ListGroupsResponseData,
  CreateGroupInput,
  UpdateGroupInput,
  GroupMemberRole,
  ListGroupMembersResponseData,
  GroupMemberItem,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface FetchAdminGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
  privacy?: string;
}

/**
 * Fetches groups list for administration with pagination and search.
 */
export async function fetchAdminGroups(
  params: FetchAdminGroupsParams = {}
): Promise<ListGroupsResponseData> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/groups${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<ListGroupsResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch groups list.');
  }

  return response.data;
}

/**
 * Fetches detailed group information by slug or ID.
 */
export async function fetchAdminGroupBySlug(slug: string): Promise<GroupDetails> {
  const response = await apiFetch<GroupDetails>(`/api/v1/groups/${slug}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch group details.');
  }

  return response.data;
}

/**
 * Creates a new community group.
 */
export async function createAdminGroup(input: CreateGroupInput): Promise<GroupDetails> {
  const response = await apiFetch<GroupDetails>('/api/v1/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to create group.');
  }

  return response.data;
}

/**
 * Updates an existing group settings (name, description, privacy, rules).
 */
export async function updateAdminGroup(
  id: string,
  input: UpdateGroupInput
): Promise<GroupDetails> {
  const response = await apiFetch<GroupDetails>(`/api/v1/groups/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update group.');
  }

  return response.data;
}

/**
 * Deletes a community group.
 */
export async function deleteAdminGroup(id: string): Promise<void> {
  const response = await apiFetch<{ message: string }>(`/api/v1/groups/${id}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete group.');
  }
}

/**
 * Fetches group members roster.
 */
export async function fetchAdminGroupMembers(
  groupId: string,
  page: number = 1,
  limit: number = 50
): Promise<ListGroupMembersResponseData> {
  const response = await apiFetch<ListGroupMembersResponseData>(
    `/api/v1/groups/${groupId}/members?page=${page}&limit=${limit}`,
    {
      method: 'GET',
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch group members.');
  }

  return response.data;
}

/**
 * Updates member role inside a group.
 */
export async function updateAdminGroupMemberRole(
  groupId: string,
  userId: string,
  role: GroupMemberRole | 'ADMIN' | 'MODERATOR' | 'MEMBER'
): Promise<void> {
  const response = await apiFetch(`/api/v1/groups/${groupId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to update group member role.');
  }
}

/**
 * Removes a member from a group.
 */
export async function removeAdminGroupMember(
  groupId: string,
  userId: string
): Promise<void> {
  const response = await apiFetch(`/api/v1/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to remove member from group.');
  }
}

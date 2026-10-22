import {
  GroupDetails,
  ListGroupsResponseData,
  CreateGroupInput,
  UpdateGroupInput,
  GroupMemberRole,
  GroupMemberActionResult,
  FeedResponseData,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface ListGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
  privacy?: 'PUBLIC' | 'PRIVATE';
}

export async function fetchGroups(params: ListGroupsParams = {}): Promise<ListGroupsResponseData> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());
  if (params.privacy) queryParams.set('privacy', params.privacy);

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/groups${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<ListGroupsResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch groups.');
  }

  return response.data;
}

export async function fetchGroupBySlug(slug: string): Promise<GroupDetails> {
  const response = await apiFetch<GroupDetails>(`/api/v1/groups/${slug}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch group details.');
  }

  return response.data;
}

export async function createGroupApi(input: CreateGroupInput): Promise<GroupDetails> {
  const response = await apiFetch<GroupDetails>('/api/v1/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to create group.');
  }

  return response.data;
}

export async function joinGroupApi(groupId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/groups/${groupId}/join`, {
    method: 'POST',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to join group.');
  }
}

export async function leaveGroupApi(groupId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/groups/${groupId}/leave`, {
    method: 'POST',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to leave group.');
  }
}

export async function fetchGroupPosts(slug: string, page: number = 1): Promise<FeedResponseData> {
  const response = await apiFetch<FeedResponseData>(`/api/v1/groups/${slug}/posts?page=${page}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch group discussions.');
  }

  return response.data;
}

export async function updateGroupApi(groupId: string, input: UpdateGroupInput): Promise<GroupDetails> {
  const response = await apiFetch<GroupDetails>(`/api/v1/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update group settings.');
  }

  return response.data;
}

export async function uploadGroupCoverApi(groupId: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch<{ coverUrl: string }>(`/api/v1/groups/${groupId}/cover`, {
    method: 'POST',
    body: formData,
  });

  if (!response.success || !response.data?.coverUrl) {
    throw new Error(response.error || 'Failed to upload cover image.');
  }

  return response.data.coverUrl;
}

export async function updateMemberRoleApi(
  groupId: string,
  userId: string,
  role: GroupMemberRole
): Promise<GroupMemberActionResult> {
  const response = await apiFetch<GroupMemberActionResult>(`/api/v1/groups/${groupId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to update member role.');
  }

  return response.data;
}

export async function removeMemberApi(groupId: string, userId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to remove member.');
  }
}


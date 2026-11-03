import { apiClient } from './client';
import {
  ApiResponse,
  ListGroupsResponseData,
  GroupDetails,
  GroupMemberRole,
  CreateGroupInput,
  UpdateGroupInput,
  PostItem,
} from '@apnasamaj/shared-types';

export interface ListGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
  privacy?: 'PUBLIC' | 'PRIVATE';
}

export interface GroupPostsResponseData {
  posts: PostItem[];
  pagination: {
    page: number;
    limit: number;
    totalPosts: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const groupsApi = {
  /**
   * Lists community groups with pagination, search, and privacy filtering.
   * Strictly scoped to caller's tenant community via x-community-slug.
   */
  async listGroups(params: ListGroupsParams = {}): Promise<ListGroupsResponseData> {
    const queryParams: Record<string, string | number | undefined> = {
      page: params.page || 1,
      limit: params.limit || 12,
    };

    if (params.search?.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.privacy) {
      queryParams.privacy = params.privacy;
    }

    const response = await apiClient.get<ApiResponse<ListGroupsResponseData>>('/groups', {
      params: queryParams,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch community groups.');
    }

    return response.data;
  },

  /**
   * Retrieves full group details by slug.
   * Private groups hide internal member roster from non-members.
   */
  async getGroupBySlug(slug: string): Promise<GroupDetails> {
    if (!slug || !slug.trim()) {
      throw new Error('Group slug is required.');
    }

    const response = await apiClient.get<ApiResponse<GroupDetails>>(
      `/groups/${encodeURIComponent(slug.trim())}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to retrieve group details.');
    }

    return response.data;
  },

  /**
   * Retrieves discussion posts for a specific group.
   * Private groups strictly enforce membership authorization on backend.
   */
  async getGroupPosts(
    slug: string,
    page: number = 1,
    limit: number = 10
  ): Promise<GroupPostsResponseData> {
    if (!slug || !slug.trim()) {
      throw new Error('Group slug is required.');
    }

    const response = await apiClient.get<ApiResponse<GroupPostsResponseData>>(
      `/groups/${encodeURIComponent(slug.trim())}/posts`,
      {
        params: { page, limit },
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to retrieve group discussions.');
    }

    return response.data;
  },

  /**
   * Joins a public group.
   * Private groups reject direct self-joining without invitation or approval.
   */
  async joinGroup(
    groupId: string
  ): Promise<{ success: boolean; message: string; role: GroupMemberRole }> {
    if (!groupId || !groupId.trim()) {
      throw new Error('Group ID is required to join.');
    }

    const response = await apiClient.post<
      ApiResponse<{ success: boolean; message: string; role: GroupMemberRole }>
    >(`/groups/${encodeURIComponent(groupId.trim())}/join`);

    if (!response.success) {
      throw new Error(response.error || 'Failed to join group.');
    }

    return response.data || { success: true, message: 'Joined group successfully.', role: 'MEMBER' as GroupMemberRole };
  },

  /**
   * Leaves a group.
   * Sole administrators cannot leave without transferring admin ownership.
   */
  async leaveGroup(groupId: string): Promise<{ success: boolean; message: string }> {
    if (!groupId || !groupId.trim()) {
      throw new Error('Group ID is required to leave.');
    }

    const response = await apiClient.post<ApiResponse<{ success: boolean; message: string }>>(
      `/groups/${encodeURIComponent(groupId.trim())}/leave`
    );

    if (!response.success) {
      throw new Error(response.error || 'Failed to leave group.');
    }

    return response.data || { success: true, message: 'Left group successfully.' };
  },

  /**
   * Creates a new community group.
   */
  async createGroup(input: CreateGroupInput): Promise<GroupDetails> {
    const response = await apiClient.post<ApiResponse<GroupDetails>>('/groups', input);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to create group.');
    }

    return response.data;
  },

  /**
   * Updates group settings (name, description, privacy, coverUrl).
   * Restricted to group ADMIN.
   */
  async updateGroup(groupId: string, input: UpdateGroupInput): Promise<GroupDetails> {
    const response = await apiClient.patch<ApiResponse<GroupDetails>>(
      `/groups/${encodeURIComponent(groupId.trim())}`,
      input
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update group.');
    }

    return response.data;
  },
};


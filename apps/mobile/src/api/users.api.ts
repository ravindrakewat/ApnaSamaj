import { apiClient } from './client';
import {
  ApiResponse,
  DirectoryResponseData,
  PublicMemberProfile,
  CurrentMemberProfile,
} from '@apnasamaj/shared-types';
import { UpdateProfileInput } from '@apnasamaj/validation';

export interface DirectoryFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  state?: string;
  gotra?: string;
  subCaste?: string;
}

export const usersApi = {
  /**
   * Fetches paginated community directory members with optional filters.
   * Only ACTIVE members are returned.
   * Strictly scoped to the caller's tenant community database via x-community-slug.
   */
  async getDirectory(params: DirectoryFilterParams = {}): Promise<DirectoryResponseData> {
    const queryParams: Record<string, string | number | undefined> = {
      page: params.page || 1,
      limit: params.limit || 12,
    };

    if (params.search?.trim()) {
      queryParams.search = params.search.trim();
    }
    if (params.city?.trim()) {
      queryParams.city = params.city.trim();
    }
    if (params.state?.trim()) {
      queryParams.state = params.state.trim();
    }
    if (params.gotra?.trim()) {
      queryParams.gotra = params.gotra.trim();
    }
    if (params.subCaste?.trim()) {
      queryParams.subCaste = params.subCaste.trim();
    }

    const response = await apiClient.get<ApiResponse<DirectoryResponseData>>('/users', {
      params: queryParams,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch directory members.');
    }

    return response.data;
  },

  /**
   * Retrieves public profile information for a community member by UUID.
   * Only ACTIVE members are discoverable; never exposes phone numbers, emails, or sensitive hashes.
   */
  async getPublicProfile(userId: string): Promise<PublicMemberProfile> {
    if (!userId || !userId.trim()) {
      throw new Error('Member ID is required to fetch profile.');
    }

    const response = await apiClient.get<ApiResponse<PublicMemberProfile>>(
      `/users/${encodeURIComponent(userId.trim())}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch member profile.');
    }

    return response.data;
  },

  /**
   * Retrieves the current authenticated member's full profile details.
   * Scoped to the caller's tenant community database via x-community-slug header.
   */
  async getMyProfile(): Promise<CurrentMemberProfile> {
    const response = await apiClient.get<ApiResponse<CurrentMemberProfile>>('/users/me/profile');

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch personal profile.');
    }

    return response.data;
  },

  /**
   * Updates allowed personal profile fields (fullName, gender, bio, city, state, subCaste, gotra).
   */
  async updateMyProfile(data: UpdateProfileInput): Promise<CurrentMemberProfile> {
    const response = await apiClient.patch<ApiResponse<CurrentMemberProfile>>('/users/me/profile', data);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to update profile.');
    }

    return response.data;
  },

  /**
   * Uploads a new profile avatar photo to Supabase storage.
   */
  async uploadAvatar(file: {
    uri: string;
    name: string;
    type: string;
  }): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await apiClient.upload<ApiResponse<{ avatarUrl: string }>>(
      '/users/me/avatar',
      formData
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload profile avatar.');
    }

    return response.data;
  },
};


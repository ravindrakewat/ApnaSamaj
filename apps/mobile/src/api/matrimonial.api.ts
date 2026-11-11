import { apiClient } from './client';
import {
  ApiResponse,
  PublicMatrimonialProfileListItem,
  PublicMatrimonialProfileDetail,
  PaginatedMatrimonialProfilesResponse,
  MatrimonialInterestItem,
  PaginatedMatrimonialInterestsResponse,
  OwnMatrimonialProfile,
  MatrimonialPartnerPreferenceItem,
  MatrimonialPhotoItem,
  MatrimonialInterestStatus,
} from '@apnasamaj/shared-types';
import {
  UpsertMatrimonialProfileInput,
  UpdatePartnerPreferenceInput,
} from '@apnasamaj/validation';

export interface MatrimonialFilterParams {
  page?: number;
  limit?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  minAge?: number;
  maxAge?: number;
  minHeightCm?: number;
  maxHeightCm?: number;
  maritalStatus?: string;
  city?: string;
  state?: string;
  subCaste?: string;
  gotra?: string;
  manglik?: string;
  diet?: string;
  education?: string;
  occupation?: string;
}

export interface SendInterestPayload {
  receiverId: string;
  message?: string;
}

export interface ReportProfilePayload {
  reason: string;
  explanation?: string;
}

export const matrimonialApi = {
  /**
   * Fetches paginated matrimonial profiles for discovery with safe filters.
   * Only APPROVED profiles are returned; blocked users are automatically excluded by backend.
   * Strictly scoped to the caller's tenant community database via x-community-slug header.
   */
  async listProfiles(params: MatrimonialFilterParams = {}): Promise<PaginatedMatrimonialProfilesResponse> {
    const queryParams: Record<string, string | number | undefined> = {
      page: params.page || 1,
      limit: params.limit || 12,
    };

    if (params.gender) queryParams.gender = params.gender;
    if (params.minAge) queryParams.minAge = params.minAge;
    if (params.maxAge) queryParams.maxAge = params.maxAge;
    if (params.minHeightCm) queryParams.minHeightCm = params.minHeightCm;
    if (params.maxHeightCm) queryParams.maxHeightCm = params.maxHeightCm;
    if (params.maritalStatus) queryParams.maritalStatus = params.maritalStatus;
    if (params.city?.trim()) queryParams.city = params.city.trim();
    if (params.state?.trim()) queryParams.state = params.state.trim();
    if (params.subCaste?.trim()) queryParams.subCaste = params.subCaste.trim();
    if (params.gotra?.trim()) queryParams.gotra = params.gotra.trim();
    if (params.manglik) queryParams.manglik = params.manglik;
    if (params.diet) queryParams.diet = params.diet;
    if (params.education?.trim()) queryParams.education = params.education.trim();
    if (params.occupation?.trim()) queryParams.occupation = params.occupation.trim();

    const response = await apiClient.get<ApiResponse<PaginatedMatrimonialProfilesResponse>>('/matrimonial/profiles', {
      params: queryParams,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch matrimonial profiles.');
    }

    return response.data;
  },

  /**
   * Retrieves public details for a single matrimonial profile by profile UUID.
   * Contact details are revealed ONLY if an interest request has been mutually accepted.
   */
  async getProfileById(profileId: string): Promise<PublicMatrimonialProfileDetail> {
    if (!profileId || profileId.trim().length === 0) {
      throw new Error('Matrimonial profile ID is required.');
    }

    const response = await apiClient.get<ApiResponse<PublicMatrimonialProfileDetail>>(
      `/matrimonial/profiles/${profileId.trim()}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch matrimonial profile details.');
    }

    return response.data;
  },

  /**
   * Sends an interest / connection request to another community member.
   * Validates non-self and non-duplicate server-side.
   */
  async sendInterest(data: SendInterestPayload): Promise<MatrimonialInterestItem> {
    if (!data.receiverId) {
      throw new Error('Receiver ID is required to send interest.');
    }

    const response = await apiClient.post<ApiResponse<MatrimonialInterestItem>>('/matrimonial/interests', {
      receiverId: data.receiverId,
      message: data.message?.trim() || undefined,
    });

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to send interest request.');
    }

    return response.data;
  },

  /**
   * Lists received matrimonial interest requests for the authenticated user.
   */
  async listReceivedInterests(page: number = 1, limit: number = 20): Promise<PaginatedMatrimonialInterestsResponse> {
    const response = await apiClient.get<ApiResponse<PaginatedMatrimonialInterestsResponse>>(
      '/matrimonial/interests/received',
      { params: { page, limit } }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch received interests.');
    }

    return response.data;
  },

  /**
   * Lists sent matrimonial interest requests initiated by the authenticated user.
   */
  async listSentInterests(page: number = 1, limit: number = 20): Promise<PaginatedMatrimonialInterestsResponse> {
    const response = await apiClient.get<ApiResponse<PaginatedMatrimonialInterestsResponse>>(
      '/matrimonial/interests/sent',
      { params: { page, limit } }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch sent interests.');
    }

    return response.data;
  },

  /**
   * Responds to an incoming interest request (ACCEPTED, DECLINED, WITHDRAWN).
   */
  async respondInterest(
    interestId: string,
    status: 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'
  ): Promise<MatrimonialInterestItem> {
    if (!interestId) {
      throw new Error('Interest ID is required.');
    }

    const response = await apiClient.patch<ApiResponse<MatrimonialInterestItem>>(
      `/matrimonial/interests/${interestId}`,
      { status }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to respond to interest.');
    }

    return response.data;
  },

  /**
   * Submits a report against a suspicious or abusive matrimonial profile.
   */
  async reportProfile(profileId: string, data: ReportProfilePayload): Promise<void> {
    if (!profileId) {
      throw new Error('Profile ID is required.');
    }

    const response = await apiClient.post<ApiResponse<void>>(`/matrimonial/profiles/${profileId}/report`, {
      reason: data.reason,
      explanation: data.explanation?.trim() || undefined,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to submit profile report.');
    }
  },

  /**
   * Blocks a matrimonial candidate from discovery and messaging.
   */
  async blockProfile(profileId: string): Promise<void> {
    if (!profileId) {
      throw new Error('Profile ID is required.');
    }

    const response = await apiClient.post<ApiResponse<void>>(`/matrimonial/profiles/${profileId}/block`);

    if (!response.success) {
      throw new Error(response.error || 'Failed to block matrimonial profile.');
    }
  },

  /**
   * Unblocks a previously blocked candidate.
   */
  async unblockProfile(profileId: string): Promise<void> {
    if (!profileId) {
      throw new Error('Profile ID is required.');
    }

    const response = await apiClient.delete<ApiResponse<void>>(`/matrimonial/profiles/${profileId}/block`);

    if (!response.success) {
      throw new Error(response.error || 'Failed to unblock matrimonial profile.');
    }
  },

  /**
   * Retrieves the current user's own matrimonial profile.
   */
  async getMyProfile(): Promise<OwnMatrimonialProfile | null> {
    const response = await apiClient.get<ApiResponse<OwnMatrimonialProfile | null>>('/matrimonial/me');

    if (!response.success) {
      throw new Error(response.error || 'Failed to retrieve own matrimonial profile.');
    }

    return response.data ?? null;
  },

  /**
   * Creates or updates the authenticated member's matrimonial profile.
   */
  async upsertMyProfile(data: UpsertMatrimonialProfileInput): Promise<OwnMatrimonialProfile> {
    const response = await apiClient.put<ApiResponse<OwnMatrimonialProfile>>('/matrimonial/me', data);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to save matrimonial profile.');
    }

    return response.data;
  },

  /**
   * Submits the authenticated member's matrimonial profile for admin approval.
   */
  async submitMyProfile(): Promise<OwnMatrimonialProfile> {
    const response = await apiClient.post<ApiResponse<OwnMatrimonialProfile>>('/matrimonial/me/submit');

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to submit matrimonial profile for approval.');
    }

    return response.data;
  },

  /**
   * Creates or updates partner preferences for the member's matrimonial profile.
   */
  async upsertMyPreferences(data: UpdatePartnerPreferenceInput): Promise<MatrimonialPartnerPreferenceItem> {
    const response = await apiClient.put<ApiResponse<MatrimonialPartnerPreferenceItem>>(
      '/matrimonial/me/preferences',
      data
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to save partner preferences.');
    }

    return response.data;
  },

  /**
   * Uploads a gallery photo to the user's matrimonial profile (max 5 photos).
   */
  async uploadPhoto(
    file: { uri: string; name: string; type: string },
    isPrimary?: boolean
  ): Promise<MatrimonialPhotoItem> {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    if (isPrimary !== undefined) {
      formData.append('isPrimary', String(isPrimary));
    }

    const response = await apiClient.upload<ApiResponse<MatrimonialPhotoItem>>(
      '/matrimonial/me/photos',
      formData
    );

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to upload matrimonial photo.');
    }

    return response.data;
  },

  /**
   * Deletes a gallery photo from the user's matrimonial profile.
   */
  async deletePhoto(photoId: string): Promise<void> {
    if (!photoId) {
      throw new Error('Photo ID is required.');
    }

    const response = await apiClient.delete<ApiResponse<void>>(`/matrimonial/me/photos/${photoId}`);

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete matrimonial photo.');
    }
  },
};


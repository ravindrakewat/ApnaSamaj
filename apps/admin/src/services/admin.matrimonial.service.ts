import {
  AdminMatrimonialProfileDetail,
  PaginatedAdminMatrimonialProfilesResponse,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface AdminMatrimonialApiError extends Error {
  isMigrationPending?: boolean;
  statusCode?: number;
}

function checkMigrationPending(msg: string): boolean {
  return (
    msg.includes('migration pending') ||
    msg.includes('temporarily offline') ||
    msg.includes('database migration')
  );
}

export interface ListAdminMatrimonialParams {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Fetches matrimonial profiles awaiting moderation or filtered by status.
 */
export async function fetchAdminMatrimonialProfiles(
  params: ListAdminMatrimonialParams = {}
): Promise<PaginatedAdminMatrimonialProfilesResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search && params.search.trim()) query.set('search', params.search.trim());

  const queryString = query.toString();
  const endpoint = `/api/v1/admin/matrimonial/profiles${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<PaginatedAdminMatrimonialProfilesResponse>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch matrimonial profiles queue.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Fetches detailed matrimonial profile and photo preview for administrative review.
 */
export async function fetchAdminMatrimonialProfileDetails(
  profileId: string
): Promise<AdminMatrimonialProfileDetail> {
  const response = await apiFetch<AdminMatrimonialProfileDetail>(
    `/api/v1/admin/matrimonial/profiles/${profileId}`,
    {
      method: 'GET',
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch profile details.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Approves, rejects, or hides a matrimonial profile.
 */
export async function moderateAdminMatrimonialProfile(
  profileId: string,
  status: 'APPROVED' | 'REJECTED' | 'HIDDEN',
  rejectionReason?: string
): Promise<AdminMatrimonialProfileDetail> {
  const response = await apiFetch<AdminMatrimonialProfileDetail>(
    `/api/v1/admin/matrimonial/profiles/${profileId}/moderation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason }),
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || `Failed to update profile to ${status}.`;
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Approves or hides an individual matrimonial photo.
 */
export async function moderateAdminMatrimonialPhoto(
  photoId: string,
  isApproved: boolean
): Promise<{ id: string; isApproved: boolean }> {
  const response = await apiFetch<{ id: string; isApproved: boolean }>(
    `/api/v1/admin/matrimonial/photos/${photoId}/moderation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ isApproved }),
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to moderate photo.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

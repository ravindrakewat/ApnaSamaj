import {
  OwnMatrimonialProfile,
  MatrimonialPartnerPreferenceItem,
  MatrimonialPhotoItem,
  PaginatedMatrimonialProfilesResponse,
  PublicMatrimonialProfileDetail,
  MatrimonialInterestItem,
  PaginatedMatrimonialInterestsResponse,
} from '@apnasamaj/shared-types';
import {
  UpsertMatrimonialProfileInput,
  UpdatePartnerPreferenceInput,
  ListMatrimonialProfilesQueryInput,
  SendMatrimonialInterestInput,
  RespondMatrimonialInterestInput,
} from '@apnasamaj/validation';
import { apiFetch } from './api.client';

export interface MatrimonialApiError extends Error {
  isMigrationPending?: boolean;
  isConflict?: boolean;
  isForbidden?: boolean;
  statusCode?: number;
}

/**
 * Helper to identify if an error is due to an unapplied database migration.
 */
function checkMigrationPending(msg: string): boolean {
  return (
    msg.includes('migration pending') ||
    msg.includes('temporarily offline') ||
    msg.includes('database migration')
  );
}

/**
 * Fetches the authenticated member's own matrimonial profile.
 * Returns null if the profile has not been created yet.
 * Throws MatrimonialApiError with isMigrationPending = true if database migration is pending (HTTP 503).
 */
export async function getMyMatrimonialProfileApi(): Promise<OwnMatrimonialProfile | null> {
  const response = await apiFetch<OwnMatrimonialProfile | null>('/api/v1/matrimonial/me', {
    method: 'GET',
  });

  if (!response.success) {
    const errorMsg = response.error || 'Failed to fetch matrimonial profile.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data ?? null;
}

/**
 * Creates or updates the authenticated member's matrimonial profile.
 */
export async function updateMyMatrimonialProfileApi(
  data: UpsertMatrimonialProfileInput
): Promise<OwnMatrimonialProfile> {
  const response = await apiFetch<OwnMatrimonialProfile>('/api/v1/matrimonial/me', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to save matrimonial profile.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Submits the authenticated member's matrimonial profile for community admin approval.
 * Allowed only from DRAFT or REJECTED status.
 */
export async function submitMyMatrimonialProfileApi(): Promise<OwnMatrimonialProfile> {
  const response = await apiFetch<OwnMatrimonialProfile>('/api/v1/matrimonial/me/submit', {
    method: 'POST',
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to submit matrimonial profile for approval.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Creates or updates partner preferences for the member's matrimonial profile.
 */
export async function updateMyPartnerPreferencesApi(
  data: UpdatePartnerPreferenceInput
): Promise<MatrimonialPartnerPreferenceItem> {
  const response = await apiFetch<MatrimonialPartnerPreferenceItem>(
    '/api/v1/matrimonial/me/preferences',
    {
      method: 'PUT',
      body: JSON.stringify(data),
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to save partner preferences.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Uploads a photo to the member's matrimonial gallery (limit 5).
 */
export async function uploadMatrimonialPhotoApi(
  file: File,
  isPrimary?: boolean
): Promise<MatrimonialPhotoItem> {
  const formData = new FormData();
  formData.append('file', file);
  if (isPrimary !== undefined) {
    formData.append('isPrimary', String(isPrimary));
  }

  const response = await apiFetch<MatrimonialPhotoItem>('/api/v1/matrimonial/me/photos', {
    method: 'POST',
    body: formData,
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to upload matrimonial photo.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Deletes a matrimonial photo by ID.
 */
export async function deleteMatrimonialPhotoApi(photoId: string): Promise<void> {
  const response = await apiFetch<void>(`/api/v1/matrimonial/me/photos/${photoId}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    const errorMsg = response.error || 'Failed to delete matrimonial photo.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }
}

/**
 * Fetches discovery profiles with multi-criteria filters and pagination.
 */
export async function listDiscoveryProfilesApi(
  params: Partial<ListMatrimonialProfilesQueryInput> = {}
): Promise<PaginatedMatrimonialProfilesResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.append(key, String(value));
    }
  }

  const queryString = query.toString();
  const endpoint = `/api/v1/matrimonial/profiles${queryString ? `?${queryString}` : ''}`;
  const response = await apiFetch<PaginatedMatrimonialProfilesResponse>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch matrimonial discovery profiles.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Fetches public details for a single matrimonial profile by ID.
 * Contact details will only be present if authorized by a mutually accepted interest.
 */
export async function getDiscoveryProfileByIdApi(
  profileId: string
): Promise<PublicMatrimonialProfileDetail> {
  const response = await apiFetch<PublicMatrimonialProfileDetail>(
    `/api/v1/matrimonial/profiles/${profileId}`,
    {
      method: 'GET',
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch matrimonial profile details.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Sends a matrimonial interest / connection request to another member.
 */
export async function sendMatrimonialInterestApi(
  data: SendMatrimonialInterestInput
): Promise<MatrimonialInterestItem> {
  const response = await apiFetch<MatrimonialInterestItem>('/api/v1/matrimonial/interests', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to send interest request.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    if (
      errorMsg.includes('already') ||
      errorMsg.includes('conflict') ||
      errorMsg.includes('exists')
    ) {
      err.isConflict = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Lists received interest requests for the current authenticated user.
 */
export async function listReceivedInterestsApi(
  page: number = 1,
  limit: number = 10
): Promise<PaginatedMatrimonialInterestsResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await apiFetch<PaginatedMatrimonialInterestsResponse>(
    `/api/v1/matrimonial/interests/received?${query.toString()}`,
    { method: 'GET' }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch received interest requests.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Lists sent interest requests initiated by the current authenticated user.
 */
export async function listSentInterestsApi(
  page: number = 1,
  limit: number = 10
): Promise<PaginatedMatrimonialInterestsResponse> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const response = await apiFetch<PaginatedMatrimonialInterestsResponse>(
    `/api/v1/matrimonial/interests/sent?${query.toString()}`,
    { method: 'GET' }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch sent interest requests.';
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    throw err;
  }

  return response.data;
}

/**
 * Responds to a matrimonial interest request (ACCEPT, DECLINE, WITHDRAW).
 */
export async function respondMatrimonialInterestApi(
  interestId: string,
  status: 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN'
): Promise<MatrimonialInterestItem> {
  const response = await apiFetch<MatrimonialInterestItem>(
    `/api/v1/matrimonial/interests/${interestId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || `Failed to update interest request to ${status}.`;
    const err: MatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) {
      err.isMigrationPending = true;
    }
    if (errorMsg.includes('already') || errorMsg.includes('conflict')) {
      err.isConflict = true;
    }
    if (
      errorMsg.includes('Only the') ||
      errorMsg.includes('unauthorized') ||
      errorMsg.includes('Forbidden')
    ) {
      err.isForbidden = true;
    }
    throw err;
  }

  return response.data;
}

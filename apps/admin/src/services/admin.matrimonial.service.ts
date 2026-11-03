import {
  AdminMatrimonialProfileDetail,
  PaginatedAdminMatrimonialProfilesResponse,
  MatrimonialModerationMetrics,
  MatrimonialDocumentItem,
  MatrimonialReportItem,
  PaginatedAdminMatrimonialDocumentsResponse,
  PaginatedAdminMatrimonialReportsResponse,
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
 * Fetches aggregate metrics for the matrimonial moderation dashboard.
 */
export async function fetchAdminMatrimonialMetrics(): Promise<MatrimonialModerationMetrics> {
  const response = await apiFetch<MatrimonialModerationMetrics>(
    '/api/v1/admin/matrimonial/metrics',
    { method: 'GET' }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch matrimonial metrics.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
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
 * Approves, rejects, hides, or suspends a matrimonial profile.
 */
export async function moderateAdminMatrimonialProfile(
  profileId: string,
  status: 'APPROVED' | 'REJECTED' | 'HIDDEN' | 'SUSPENDED',
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

/**
 * Fetches submitted verification documents queue.
 */
export async function fetchAdminMatrimonialDocuments(params: {
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedAdminMatrimonialDocumentsResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const response = await apiFetch<PaginatedAdminMatrimonialDocumentsResponse>(
    `/api/v1/admin/matrimonial/documents?${query.toString()}`,
    { method: 'GET' }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch verification documents.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
}

/**
 * Generates a short-lived temporary signed URL to view a verification document.
 */
export async function fetchAdminDocumentSignedUrl(
  documentId: string
): Promise<{ signedUrl: string; documentName: string; mimeType: string }> {
  const response = await apiFetch<{ signedUrl: string; documentName: string; mimeType: string }>(
    `/api/v1/admin/matrimonial/documents/${documentId}/signed-url`,
    { method: 'GET' }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to generate document signed URL.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
}

/**
 * Approves or rejects a verification document.
 */
export async function moderateAdminMatrimonialDocument(
  documentId: string,
  status: 'APPROVED' | 'REJECTED',
  rejectionReason?: string
): Promise<MatrimonialDocumentItem> {
  const response = await apiFetch<MatrimonialDocumentItem>(
    `/api/v1/admin/matrimonial/documents/${documentId}/moderation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason }),
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to moderate verification document.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
}

/**
 * Fetches matrimonial profile reports queue.
 */
export async function fetchAdminMatrimonialReports(params: {
  status?: string;
  page?: number;
  limit?: number;
} = {}): Promise<PaginatedAdminMatrimonialReportsResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const response = await apiFetch<PaginatedAdminMatrimonialReportsResponse>(
    `/api/v1/admin/matrimonial/reports?${query.toString()}`,
    { method: 'GET' }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch matrimonial reports.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
}

/**
 * Resolves or dismisses a report, optionally suspending the target profile.
 */
export async function moderateAdminMatrimonialReport(
  reportId: string,
  status: 'UNDER_INVESTIGATION' | 'RESOLVED' | 'DISMISSED',
  adminNotes?: string,
  action?: 'NONE' | 'SUSPEND_PROFILE' | 'REJECT_PROFILE'
): Promise<MatrimonialReportItem> {
  const response = await apiFetch<MatrimonialReportItem>(
    `/api/v1/admin/matrimonial/reports/${reportId}/moderation`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, adminNotes, action }),
    }
  );

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to resolve matrimonial report.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
}

/**
 * Fetches matrimonial moderation audit history.
 */
export async function fetchAdminMatrimonialAuditLogs(params: {
  page?: number;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const response = await apiFetch<{
    logs: {
      id: string;
      actorId: string;
      actorName: string;
      action: string;
      targetType: string;
      targetId: string;
      details: any;
      createdAt: string;
    }[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>(`/api/v1/admin/matrimonial/audit-logs?${query.toString()}`, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    const errorMsg = response.error || 'Failed to fetch matrimonial audit logs.';
    const err: AdminMatrimonialApiError = new Error(errorMsg);
    if (checkMigrationPending(errorMsg)) err.isMigrationPending = true;
    throw err;
  }

  return response.data;
}

import {
  AdminUserDetails,
  ListUsersResponseData,
  BulkImportPreviewSummary,
  BulkImportExecuteResult,
  BulkImportExecuteOptions,
} from '@apnasamaj/shared-types';
import { apiFetch, getInMemoryToken, getActiveCommunitySlug } from './api.client';
import { API_BASE_URL } from '../config/api.config';

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

/**
 * Downloads the official Excel bulk member import template (.xlsx) from backend.
 */
export async function downloadImportTemplate(): Promise<{ blob: Blob; filename: string }> {
  const communitySlug = getActiveCommunitySlug();
  const token = getInMemoryToken();
  const headers: Record<string, string> = {};
  if (communitySlug) headers['X-Community-Slug'] = communitySlug;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/import/template`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = 'Failed to download member import template.';
    try {
      const data = await response.json();
      if (data?.error) errorMsg = data.error;
    } catch {
      // Non-JSON error fallback
    }
    throw new Error(errorMsg);
  }

  const contentDisposition = response.headers.get('content-disposition');
  let filename = 'ApnaSamaj_Member_Import_Template.xlsx';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
    if (match && match[1]) filename = match[1];
  }

  const blob = await response.blob();
  return { blob, filename };
}

/**
 * Executes a dry-run preview of an Excel member roster with zero database writes.
 */
export async function previewBulkImportApi(file: File): Promise<BulkImportPreviewSummary> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch<BulkImportPreviewSummary>('/api/v1/admin/users/import/preview', {
    method: 'POST',
    body: formData,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to generate spreadsheet preview.');
  }

  return response.data;
}

/**
 * Executes atomic chunked member import with Argon2id dummy hashes and audit logging.
 */
export async function executeBulkImportApi(
  file: File,
  options?: BulkImportExecuteOptions
): Promise<BulkImportExecuteResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (options && typeof options.skipExisting !== 'undefined') {
    formData.append('skipExisting', String(options.skipExisting));
  }

  const response = await apiFetch<BulkImportExecuteResult>('/api/v1/admin/users/import/execute', {
    method: 'POST',
    body: formData,
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to execute bulk member import.');
  }

  return response.data;
}

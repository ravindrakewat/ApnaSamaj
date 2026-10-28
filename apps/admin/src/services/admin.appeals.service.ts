import {
  PostAppealItem,
  PostAppealsListResponseData,
  PostAppealStatus,
  ReviewPostAppealRequest,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface ListAdminAppealsParams {
  page?: number;
  limit?: number;
  status?: PostAppealStatus | 'ALL';
}

export async function fetchAdminAppeals(
  params: ListAdminAppealsParams = {}
): Promise<PostAppealsListResponseData> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status && params.status !== 'ALL') query.set('status', params.status);

  const queryString = query.toString();
  const endpoint = queryString
    ? `/api/v1/admin/appeals?${queryString}`
    : '/api/v1/admin/appeals';

  const response = await apiFetch<PostAppealsListResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch appeals queue.');
  }

  return response.data;
}

export async function reviewAppealApi(
  appealId: string,
  data: ReviewPostAppealRequest
): Promise<PostAppealItem> {
  const response = await apiFetch<PostAppealItem>(
    `/api/v1/admin/appeals/${encodeURIComponent(appealId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to submit appeal review.');
  }

  return response.data;
}


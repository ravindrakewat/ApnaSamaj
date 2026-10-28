import {
  PostAppealItem,
  PostAppealsListResponseData,
  SubmitPostAppealRequest,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface ListMyAppealsParams {
  page?: number;
  limit?: number;
}

export async function submitAppealApi(
  data: SubmitPostAppealRequest
): Promise<PostAppealItem> {
  const response = await apiFetch<PostAppealItem>('/api/v1/appeals', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to submit appeal.');
  }

  return response.data;
}

export async function fetchMyAppealsApi(
  params: ListMyAppealsParams = {}
): Promise<PostAppealsListResponseData> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const queryString = query.toString();
  const endpoint = queryString
    ? `/api/v1/appeals/me?${queryString}`
    : '/api/v1/appeals/me';

  const response = await apiFetch<PostAppealsListResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch appeals.');
  }

  return response.data;
}


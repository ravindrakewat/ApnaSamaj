import { DirectoryResponseData } from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface DirectoryFilterParams {
  page?: number;
  limit?: number;
  search?: string;
  city?: string;
  state?: string;
  gotra?: string;
  subCaste?: string;
}

export async function fetchDirectory(params: DirectoryFilterParams = {}): Promise<DirectoryResponseData> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.search && params.search.trim()) queryParams.set('search', params.search.trim());
  if (params.city && params.city.trim()) queryParams.set('city', params.city.trim());
  if (params.state && params.state.trim()) queryParams.set('state', params.state.trim());
  if (params.gotra && params.gotra.trim()) queryParams.set('gotra', params.gotra.trim());
  if (params.subCaste && params.subCaste.trim()) queryParams.set('subCaste', params.subCaste.trim());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/users${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<DirectoryResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch directory members.');
  }

  return response.data;
}

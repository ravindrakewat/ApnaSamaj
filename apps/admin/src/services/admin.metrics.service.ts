import { AdminMetrics } from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const response = await apiFetch<AdminMetrics>('/api/v1/admin/metrics', {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch admin metrics.');
  }

  return response.data;
}

import { ListAuditLogsResponseData } from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  targetType?: string;
  actorId?: string;
  fromDate?: string;
  toDate?: string;
}

export async function fetchAdminAuditLogs(params: ListAuditLogsParams = {}): Promise<ListAuditLogsResponseData> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.action && params.action.trim()) queryParams.set('action', params.action.trim());
  if (params.targetType && params.targetType.trim()) queryParams.set('targetType', params.targetType.trim());
  if (params.actorId && params.actorId.trim()) queryParams.set('actorId', params.actorId.trim());
  if (params.fromDate && params.fromDate.trim()) queryParams.set('fromDate', params.fromDate.trim());
  if (params.toDate && params.toDate.trim()) queryParams.set('toDate', params.toDate.trim());

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/admin/audit-logs${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<ListAuditLogsResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch audit logs.');
  }

  return response.data;
}

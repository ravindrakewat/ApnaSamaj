import {
  ModerationQueueResponseData,
  ReviewReportRequest,
  ReviewReportResponseData,
  ReportPostReason,
  ModerationAnalyticsResponseData,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface ListModerationReportsParams {
  page?: number;
  limit?: number;
  status?: 'ALL' | 'PENDING' | 'DISMISSED' | 'ACTIONED';
  reason?: ReportPostReason;
}

export async function fetchModerationReports(
  params: ListModerationReportsParams = {}
): Promise<ModerationQueueResponseData> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.status) query.set('status', params.status);
  if (params.reason) query.set('reason', params.reason);

  const queryString = query.toString();
  const endpoint = queryString
    ? `/api/v1/admin/moderation/reports?${queryString}`
    : '/api/v1/admin/moderation/reports';

  const response = await apiFetch<ModerationQueueResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch moderation reports queue.');
  }

  return response.data;
}

export async function reviewReportApi(
  reportId: string,
  data: ReviewReportRequest
): Promise<ReviewReportResponseData> {
  const response = await apiFetch<ReviewReportResponseData>(
    `/api/v1/admin/moderation/reports/${encodeURIComponent(reportId)}/review`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to submit report review.');
  }

  return response.data;
}

export async function actionDeleteReportedPostApi(
  reportId: string,
  notes?: string
): Promise<ReviewReportResponseData> {
  const response = await apiFetch<ReviewReportResponseData>(
    `/api/v1/admin/moderation/reports/${encodeURIComponent(reportId)}/action-delete`,
    {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to take down reported post.');
  }

  return response.data;
}

export async function fetchModerationAnalytics(
  days: number = 30
): Promise<ModerationAnalyticsResponseData> {
  const response = await apiFetch<ModerationAnalyticsResponseData>(
    `/api/v1/admin/moderation/analytics?days=${days}`,
    {
      method: 'GET',
    }
  );

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch moderation analytics.');
  }

  return response.data;
}

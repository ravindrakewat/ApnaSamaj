import { Response } from 'express';
import { ApiResponse, AdminMetrics } from '@apnasamaj/shared-types';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import { getAdminMetrics } from './admin.metrics.service';

export async function getMetricsHandler(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await getAdminMetrics();
    const response: ApiResponse<AdminMetrics> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[Admin Metrics Controller] Get metrics error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve administrative metrics.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

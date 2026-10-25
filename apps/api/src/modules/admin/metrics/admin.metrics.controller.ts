import { Response } from 'express';
import { ApiResponse, AdminMetrics, UserRole } from '@apnasamaj/shared-types';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import { getAdminMetrics } from './admin.metrics.service';

export async function getMetricsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // COMMUNITY_ADMIN must be bound to their assigned community database
    if (req.user?.role === UserRole.COMMUNITY_ADMIN && (!req.tenant || !req.tenant.isResolved || !req.db)) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for community administrative metrics.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getAdminMetrics(req.db);
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

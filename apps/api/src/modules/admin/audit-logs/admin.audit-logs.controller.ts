import { Response } from 'express';
import { ApiResponse, ListAuditLogsResponseData, UserRole } from '@apnasamaj/shared-types';
import { listAuditLogsQuerySchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import { listAuditLogs } from './admin.audit-logs.service';

export async function listAuditLogsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // COMMUNITY_ADMIN must be bound to their assigned community database
    if (req.user?.role === UserRole.COMMUNITY_ADMIN && (!req.tenant || !req.tenant.isResolved || !req.db)) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for community audit logs.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsed = listAuditLogsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid audit log query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await listAuditLogs(parsed.data, req.db);

    const response: ApiResponse<ListAuditLogsResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[Admin Audit Logs Controller] Error listing audit logs:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve audit logs.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

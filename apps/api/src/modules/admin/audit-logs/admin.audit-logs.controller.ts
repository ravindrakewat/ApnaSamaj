import { Request, Response } from 'express';
import { ApiResponse, ListAuditLogsResponseData } from '@apnasamaj/shared-types';
import { listAuditLogsQuerySchema } from '@apnasamaj/validation';
import { listAuditLogs } from './admin.audit-logs.service';

export async function listAuditLogsHandler(req: Request, res: Response): Promise<void> {
  try {
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

    const result = await listAuditLogs(parsed.data);

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

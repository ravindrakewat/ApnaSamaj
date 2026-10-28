import { Response } from 'express';
import {
  ApiResponse,
  ModerationQueueResponseData,
  ReviewReportResponseData,
  UserRole,
} from '@apnasamaj/shared-types';
import {
  moderationQueueQuerySchema,
  reviewReportSchema,
  idParamSchema,
  moderationAnalyticsQuerySchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import {
  listModerationReports,
  reviewModerationReport,
  actionDeletePostFromReport,
  getModerationAnalytics,
} from './admin.moderation.service';
import { PostNotFoundError, PostServiceError } from '../../posts/posts.service';

export async function listModerationReportsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // COMMUNITY_ADMIN or MODERATOR must be bound to their community database
    if (
      (req.user?.role === UserRole.COMMUNITY_ADMIN || req.user?.role === UserRole.MODERATOR) &&
      (!req.tenant || !req.tenant.isResolved || !req.db)
    ) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for community moderation queue.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = moderationQueueQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid moderation queue query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await listModerationReports(parsedQuery.data, req.db);

    const response: ApiResponse<ModerationQueueResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[Admin Moderation Controller] Error listing reports:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve moderation reports queue.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function reviewModerationReportHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required for moderation actions.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid report ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = reviewReportSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid report review data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await reviewModerationReport(
      parsedParam.data.id,
      userId,
      userRole,
      parsedBody.data,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<ReviewReportResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostNotFoundError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Admin Moderation Controller] Error reviewing report:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to process report review.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function actionDeletePostFromReportHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required for moderation actions.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParam = idParamSchema.safeParse(req.params);
    if (!parsedParam.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid report ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

    const result = await actionDeletePostFromReport(
      parsedParam.data.id,
      userId,
      userRole,
      notes,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<ReviewReportResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PostNotFoundError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    if (err instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Admin Moderation Controller] Error acting on report:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to complete moderation post removal.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getModerationAnalyticsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Only COMMUNITY_ADMIN or SUPER_ADMIN
    if (
      req.user?.role === UserRole.COMMUNITY_ADMIN &&
      (!req.tenant || !req.tenant.isResolved || !req.db)
    ) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for moderation analytics.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = moderationAnalyticsQuerySchema.safeParse(req.query);
    const query = parsedQuery.success ? parsedQuery.data : { days: 30 };

    const analytics = await getModerationAnalytics(query, req.db);

    const response: ApiResponse = {
      success: true,
      data: analytics,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve moderation analytics.';
    const response: ApiResponse = {
      success: false,
      error: errorMsg,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

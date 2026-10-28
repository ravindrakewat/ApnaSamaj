import { Response } from 'express';
import {
  ApiResponse,
  PostAppealItem,
  PostAppealsListResponseData,
  UserRole,
} from '@apnasamaj/shared-types';
import {
  idParamSchema,
  submitPostAppealSchema,
  reviewPostAppealSchema,
  listMemberPostAppealsQuerySchema,
  listAdminPostAppealsQuerySchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  submitPostAppeal,
  getMemberAppeals,
  listCommunityAppeals,
  reviewAppeal,
} from './appeals.service';
import { PostNotFoundError, PostServiceError } from '../posts/posts.service';

/**
 * POST /api/v1/appeals
 * Submits an appeal for a post removed by moderation.
 */
export async function submitPostAppealHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Fail-closed tenant context check
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community tenant context required to submit an appeal.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.user?.id) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required to submit an appeal.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedBody = submitPostAppealSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid appeal submission data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const appeal = await submitPostAppeal(req.user.id, parsedBody.data, req.db);

    const response: ApiResponse<PostAppealItem> = {
      success: true,
      data: appeal,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (error: any) {
    if (error instanceof PostNotFoundError) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    if (error instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      res.status(error.statusCode).json(response);
      return;
    }

    console.error('[Appeals Controller] submitPostAppeal error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to submit appeal. Please try again later.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * GET /api/v1/appeals/me
 * Retrieves appeals submitted by the authenticated member.
 */
export async function getMemberAppealsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    // Fail-closed tenant context check
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community tenant context required to view appeals.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.user?.id) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required to view appeals.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedQuery = listMemberPostAppealsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await getMemberAppeals(req.user.id, parsedQuery.data, req.db);

    const response: ApiResponse<PostAppealsListResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (error: any) {
    if (error instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      res.status(error.statusCode).json(response);
      return;
    }

    console.error('[Appeals Controller] getMemberAppeals error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve appeals.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * GET /api/v1/admin/appeals
 * Lists community appeals for administrators and moderators.
 */
export async function listCommunityAppealsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (
      (req.user?.role === UserRole.COMMUNITY_ADMIN || req.user?.role === UserRole.MODERATOR) &&
      (!req.tenant || !req.tenant.isResolved || !req.db)
    ) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for community appeals queue.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = listAdminPostAppealsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid appeals query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await listCommunityAppeals(parsedQuery.data, req.db);

    const response: ApiResponse<PostAppealsListResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (error: any) {
    if (error instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      res.status(error.statusCode).json(response);
      return;
    }

    console.error('[Appeals Controller] listCommunityAppeals error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to list community appeals.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * POST /api/v1/admin/appeals/:id/review
 * Reviews a member's appeal with decision (UNDER_REVIEW, APPROVED, REJECTED).
 */
export async function reviewAppealHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (
      (req.user?.role === UserRole.COMMUNITY_ADMIN || req.user?.role === UserRole.MODERATOR) &&
      (!req.tenant || !req.tenant.isResolved || !req.db)
    ) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required to review appeals.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const paramCheck = idParamSchema.safeParse(req.params);
    if (!paramCheck.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid appeal ID parameter.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = reviewPostAppealSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid appeal review input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await reviewAppeal(
      paramCheck.data.id,
      req.user!.id,
      req.user!.role,
      parsedBody.data,
      req.db
    );

    const response: ApiResponse<PostAppealItem> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (error: any) {
    if (error instanceof PostNotFoundError) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    if (error instanceof PostServiceError) {
      const response: ApiResponse = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      res.status(error.statusCode).json(response);
      return;
    }

    console.error('[Appeals Controller] reviewAppeal error:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to review appeal.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

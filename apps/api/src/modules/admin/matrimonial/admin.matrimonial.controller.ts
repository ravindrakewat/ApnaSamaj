import { Response } from 'express';
import {
  ApiResponse,
  AdminMatrimonialProfileDetail,
  PaginatedAdminMatrimonialProfilesResponse,
} from '@apnasamaj/shared-types';
import {
  listAdminMatrimonialProfilesQuerySchema,
  adminModerateMatrimonialProfileSchema,
  adminModerateMatrimonialPhotoSchema,
  idParamSchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import {
  listAdminMatrimonialProfiles,
  getAdminMatrimonialProfileDetails,
  moderateMatrimonialProfile,
  moderateMatrimonialPhoto,
} from './admin.matrimonial.service';
import {
  MatrimonialMigrationPendingError,
  MatrimonialNotFoundError,
  MatrimonialServiceError,
} from '../../matrimonial/matrimonial.service';

/**
 * Standard error response formatter for admin matrimonial endpoints.
 */
function handleAdminMatrimonialError(
  err: unknown,
  res: Response,
  fallbackMessage: string
): void {
  if (err instanceof MatrimonialMigrationPendingError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(503).json(response);
    return;
  }

  if (err instanceof MatrimonialNotFoundError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(404).json(response);
    return;
  }

  if (err instanceof MatrimonialServiceError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(err.statusCode).json(response);
    return;
  }

  console.error(`[Admin Matrimonial Controller] ${fallbackMessage}:`, err);
  const response: ApiResponse = {
    success: false,
    error: fallbackMessage,
    timestamp: new Date().toISOString(),
  };
  res.status(500).json(response);
}

/**
 * GET /api/v1/admin/matrimonial/profiles
 * Lists matrimonial profiles for review with pagination and status filters.
 */
export async function listProfilesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for matrimonial administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = listAdminMatrimonialProfilesQuerySchema.safeParse(req.query);
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

    const data = await listAdminMatrimonialProfiles(parsedQuery.data, req.db);

    const response: ApiResponse<PaginatedAdminMatrimonialProfilesResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleAdminMatrimonialError(err, res, 'Failed to retrieve matrimonial profiles queue.');
  }
}

/**
 * GET /api/v1/admin/matrimonial/profiles/:id
 * Retrieves detailed matrimonial profile and photo preview for administrative review.
 */
export async function getProfileDetailsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for matrimonial administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const issue = parsedParams.error.issues[0]?.message || 'Invalid profile ID parameter.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getAdminMatrimonialProfileDetails(parsedParams.data.id, req.db);

    const response: ApiResponse<AdminMatrimonialProfileDetail> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleAdminMatrimonialError(err, res, 'Failed to retrieve profile details.');
  }
}

/**
 * PATCH /api/v1/admin/matrimonial/profiles/:id/moderation
 * Approves, rejects, or hides a matrimonial profile.
 */
export async function moderateProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for matrimonial administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const actor = req.user;
    if (!actor) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const issue = parsedParams.error.issues[0]?.message || 'Invalid profile ID parameter.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = adminModerateMatrimonialProfileSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid moderation input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const updated = await moderateMatrimonialProfile(
      parsedParams.data.id,
      actor,
      parsedBody.data,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const actionText =
      parsedBody.data.status === 'APPROVED'
        ? 'approved'
        : parsedBody.data.status === 'REJECTED'
        ? 'rejected'
        : 'hidden';

    const response: ApiResponse<AdminMatrimonialProfileDetail> = {
      success: true,
      message: `Matrimonial profile ${actionText} successfully.`,
      data: updated,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleAdminMatrimonialError(err, res, 'Failed to moderate matrimonial profile.');
  }
}

/**
 * PATCH /api/v1/admin/matrimonial/photos/:id/moderation
 * Approves or hides an individual matrimonial photo.
 */
export async function moderatePhotoHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for matrimonial administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const actor = req.user;
    if (!actor) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const issue = parsedParams.error.issues[0]?.message || 'Invalid photo ID parameter.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = adminModerateMatrimonialPhotoSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid photo moderation payload.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await moderateMatrimonialPhoto(
      parsedParams.data.id,
      actor,
      parsedBody.data,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<{ id: string; isApproved: boolean }> = {
      success: true,
      message: `Photo visibility ${result.isApproved ? 'approved' : 'hidden'} successfully.`,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleAdminMatrimonialError(err, res, 'Failed to moderate photo.');
  }
}

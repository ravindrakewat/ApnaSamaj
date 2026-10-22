import { Response } from 'express';
import {
  ApiResponse,
  OwnMatrimonialProfile,
  MatrimonialPartnerPreferenceItem,
  MatrimonialPhotoItem,
  PublicMatrimonialProfileDetail,
  MatrimonialInterestItem,
  PaginatedMatrimonialProfilesResponse,
  PaginatedMatrimonialInterestsResponse,
} from '@apnasamaj/shared-types';
import {
  upsertMatrimonialProfileSchema,
  updatePartnerPreferenceSchema,
  idParamSchema,
  listMatrimonialProfilesQuerySchema,
  sendMatrimonialInterestSchema,
  respondMatrimonialInterestSchema,
  paginationSchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getMyMatrimonialProfile,
  upsertMyMatrimonialProfile,
  upsertMyPartnerPreferences,
  submitMyMatrimonialProfile,
  uploadMyMatrimonialPhoto,
  deleteMyMatrimonialPhoto,
  listDiscoveryProfiles,
  getDiscoveryProfileById,
  sendInterest,
  listReceivedInterests,
  listSentInterests,
  respondToInterest,
  MatrimonialServiceError,
  MatrimonialNotFoundError,
  MatrimonialValidationError,
  MatrimonialMigrationPendingError,
} from './matrimonial.service';
import { StorageError } from '../../services/storage.service';

/**
 * Helper to dispatch consistent error responses across all matrimonial controllers.
 */
function handleMatrimonialError(err: unknown, res: Response, fallbackMessage: string): void {
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

  if (err instanceof MatrimonialValidationError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      data: err.errors ? { errors: err.errors } : undefined,
      timestamp: new Date().toISOString(),
    };
    res.status(400).json(response);
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

  if (err instanceof StorageError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(err.statusCode || 400).json(response);
    return;
  }

  console.error(`[Matrimonial Controller] ${fallbackMessage}:`, err);
  const response: ApiResponse = {
    success: false,
    error: fallbackMessage,
    timestamp: new Date().toISOString(),
  };
  res.status(500).json(response);
}

/**
 * GET /api/v1/matrimonial/me
 * Retrieves the current authenticated user's own matrimonial profile.
 */
export async function getMyProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const profile = await getMyMatrimonialProfile(userId);

    const response: ApiResponse<OwnMatrimonialProfile | null> = {
      success: true,
      data: profile,
      message: profile ? undefined : 'Matrimonial profile not created yet.',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to retrieve matrimonial profile.');
  }
}

/**
 * PUT /api/v1/matrimonial/me
 * Creates or updates the current authenticated user's matrimonial profile.
 */
export async function upsertProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = upsertMatrimonialProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid matrimonial profile input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const profile = await upsertMyMatrimonialProfile(userId, parsed.data);

    const response: ApiResponse<OwnMatrimonialProfile> = {
      success: true,
      message: 'Matrimonial profile saved successfully.',
      data: profile,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to save matrimonial profile.');
  }
}

/**
 * POST /api/v1/matrimonial/me/submit
 * Submits the current authenticated member's matrimonial profile for admin approval.
 */
export async function submitProfileHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const profile = await submitMyMatrimonialProfile(userId, {
      ipAddress,
      userAgent,
    });

    const response: ApiResponse<OwnMatrimonialProfile> = {
      success: true,
      message: 'Matrimonial profile submitted successfully and is now pending admin approval.',
      data: profile,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to submit matrimonial profile for approval.');
  }
}

/**
 * PUT /api/v1/matrimonial/me/preferences
 * Creates or updates partner preferences for the authenticated user's matrimonial profile.
 */
export async function upsertPreferencesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = updatePartnerPreferenceSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid partner preferences input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const preferences = await upsertMyPartnerPreferences(userId, parsed.data);

    const response: ApiResponse<MatrimonialPartnerPreferenceItem> = {
      success: true,
      message: 'Partner preferences saved successfully.',
      data: preferences,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to save partner preferences.');
  }
}

/**
 * POST /api/v1/matrimonial/me/photos
 * Uploads a photo to the authenticated user's matrimonial gallery (limit 5).
 */
export async function uploadPhotoHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    if (!req.file) {
      const response: ApiResponse = {
        success: false,
        error: 'No image file was provided in the request.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    let isPrimary: boolean | undefined = undefined;
    if (req.body.isPrimary !== undefined) {
      if (typeof req.body.isPrimary === 'boolean') {
        isPrimary = req.body.isPrimary;
      } else if (typeof req.body.isPrimary === 'string') {
        isPrimary = req.body.isPrimary.trim().toLowerCase() === 'true';
      }
    }

    const photo = await uploadMyMatrimonialPhoto(
      userId,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      isPrimary
    );

    const response: ApiResponse<MatrimonialPhotoItem> = {
      success: true,
      message: 'Matrimonial photo uploaded successfully.',
      data: photo,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to upload matrimonial photo.');
  }
}

/**
 * DELETE /api/v1/matrimonial/me/photos/:id
 * Deletes a matrimonial photo belonging to the authenticated user.
 */
export async function deletePhotoHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
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

    await deleteMyMatrimonialPhoto(userId, parsedParams.data.id);

    const response: ApiResponse = {
      success: true,
      message: 'Matrimonial photo deleted successfully.',
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to delete matrimonial photo.');
  }
}

/**
 * GET /api/v1/matrimonial/profiles
 * Lists discovery profiles with safe multi-criteria filters and pagination.
 */
export async function listProfilesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = listMatrimonialProfilesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid discovery query filters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await listDiscoveryProfiles(userId, parsed.data);

    const response: ApiResponse<PaginatedMatrimonialProfilesResponse> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to retrieve discovery profiles.');
  }
}

/**
 * GET /api/v1/matrimonial/profiles/:id
 * Retrieves safe details for a single matrimonial profile.
 * Contact phone is revealed only when mutually accepted interest exists.
 */
export async function getProfileByIdHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
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

    const profile = await getDiscoveryProfileById(userId, parsedParams.data.id);

    const response: ApiResponse<PublicMatrimonialProfileDetail> = {
      success: true,
      data: profile,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to retrieve matrimonial profile details.');
  }
}

/**
 * POST /api/v1/matrimonial/interests
 * Sends an interest / connection request to another member.
 */
export async function sendInterestHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsed = sendMatrimonialInterestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid interest request input.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const interest = await sendInterest(userId, parsed.data);

    const response: ApiResponse<MatrimonialInterestItem> = {
      success: true,
      message: 'Interest request sent successfully.',
      data: interest,
      timestamp: new Date().toISOString(),
    };

    res.status(201).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to send interest request.');
  }
}

/**
 * GET /api/v1/matrimonial/interests/received
 * Lists received interest requests for the authenticated user.
 */
export async function listReceivedInterestsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedQuery = paginationSchema.safeParse(req.query);
    const page = parsedQuery.success ? parsedQuery.data.page : 1;
    const limit = parsedQuery.success ? parsedQuery.data.limit : 20;

    const result = await listReceivedInterests(userId, page, limit);

    const response: ApiResponse<PaginatedMatrimonialInterestsResponse> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to list received interest requests.');
  }
}

/**
 * GET /api/v1/matrimonial/interests/sent
 * Lists sent interest requests initiated by the authenticated user.
 */
export async function listSentInterestsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedQuery = paginationSchema.safeParse(req.query);
    const page = parsedQuery.success ? parsedQuery.data.page : 1;
    const limit = parsedQuery.success ? parsedQuery.data.limit : 20;

    const result = await listSentInterests(userId, page, limit);

    const response: ApiResponse<PaginatedMatrimonialInterestsResponse> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to list sent interest requests.');
  }
}

/**
 * PATCH /api/v1/matrimonial/interests/:id
 * Accepts, declines, or withdraws an interest request according to ownership rules.
 */
export async function respondInterestHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
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
      const issue = parsedParams.error.issues[0]?.message || 'Invalid interest ID parameter.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = respondMatrimonialInterestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid response status.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const updated = await respondToInterest(userId, parsedParams.data.id, parsedBody.data);

    const actionText =
      parsedBody.data.status === 'ACCEPTED'
        ? 'accepted'
        : parsedBody.data.status === 'DECLINED'
        ? 'declined'
        : 'withdrawn';

    const response: ApiResponse<MatrimonialInterestItem> = {
      success: true,
      message: `Interest request ${actionText} successfully.`,
      data: updated,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    handleMatrimonialError(err, res, 'Failed to update interest request.');
  }
}

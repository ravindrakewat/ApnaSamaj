import { Response } from 'express';
import { ApiResponse, DirectoryResponseData, PublicMemberProfile } from '@apnasamaj/shared-types';
import { updateProfileSchema, directoryQuerySchema, memberIdSchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getMyProfile,
  updateMyProfile,
  getDirectoryMembers,
  uploadMyAvatar,
  getPublicMemberProfile,
  UserServiceError,
  CurrentMemberProfile,
} from './users.service';

export async function getMyProfileHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context and tenant database are required to access user profile.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getMyProfile(userId, req.db);

    const response: ApiResponse<CurrentMemberProfile> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof UserServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Users Controller] Get profile error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve profile.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function updateMyProfileHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message || 'Invalid profile update data.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context and tenant database are required to update user profile.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const updatedProfile = await updateMyProfile(userId, parsed.data, req.db);

    const response: ApiResponse<CurrentMemberProfile> = {
      success: true,
      message: 'Profile updated successfully.',
      data: updatedProfile,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof UserServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Users Controller] Update profile error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update profile.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getDirectoryHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context and tenant database are required to access the member directory.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = directoryQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid directory query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getDirectoryMembers(parsedQuery.data, req.db);

    const response: ApiResponse<DirectoryResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof UserServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Users Controller] Get directory error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve community directory.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function uploadMyAvatarHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
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
        error: 'No avatar image file uploaded.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context and tenant database are required to upload profile avatar.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await uploadMyAvatar(
      userId,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      req.db
    );

    const response: ApiResponse<{ avatarUrl: string }> = {
      success: true,
      message: 'Avatar updated successfully.',
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof UserServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Users Controller] Upload avatar error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to upload profile avatar.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getPublicProfileHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const parsedId = memberIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      const issue = parsedId.error.issues[0]?.message || 'Invalid member ID format. Expected a valid UUID.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context and tenant database are required to view member profile.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getPublicMemberProfile(parsedId.data, req.db);

    const response: ApiResponse<PublicMemberProfile> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof UserServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Users Controller] Get public profile error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve member profile.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

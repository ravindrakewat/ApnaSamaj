import { Response } from 'express';
import { ApiResponse } from '@apnasamaj/shared-types';
import { updateProfileSchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getMyProfile,
  updateMyProfile,
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

    const data = await getMyProfile(userId);

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

    const updatedProfile = await updateMyProfile(userId, parsed.data);

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

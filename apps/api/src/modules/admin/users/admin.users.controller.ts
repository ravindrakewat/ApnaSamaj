import { Response } from 'express';
import { ApiResponse, ListUsersResponseData, AdminUserDetails } from '@apnasamaj/shared-types';
import { listUsersQuerySchema, updateUserStatusSchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../../middleware/authenticate';
import {
  listAdminUsers,
  getAdminUserDetails,
  updateAdminUserStatus,
  AdminServiceError,
} from './admin.users.service';

export async function getUsersHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for user administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = listUsersQuerySchema.safeParse(req.query);
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

    const data = await listAdminUsers(parsedQuery.data, req.db);

    const response: ApiResponse<ListUsersResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    console.error('[Admin Users Controller] List users error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve users list.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function getUserDetailsHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for user administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'User ID is required.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getAdminUserDetails(id, req.db);

    const response: ApiResponse<AdminUserDetails> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof AdminServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Admin Users Controller] Get user details error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve user details.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

export async function updateUserStatusHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.tenant || !req.tenant.isResolved || !req.db) {
      const response: ApiResponse = {
        success: false,
        error: 'Community context required for user administration. Please specify X-Community-Slug header.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'User ID parameter is required.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = updateUserStatusSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid status update payload.';
      const response: ApiResponse = {
        success: false,
        error: issue,
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

    const updatedUser = await updateAdminUserStatus(
      id,
      parsedBody.data.status,
      actor,
      parsedBody.data.reason,
      req.ip,
      req.headers['user-agent'],
      req.db
    );

    const response: ApiResponse<AdminUserDetails> = {
      success: true,
      message: `User status successfully updated to ${parsedBody.data.status}.`,
      data: updatedUser,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof AdminServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Admin Users Controller] Update status error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update user account status.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

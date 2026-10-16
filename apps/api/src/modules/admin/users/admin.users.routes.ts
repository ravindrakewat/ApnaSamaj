import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import {
  getUsersHandler,
  getUserDetailsHandler,
  updateUserStatusHandler,
} from './admin.users.controller';

export const adminUsersRouter = Router();

// Apply administrative security guard across all admin user endpoints
adminUsersRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN)
);

// GET /api/v1/admin/users - List users with pagination, search, and filtering
adminUsersRouter.get('/', getUsersHandler);

// GET /api/v1/admin/users/:id - Get safe detailed user profile with counts
adminUsersRouter.get('/:id', getUserDetailsHandler);

// PATCH /api/v1/admin/users/:id/status - Activate or Suspend a user
adminUsersRouter.patch('/:id/status', updateUserStatusHandler);

export default adminUsersRouter;

import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import { authorizeAdminCommunitySwitch } from '../../../middleware/tenant.middleware';
import {
  getUsersHandler,
  getUserDetailsHandler,
  updateUserStatusHandler,
  updateUserRoleHandler,
} from './admin.users.controller';
import {
  downloadTemplateHandler,
  previewImportHandler,
  executeImportHandler,
} from './admin.import.controller';
import { excelUploadMiddleware } from './excel.upload';

export const adminUsersRouter = Router();

// Apply administrative security guard across all admin user endpoints
adminUsersRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN),
  authorizeAdminCommunitySwitch
);

// GET /api/v1/admin/users - List users with pagination, search, and filtering
adminUsersRouter.get('/', getUsersHandler);

// Bulk Member Import Endpoints (registered before /:id parameter)
// GET /api/v1/admin/users/import/template - Download pre-formatted .xlsx template
adminUsersRouter.get('/import/template', downloadTemplateHandler);

// POST /api/v1/admin/users/import/preview - Dry-run preview of member roster
adminUsersRouter.post('/import/preview', excelUploadMiddleware, previewImportHandler);

// POST /api/v1/admin/users/import/execute - Atomic batch import into tenant database
adminUsersRouter.post('/import/execute', excelUploadMiddleware, executeImportHandler);

// GET /api/v1/admin/users/:id - Get safe detailed user profile with counts
adminUsersRouter.get('/:id', getUserDetailsHandler);

// PATCH /api/v1/admin/users/:id/status - Activate or Suspend a user
adminUsersRouter.patch('/:id/status', updateUserStatusHandler);

// PATCH /api/v1/admin/users/:id/role - Update a user's role (promote/demote moderator)
adminUsersRouter.patch('/:id/role', updateUserRoleHandler);

export default adminUsersRouter;

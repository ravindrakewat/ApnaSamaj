import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import { singleImageUpload } from '../../middleware/upload.middleware';
import {
  getMyProfileHandler,
  updateMyProfileHandler,
  getDirectoryHandler,
  uploadMyAvatarHandler,
  getPublicProfileHandler,
} from './users.controller';

export const usersRouter = Router();

// All member profile and directory routes require valid Bearer token authentication
usersRouter.use(authenticateToken);

// GET /api/v1/users - Paginated community directory with safe search & filters (ACTIVE members only)
usersRouter.get('/', requireActiveUser, requireTenantContext, getDirectoryHandler);

// GET /api/v1/users/me/profile - Retrieve own profile (requires valid tenant context)
usersRouter.get('/me/profile', requireTenantContext, getMyProfileHandler);

// PATCH /api/v1/users/me/profile - Update own allowed profile fields (requires valid tenant context)
usersRouter.patch('/me/profile', requireTenantContext, updateMyProfileHandler);

// POST /api/v1/users/me/avatar - Upload profile avatar (ACTIVE members only, requires valid tenant context)
usersRouter.post('/me/avatar', requireActiveUser, requireTenantContext, singleImageUpload, uploadMyAvatarHandler);

// GET /api/v1/users/:id - Public member profile (ACTIVE members only, requires valid tenant context)
// Note: Placed after /me/* to prevent route parameter collision
usersRouter.get('/:id', requireActiveUser, requireTenantContext, getPublicProfileHandler);

export default usersRouter;


import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
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
usersRouter.get('/', requireActiveUser, getDirectoryHandler);

// GET /api/v1/users/me/profile - Retrieve own profile
usersRouter.get('/me/profile', getMyProfileHandler);

// PATCH /api/v1/users/me/profile - Update own allowed profile fields
usersRouter.patch('/me/profile', updateMyProfileHandler);

// POST /api/v1/users/me/avatar - Upload profile avatar (ACTIVE members only)
usersRouter.post('/me/avatar', requireActiveUser, singleImageUpload, uploadMyAvatarHandler);

// GET /api/v1/users/:id - Public member profile (ACTIVE members only)
// Note: Placed after /me/* to prevent route parameter collision
usersRouter.get('/:id', requireActiveUser, getPublicProfileHandler);

export default usersRouter;


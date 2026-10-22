import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import {
  listProfilesHandler,
  getProfileDetailsHandler,
  moderateProfileHandler,
  moderatePhotoHandler,
} from './admin.matrimonial.controller';

export const adminMatrimonialRouter = Router();

// Apply administrative security guard across all admin matrimonial endpoints
adminMatrimonialRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN)
);

// GET /api/v1/admin/matrimonial/profiles - List matrimonial profiles awaiting approval or with status filter
adminMatrimonialRouter.get('/profiles', listProfilesHandler);

// GET /api/v1/admin/matrimonial/profiles/:id - Get detailed matrimonial profile and photos for review
adminMatrimonialRouter.get('/profiles/:id', getProfileDetailsHandler);

// PATCH /api/v1/admin/matrimonial/profiles/:id/moderation - Approve, reject, or hide matrimonial profile
adminMatrimonialRouter.patch('/profiles/:id/moderation', moderateProfileHandler);

// PATCH /api/v1/admin/matrimonial/photos/:id/moderation - Approve or hide an individual photo
adminMatrimonialRouter.patch('/photos/:id/moderation', moderatePhotoHandler);

export default adminMatrimonialRouter;

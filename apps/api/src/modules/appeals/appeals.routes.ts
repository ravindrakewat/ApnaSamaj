import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../middleware/authorize';
import { authorizeAdminCommunitySwitch } from '../../middleware/tenant.middleware';
import {
  submitPostAppealHandler,
  getMemberAppealsHandler,
  listCommunityAppealsHandler,
  reviewAppealHandler,
} from './appeals.controller';

/**
 * Member-facing appeal routes: /api/v1/appeals
 */
export const appealsRouter = Router();

appealsRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(
    UserRole.MEMBER,
    UserRole.MODERATOR,
    UserRole.COMMUNITY_ADMIN,
    UserRole.SUPER_ADMIN
  )
);

// POST /api/v1/appeals - Submit an appeal for a moderated post
appealsRouter.post('/', submitPostAppealHandler);

// GET /api/v1/appeals/me - List appeals submitted by authenticated member
appealsRouter.get('/me', getMemberAppealsHandler);

/**
 * Admin & Moderator appeal review routes: /api/v1/admin/appeals
 */
export const adminAppealsRouter = Router();

adminAppealsRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR),
  authorizeAdminCommunitySwitch
);

// GET /api/v1/admin/appeals - List community appeals queue
adminAppealsRouter.get('/', listCommunityAppealsHandler);

// POST /api/v1/admin/appeals/:id/review - Review/update appeal status
adminAppealsRouter.post('/:id/review', reviewAppealHandler);

export default appealsRouter;


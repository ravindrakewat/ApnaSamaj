import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import { authorizeAdminCommunitySwitch } from '../../../middleware/tenant.middleware';
import {
  listModerationReportsHandler,
  reviewModerationReportHandler,
  actionDeletePostFromReportHandler,
  getModerationAnalyticsHandler,
} from './admin.moderation.controller';

export const adminModerationRouter = Router();

// Apply administrative security guard: authenticated, active, super_admin, community_admin, or moderator
adminModerationRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR),
  authorizeAdminCommunitySwitch
);

// GET /api/v1/admin/moderation/analytics - Community-scoped moderation analytics (Admins only)
adminModerationRouter.get(
  '/analytics',
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN),
  getModerationAnalyticsHandler
);

// GET /api/v1/admin/moderation/reports - List reported posts queue
adminModerationRouter.get('/reports', listModerationReportsHandler);

// POST /api/v1/admin/moderation/reports/:id/review - Review/dismiss report outcome
adminModerationRouter.post('/reports/:id/review', reviewModerationReportHandler);

// POST /api/v1/admin/moderation/reports/:id/action-delete - Take down post and mark actioned
adminModerationRouter.post('/reports/:id/action-delete', actionDeletePostFromReportHandler);

export default adminModerationRouter;

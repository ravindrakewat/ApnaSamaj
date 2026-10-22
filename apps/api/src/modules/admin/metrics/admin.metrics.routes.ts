import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import { getMetricsHandler } from './admin.metrics.controller';

export const adminMetricsRouter = Router();

// Apply administrative security guard: authenticated, active, super_admin or community_admin
adminMetricsRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN)
);

// GET /api/v1/admin/metrics
adminMetricsRouter.get('/', getMetricsHandler);

export default adminMetricsRouter;

import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import { authorizeAdminCommunitySwitch } from '../../../middleware/tenant.middleware';
import { listAuditLogsHandler } from './admin.audit-logs.controller';

export const adminAuditLogsRouter = Router();

// Apply administrative security guard: authenticated, active, super_admin or community_admin
adminAuditLogsRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN),
  authorizeAdminCommunitySwitch
);

// GET /api/v1/admin/audit-logs
adminAuditLogsRouter.get('/', listAuditLogsHandler);

export default adminAuditLogsRouter;

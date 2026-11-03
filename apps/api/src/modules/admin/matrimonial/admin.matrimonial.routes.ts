import { Router } from 'express';
import { UserRole } from '@apnasamaj/shared-types';
import { authenticateToken } from '../../../middleware/authenticate';
import { requireActiveUser, requireRoles } from '../../../middleware/authorize';
import { authorizeAdminCommunitySwitch } from '../../../middleware/tenant.middleware';
import {
  listProfilesHandler,
  getProfileDetailsHandler,
  moderateProfileHandler,
  moderatePhotoHandler,
  getMetricsHandler,
  listDocumentsHandler,
  getDocumentSignedUrlHandler,
  moderateDocumentHandler,
  listReportsHandler,
  moderateReportHandler,
  listAuditLogsHandler,
} from './admin.matrimonial.controller';

export const adminMatrimonialRouter = Router();

// Apply administrative security guard across all admin matrimonial endpoints
adminMatrimonialRouter.use(
  authenticateToken,
  requireActiveUser,
  requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN),
  authorizeAdminCommunitySwitch
);

// ---------------------------------------------------------------------------
// 1. Dashboard Metrics & Overview
// ---------------------------------------------------------------------------

// GET /api/v1/admin/matrimonial/metrics - Aggregated metrics across profiles, documents, and reports
adminMatrimonialRouter.get('/metrics', getMetricsHandler);

// ---------------------------------------------------------------------------
// 2. Profile Moderation Queue
// ---------------------------------------------------------------------------

// GET /api/v1/admin/matrimonial/profiles - List matrimonial profiles awaiting approval or with status filter
adminMatrimonialRouter.get('/profiles', listProfilesHandler);

// GET /api/v1/admin/matrimonial/profiles/:id - Get detailed matrimonial profile and photos for review
adminMatrimonialRouter.get('/profiles/:id', getProfileDetailsHandler);

// PATCH /api/v1/admin/matrimonial/profiles/:id/moderation - Approve, reject, hide, or suspend matrimonial profile
adminMatrimonialRouter.patch('/profiles/:id/moderation', moderateProfileHandler);

// PATCH /api/v1/admin/matrimonial/photos/:id/moderation - Approve or hide an individual photo
adminMatrimonialRouter.patch('/photos/:id/moderation', moderatePhotoHandler);

// ---------------------------------------------------------------------------
// 3. Document Verification Queue
// ---------------------------------------------------------------------------

// GET /api/v1/admin/matrimonial/documents - List submitted verification documents
adminMatrimonialRouter.get('/documents', listDocumentsHandler);

// GET /api/v1/admin/matrimonial/documents/:id/signed-url - Temporary signed URL for secure viewing
adminMatrimonialRouter.get('/documents/:id/signed-url', getDocumentSignedUrlHandler);

// PATCH /api/v1/admin/matrimonial/documents/:id/moderation - Approve or reject document
adminMatrimonialRouter.patch('/documents/:id/moderation', moderateDocumentHandler);

// ---------------------------------------------------------------------------
// 4. Report Management Queue
// ---------------------------------------------------------------------------

// GET /api/v1/admin/matrimonial/reports - List member reports against matrimonial profiles
adminMatrimonialRouter.get('/reports', listReportsHandler);

// PATCH /api/v1/admin/matrimonial/reports/:id/moderation - Resolve, dismiss, or suspend from report
adminMatrimonialRouter.patch('/reports/:id/moderation', moderateReportHandler);

// ---------------------------------------------------------------------------
// 5. Moderation Audit History
// ---------------------------------------------------------------------------

// GET /api/v1/admin/matrimonial/audit-logs - Immutable audit history for matrimonial moderation
adminMatrimonialRouter.get('/audit-logs', listAuditLogsHandler);

export default adminMatrimonialRouter;

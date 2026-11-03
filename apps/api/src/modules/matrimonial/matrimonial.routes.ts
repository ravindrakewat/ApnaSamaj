import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import { singleImageUpload, singleDocumentUpload } from '../../middleware/upload.middleware';
import {
  getMyProfileHandler,
  upsertProfileHandler,
  submitProfileHandler,
  upsertPreferencesHandler,
  uploadPhotoHandler,
  deletePhotoHandler,
  listProfilesHandler,
  getProfileByIdHandler,
  sendInterestHandler,
  listReceivedInterestsHandler,
  listSentInterestsHandler,
  respondInterestHandler,
  uploadDocumentHandler,
  listMyDocumentsHandler,
  deleteMyDocumentHandler,
  reportProfileHandler,
  blockProfileHandler,
  unblockProfileHandler,
  listBlockedUsersHandler,
} from './matrimonial.controller';

export const matrimonialRouter = Router();

// All matrimonial endpoints strictly require authentication, ACTIVE account status, and tenant context
matrimonialRouter.use(authenticateToken, requireActiveUser, requireTenantContext);

// ---------------------------------------------------------------------------
// 1. Own Profile & Photos Management (/me)
// ---------------------------------------------------------------------------

// GET /api/v1/matrimonial/me - Retrieve current member's own matrimonial profile
matrimonialRouter.get('/me', getMyProfileHandler);

// PUT /api/v1/matrimonial/me - Create or update current member's matrimonial profile
matrimonialRouter.put('/me', upsertProfileHandler);

// POST /api/v1/matrimonial/me/submit - Submit matrimonial profile for admin approval
matrimonialRouter.post('/me/submit', submitProfileHandler);

// PUT /api/v1/matrimonial/me/preferences - Create or update partner preferences
matrimonialRouter.put('/me/preferences', upsertPreferencesHandler);

// POST /api/v1/matrimonial/me/photos - Upload gallery photo (max 5 photos)
matrimonialRouter.post('/me/photos', singleImageUpload, uploadPhotoHandler);

// DELETE /api/v1/matrimonial/me/photos/:id - Delete a gallery photo
matrimonialRouter.delete('/me/photos/:id', deletePhotoHandler);

// ---------------------------------------------------------------------------
// 2. Identity & Verification Documents (/me/documents)
// ---------------------------------------------------------------------------

// POST /api/v1/matrimonial/me/documents - Upload verification document (PDF, PNG, JPG, WebP)
matrimonialRouter.post('/me/documents', singleDocumentUpload, uploadDocumentHandler);

// GET /api/v1/matrimonial/me/documents - List submitted verification documents
matrimonialRouter.get('/me/documents', listMyDocumentsHandler);

// DELETE /api/v1/matrimonial/me/documents/:id - Delete pending or rejected document
matrimonialRouter.delete('/me/documents/:id', deleteMyDocumentHandler);

// ---------------------------------------------------------------------------
// 3. Discovery & Search Profiles (/profiles)
// ---------------------------------------------------------------------------

// GET /api/v1/matrimonial/profiles - Paginated discovery with filters (APPROVED profiles only, blocked excluded)
matrimonialRouter.get('/profiles', listProfilesHandler);

// GET /api/v1/matrimonial/profiles/:id - Safe profile details
matrimonialRouter.get('/profiles/:id', getProfileByIdHandler);

// POST /api/v1/matrimonial/profiles/:id/report - Report a suspicious or abusive profile
matrimonialRouter.post('/profiles/:id/report', reportProfileHandler);

// POST /api/v1/matrimonial/profiles/:id/block - Block a matrimonial profile
matrimonialRouter.post('/profiles/:id/block', blockProfileHandler);

// DELETE /api/v1/matrimonial/profiles/:id/block - Unblock a matrimonial profile
matrimonialRouter.delete('/profiles/:id/block', unblockProfileHandler);

// ---------------------------------------------------------------------------
// 4. Privacy Blocks (/blocks)
// ---------------------------------------------------------------------------

// GET /api/v1/matrimonial/blocks - List members blocked by the current user
matrimonialRouter.get('/blocks', listBlockedUsersHandler);

// ---------------------------------------------------------------------------
// 5. Interest Requests (/interests)
// ---------------------------------------------------------------------------

// POST /api/v1/matrimonial/interests - Express / send interest to another member
matrimonialRouter.post('/interests', sendInterestHandler);

// GET /api/v1/matrimonial/interests/received - List received interest requests
matrimonialRouter.get('/interests/received', listReceivedInterestsHandler);

// GET /api/v1/matrimonial/interests/sent - List sent interest requests
matrimonialRouter.get('/interests/sent', listSentInterestsHandler);

// PATCH /api/v1/matrimonial/interests/:id - Respond to interest (ACCEPT, DECLINE, WITHDRAW)
matrimonialRouter.patch('/interests/:id', respondInterestHandler);

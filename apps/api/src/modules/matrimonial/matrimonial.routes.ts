import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { singleImageUpload } from '../../middleware/upload.middleware';
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
} from './matrimonial.controller';

export const matrimonialRouter = Router();

// All matrimonial endpoints strictly require authentication and ACTIVE account status
matrimonialRouter.use(authenticateToken, requireActiveUser);

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
// 2. Discovery & Search Profiles (/profiles)
// ---------------------------------------------------------------------------

// GET /api/v1/matrimonial/profiles - Paginated discovery with filters (APPROVED profiles only)
matrimonialRouter.get('/profiles', listProfilesHandler);

// GET /api/v1/matrimonial/profiles/:id - Safe profile details (contact revealed only on mutual accept)
matrimonialRouter.get('/profiles/:id', getProfileByIdHandler);

// ---------------------------------------------------------------------------
// 3. Interest Requests (/interests)
// ---------------------------------------------------------------------------

// POST /api/v1/matrimonial/interests - Express / send interest to another member
matrimonialRouter.post('/interests', sendInterestHandler);

// GET /api/v1/matrimonial/interests/received - List received interest requests
matrimonialRouter.get('/interests/received', listReceivedInterestsHandler);

// GET /api/v1/matrimonial/interests/sent - List sent interest requests
matrimonialRouter.get('/interests/sent', listSentInterestsHandler);

// PATCH /api/v1/matrimonial/interests/:id - Respond to interest (ACCEPT, DECLINE, WITHDRAW)
matrimonialRouter.patch('/interests/:id', respondInterestHandler);

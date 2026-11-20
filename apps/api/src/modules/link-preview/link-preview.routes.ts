import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import { requireTenantContext } from '../../middleware/tenant.middleware';
import { linkPreviewRateLimiter } from '../../middleware/rate-limiter';
import { getLinkPreviewHandler } from './link-preview.controller';

export const linkPreviewRouter = Router();

// POST /api/v1/link-preview
linkPreviewRouter.post(
  '/',
  authenticateToken,
  requireActiveUser,
  requireTenantContext,
  linkPreviewRateLimiter,
  getLinkPreviewHandler
);

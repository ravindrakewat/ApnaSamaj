import { Router } from 'express';
import {
  loginHandler,
  registerHandler,
  refreshHandler,
  logoutHandler,
  getMeHandler,
} from './auth.controller';
import {
  loginRateLimiter,
  registerRateLimiter,
  refreshRateLimiter,
} from '../../middleware/rate-limiter';
import { authenticateToken } from '../../middleware/authenticate';

export const authRouter = Router();

// POST /api/v1/auth/register (Rate-limited, anonymous public member registration)
authRouter.post('/register', registerRateLimiter, registerHandler);

// POST /api/v1/auth/login (Rate-limited, anonymous access)
authRouter.post('/login', loginRateLimiter, loginHandler);

// POST /api/v1/auth/refresh (Rate-limited, rotates refresh token and returns new access token)
authRouter.post('/refresh', refreshRateLimiter, refreshHandler);

// POST /api/v1/auth/logout (Revokes session and clears HttpOnly refresh cookie)
authRouter.post('/logout', logoutHandler);

// GET /api/v1/auth/me (Requires valid Bearer access token)
authRouter.get('/me', authenticateToken, getMeHandler);

export default authRouter;

import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { getMyProfileHandler, updateMyProfileHandler } from './users.controller';

export const usersRouter = Router();

// All member profile routes require valid Bearer token authentication
usersRouter.use(authenticateToken);

// GET /api/v1/users/me/profile - Retrieve own profile
usersRouter.get('/me/profile', getMyProfileHandler);

// PATCH /api/v1/users/me/profile - Update own allowed profile fields
usersRouter.patch('/me/profile', updateMyProfileHandler);

export default usersRouter;

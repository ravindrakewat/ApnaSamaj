import { Router } from 'express';
import { adminUsersRouter } from './users/admin.users.routes';

export const adminRouter = Router();

adminRouter.use('/users', adminUsersRouter);

export * from './users/admin.users.routes';
export * from './users/admin.users.service';

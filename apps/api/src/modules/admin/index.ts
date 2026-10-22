import { Router } from 'express';
import { adminUsersRouter } from './users/admin.users.routes';
import { adminMetricsRouter } from './metrics/admin.metrics.routes';
import { adminAuditLogsRouter } from './audit-logs/admin.audit-logs.routes';
import { adminMatrimonialRouter } from './matrimonial/admin.matrimonial.routes';

export const adminRouter = Router();

adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/metrics', adminMetricsRouter);
adminRouter.use('/audit-logs', adminAuditLogsRouter);
adminRouter.use('/matrimonial', adminMatrimonialRouter);

export * from './users/admin.users.routes';
export * from './users/admin.users.service';
export * from './metrics/admin.metrics.routes';
export * from './metrics/admin.metrics.service';
export * from './audit-logs/admin.audit-logs.routes';
export * from './audit-logs/admin.audit-logs.service';
export * from './matrimonial/admin.matrimonial.routes';
export * from './matrimonial/admin.matrimonial.service';


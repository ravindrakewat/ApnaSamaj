import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { healthRouter } from './routes/health';
import { authRouter } from './modules/auth';
import { adminRouter } from './modules/admin';
import { usersRouter } from './modules/users';
import { postsRouter } from './modules/posts';
import { groupsRouter } from './modules/groups';
import { notificationsRouter } from './modules/notifications';
import { matrimonialRouter } from './modules/matrimonial';

import { isCorsOriginAllowed } from './config/cors';
import { resolveTenantContext } from './middleware/tenant.middleware';

export function createApp(): Express {
  const app = express();

  const extraAllowed = [
    config.clientUrl,
    config.adminUrl,
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
  ]
    .flatMap((o) => (o ? o.split(',') : []))
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (isCorsOriginAllowed(origin, { extraAllowed })) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Community-Slug'],
    })
  );

  app.use(cookieParser());
  app.use(express.json());
  app.use(resolveTenantContext);

  app.use('/', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/posts', postsRouter);
  app.use('/api/v1/groups', groupsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/matrimonial', matrimonialRouter);
  return app;
}


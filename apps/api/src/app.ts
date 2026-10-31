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
import { appealsRouter } from './modules/appeals';

import { isCorsOriginAllowed } from './config/cors';
import { resolveTenantContext } from './middleware/tenant.middleware';

export function createApp(): Express {
  const app = express();

  // Yahan apna Vercel domain explicitly add kar dein taaki env variable miss hone par bhi CORS fail na ho
  const hardcodedOrigins = [
    'https://apna-samaj.vercel.app',
    'https://apna-samaj-admin.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  const extraAllowed = [
    ...hardcodedOrigins,
    config.clientUrl,
    config.adminUrl,
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
  ]
    .flatMap((o) => (o ? o.split(',') : []))
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check hardcoded/extraAllowed list first, then isCorsOriginAllowed fallback
      const isAllowed =
        extraAllowed.includes(origin) ||
        isCorsOriginAllowed(origin, { extraAllowed });

      if (isAllowed) {
        return callback(null, true);
      }

      console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'x-community-slug',   // Lowercase (Browser yahi bhejta hai)
      'X-Community-Slug',   // Uppercase
      'Accept',
      'Origin',
    ],
  };

  // CORS middleware apply karein
  app.use(cors(corsOptions));

  // Preflight requests (OPTIONS) ko handle karein
  app.options('*', cors(corsOptions));

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
  app.use('/api/v1/appeals', appealsRouter);
  return app;
}

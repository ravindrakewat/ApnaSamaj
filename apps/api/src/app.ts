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

export function createApp(): Express {
  const app = express();

  const rawOrigins = [
    config.clientUrl,
    config.adminUrl,
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
    'https://apna-samaj.vercel.app',
    'https://apna-samaj-admin.vercel.app',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];

  const allowedOrigins = rawOrigins
    .flatMap((o) => (o ? o.split(',') : []))
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, Postman)
        if (!origin) return callback(null, true);

        const cleanOrigin = origin.trim().replace(/\/+$/, '');
        if (
          allowedOrigins.includes(cleanOrigin) ||
          cleanOrigin.endsWith('.vercel.app') ||
          cleanOrigin.includes('localhost') ||
          cleanOrigin.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use(cookieParser());
  app.use(express.json());

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


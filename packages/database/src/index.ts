import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './tenant-manager.js';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;

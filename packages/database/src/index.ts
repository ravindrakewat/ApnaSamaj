import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './tenant-manager.js';
export * from './migrate-all-tenants.js';

let defaultPrismaUrl: string | undefined = undefined;
if (process.env.DATABASE_URL) {
  try {
    const parsed = new URL(process.env.DATABASE_URL);
    const currentLimit = parsed.searchParams.get('connection_limit');
    if (!currentLimit || currentLimit === '1') {
      parsed.searchParams.set('connection_limit', '10');
    }
    if (!parsed.searchParams.has('pool_timeout')) {
      parsed.searchParams.set('pool_timeout', '20');
    }
    defaultPrismaUrl = parsed.toString();
  } catch {
    defaultPrismaUrl = process.env.DATABASE_URL;
  }
}

export const prisma = new PrismaClient({
  ...(defaultPrismaUrl ? { datasources: { db: { url: defaultPrismaUrl } } } : {}),
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;

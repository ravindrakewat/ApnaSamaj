import { prisma, PrismaClient } from '@apnasamaj/database';
import { AdminMetrics } from '@apnasamaj/shared-types';

export async function getAdminMetrics(db?: PrismaClient): Promise<AdminMetrics> {
  const client = db || prisma;
  const [totalUsers, pendingUsers, activeUsers, totalPosts] = await Promise.all([
    client.user.count(),
    client.user.count({ where: { status: 'PENDING' } }),
    client.user.count({ where: { status: 'ACTIVE' } }),
    client.post.count(),
  ]);

  return {
    totalUsers,
    pendingUsers,
    activeUsers,
    totalPosts,
  };
}

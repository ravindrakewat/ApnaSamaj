import { prisma } from '@apnasamaj/database';
import { AdminMetrics } from '@apnasamaj/shared-types';

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const [totalUsers, pendingUsers, activeUsers, totalPosts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.post.count(),
  ]);

  return {
    totalUsers,
    pendingUsers,
    activeUsers,
    totalPosts,
  };
}

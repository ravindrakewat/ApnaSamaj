import { prisma, Prisma, PrismaClient } from '@apnasamaj/database';
import { ListAuditLogsResponseData, AuditLogItem, UserRole } from '@apnasamaj/shared-types';
import { ListAuditLogsQuery } from '@apnasamaj/validation';

/**
 * Lists audit logs with pagination and multi-criteria filtering.
 * Selects only safe actor fields to prevent leaking credentials or tokens.
 */
export async function listAuditLogs(
  query: ListAuditLogsQuery,
  db?: PrismaClient
): Promise<ListAuditLogsResponseData> {
  const client = db || prisma;
  const { page = 1, limit = 20, action, targetType, actorId, fromDate, toDate } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {};

  if (action && action.trim().length > 0) {
    where.action = action.trim();
  }

  if (targetType && targetType.trim().length > 0) {
    where.targetType = targetType.trim();
  }

  if (actorId && actorId.trim().length > 0) {
    where.actorId = actorId.trim();
  }

  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      where.createdAt.gte = new Date(fromDate);
    }
    if (toDate) {
      const parsedTo = new Date(toDate);
      // If given a date-only string like YYYY-MM-DD, encompass the entire day
      if (toDate.length === 10) {
        parsedTo.setUTCHours(23, 59, 59, 999);
      }
      where.createdAt.lte = parsedTo;
    }
  }

  const [totalLogs, logs] = await Promise.all([
    client.auditLog.count({ where }),
    client.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        details: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            phone: true,
            role: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(totalLogs / limit) || 1;

  const mappedLogs: AuditLogItem[] = logs.map((log) => ({
    id: log.id,
    actorId: log.actorId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    details: (log.details as Record<string, unknown>) || null,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
    actor: {
      id: log.actor.id,
      phone: log.actor.phone,
      role: log.actor.role as unknown as UserRole,
      profile: log.actor.profile
        ? {
            fullName: log.actor.profile.fullName,
            avatarUrl: log.actor.profile.avatarUrl,
          }
        : null,
    },
  }));

  return {
    logs: mappedLogs,
    pagination: {
      page,
      limit,
      totalLogs,
      totalPages,
    },
  };
}

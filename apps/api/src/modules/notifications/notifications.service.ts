import { NotificationType as DbNotificationType, Prisma, PrismaClient } from '@apnasamaj/database';
import {
  NotificationType,
  NotificationItem,
  UnreadCountResponse,
  NotificationsResponseData,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
} from '@apnasamaj/shared-types';
import { NotificationsQueryInput } from '@apnasamaj/validation';

export class NotificationServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'NotificationServiceError';
    this.statusCode = statusCode;
  }
}

export class NotificationNotFoundError extends NotificationServiceError {
  constructor(message: string = 'Notification not found.') {
    super(message, 404);
  }
}

function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new NotificationServiceError('Tenant database context is required.', 400);
  }
  return db;
}

export interface CreateNotificationParams {
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
}

const notificationInclude = {
  actor: {
    select: {
      id: true,
      profile: {
        select: {
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.NotificationInclude;

type RawNotificationWithActor = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

function mapToNotificationItem(item: RawNotificationWithActor): NotificationItem {
  return {
    id: item.id,
    recipientId: item.recipientId,
    actorId: item.actorId,
    actor: item.actor
      ? {
          id: item.actor.id,
          fullName: item.actor.profile?.fullName || 'Community Member',
          avatarUrl: item.actor.profile?.avatarUrl || null,
        }
      : null,
    type: item.type as unknown as NotificationType,
    title: item.title,
    message: item.message,
    entityType: item.entityType,
    entityId: item.entityId,
    isRead: item.isRead,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Retrieves the count of unread notifications for a user.
 */
export async function getUnreadCount(
  userId: string,
  db?: PrismaClient
): Promise<UnreadCountResponse> {
  const client = assertDb(db);
  const unreadCount = await client.notification.count({
    where: {
      recipientId: userId,
      isRead: false,
    },
  });

  return { unreadCount };
}

/**
 * Lists paginated notifications for a user with optional unread-only filtering.
 */
export async function getNotifications(
  userId: string,
  query: NotificationsQueryInput,
  db?: PrismaClient
): Promise<NotificationsResponseData> {
  const client = assertDb(db);
  const { page = 1, limit = 20, unreadOnly } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationWhereInput = {
    recipientId: userId,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [total, unreadCount, rawNotifications] = await Promise.all([
    client.notification.count({ where }),
    client.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    }),
    client.notification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: notificationInclude,
    }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;
  const hasMore = page < totalPages;

  return {
    notifications: rawNotifications.map(mapToNotificationItem),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore,
    },
    unreadCount,
  };
}

/**
 * Marks a single notification as read.
 * Strict ownership check: returns 404 if not found or belongs to another user.
 */
export async function markAsRead(
  id: string,
  userId: string,
  db?: PrismaClient
): Promise<MarkNotificationReadResponse> {
  const client = assertDb(db);
  const notification = await client.notification.findUnique({
    where: { id },
    select: {
      id: true,
      recipientId: true,
      isRead: true,
      readAt: true,
    },
  });

  if (!notification || notification.recipientId !== userId) {
    throw new NotificationNotFoundError();
  }

  if (notification.isRead && notification.readAt) {
    return {
      id: notification.id,
      isRead: true,
      readAt: notification.readAt.toISOString(),
    };
  }

  const now = new Date();
  const updated = await client.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: now,
    },
  });

  return {
    id: updated.id,
    isRead: true,
    readAt: now.toISOString(),
  };
}

/**
 * Marks all unread notifications as read for the authenticated user.
 */
export async function markAllAsRead(
  userId: string,
  db?: PrismaClient
): Promise<MarkAllNotificationsReadResponse> {
  const client = assertDb(db);
  const now = new Date();
  const result = await client.notification.updateMany({
    where: {
      recipientId: userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: now,
    },
  });

  return {
    updatedCount: result.count,
  };
}

/**
 * Deletes a notification by ID.
 * Strict ownership check: returns 404 if not found or belongs to another user.
 */
export async function deleteNotification(
  id: string,
  userId: string,
  db?: PrismaClient
): Promise<void> {
  const client = assertDb(db);
  const notification = await client.notification.findUnique({
    where: { id },
    select: {
      id: true,
      recipientId: true,
    },
  });

  if (!notification || notification.recipientId !== userId) {
    throw new NotificationNotFoundError();
  }

  await client.notification.delete({
    where: { id },
  });
}

/**
 * Safe, non-blocking side-effect to record an in-app notification.
 * Automatically suppresses self-action notifications.
 * Catches and logs all errors so notification failures never disrupt primary operations.
 */
export async function sendNotificationSafely(
  params: CreateNotificationParams,
  db?: PrismaClient
): Promise<void> {
  // Suppress self-action notifications
  if (params.actorId && params.recipientId === params.actorId) {
    return;
  }

  if (!db) {
    console.warn('[Notification Service] Safe delivery skipped: missing tenant database client.', {
      type: params.type,
      recipientId: params.recipientId,
    });
    return;
  }

  try {
    // Deduplication safeguard for POST_LIKE:
    // Skip if an unread POST_LIKE notification from the same actor for the same post exists within the last 24 hours.
    if (params.type === 'POST_LIKE' && params.actorId && params.entityId) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingUnreadLikeNotification = await db.notification.findFirst({
        where: {
          recipientId: params.recipientId,
          actorId: params.actorId,
          type: 'POST_LIKE' as unknown as DbNotificationType,
          entityId: params.entityId,
          isRead: false,
          createdAt: {
            gte: twentyFourHoursAgo,
          },
        },
        select: { id: true },
      });

      if (existingUnreadLikeNotification) {
        return; // Suppress duplicate unread like notification
      }
    }

    await db.notification.create({
      data: {
        recipientId: params.recipientId,
        actorId: params.actorId || null,
        type: params.type as unknown as DbNotificationType,
        title: params.title,
        message: params.message,
        entityType: params.entityType || null,
        entityId: params.entityId || null,
      },
    });
  } catch (err: unknown) {
    // Non-blocking error handling: log warning, never throw
    console.warn('[Notification Service] Safe delivery failed:', {
      type: params.type,
      recipientId: params.recipientId,
      error: err instanceof Error ? err.message : err,
    });
  }
}

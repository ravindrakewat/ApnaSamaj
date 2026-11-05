import { PrismaClient, DevicePlatform, NotificationDeliveryStatus } from '@apnasamaj/database';
import {
  RegisterDeviceTokenInput,
  RegisterDeviceTokenResponseData,
  NotificationPreferencesItem,
  UpdateNotificationPreferencesInput,
  PushNotificationRoutingPayload,
} from '@apnasamaj/shared-types';
import {
  sendMulticastPushNotification,
  isApnsDeviceToken,
  PushNotificationMessage,
} from '../../services/firebase.service';

export class PushServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'PushServiceError';
    this.statusCode = statusCode;
  }
}

function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new PushServiceError('Tenant database context is required.', 400);
  }
  return db;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesItem = {
  personalMessages: true,
  groupMessages: true,
  matrimonial: true,
  likes: true,
  comments: true,
  announcements: true,
  communityUpdates: true,
};

/**
 * Registers or updates a device push token for an authenticated user.
 * Prevents duplicate active tokens, handles device migrations, and maintains tenant isolation.
 * Never leaks the full FCM token in response.
 */
export async function registerDevicePushToken(
  userId: string,
  input: RegisterDeviceTokenInput,
  db?: PrismaClient
): Promise<RegisterDeviceTokenResponseData> {
  const client = assertDb(db);
  const now = new Date();

  const tokenTrimmed = input.token.trim();
  if (!tokenTrimmed) {
    throw new PushServiceError('FCM registration token cannot be empty.', 400);
  }

  const platform = input.platform as DevicePlatform;
  const deviceId = input.deviceId ? input.deviceId.trim() : null;

  // Strict Token Validation & Safe APNs Detection:
  // If an iOS client submits a raw 64-character APNs device token (rather than a true FCM registration token),
  // do NOT silently register it as an active FCM token (which would cause FCM v1 rejection).
  // Instead, store it as inactive (isActive: false) and return this clear status to the client.
  const isRawApns = platform === 'IOS' && (input.tokenType === 'APNS' || isApnsDeviceToken(tokenTrimmed));
  const isActive = !isRawApns;

  if (isRawApns) {
    console.warn(
      `[Push Service] Notice: iOS device registered raw APNs device token (${tokenTrimmed.slice(0, 8)}...). Storing as inactive (isActive: false). Production iOS FCM push delivery requires a native FCM registration token obtained via @react-native-firebase/messaging in a custom development build.`
    );
  }

  // Upsert by token: If this physical device token already exists (e.g. previous user or refresh),
  // re-assign to the current authenticated user and update status atomically.
  const record = await client.devicePushToken.upsert({
    where: { token: tokenTrimmed },
    update: {
      userId,
      platform,
      deviceId,
      isActive,
      lastUsedAt: now,
      updatedAt: now,
    },
    create: {
      userId,
      token: tokenTrimmed,
      platform,
      deviceId,
      isActive,
      lastUsedAt: now,
    },
    select: {
      id: true,
      platform: true,
      isActive: true,
      createdAt: true,
    },
  });

  return {
    id: record.id,
    platform: record.platform as 'ANDROID' | 'IOS',
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Deactivates a device push token upon user logout or device unregistration.
 * Token can be identified either by database UUID or by the FCM token string itself.
 */
export async function deactivateDevicePushToken(
  userId: string,
  tokenOrId: string,
  db?: PrismaClient
): Promise<{ success: boolean }> {
  const client = assertDb(db);
  const trimmed = tokenOrId.trim();

  await client.devicePushToken.updateMany({
    where: {
      userId,
      OR: [{ id: trimmed }, { token: trimmed }],
    },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Deactivates all device push tokens for a user (e.g. on global session destruction or password reset).
 */
export async function deactivateAllUserTokens(
  userId: string,
  db?: PrismaClient
): Promise<{ count: number }> {
  const client = assertDb(db);
  const res = await client.devicePushToken.updateMany({
    where: { userId },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });
  return { count: res.count };
}

/**
 * Retrieves user's notification preferences with secure default fallback.
 */
export async function getNotificationPreferences(
  userId: string,
  db?: PrismaClient
): Promise<NotificationPreferencesItem> {
  const client = assertDb(db);

  if (!client.notificationPreference || typeof client.notificationPreference.findUnique !== 'function') {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const pref = await client.notificationPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  return {
    personalMessages: pref.personalMessages,
    groupMessages: pref.groupMessages,
    matrimonial: pref.matrimonial,
    likes: pref.likes,
    comments: pref.comments,
    announcements: pref.announcements,
    communityUpdates: pref.communityUpdates,
  };
}

/**
 * Updates user notification preferences.
 */
export async function updateNotificationPreferences(
  userId: string,
  input: UpdateNotificationPreferencesInput,
  db?: PrismaClient
): Promise<NotificationPreferencesItem> {
  const client = assertDb(db);
  const now = new Date();

  const updated = await client.notificationPreference.upsert({
    where: { userId },
    update: {
      ...(input.personalMessages !== undefined ? { personalMessages: input.personalMessages } : {}),
      ...(input.groupMessages !== undefined ? { groupMessages: input.groupMessages } : {}),
      ...(input.matrimonial !== undefined ? { matrimonial: input.matrimonial } : {}),
      ...(input.likes !== undefined ? { likes: input.likes } : {}),
      ...(input.comments !== undefined ? { comments: input.comments } : {}),
      ...(input.announcements !== undefined ? { announcements: input.announcements } : {}),
      ...(input.communityUpdates !== undefined ? { communityUpdates: input.communityUpdates } : {}),
      updatedAt: now,
    },
    create: {
      userId,
      personalMessages: input.personalMessages ?? true,
      groupMessages: input.groupMessages ?? true,
      matrimonial: input.matrimonial ?? true,
      likes: input.likes ?? true,
      comments: input.comments ?? true,
      announcements: input.announcements ?? true,
      communityUpdates: input.communityUpdates ?? true,
    },
  });

  return {
    personalMessages: updated.personalMessages,
    groupMessages: updated.groupMessages,
    matrimonial: updated.matrimonial,
    likes: updated.likes,
    comments: updated.comments,
    announcements: updated.announcements,
    communityUpdates: updated.communityUpdates,
  };
}

export interface DispatchPushNotificationParams {
  recipientId: string;
  category: keyof NotificationPreferencesItem;
  title: string;
  body: string;
  routingPayload: PushNotificationRoutingPayload;
  actorId?: string | null;
}

/**
 * Dispatches an FCM push notification to all active devices of a recipient.
 * Enforces:
 *  1. Self-action suppression (never notify a user of their own actions).
 *  2. User notification preferences.
 *  3. Privacy protection: payload contains only generic routing parameters, no raw secrets or private messages.
 *  4. Automatic deactivation of stale / invalid tokens.
 *  5. Delivery logging.
 *  6. Non-blocking error containment: FCM failures NEVER break caller operations.
 */
export async function dispatchPushNotificationToUser(
  params: DispatchPushNotificationParams,
  db?: PrismaClient
): Promise<{ deliveredCount: number; skipped?: boolean; reason?: string }> {
  // 1. Suppress self actions
  if (params.actorId && params.recipientId === params.actorId) {
    return { deliveredCount: 0, skipped: true, reason: 'SELF_ACTION' };
  }

  if (!db || !db.devicePushToken || typeof db.devicePushToken.findMany !== 'function') {
    return { deliveredCount: 0, skipped: true, reason: 'MISSING_DB_CONTEXT' };
  }

  try {
    // 2. Check recipient preferences
    const preferences = await getNotificationPreferences(params.recipientId, db);
    if (!preferences[params.category]) {
      return { deliveredCount: 0, skipped: true, reason: 'CATEGORY_DISABLED_BY_USER' };
    }

    // 3. Query active device tokens for recipient
    const deviceTokens = await db.devicePushToken.findMany({
      where: {
        userId: params.recipientId,
        isActive: true,
      },
      select: {
        id: true,
        token: true,
      },
    });

    if (deviceTokens.length === 0) {
      return { deliveredCount: 0, skipped: true, reason: 'NO_ACTIVE_DEVICE_TOKENS' };
    }

    const tokenStrings = deviceTokens.map((d) => d.token);

    // 4. Construct privacy-safe FCM message
    // Convert routing payload to string-keyed dictionary for FCM data payload
    const stringData: Record<string, string> = {
      type: params.routingPayload.type,
      ...(params.routingPayload.conversationId ? { conversationId: params.routingPayload.conversationId } : {}),
      ...(params.routingPayload.groupId ? { groupId: params.routingPayload.groupId } : {}),
      ...(params.routingPayload.groupSlug ? { groupSlug: params.routingPayload.groupSlug } : {}),
      ...(params.routingPayload.postId ? { postId: params.routingPayload.postId } : {}),
      ...(params.routingPayload.interestId ? { interestId: params.routingPayload.interestId } : {}),
      ...(params.routingPayload.entityId ? { entityId: params.routingPayload.entityId } : {}),
    };

    const pushMessage: PushNotificationMessage = {
      title: params.title,
      body: params.body,
      data: stringData,
    };

    // 5. Send multicast push
    const result = await sendMulticastPushNotification(tokenStrings, pushMessage);

    // 6. Automatically deactivate permanently invalid tokens reported by FCM
    if (result.invalidTokens.length > 0) {
      await db.devicePushToken.updateMany({
        where: {
          token: { in: result.invalidTokens },
        },
        data: {
          isActive: false,
          updatedAt: new Date(),
        },
      });
      console.info(
        `[Push Service] Deactivated ${result.invalidTokens.length} stale/invalid FCM tokens for user ${params.recipientId}.`
      );
    }

    // 7. Record delivery log
    try {
      await db.notificationLog.create({
        data: {
          userId: params.recipientId,
          category: String(params.category),
          status: result.successCount > 0 ? ('DELIVERED' as NotificationDeliveryStatus) : ('FAILED' as NotificationDeliveryStatus),
          errorCode: result.failureCount > 0 ? 'PARTIAL_OR_FULL_FCM_DELIVERY_FAILURE' : null,
        },
      });
    } catch (logErr) {
      // Non-blocking
      console.warn('[Push Service] NotificationLog creation warning:', logErr);
    }

    return { deliveredCount: result.successCount };
  } catch (err: unknown) {
    // Non-blocking: never throw from push notification pipeline
    console.warn('[Push Service] Dispatch failed with error (suppressed):', err);
    return { deliveredCount: 0, skipped: true, reason: 'EXCEPTION_SUPPRESSED' };
  }
}

export interface DispatchMulticastPushParams {
  recipientIds: string[];
  category: keyof NotificationPreferencesItem;
  title: string;
  body: string;
  routingPayload: PushNotificationRoutingPayload;
  excludeUserId?: string | null;
}

/**
 * Dispatches push notifications to multiple recipients (e.g. group members, announcements).
 * Filters out excluded user (sender), checks individual preferences, and multicasts.
 */
export async function dispatchPushNotificationToMultipleUsers(
  params: DispatchMulticastPushParams,
  db?: PrismaClient
): Promise<{ totalDelivered: number }> {
  if (!db) return { totalDelivered: 0 };

  const targetRecipientIds = params.recipientIds.filter(
    (id) => typeof id === 'string' && id !== params.excludeUserId
  );

  if (targetRecipientIds.length === 0) {
    return { totalDelivered: 0 };
  }

  let totalDelivered = 0;

  // Process users safely without unbounded parallel starvation
  const BATCH_SIZE = 25;
  for (let i = 0; i < targetRecipientIds.length; i += BATCH_SIZE) {
    const chunk = targetRecipientIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      chunk.map((recipientId) =>
        dispatchPushNotificationToUser(
          {
            recipientId,
            category: params.category,
            title: params.title,
            body: params.body,
            routingPayload: params.routingPayload,
            actorId: params.excludeUserId,
          },
          db
        )
      )
    );

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.deliveredCount > 0) {
        totalDelivered += res.value.deliveredCount;
      }
    }
  }

  return { totalDelivered };
}

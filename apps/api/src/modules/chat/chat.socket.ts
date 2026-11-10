import http from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../../config/env';
import { isCorsOriginAllowed } from '../../config/cors';
import { verifyAccessToken } from '../auth/auth.tokens';
import { tenantDbManager, PrismaClient } from '@apnasamaj/database';
import { resolveCommunityFromRequest } from '@apnasamaj/validation';
import {
  sendChatMessage,
  verifyGroupChatAccess,
  toggleChatMessageReaction,
  removeChatMessageReaction,
  deleteGroupMessage,
} from './chat.service';
import {
  sendDirectMessage,
  verifyDirectConversationAccess,
  markDirectConversationAsRead,
  toggleDirectMessageReaction,
  removeDirectMessageReaction,
  deleteDirectMessage,
} from './direct-chat.service';
import {
  ChatMessageItem,
  NewChatMessageEvent,
  NotificationItem,
  ModerationQueueUpdatePayload,
  DirectMessageItem,
  DirectNewMessageEvent,
  DirectUserTypingEvent,
  DirectMessageReadEvent,
  ChatAttachmentInput,
  ChatReactionEventPayload,
  ToggleChatReactionResponseData,
  ChatMessageDeletedEvent,
  MessageDeleteScope,
} from '@apnasamaj/shared-types';

export interface AuthenticatedSocketUser {
  id: string;
  role: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CustomSocket extends Socket {
  data: {
    user?: AuthenticatedSocketUser;
    tenant?: {
      slug: string;
    };
    db?: PrismaClient;
  };
}

// In-memory rate limiting map: tracks timestamp of last sent message per user
const userLastMessageTime = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_MS = 1000; // ~1 message per second

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const lastTime = userLastMessageTime.get(userId) || 0;
  if (now - lastTime < RATE_LIMIT_COOLDOWN_MS) {
    return false; // Rate limit exceeded
  }
  userLastMessageTime.set(userId, now);
  return true;
}

let ioInstance: Server | null = null;

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized yet.');
  }
  return ioInstance;
}

export function getCommunityModerationRoomName(tenantSlug: string): string {
  return `${tenantSlug}:moderation:queue`;
}

/**
 * Emits a real-time moderation queue update strictly scoped to privileged moderators of the community.
 * Minimum required payload is transmitted without exposing personal or reporter data.
 */
export function emitModerationQueueUpdate(
  tenantSlug: string,
  payload: ModerationQueueUpdatePayload
): void {
  if (!ioInstance) return;
  try {
    const room = getCommunityModerationRoomName(tenantSlug);
    ioInstance.to(room).emit('moderation:queue-updated', payload);
  } catch (err: unknown) {
    console.warn('[Realtime Moderation] Failed to emit queue update:', err);
  }
}

export function getConversationRoomName(tenantSlug: string, conversationId: string): string {
  return `${tenantSlug}:conversation:${conversationId}`;
}

export function getUserNotificationRoomName(tenantSlug: string, userId: string): string {
  return `${tenantSlug}:user:${userId}`;
}

/**
 * Emits a real-time notification and updated unread count to the recipient's authenticated room.
 * Minimum safe payload required by the frontend is transmitted.
 */
export function emitRealtimeNotification(
  tenantSlug: string,
  recipientId: string,
  notification: any,
  unreadCount: number
): void {
  if (!ioInstance) return;
  try {
    const userRoom = getUserNotificationRoomName(tenantSlug, recipientId);

    const mappedNotification: NotificationItem = {
      id: notification.id,
      recipientId: notification.recipientId,
      actorId: notification.actorId || null,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType || null,
      entityId: notification.entityId || null,
      isRead: Boolean(notification.isRead),
      readAt: notification.readAt
        ? typeof notification.readAt === 'string'
          ? notification.readAt
          : notification.readAt.toISOString()
        : null,
      createdAt:
        typeof notification.createdAt === 'string'
          ? notification.createdAt
          : notification.createdAt.toISOString(),
      actor: notification.actor
        ? {
            id: notification.actor.id,
            fullName: notification.actor.profile?.fullName || 'Community Member',
            avatarUrl: notification.actor.profile?.avatarUrl || null,
          }
        : undefined,
    };

    ioInstance.to(userRoom).emit('notification:new', {
      notification: mappedNotification,
    });

    ioInstance.to(userRoom).emit('notification:unread-count', {
      unreadCount,
    });
  } catch (err: unknown) {
    console.warn('[Realtime Notification] Failed to emit to user room:', err);
  }
}

/**
 * Emits updated unread count to a recipient's authenticated room (e.g. after mark as read).
 */
export function emitRealtimeUnreadCount(
  tenantSlug: string,
  recipientId: string,
  unreadCount: number
): void {
  if (!ioInstance) return;
  try {
    const userRoom = getUserNotificationRoomName(tenantSlug, recipientId);
    ioInstance.to(userRoom).emit('notification:unread-count', {
      unreadCount,
    });
  } catch (err: unknown) {
    console.warn('[Realtime Notification] Failed to emit unread count:', err);
  }
}

export async function chatSocketAuthMiddleware(
  socket: CustomSocket,
  next: (err?: any) => void
): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  try {
    // 1. Resolve community tenant context from handshake
    const origin = (socket.handshake.headers['origin'] as string | undefined) || undefined;
    const referer = (socket.handshake.headers['referer'] as string | undefined) || undefined;
    const hostHeader = (socket.handshake.headers['host'] as string | undefined) || undefined;
    const hostname = hostHeader ? hostHeader.split(':')[0] : undefined;
    const headerSlug =
      (socket.handshake.headers['x-community-slug'] as string | undefined) ||
      (socket.handshake.auth?.community as string | undefined) ||
      undefined;
    const querySlug = (socket.handshake.query?.community as string | undefined) || undefined;

    const resolved = resolveCommunityFromRequest({
      hostname,
      origin,
      referer,
      headerSlug,
      querySlug,
      isProduction,
    });

    // Reject if there is a conflict between origin/host and client header
    if (resolved.conflict) {
      return next(
        new Error(`Authentication failed: Tenant conflict (${resolved.conflict.message})`)
      );
    }

    // Community tenant is mandatory for chat
    if (!resolved.slug) {
      return next(
        new Error(
          'Authentication failed: Community tenant context required. Please connect via a community origin or declare community.'
        )
      );
    }

    // Validate tenant exists in preconfigured trusted registry
    if (!tenantDbManager.hasCommunity(resolved.slug)) {
      return next(
        new Error(
          `Authentication failed: Unknown community tenant "${resolved.slug}". This community is not registered.`
        )
      );
    }

    const tenantDb = tenantDbManager.getClient(resolved.slug);

    // 2. Extract Bearer token from handshake auth or headers
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token || typeof token !== 'string' || !token.trim()) {
      return next(new Error('Authentication required: Missing access token.'));
    }

    // 3. Cryptographic signature and expiration check
    let payload;
    try {
      payload = verifyAccessToken(token.trim());
    } catch (err: unknown) {
      const isExpired = (err as { name?: string })?.name === 'TokenExpiredError';
      return next(
        new Error(
          isExpired ? 'Authentication failed: Token expired.' : 'Authentication failed: Invalid token.'
        )
      );
    }

    // 4. Database verification on the resolved tenant database: user exists and status is ACTIVE
    const dbUser = await tenantDb.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        status: true,
        profile: {
          select: {
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!dbUser || dbUser.status !== 'ACTIVE') {
      return next(
        new Error(
          'Authentication failed: Account not found or inactive in this community.'
        )
      );
    }

    // 5. Strictly bind user and tenant database context to socket instance (immutable for connection lifetime)
    socket.data.user = {
      id: dbUser.id,
      role: dbUser.role,
      fullName: dbUser.profile?.fullName || 'Community Member',
      avatarUrl: dbUser.profile?.avatarUrl || null,
    };
    socket.data.tenant = {
      slug: resolved.slug,
    };
    socket.data.db = tenantDb;

    next();
  } catch {
    next(new Error('Authentication failed: Server error.'));
  }
}

export function initChatSocketServer(httpServer: http.Server): Server {
  const isProduction = process.env.NODE_ENV === 'production';
  const extraAllowed = [
    config.clientUrl,
    config.adminUrl,
    process.env.CLIENT_URL,
    process.env.ADMIN_URL,
  ]
    .flatMap((o) => (o ? o.split(',') : []))
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isCorsOriginAllowed(origin, { isProduction, extraAllowed })) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    path: '/socket.io',
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  ioInstance = io;

  // --------------------------------------------------------
  // SOCKET TENANT RESOLUTION & AUTHENTICATION MIDDLEWARE
  // --------------------------------------------------------
  io.use(chatSocketAuthMiddleware);

  // --------------------------------------------------------
  // SOCKET EVENT LIFECYCLE & HANDLERS (TENANT ISOLATED)
  // --------------------------------------------------------
  io.on('connection', (socket: CustomSocket) => {
    const user = socket.data.user;
    const tenant = socket.data.tenant;
    const db = socket.data.db;

    if (!user || !tenant || !db) {
      socket.disconnect(true);
      return;
    }

    const tenantSlug = tenant.slug;
    const getTenantRoomName = (groupId: string) => `${tenantSlug}:group:${groupId}`;
    const getDirectRoomName = (conversationId: string) => getConversationRoomName(tenantSlug, conversationId);
    const userRoomName = getUserNotificationRoomName(tenantSlug, user.id);

    // Automatically join the authenticated user's notification room within their verified tenant
    socket.join(userRoomName);

    // Guard: Prevent arbitrary-user room subscription attempts
    socket.on(
      'join_user_notifications',
      (
        payload: { userId?: string },
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        // Strict Security Guard: Never trust a client-supplied userId
        if (payload?.userId && payload.userId !== user.id) {
          callback?.({
            success: false,
            error: 'Forbidden: Cannot subscribe to another user notification room.',
          });
          return;
        }
        socket.join(userRoomName);
        callback?.({ success: true });
      }
    );

    const moderationRoomName = getCommunityModerationRoomName(tenantSlug);
    const isModeratorOrAdmin = ['SUPER_ADMIN', 'COMMUNITY_ADMIN', 'MODERATOR'].includes(user.role);

    // Automatically join the moderation room for authorized moderators/admins
    if (isModeratorOrAdmin) {
      socket.join(moderationRoomName);
    }

    // Explicit moderation queue subscription listener with server-side authorization check
    socket.on(
      'join_moderation_queue',
      (
        _payload: unknown,
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        if (!['SUPER_ADMIN', 'COMMUNITY_ADMIN', 'MODERATOR'].includes(user.role)) {
          callback?.({
            success: false,
            error: 'Forbidden: Insufficient privileges for moderation queue.',
          });
          return;
        }
        socket.join(moderationRoomName);
        callback?.({ success: true });
      }
    );

    // Explicit leave_moderation_queue listener
    socket.on('leave_moderation_queue', () => {
      socket.leave(moderationRoomName);
    });

    // 1. Join Group Chat Room
    socket.on(
      'join_group',
      async (
        payload: { groupId: string },
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        try {
          const { groupId } = payload || {};
          if (!groupId) {
            callback?.({ success: false, error: 'Group ID is required.' });
            return;
          }

          // Authorize access against tenant database
          const { group } = await verifyGroupChatAccess(groupId, user.id, false, db);
          const roomName = getTenantRoomName(group.id);
          socket.join(roomName);

          callback?.({ success: true });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to join group chat.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // 2. Leave Group Chat Room
    socket.on('leave_group', (payload: { groupId: string }) => {
      if (payload?.groupId) {
        socket.leave(getTenantRoomName(payload.groupId));
      }
    });

    // 3. Send Message
    socket.on(
      'send_message',
      async (
        payload: {
          groupId: string;
          content?: string;
          attachment?: ChatAttachmentInput;
          replyToMessageId?: string;
          tempId?: string;
        },
        callback?: (res: { success: boolean; message?: ChatMessageItem; error?: string }) => void
      ) => {
        try {
          const { groupId, content, attachment, replyToMessageId, tempId } = payload || {};
          if (!groupId || (!content && !attachment)) {
            callback?.({ success: false, error: 'Group ID and message content or attachment are required.' });
            return;
          }

          // Rate limit enforcement (~1 message per second)
          if (!checkRateLimit(user.id)) {
            callback?.({
              success: false,
              error: 'You are sending messages too quickly. Please wait a moment.',
            });
            return;
          }

          // Server-side authorization & database persistence on tenant db
          const savedMessage = await sendChatMessage(
            groupId,
            user.id,
            content,
            attachment,
            tempId,
            db,
            undefined,
            replyToMessageId
          );

          // Broadcast strictly to sockets in the tenant's group room
          const eventPayload: NewChatMessageEvent = {
            message: savedMessage,
            tempId,
          };
          const roomName = getTenantRoomName(savedMessage.groupId);
          io.to(roomName).emit('new_message', eventPayload);

          // Acknowledge sender callback
          callback?.({ success: true, message: savedMessage });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to send message.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // 3.1 Emoji Reaction on Group Chat Message
    socket.on(
      'chat:react',
      async (
        payload: { groupId: string; messageId: string; emoji: string },
        callback?: (res: { success: boolean; data?: ToggleChatReactionResponseData; error?: string }) => void
      ) => {
        try {
          const { groupId, messageId, emoji } = payload || {};
          if (!groupId || !messageId || !emoji) {
            callback?.({ success: false, error: 'Group ID, message ID, and emoji are required.' });
            return;
          }

          const result = await toggleChatMessageReaction(groupId, messageId, user.id, emoji, db);
          const targetGroupId = result.groupId || groupId;

          const reactionPayload: ChatReactionEventPayload = {
            conversationId: targetGroupId,
            conversationType: 'GROUP',
            messageId,
            reactions: result.reactions,
            userId: user.id,
            emoji,
            action: result.action,
          };
          io.to(getTenantRoomName(targetGroupId)).emit('chat:reaction', reactionPayload);

          callback?.({ success: true, data: result });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to update reaction.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // 4. Typing Indicators
    socket.on('typing_start', (payload: { groupId: string }) => {
      if (payload?.groupId) {
        socket.to(getTenantRoomName(payload.groupId)).emit('user_typing', {
          groupId: payload.groupId,
          userId: user.id,
          userName: user.fullName,
          isTyping: true,
        });
      }
    });

    socket.on('typing_stop', (payload: { groupId: string }) => {
      if (payload?.groupId) {
        socket.to(getTenantRoomName(payload.groupId)).emit('user_typing', {
          groupId: payload.groupId,
          userId: user.id,
          userName: user.fullName,
          isTyping: false,
        });
      }
    });

    // 5. Delete Group Message
    socket.on(
      'chat:delete_message',
      async (
        payload: { groupId: string; messageId: string; scope: MessageDeleteScope },
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        try {
          const { groupId, messageId, scope } = payload || {};
          if (!groupId || !messageId || !scope) {
            callback?.({ success: false, error: 'Group ID, message ID, and scope are required.' });
            return;
          }

          const result = await deleteGroupMessage(groupId, messageId, user.id, scope, db);

          if (scope === 'EVERYONE') {
            const eventPayload: ChatMessageDeletedEvent = {
              messageId,
              scope: 'EVERYONE',
              groupId,
              conversationType: 'GROUP',
              deletedByUserId: user.id,
              deletedAt: new Date().toISOString(),
            };
            io.to(getTenantRoomName(groupId)).emit('chat:message_deleted', eventPayload);
          }

          callback?.({ success: true });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to delete message.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // --------------------------------------------------------
    // DIRECT ONE-TO-ONE CHAT LISTENERS
    // --------------------------------------------------------

    // A. Join Direct Conversation Room
    socket.on(
      'direct:join',
      async (
        payload: { conversationId: string },
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        try {
          const { conversationId } = payload || {};
          if (!conversationId) {
            callback?.({ success: false, error: 'Conversation ID is required.' });
            return;
          }

          // Authorize access: strictly verify user is a participant
          await verifyDirectConversationAccess(conversationId, user.id, db);
          const roomName = getDirectRoomName(conversationId);
          socket.join(roomName);

          callback?.({ success: true });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to join direct conversation.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // B. Leave Direct Conversation Room
    socket.on('direct:leave', (payload: { conversationId: string }) => {
      if (payload?.conversationId) {
        socket.leave(getDirectRoomName(payload.conversationId));
      }
    });

    // C. Send Direct Message
    socket.on(
      'direct:send_message',
      async (
        payload: {
          conversationId: string;
          content?: string;
          attachment?: ChatAttachmentInput;
          replyToMessageId?: string;
          tempId?: string;
        },
        callback?: (res: { success: boolean; message?: DirectMessageItem; error?: string }) => void
      ) => {
        try {
          const { conversationId, content, attachment, replyToMessageId, tempId } = payload || {};
          if (!conversationId || (!content && !attachment)) {
            callback?.({ success: false, error: 'Conversation ID and message content or attachment are required.' });
            return;
          }

          // Rate limit enforcement (~1 message per second)
          if (!checkRateLimit(user.id)) {
            callback?.({
              success: false,
              error: 'You are sending messages too quickly. Please wait a moment.',
            });
            return;
          }

          // Verify access & persist message
          const savedMessage = await sendDirectMessage(
            conversationId,
            user.id,
            content,
            attachment,
            tempId,
            db,
            undefined,
            replyToMessageId
          );

          // Broadcast strictly to participants in the direct conversation room
          const eventPayload: DirectNewMessageEvent = {
            message: savedMessage,
            tempId,
          };
          const roomName = getDirectRoomName(conversationId);
          io.to(roomName).emit('direct:new_message', eventPayload);

          // Acknowledge sender callback
          callback?.({ success: true, message: savedMessage });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to send message.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // C.1 Emoji Reaction on Direct Message
    socket.on(
      'direct:react',
      async (
        payload: { conversationId: string; messageId: string; emoji: string },
        callback?: (res: { success: boolean; data?: ToggleChatReactionResponseData; error?: string }) => void
      ) => {
        try {
          const { conversationId, messageId, emoji } = payload || {};
          if (!conversationId || !messageId || !emoji) {
            callback?.({ success: false, error: 'Conversation ID, message ID, and emoji are required.' });
            return;
          }

          const result = await toggleDirectMessageReaction(conversationId, messageId, user.id, emoji, db);

          const reactionPayload: ChatReactionEventPayload = {
            conversationId,
            conversationType: 'DIRECT',
            messageId,
            reactions: result.reactions,
            userId: user.id,
            emoji,
            action: result.action,
          };
          io.to(getDirectRoomName(conversationId)).emit('direct:reaction', reactionPayload);

          callback?.({ success: true, data: result });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to update reaction.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // D. Direct Typing Indicators
    socket.on(
      'direct:user_typing',
      async (payload: { conversationId: string; isTyping: boolean }) => {
        try {
          const { conversationId, isTyping } = payload || {};
          if (!conversationId) return;

          // Verify user is in this conversation
          await verifyDirectConversationAccess(conversationId, user.id, db);

          const eventPayload: DirectUserTypingEvent = {
            conversationId,
            userId: user.id,
            userName: user.fullName,
            isTyping: Boolean(isTyping),
          };

          socket.to(getDirectRoomName(conversationId)).emit('direct:user_typing', eventPayload);
        } catch {
          // Ignore unauthorized typing events
        }
      }
    );

    // E. Direct Message Read Status
    socket.on(
      'direct:message_read',
      async (
        payload: { conversationId: string },
        callback?: (res: { success: boolean; readAt?: string; error?: string }) => void
      ) => {
        try {
          const { conversationId } = payload || {};
          if (!conversationId) {
            callback?.({ success: false, error: 'Conversation ID is required.' });
            return;
          }

          const result = await markDirectConversationAsRead(conversationId, user.id, db);

          const eventPayload: DirectMessageReadEvent = {
            conversationId,
            userId: user.id,
            readAt: result.readAt,
          };

          // Broadcast to conversation room so other participant sees blue ticks/read status
          socket.to(getDirectRoomName(conversationId)).emit('direct:message_read', eventPayload);

          callback?.({ success: true, readAt: result.readAt });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to mark conversation as read.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // F. Delete Direct Message
    socket.on(
      'direct:delete_message',
      async (
        payload: { conversationId: string; messageId: string; scope: MessageDeleteScope },
        callback?: (res: { success: boolean; error?: string }) => void
      ) => {
        try {
          const { conversationId, messageId, scope } = payload || {};
          if (!conversationId || !messageId || !scope) {
            callback?.({ success: false, error: 'Conversation ID, message ID, and scope are required.' });
            return;
          }

          const result = await deleteDirectMessage(conversationId, messageId, user.id, scope, db);

          if (scope === 'EVERYONE') {
            const eventPayload: ChatMessageDeletedEvent = {
              messageId,
              scope: 'EVERYONE',
              conversationId,
              conversationType: 'DIRECT',
              deletedByUserId: user.id,
              deletedAt: new Date().toISOString(),
            };
            io.to(getDirectRoomName(conversationId)).emit('direct:message_deleted', eventPayload);
          }

          callback?.({ success: true });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to delete message.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // 5. Disconnect Cleanup
    socket.on('disconnect', () => {
      // Memory cleanup for user rate limiting map
      if (user?.id) {
        userLastMessageTime.delete(user.id);
      }
    });
  });

  return io;
}

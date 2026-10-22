import http from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../../config/env';
import { verifyAccessToken } from '../auth/auth.tokens';
import { prisma } from '@apnasamaj/database';
import { sendChatMessage, verifyGroupChatAccess } from './chat.service';
import { ChatMessageItem, NewChatMessageEvent } from '@apnasamaj/shared-types';

export interface AuthenticatedSocketUser {
  id: string;
  role: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CustomSocket extends Socket {
  data: {
    user?: AuthenticatedSocketUser;
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

export function initChatSocketServer(httpServer: http.Server): Server {
  const allowedOrigins = [
    config.clientUrl,
    config.adminUrl,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ].filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
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
  // SOCKET AUTHENTICATION MIDDLEWARE
  // --------------------------------------------------------
  io.use(async (socket: CustomSocket, next) => {
    try {
      // 1. Extract Bearer token from handshake auth or headers
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!token || typeof token !== 'string' || !token.trim()) {
        return next(new Error('Authentication required: Missing access token.'));
      }

      // 2. Cryptographic signature and expiration check
      let payload;
      try {
        payload = verifyAccessToken(token.trim());
      } catch (err: unknown) {
        const isExpired = (err as { name?: string })?.name === 'TokenExpiredError';
        return next(
          new Error(isExpired ? 'Authentication failed: Token expired.' : 'Authentication failed: Invalid token.')
        );
      }

      // 3. Database verification: user exists and status is ACTIVE
      const dbUser = await prisma.user.findUnique({
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
        return next(new Error('Authentication failed: Account not found or inactive.'));
      }

      // Attach strictly verified user session to socket
      socket.data.user = {
        id: dbUser.id,
        role: dbUser.role,
        fullName: dbUser.profile?.fullName || 'Community Member',
        avatarUrl: dbUser.profile?.avatarUrl || null,
      };

      next();
    } catch {
      next(new Error('Authentication failed: Server error.'));
    }
  });

  // --------------------------------------------------------
  // SOCKET EVENT LIFECYCLE & HANDLERS
  // --------------------------------------------------------
  io.on('connection', (socket: CustomSocket) => {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

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

          // Authorize access against database
          const { group } = await verifyGroupChatAccess(groupId, user.id, false);
          const roomName = `group:${group.id}`;
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
        socket.leave(`group:${payload.groupId}`);
      }
    });

    // 3. Send Message
    socket.on(
      'send_message',
      async (
        payload: { groupId: string; content: string; tempId?: string },
        callback?: (res: { success: boolean; message?: ChatMessageItem; error?: string }) => void
      ) => {
        try {
          const { groupId, content, tempId } = payload || {};
          if (!groupId || !content) {
            callback?.({ success: false, error: 'Group ID and message content are required.' });
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

          // Server-side authorization & database persistence (runs before broadcast)
          const savedMessage = await sendChatMessage(groupId, user.id, content, tempId);

          // Broadcast to all sockets in the group room
          const eventPayload: NewChatMessageEvent = {
            message: savedMessage,
            tempId,
          };
          io.to(`group:${savedMessage.groupId}`).emit('new_message', eventPayload);

          // Acknowledge sender callback
          callback?.({ success: true, message: savedMessage });
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to send message.';
          callback?.({ success: false, error: errorMsg });
        }
      }
    );

    // 4. Typing Indicators
    socket.on('typing_start', (payload: { groupId: string }) => {
      if (payload?.groupId) {
        socket.to(`group:${payload.groupId}`).emit('user_typing', {
          groupId: payload.groupId,
          userId: user.id,
          userName: user.fullName,
          isTyping: true,
        });
      }
    });

    socket.on('typing_stop', (payload: { groupId: string }) => {
      if (payload?.groupId) {
        socket.to(`group:${payload.groupId}`).emit('user_typing', {
          groupId: payload.groupId,
          userId: user.id,
          userName: user.fullName,
          isTyping: false,
        });
      }
    });

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

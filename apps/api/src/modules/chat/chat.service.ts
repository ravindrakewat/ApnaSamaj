import { Prisma, PrismaClient } from '@apnasamaj/database';
import {
  ChatMessageItem,
  ChatMessagesResponseData,
  ChatAttachmentItem,
  ChatAttachmentInput,
} from '@apnasamaj/shared-types';
import { ListGroupMessagesQueryInput } from '@apnasamaj/validation';
import { dispatchPushNotificationToMultipleUsers } from '../notifications/push-notification.service';
import { chatIdempotencyService } from './chat-idempotency.service';

export class ChatServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'ChatServiceError';
    this.statusCode = statusCode;
  }
}

export class ChatNotFoundError extends ChatServiceError {
  constructor(message: string = 'Group not found.') {
    super(message, 404);
  }
}

export class ForbiddenChatError extends ChatServiceError {
  constructor(message: string = 'Access denied: You do not have permission for this chat room.') {
    super(message, 403);
  }
}

function isPrismaClient(val: any): val is PrismaClient {
  return Boolean(val && typeof val === 'object' && ('$connect' in val || 'user' in val || 'chatMessage' in val || 'directMessage' in val));
}

function isChatAttachmentInput(val: any): val is ChatAttachmentInput {
  return Boolean(val && typeof val === 'object' && ('storagePath' in val || 'mimeType' in val || 'fileSizeBytes' in val));
}

function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new ChatServiceError('Tenant database context is required.', 400);
  }
  return db;
}

const chatMessageInclude = {
  sender: {
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
  attachments: true,
} satisfies Prisma.ChatMessageInclude;

type RawChatMessage = Prisma.ChatMessageGetPayload<{
  include: typeof chatMessageInclude;
}>;

export function mapToChatMessageItem(item: RawChatMessage): ChatMessageItem {
  return {
    id: item.id,
    groupId: item.groupId,
    senderId: item.senderId,
    content: item.content,
    clientMessageId: (item as any).clientMessageId || null,
    tempId: (item as any).clientMessageId || undefined,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    sender: item.sender
      ? {
          id: item.sender.id,
          fullName: item.sender.profile?.fullName || 'Community Member',
          avatarUrl: item.sender.profile?.avatarUrl || null,
        }
      : null,
    attachments: ((item as any).attachments || []).map((att: any) => ({
      id: att.id,
      chatMessageId: att.chatMessageId,
      type: att.type,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSizeBytes: att.fileSizeBytes,
      storagePath: att.storagePath,
      url: `https://mock-storage.apnasamaj.local/chat-attachments/${att.storagePath}?token=mock-signed-token&expires=3600`,
      duration: att.duration != null ? att.duration : undefined,
      createdAt: att.createdAt instanceof Date ? att.createdAt.toISOString() : att.createdAt,
    })),
  };
}

/**
 * Validates group existence and verifies member access authorization.
 * If the group is PRIVATE, user MUST be an active member.
 * If requireActiveMembership is true, user must be a member even in public groups (required to send messages).
 */
export async function verifyGroupChatAccess(
  groupIdOrSlug: string,
  userId: string,
  requireActiveMembership: boolean = false,
  db?: PrismaClient
): Promise<{ group: { id: string; name: string; slug: string; privacy: string }; isMember: boolean }> {
  const client = assertDb(db);
  const group = await client.group.findFirst({
    where: {
      OR: [{ id: groupIdOrSlug }, { slug: groupIdOrSlug }],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      privacy: true,
    },
  });

  if (!group) {
    throw new ChatNotFoundError();
  }

  const membership = await client.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId: group.id,
        userId,
      },
    },
  });

  const isMember = Boolean(membership);

  // Private group access restriction: non-members cannot enter room or read chat history
  if (group.privacy === 'PRIVATE' && !isMember) {
    throw new ForbiddenChatError('You must be a member of this private group to access its chat.');
  }

  // To send messages in any group (public or private), membership is required
  if (requireActiveMembership && !isMember) {
    throw new ForbiddenChatError('You must join this group before you can send chat messages.');
  }

  return { group, isMember };
}

/**
 * Retrieves chat message history with cursor-based pagination.
 * Safely handles unapplied database migration with a graceful empty fallback.
 */
export async function getGroupChatHistory(
  groupIdOrSlug: string,
  userId: string,
  query: ListGroupMessagesQueryInput,
  db?: PrismaClient
): Promise<ChatMessagesResponseData> {
  const client = assertDb(db);
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  const limit = Math.min(Math.max(query.limit || 20, 1), 50);
  const beforeDate = query.before ? new Date(query.before) : undefined;

  try {
    const where: Prisma.ChatMessageWhereInput = {
      groupId: group.id,
      ...(beforeDate && !isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
    };

    const rawMessages = await client.chatMessage.findMany({
      where,
      take: limit + 1, // take 1 extra to determine hasMore
      orderBy: { createdAt: 'desc' },
      include: chatMessageInclude,
    });

    const hasMore = rawMessages.length > limit;
    const sliced = hasMore ? rawMessages.slice(0, limit) : rawMessages;
    const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].createdAt.toISOString() : null;

    return {
      messages: (sliced as unknown as RawChatMessage[]).map(mapToChatMessageItem),
      nextCursor,
      hasMore,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // If ChatMessage table is not yet migrated to the database, report migration pending
    if (message.includes('ChatMessage') || message.includes('does not exist')) {
      console.warn('[Chat Service] ChatMessage table not yet created in database:', message);
      throw new ChatServiceError('Chat service is temporarily offline (database migration pending).', 503);
    }
    throw err;
  }
}

/**
 * Saves a new chat message to PostgreSQL using Prisma.
 * Verifies active membership on the server before writing.
 * Overload-safe: supports both (groupId, senderId, content, tempId?, db?, attachment?) and (groupId, senderId, content, attachment?, tempId?, db?).
 */
export async function sendChatMessage(
  groupIdOrSlug: string,
  senderId: string,
  content?: string,
  attachmentOrTempId?: string | ChatAttachmentInput,
  tempIdOrDb?: string | PrismaClient,
  db?: PrismaClient,
  attachment?: ChatAttachmentInput
): Promise<ChatMessageItem> {
  let resolvedTempId: string | undefined;
  let resolvedDb: PrismaClient | undefined;
  let resolvedAttachment: ChatAttachmentInput | undefined;

  for (const arg of [attachmentOrTempId, tempIdOrDb, db, attachment]) {
    if (!arg) continue;
    if (typeof arg === 'string' && !resolvedTempId) {
      resolvedTempId = arg;
    } else if (isPrismaClient(arg) && !resolvedDb) {
      resolvedDb = arg;
    } else if (isChatAttachmentInput(arg) && !resolvedAttachment) {
      resolvedAttachment = arg;
    }
  }

  const client = assertDb(resolvedDb);
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, senderId, true, client);

  const trimmed = content ? content.trim() : '';
  if (!trimmed && !resolvedAttachment) {
    throw new ChatServiceError('Message content or attachment cannot be empty.', 400);
  }
  if (trimmed.length > 2000) {
    throw new ChatServiceError('Message content cannot exceed 2000 characters.', 400);
  }

  // 1. Idempotency fast-path: Check if message already exists with this clientMessageId
  if (resolvedTempId) {
    try {
      const existing = await client.chatMessage.findFirst({
        where: {
          groupId: group.id,
          senderId,
          clientMessageId: resolvedTempId,
        },
        include: chatMessageInclude,
      });
      if (existing) {
        return mapToChatMessageItem(existing as unknown as RawChatMessage);
      }
    } catch {
      // Suppress if column query fails on unmigrated database
    }
  }

  if (resolvedAttachment) {
    if (!resolvedAttachment.storagePath || !resolvedAttachment.storagePath.includes(group.id)) {
      throw new ChatServiceError('Invalid attachment path for this group.', 400);
    }
    const existingAttachment = await client.chatAttachment.findFirst({
      where: { storagePath: resolvedAttachment.storagePath },
      include: {
        chatMessage: {
          include: chatMessageInclude,
        },
      },
    });
    if (existingAttachment) {
      // If this attachment already belongs to a message created by the same sender in this group,
      // and matches the clientMessageId (or was already created), return that existing message safely
      if (
        existingAttachment.chatMessage &&
        existingAttachment.chatMessage.groupId === group.id &&
        existingAttachment.chatMessage.senderId === senderId &&
        (!resolvedTempId || (existingAttachment.chatMessage as any).clientMessageId === resolvedTempId)
      ) {
        return mapToChatMessageItem(existingAttachment.chatMessage as unknown as RawChatMessage);
      }
      throw new ChatServiceError('Attachment has already been associated with an existing message.', 400);
    }
  }

  const idempotencyKey = resolvedTempId
    ? chatIdempotencyService.buildKey(group.slug || group.id, 'GROUP', group.id, senderId, resolvedTempId)
    : undefined;

  return await chatIdempotencyService.executeIdempotent(idempotencyKey, async () => {
    // 1. Check if message already exists with this clientMessageId
    if (resolvedTempId) {
      try {
        const existing = await client.chatMessage.findFirst({
          where: {
            groupId: group.id,
            senderId,
            clientMessageId: resolvedTempId,
          },
          include: chatMessageInclude,
        });
        if (existing) {
          return mapToChatMessageItem(existing as unknown as RawChatMessage);
        }
      } catch {
        // Suppress if column query fails on unmigrated database
      }
    }

    try {
      let message: any;
      try {
        message = await client.chatMessage.create({
          data: {
            groupId: group.id,
            senderId,
            content: trimmed,
            ...(resolvedTempId ? { clientMessageId: resolvedTempId } : {}),
            ...(resolvedAttachment
              ? {
                  attachments: {
                    create: {
                      type: resolvedAttachment.type,
                      fileName: resolvedAttachment.fileName,
                      mimeType: resolvedAttachment.mimeType,
                      fileSizeBytes: resolvedAttachment.fileSizeBytes,
                      storagePath: resolvedAttachment.storagePath,
                      duration: resolvedAttachment.duration != null ? Math.round(resolvedAttachment.duration) : null,
                    },
                  },
                }
              : {}),
          },
          include: chatMessageInclude,
        });
      } catch (createErr: any) {
        // P2002: Unique constraint violation (concurrent duplicate insert)
        if (createErr?.code === 'P2002' && resolvedTempId) {
          const existing = await client.chatMessage.findFirst({
            where: {
              groupId: group.id,
              senderId,
              clientMessageId: resolvedTempId,
            },
            include: chatMessageInclude,
          });
          if (existing) {
            return mapToChatMessageItem(existing as unknown as RawChatMessage);
          }
        }

        // Graceful fallback if clientMessageId column does not exist yet in live database
        if (createErr?.message && (createErr.message.includes('clientMessageId') || createErr.message.includes('column')) && resolvedTempId) {
          message = await client.chatMessage.create({
            data: {
              groupId: group.id,
              senderId,
              content: trimmed,
              ...(resolvedAttachment
                ? {
                    attachments: {
                      create: {
                        type: resolvedAttachment.type,
                        fileName: resolvedAttachment.fileName,
                        mimeType: resolvedAttachment.mimeType,
                        fileSizeBytes: resolvedAttachment.fileSizeBytes,
                        storagePath: resolvedAttachment.storagePath,
                      },
                    },
                  }
                : {}),
            },
            include: chatMessageInclude,
          });
        } else {
          throw createErr;
        }
      }

      // Non-blocking FCM push notification dispatch to group members
      try {
        if (client.groupMember && typeof client.groupMember.findMany === 'function') {
          const activeMembers = await client.groupMember.findMany({
            where: {
              groupId: group.id,
              userId: { not: senderId },
            },
            select: { userId: true },
          });

          if (activeMembers.length > 0) {
            const memberIds = activeMembers.map((m) => m.userId);
            const senderName = (message as any)?.sender?.profile?.fullName || 'Community Member';
            const pushBody = resolvedAttachment
              ? `${senderName}: ${
                  resolvedAttachment.type === 'IMAGE'
                    ? 'Sent a photo'
                    : resolvedAttachment.type === 'VIDEO'
                    ? 'Sent a video'
                    : 'Sent a document'
                }`
              : `${senderName}: Sent a message`;

            await dispatchPushNotificationToMultipleUsers(
              {
                recipientIds: memberIds,
                category: 'groupMessages',
                title: group.name,
                body: pushBody,
                routingPayload: {
                  type: 'GROUP_CHAT',
                  groupId: group.id,
                  groupSlug: group.slug,
                  entityId: message.id,
                },
                excludeUserId: senderId,
              },
              client
            );
          }
        }
      } catch (groupPushErr) {
        console.warn('[Group Chat] FCM push notification dispatch warning (suppressed):', groupPushErr);
      }

      return mapToChatMessageItem(message as unknown as RawChatMessage);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ChatMessage') || msg.includes('does not exist')) {
        throw new ChatServiceError('Chat service is temporarily offline (database migration pending).', 503);
      }
      throw err;
    }
  });
}

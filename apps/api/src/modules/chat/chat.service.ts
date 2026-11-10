import { Prisma, PrismaClient } from '@apnasamaj/database';
import {
  ChatMessageItem,
  ChatMessagesResponseData,
  ChatAttachmentItem,
  ChatAttachmentInput,
  ChatReactionSummary,
  ChatMessageReplyPreview,
  ToggleChatReactionResponseData,
  ALLOWED_CHAT_REACTIONS,
  PaginatedChatSearchResponse,
  ChatSearchResultItem,
  PaginatedChatMediaResponse,
  ChatMediaGalleryItem,
  ChatMessageContextResponse,
  DELETED_CHAT_MESSAGE_PLACEHOLDER,
  MessageDeleteScope,
  DeleteChatMessageResponseData,
} from '@apnasamaj/shared-types';
import {
  ListGroupMessagesQueryInput,
  ChatSearchQueryInput,
  ChatMediaQueryInput,
} from '@apnasamaj/validation';
import { dispatchPushNotificationToMultipleUsers } from '../notifications/push-notification.service';
import { createTemporarySignedChatAttachmentUrl, resolveChatAttachmentUrl, populateSignedAttachmentUrls } from '../../services/storage.service';
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

export class BadRequestChatError extends ChatServiceError {
  constructor(message: string = 'Bad request.') {
    super(message, 400);
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

export function aggregateReactions(
  reactions: any[] = [],
  currentUserId?: string
): ChatReactionSummary[] {
  if (!reactions || reactions.length === 0) return [];
  const map = new Map<string, { count: number; hasReacted: boolean; users: { id: string; fullName: string }[] }>();

  for (const r of reactions) {
    if (!r.emoji) continue;
    let entry = map.get(r.emoji);
    if (!entry) {
      entry = { count: 0, hasReacted: false, users: [] };
      map.set(r.emoji, entry);
    }
    entry.count += 1;
    if (currentUserId && r.userId === currentUserId) {
      entry.hasReacted = true;
    }
    entry.users.push({
      id: r.userId,
      fullName: r.user?.profile?.fullName || 'Community Member',
    });
  }

  return Array.from(map.entries()).map(([emoji, data]) => ({
    emoji,
    count: data.count,
    hasReacted: data.hasReacted,
    users: data.users,
  }));
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
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      isDeletedForEveryone: true,
      sender: {
        select: {
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
      attachments: {
        take: 1,
        select: {
          type: true,
          fileName: true,
        },
      },
    },
  },
  reactions: {
    include: {
      user: {
        select: {
          id: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ChatMessageInclude;

const legacyChatMessageSelect = {
  id: true,
  groupId: true,
  senderId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  clientMessageId: true,
  replyToMessageId: true,
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
  replyTo: {
    select: {
      id: true,
      senderId: true,
      content: true,
      sender: {
        select: {
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
      attachments: {
        take: 1,
        select: {
          type: true,
          fileName: true,
        },
      },
    },
  },
  reactions: {
    include: {
      user: {
        select: {
          id: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  },
};

type RawChatMessage = Prisma.ChatMessageGetPayload<{
  include: typeof chatMessageInclude;
}>;

export function mapToChatMessageItem(item: any, currentUserId?: string): ChatMessageItem {
  const isDeletedForEveryone = Boolean(
    item.isDeletedForEveryone || item.content === DELETED_CHAT_MESSAGE_PLACEHOLDER
  );

  const replyToRaw = item.replyTo;
  let replyTo: ChatMessageReplyPreview | null = null;
  if (replyToRaw) {
    const isReplyDeleted = Boolean(
      replyToRaw.isDeletedForEveryone || replyToRaw.content === DELETED_CHAT_MESSAGE_PLACEHOLDER
    );
    replyTo = {
      id: replyToRaw.id,
      senderId: isReplyDeleted ? '' : replyToRaw.senderId,
      senderName: isReplyDeleted ? 'Message Deleted' : (replyToRaw.sender?.profile?.fullName || 'Community Member'),
      content: isReplyDeleted ? DELETED_CHAT_MESSAGE_PLACEHOLDER : (replyToRaw.content || ''),
      attachmentType: isReplyDeleted ? null : (replyToRaw.attachments?.[0]?.type || null),
      attachmentName: isReplyDeleted ? null : (replyToRaw.attachments?.[0]?.fileName || null),
    };
  } else if (item.replyToMessageId) {
    replyTo = {
      id: item.replyToMessageId,
      senderId: '',
      senderName: 'Original Message',
      content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
      attachmentType: null,
      attachmentName: null,
    };
  }

  const content = isDeletedForEveryone ? DELETED_CHAT_MESSAGE_PLACEHOLDER : item.content;
  const attachments = isDeletedForEveryone
    ? []
    : ((item as any).attachments || []).map((att: any) => ({
      id: att.id,
      chatMessageId: att.chatMessageId,
      type: att.type,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSizeBytes: att.fileSizeBytes,
      storagePath: att.storagePath,
      url: resolveChatAttachmentUrl(att.storagePath),
      duration: att.duration != null ? att.duration : undefined,
      createdAt: att.createdAt instanceof Date ? att.createdAt.toISOString() : att.createdAt,
    }));
  const reactions = isDeletedForEveryone
    ? []
    : aggregateReactions(item.reactions, currentUserId || item.senderId);

  return {
    id: item.id,
    groupId: item.groupId,
    senderId: item.senderId,
    content,
    clientMessageId: item.clientMessageId || null,
    replyToMessageId: item.replyToMessageId || null,
    replyTo,
    reactions,
    tempId: item.clientMessageId || undefined,
    isDeletedForEveryone: isDeletedForEveryone ? true : Boolean(item.isDeletedForEveryone),
    deletedAt: item.deletedAt
      ? item.deletedAt instanceof Date
        ? item.deletedAt.toISOString()
        : item.deletedAt
      : null,
    deletedByUserId: item.deletedByUserId || null,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
    sender: item.sender
      ? {
        id: item.sender.id,
        fullName: item.sender.profile?.fullName || 'Community Member',
        avatarUrl: item.sender.profile?.avatarUrl || null,
      }
      : null,
    attachments,
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
    let rawMessages: any[];
    try {
      const where: Prisma.ChatMessageWhereInput = {
        groupId: group.id,
        ...(beforeDate && !isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
        deletions: {
          none: { userId },
        },
      };

      rawMessages = await client.chatMessage.findMany({
        where,
        take: limit + 1, // take 1 extra to determine hasMore
        orderBy: { createdAt: 'desc' },
        include: chatMessageInclude,
      });
    } catch {
      // Graceful fallback if deletions table/relation or isDeletedForEveryone is not yet migrated
      const fallbackWhere: Prisma.ChatMessageWhereInput = {
        groupId: group.id,
        ...(beforeDate && !isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
      };

      try {
        rawMessages = await (client.chatMessage as any).findMany({
          where: fallbackWhere,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          select: legacyChatMessageSelect,
        });
      } catch {
        rawMessages = await client.chatMessage.findMany({
          where: fallbackWhere,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          include: chatMessageInclude,
        });
      }
    }

    const hasMore = rawMessages.length > limit;
    const sliced = hasMore ? rawMessages.slice(0, limit) : rawMessages;
    const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].createdAt.toISOString() : null;

    const mappedMessages = (sliced as unknown as RawChatMessage[]).map((m) => mapToChatMessageItem(m, userId));
    await populateSignedAttachmentUrls(mappedMessages);

    return {
      messages: mappedMessages,
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
  contentOrOptions?: string | { content?: string; attachment?: ChatAttachmentInput; tempId?: string; replyToMessageId?: string; db?: PrismaClient },
  attachmentOrTempId?: string | ChatAttachmentInput,
  tempIdOrDb?: string | PrismaClient,
  db?: PrismaClient,
  attachment?: ChatAttachmentInput,
  replyToMessageId?: string
): Promise<ChatMessageItem> {
  let content: string | undefined;
  let resolvedTempId: string | undefined;
  let resolvedDb: PrismaClient | undefined;
  let resolvedAttachment: ChatAttachmentInput | undefined;
  let resolvedReplyToMessageId: string | undefined = replyToMessageId;

  if (typeof contentOrOptions === 'object' && contentOrOptions !== null) {
    content = contentOrOptions.content;
    resolvedAttachment = contentOrOptions.attachment;
    resolvedTempId = contentOrOptions.tempId;
    resolvedReplyToMessageId = contentOrOptions.replyToMessageId || resolvedReplyToMessageId;
    resolvedDb = contentOrOptions.db;
  } else {
    content = contentOrOptions;
  }

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

  // Sanitize and validate replyToMessageId
  const sanitizedReplyToMessageId =
    typeof resolvedReplyToMessageId === 'string' && resolvedReplyToMessageId.trim().length > 0
      ? resolvedReplyToMessageId.trim()
      : undefined;

  if (typeof resolvedReplyToMessageId === 'string' && resolvedReplyToMessageId.trim().length > 100) {
    throw new ChatServiceError('Invalid replyToMessageId parameter length.', 400);
  }

  // Cross-conversation validation: replyToMessageId must belong to the same group
  if (sanitizedReplyToMessageId) {
    const parent = await client.chatMessage.findUnique({
      where: { id: sanitizedReplyToMessageId },
      select: { id: true, groupId: true },
    });
    if (!parent || parent.groupId !== group.id) {
      throw new ChatServiceError('Cannot reply to a message from a different group or conversation.', 400);
    }
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
        const mapped = mapToChatMessageItem(existing as unknown as RawChatMessage, senderId);
        await populateSignedAttachmentUrls([mapped]);
        return mapped;
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
        const mapped = mapToChatMessageItem(existingAttachment.chatMessage as unknown as RawChatMessage, senderId);
        await populateSignedAttachmentUrls([mapped]);
        return mapped;
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
          const mapped = mapToChatMessageItem(existing as unknown as RawChatMessage, senderId);
          await populateSignedAttachmentUrls([mapped]);
          return mapped;
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
            ...(sanitizedReplyToMessageId ? { replyToMessageId: sanitizedReplyToMessageId } : {}),
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
            const mapped = mapToChatMessageItem(existing as unknown as RawChatMessage, senderId);
            await populateSignedAttachmentUrls([mapped]);
            return mapped;
          }
        }

        // Graceful fallback if clientMessageId or replyToMessageId columns do not exist yet in live database
        if (createErr?.message && (createErr.message.includes('clientMessageId') || createErr.message.includes('replyToMessageId') || createErr.message.includes('column'))) {
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
              ? `${senderName}: ${resolvedAttachment.type === 'IMAGE'
                ? 'Sent a photo'
                : resolvedAttachment.type === 'VIDEO'
                  ? 'Sent a video'
                  : resolvedAttachment.type === 'AUDIO'
                    ? 'Sent a voice note'
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

      const mapped = mapToChatMessageItem(message as unknown as RawChatMessage, senderId);
      await populateSignedAttachmentUrls([mapped]);
      return mapped;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ChatMessage') || msg.includes('does not exist')) {
        throw new ChatServiceError('Chat service is temporarily offline (database migration pending).', 503);
      }
      throw err;
    }
  });
}

/**
 * Toggles an emoji reaction on a group chat message.
 * If user already reacted with this emoji, removes it (toggle off).
 * If user reacted with a different emoji, updates it (one reaction per user).
 * If user has not reacted, creates it.
 */
export async function toggleChatMessageReaction(
  groupIdOrSlug: string,
  messageId: string,
  userId: string,
  emoji: string,
  db?: PrismaClient
): Promise<ToggleChatReactionResponseData> {
  const client = assertDb(db);
  if (!ALLOWED_CHAT_REACTIONS.includes(emoji as any)) {
    throw new ChatServiceError(
      `Invalid reaction emoji. Supported reactions: ${ALLOWED_CHAT_REACTIONS.join(', ')}`,
      400
    );
  }

  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  const message = await client.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, groupId: true },
  });

  if (!message || message.groupId !== group.id) {
    throw new ChatNotFoundError('Message not found in this group.');
  }

  const existing = await client.chatMessageReaction.findUnique({
    where: {
      messageId_userId: {
        messageId,
        userId,
      },
    },
  });

  let action: 'added' | 'removed' | 'updated';
  if (existing) {
    if (existing.emoji === emoji) {
      try {
        await client.chatMessageReaction.delete({
          where: { id: existing.id },
        });
      } catch (delErr: any) {
        if (delErr?.code !== 'P2025') throw delErr;
      }
      action = 'removed';
    } else {
      try {
        await client.chatMessageReaction.update({
          where: { id: existing.id },
          data: { emoji },
        });
        action = 'updated';
      } catch (updateErr: any) {
        if (updateErr?.code === 'P2025') {
          await client.chatMessageReaction.create({
            data: { messageId, userId, emoji },
          });
          action = 'added';
        } else {
          throw updateErr;
        }
      }
    }
  } else {
    try {
      await client.chatMessageReaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
      action = 'added';
    } catch (createErr: any) {
      if (createErr?.code === 'P2002') {
        // Concurrency resolution: record created concurrently by duplicate request
        const raceExisting = await client.chatMessageReaction.findUnique({
          where: {
            messageId_userId: {
              messageId,
              userId,
            },
          },
        });
        if (raceExisting) {
          if (raceExisting.emoji === emoji) {
            try {
              await client.chatMessageReaction.delete({ where: { id: raceExisting.id } });
            } catch { }
            action = 'removed';
          } else {
            await client.chatMessageReaction.update({
              where: { id: raceExisting.id },
              data: { emoji },
            });
            action = 'updated';
          }
        } else {
          action = 'added';
        }
      } else {
        throw createErr;
      }
    }
  }

  const allReactions = await client.chatMessageReaction.findMany({
    where: { messageId },
    include: {
      user: {
        select: {
          id: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  const reactions = aggregateReactions(allReactions, userId);

  return {
    messageId,
    groupId: group.id,
    reactions,
    action,
  };
}

/**
 * Removes any active reaction from the user on a group chat message.
 */
export async function removeChatMessageReaction(
  groupIdOrSlug: string,
  messageId: string,
  userId: string,
  db?: PrismaClient
): Promise<ToggleChatReactionResponseData> {
  const client = assertDb(db);
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  const message = await client.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, groupId: true },
  });

  if (!message || message.groupId !== group.id) {
    throw new ChatNotFoundError('Message not found in this group.');
  }

  try {
    await client.chatMessageReaction.delete({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });
  } catch {
    // Suppress if reaction does not exist
  }

  const allReactions = await client.chatMessageReaction.findMany({
    where: { messageId },
    include: {
      user: {
        select: {
          id: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  const reactions = aggregateReactions(allReactions, userId);

  return {
    messageId,
    groupId: group.id,
    reactions,
    action: 'removed',
  };
}

/**
 * Searches messages within a specific community group.
 * Strictly verifies group access (non-members cannot search private groups).
 * Supports full text matching in content & attachment filenames, sender filter, date range, and pagination.
 */
export async function searchGroupMessages(
  groupIdOrSlug: string,
  userId: string,
  query: ChatSearchQueryInput,
  db?: PrismaClient
): Promise<PaginatedChatSearchResponse> {
  const client = assertDb(db);
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  const limit = Math.min(Math.max(query.limit || 20, 1), 50);
  const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
  const startDate = query.startDate ? new Date(query.startDate) : undefined;
  const endDate = query.endDate ? new Date(query.endDate) : undefined;

  // Escape ILIKE wildcard characters so a bare `%` or `_` does not match all rows.
  // Prisma passes `contains` values through to PostgreSQL ILIKE without escaping them,
  // meaning `%` matches any sequence and `_` matches any single character.
  const rawKeyword = query.q.trim();
  const searchKeyword = rawKeyword.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

  const baseWhere: Prisma.ChatMessageWhereInput = {
    groupId: group.id,
    content: { not: DELETED_CHAT_MESSAGE_PLACEHOLDER },
    OR: [
      { content: { contains: searchKeyword, mode: 'insensitive' } },
      { attachments: { some: { fileName: { contains: searchKeyword, mode: 'insensitive' } } } },
    ],
    ...(query.senderId ? { senderId: query.senderId } : {}),
    ...((startDate && !isNaN(startDate.getTime())) || (endDate && !isNaN(endDate.getTime()))
      ? {
        createdAt: {
          ...(startDate && !isNaN(startDate.getTime()) ? { gte: startDate } : {}),
          ...(endDate && !isNaN(endDate.getTime()) ? { lte: endDate } : {}),
        },
      }
      : {}),
    ...(cursorDate && !isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
  };

  let rawMessages: any[] = [];
  let totalMatches = 0;

  try {
    const where: Prisma.ChatMessageWhereInput = {
      ...baseWhere,
      isDeletedForEveryone: false,
      deletions: {
        none: { userId },
      },
    };

    [rawMessages, totalMatches] = await Promise.all([
      client.chatMessage.findMany({
        where,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: chatMessageInclude,
      }),
      client.chatMessage.count({
        where: {
          ...where,
          OR: where.OR,
          ...(query.senderId ? { senderId: query.senderId } : {}),
        },
      }),
    ]);
  } catch {
    try {
      [rawMessages, totalMatches] = await Promise.all([
        (client.chatMessage as any).findMany({
          where: baseWhere,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          select: legacyChatMessageSelect,
        }),
        client.chatMessage.count({
          where: {
            groupId: group.id,
            content: { not: DELETED_CHAT_MESSAGE_PLACEHOLDER },
            OR: baseWhere.OR,
            ...(query.senderId ? { senderId: query.senderId } : {}),
          },
        }),
      ]);
    } catch {
      [rawMessages, totalMatches] = await Promise.all([
        client.chatMessage.findMany({
          where: baseWhere,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          include: chatMessageInclude,
        }),
        client.chatMessage.count({
          where: {
            groupId: group.id,
            content: { not: DELETED_CHAT_MESSAGE_PLACEHOLDER },
            OR: baseWhere.OR,
            ...(query.senderId ? { senderId: query.senderId } : {}),
          },
        }),
      ]);
    }
  }

  const hasMore = rawMessages.length > limit;
  const sliced = hasMore ? rawMessages.slice(0, limit) : rawMessages;
  const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].createdAt.toISOString() : null;

  const results: ChatSearchResultItem[] = (sliced as unknown as RawChatMessage[]).map((msg) => {
    const item = mapToChatMessageItem(msg, userId);
    return {
      id: item.id,
      groupId: group.id,
      conversationType: 'GROUP',
      senderId: item.senderId,
      senderName: item.sender?.fullName || 'Community Member',
      senderAvatarUrl: item.sender?.avatarUrl || null,
      content: item.content,
      createdAt: item.createdAt,
      attachmentType: item.attachments?.[0]?.type || null,
      attachmentName: item.attachments?.[0]?.fileName || null,
      matchSource: 'remote',
      matchedSubstring: rawKeyword,
    };
  });

  return {
    results,
    nextCursor,
    hasMore,
    totalMatches,
  };
}

/**
 * Retrieves paginated media attachments (Photos, Videos, Audio/Voice Notes, Documents)
 * for a community group with signed temporary URLs.
 */
export async function getGroupMediaGallery(
  groupIdOrSlug: string,
  userId: string,
  query: ChatMediaQueryInput,
  db?: PrismaClient
): Promise<PaginatedChatMediaResponse> {
  const client = assertDb(db);
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  const limit = Math.min(Math.max(query.limit || 30, 1), 50);
  const cursorDate = query.cursor ? new Date(query.cursor) : undefined;

  let rawAttachments: any[] = [];
  try {
    const where: Prisma.ChatAttachmentWhereInput = {
      chatMessage: {
        groupId: group.id,
        isDeletedForEveryone: false,
        content: { not: DELETED_CHAT_MESSAGE_PLACEHOLDER },
        deletions: {
          none: { userId },
        },
      },
      ...(query.type ? { type: query.type } : {}),
      ...(cursorDate && !isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
    };

    rawAttachments = await client.chatAttachment.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        chatMessage: {
          include: {
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
          },
        },
      },
    });
  } catch {
    const fallbackWhere: Prisma.ChatAttachmentWhereInput = {
      chatMessage: {
        groupId: group.id,
        content: { not: DELETED_CHAT_MESSAGE_PLACEHOLDER },
      },
      ...(query.type ? { type: query.type } : {}),
      ...(cursorDate && !isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
    };

    rawAttachments = await client.chatAttachment.findMany({
      where: fallbackWhere,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        chatMessage: {
          include: {
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
          },
        },
      },
    });
  }

  const hasMore = rawAttachments.length > limit;
  const sliced = hasMore ? rawAttachments.slice(0, limit) : rawAttachments;
  const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].createdAt.toISOString() : null;

  const media: ChatMediaGalleryItem[] = await Promise.all(
    sliced.map(async (att) => {
      const signedUrl = await createTemporarySignedChatAttachmentUrl(att.storagePath, 3600);
      return {
        id: att.id,
        messageId: att.chatMessageId || '',
        groupId: group.id,
        type: att.type,
        fileName: att.fileName,
        mimeType: att.mimeType,
        fileSizeBytes: att.fileSizeBytes,
        storagePath: att.storagePath,
        url: signedUrl,
        duration: att.duration ?? undefined,
        createdAt: att.createdAt instanceof Date ? att.createdAt.toISOString() : String(att.createdAt),
        senderId: att.chatMessage?.senderId || '',
        senderName: att.chatMessage?.sender?.profile?.fullName || 'Community Member',
        senderAvatarUrl: att.chatMessage?.sender?.profile?.avatarUrl || null,
      };
    })
  );

  return {
    media,
    nextCursor,
    hasMore,
  };
}

/**
 * Retrieves context around a specific message (for jump navigation from search or gallery).
 * Returns messages in descending order (newest first) along with the 0-based target index.
 */
export async function getGroupMessageContext(
  groupIdOrSlug: string,
  messageId: string,
  userId: string,
  limit: number = 30,
  db?: PrismaClient
): Promise<ChatMessageContextResponse> {
  const client = assertDb(db);
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  let targetMsg: any;
  try {
    targetMsg = await client.chatMessage.findFirst({
      where: { id: messageId, groupId: group.id },
      include: chatMessageInclude,
    });
  } catch {
    targetMsg = await (client.chatMessage as any).findFirst({
      where: { id: messageId, groupId: group.id },
      select: legacyChatMessageSelect,
    });
  }

  if (!targetMsg) {
    throw new ChatNotFoundError('Target message not found.');
  }

  try {
    const isDeletedForMe = await (client as any).chatMessageDeletion.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });
    if (isDeletedForMe) {
      throw new ChatNotFoundError('Target message not found.');
    }
  } catch (err) {
    if (err instanceof ChatNotFoundError) throw err;
  }

  const half = Math.floor(limit / 2);

  let olderMessages: any[] = [];
  let newerMessages: any[] = [];

  try {
    // Fetch older messages
    olderMessages = await client.chatMessage.findMany({
      where: { groupId: group.id, createdAt: { lt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'desc' },
      include: chatMessageInclude,
    });

    // Fetch newer messages
    newerMessages = await client.chatMessage.findMany({
      where: { groupId: group.id, createdAt: { gt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'asc' },
      include: chatMessageInclude,
    });
  } catch {
    olderMessages = await (client.chatMessage as any).findMany({
      where: { groupId: group.id, createdAt: { lt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'desc' },
      select: legacyChatMessageSelect,
    });

    newerMessages = await (client.chatMessage as any).findMany({
      where: { groupId: group.id, createdAt: { gt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'asc' },
      select: legacyChatMessageSelect,
    });
  }

  // Recombine in descending order: newer (desc) -> target -> older (desc)
  const allRaw = [...newerMessages.reverse(), targetMsg, ...olderMessages];
  const targetIndex = newerMessages.length;

  const mapped = (allRaw as unknown as RawChatMessage[]).map((m) => mapToChatMessageItem(m, userId));
  await populateSignedAttachmentUrls(mapped);

  return {
    targetMessageId: messageId,
    messages: mapped,
    targetIndex,
  };
}

/**
 * Deletes a group chat message for the requesting user (ME) or for all participants (EVERYONE).
 * - "ME": Persisted in ChatMessageDeletion so it disappears only for the requesting user.
 * - "EVERYONE": Replaces content with deleted placeholder, revokes attachments/reactions.
 *   - Sender can delete within 60 minutes.
 *   - Active Group Admin can moderate/delete any group message at any time (bypassing 60m window).
 */
export async function deleteGroupMessage(
  groupIdOrSlug: string,
  messageId: string,
  userId: string,
  scope: MessageDeleteScope,
  db?: PrismaClient
): Promise<DeleteChatMessageResponseData> {
  const client = assertDb(db);
  const { group, isMember } = await verifyGroupChatAccess(groupIdOrSlug, userId, false, client);

  if (!isMember) {
    throw new ForbiddenChatError('You must be a member of this group to delete messages.');
  }

  const message = await client.chatMessage.findFirst({
    where: { id: messageId, groupId: group.id },
  });

  if (!message) {
    throw new ChatNotFoundError('Chat message not found.');
  }

  if (scope === 'ME') {
    try {
      await (client as any).chatMessageDeletion.upsert({
        where: {
          messageId_userId: {
            messageId,
            userId,
          },
        },
        create: {
          messageId,
          userId,
        },
        update: {},
      });
    } catch (err) {
      console.warn('[Chat Service] ChatMessageDeletion write failed (unmigrated DB?), falling back:', err);
    }
    return {
      success: true,
      messageId,
      scope: 'ME',
    };
  }

  if (scope === 'EVERYONE') {
    if (message.isDeletedForEveryone || message.content === DELETED_CHAT_MESSAGE_PLACEHOLDER) {
      return {
        success: true,
        messageId,
        scope: 'EVERYONE',
      };
    }

    const isSender = message.senderId === userId;

    if (isSender) {
      const ageMs = Date.now() - message.createdAt.getTime();
      const WINDOW_MS = 60 * 60 * 1000; // 60 minutes
      if (ageMs > WINDOW_MS) {
        throw new BadRequestChatError('Messages can only be deleted for everyone within 60 minutes of sending.');
      }
    } else {
      // Group Admin moderation check
      const member = await client.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: group.id,
            userId,
          },
        },
        select: { role: true },
      });

      const isGroupAdmin = member?.role === 'ADMIN';
      if (!isGroupAdmin) {
        throw new ForbiddenChatError('Only the message sender or a group admin can delete this message for everyone.');
      }
    }

    try {
      await client.chatMessage.update({
        where: { id: messageId },
        data: {
          content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
          isDeletedForEveryone: true,
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      });
    } catch {
      // Fallback if isDeletedForEveryone columns not yet migrated
      await client.chatMessage.update({
        where: { id: messageId },
        data: {
          content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
        },
      });
    }

    return {
      success: true,
      messageId,
      scope: 'EVERYONE',
    };
  }

  throw new BadRequestChatError('Invalid delete scope. Must be ME or EVERYONE.');
}

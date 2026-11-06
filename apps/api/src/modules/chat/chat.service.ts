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
} from '@apnasamaj/shared-types';
import {
  ListGroupMessagesQueryInput,
  ChatSearchQueryInput,
  ChatMediaQueryInput,
} from '@apnasamaj/validation';
import { dispatchPushNotificationToMultipleUsers } from '../notifications/push-notification.service';
import { createTemporarySignedChatAttachmentUrl } from '../../services/storage.service';
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

type RawChatMessage = Prisma.ChatMessageGetPayload<{
  include: typeof chatMessageInclude;
}>;

export function mapToChatMessageItem(item: any, currentUserId?: string): ChatMessageItem {
  const replyToRaw = item.replyTo;
  let replyTo: ChatMessageReplyPreview | null = null;
  if (replyToRaw) {
    replyTo = {
      id: replyToRaw.id,
      senderId: replyToRaw.senderId,
      senderName: replyToRaw.sender?.profile?.fullName || 'Community Member',
      content: replyToRaw.content || '',
      attachmentType: replyToRaw.attachments?.[0]?.type || null,
      attachmentName: replyToRaw.attachments?.[0]?.fileName || null,
    };
  } else if (item.replyToMessageId) {
    replyTo = {
      id: item.replyToMessageId,
      senderId: '',
      senderName: 'Original Message',
      content: 'This message was deleted',
      attachmentType: null,
      attachmentName: null,
    };
  }

  return {
    id: item.id,
    groupId: item.groupId,
    senderId: item.senderId,
    content: item.content,
    clientMessageId: item.clientMessageId || null,
    replyToMessageId: item.replyToMessageId || null,
    replyTo,
    reactions: aggregateReactions(item.reactions, currentUserId || item.senderId),
    tempId: item.clientMessageId || undefined,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
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
      messages: (sliced as unknown as RawChatMessage[]).map((m) => mapToChatMessageItem(m, userId)),
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
        return mapToChatMessageItem(existing as unknown as RawChatMessage, senderId);
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
        return mapToChatMessageItem(existingAttachment.chatMessage as unknown as RawChatMessage, senderId);
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
          return mapToChatMessageItem(existing as unknown as RawChatMessage, senderId);
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
            return mapToChatMessageItem(existing as unknown as RawChatMessage, senderId);
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
              ? `${senderName}: ${
                  resolvedAttachment.type === 'IMAGE'
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

      return mapToChatMessageItem(message as unknown as RawChatMessage, senderId);
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
            } catch {}
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

  const searchKeyword = query.q.trim();

  const where: Prisma.ChatMessageWhereInput = {
    groupId: group.id,
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

  const [rawMessages, totalMatches] = await Promise.all([
    client.chatMessage.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: chatMessageInclude,
    }),
    client.chatMessage.count({
      where: {
        groupId: group.id,
        OR: where.OR,
        ...(query.senderId ? { senderId: query.senderId } : {}),
      },
    }),
  ]);

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
      matchedSubstring: searchKeyword,
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

  const where: Prisma.ChatAttachmentWhereInput = {
    chatMessage: {
      groupId: group.id,
    },
    ...(query.type ? { type: query.type } : {}),
    ...(cursorDate && !isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
  };

  const rawAttachments = await client.chatAttachment.findMany({
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

  const targetMsg = await client.chatMessage.findFirst({
    where: { id: messageId, groupId: group.id },
    include: chatMessageInclude,
  });

  if (!targetMsg) {
    throw new ChatNotFoundError('Target message not found.');
  }

  const half = Math.floor(limit / 2);

  // Fetch older messages
  const olderMessages = await client.chatMessage.findMany({
    where: { groupId: group.id, createdAt: { lt: targetMsg.createdAt } },
    take: half,
    orderBy: { createdAt: 'desc' },
    include: chatMessageInclude,
  });

  // Fetch newer messages
  const newerMessages = await client.chatMessage.findMany({
    where: { groupId: group.id, createdAt: { gt: targetMsg.createdAt } },
    take: half,
    orderBy: { createdAt: 'asc' },
    include: chatMessageInclude,
  });

  // Recombine in descending order: newer (desc) -> target -> older (desc)
  const allRaw = [...newerMessages.reverse(), targetMsg, ...olderMessages];
  const targetIndex = newerMessages.length;

  const mapped = (allRaw as unknown as RawChatMessage[]).map((m) => mapToChatMessageItem(m, userId));

  return {
    targetMessageId: messageId,
    messages: mapped,
    targetIndex,
  };
}

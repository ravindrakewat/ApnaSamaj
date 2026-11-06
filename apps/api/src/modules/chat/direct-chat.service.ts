import { Prisma, PrismaClient } from '@apnasamaj/database';
import {
  DirectMessageItem,
  DirectMessagesResponseData,
  DirectConversationItem,
  DirectInboxResponseData,
  DirectChatParticipant,
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
  ListDirectMessagesQueryInput,
  ListDirectInboxQueryInput,
  ChatSearchQueryInput,
  ChatMediaQueryInput,
} from '@apnasamaj/validation';
import {
  ChatServiceError,
  ChatNotFoundError,
  ForbiddenChatError,
  aggregateReactions,
} from './chat.service';
import { createTemporarySignedChatAttachmentUrl } from '../../services/storage.service';
import { dispatchPushNotificationToUser } from '../notifications/push-notification.service';
import { chatIdempotencyService } from './chat-idempotency.service';

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

const directMessageInclude = {
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
} satisfies Prisma.DirectMessageInclude;

type RawDirectMessage = Prisma.DirectMessageGetPayload<{
  include: typeof directMessageInclude;
}>;

export function mapToDirectMessageItem(item: any, currentUserId?: string): DirectMessageItem {
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
    conversationId: item.conversationId,
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
      directMessageId: att.directMessageId,
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
 * Ensures user is an authorized participant in the direct conversation.
 */
export async function verifyDirectConversationAccess(
  conversationId: string,
  userId: string,
  db?: PrismaClient
): Promise<{
  id: string;
  userOneId: string;
  userTwoId: string;
  otherUserId: string;
}> {
  const client = assertDb(db);

  const conversation = await client.directConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userOneId: true,
      userTwoId: true,
    },
  });

  if (!conversation) {
    throw new ChatNotFoundError('Conversation not found.');
  }

  if (conversation.userOneId !== userId && conversation.userTwoId !== userId) {
    throw new ForbiddenChatError('Access denied: You are not a participant in this conversation.');
  }

  const otherUserId = conversation.userOneId === userId ? conversation.userTwoId : conversation.userOneId;

  return {
    ...conversation,
    otherUserId,
  };
}

/**
 * Starts or retrieves an existing one-to-one conversation between two users.
 * Physically orders user IDs to guarantee duplicate conversation prevention.
 */
export async function getOrCreateDirectConversation(
  initiatorId: string,
  recipientId: string,
  db?: PrismaClient
): Promise<DirectConversationItem> {
  const client = assertDb(db);

  if (initiatorId === recipientId) {
    throw new ChatServiceError('Cannot start a direct conversation with yourself.', 400);
  }

  // Recipient must exist and be ACTIVE in this community tenant
  const recipient = await client.user.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      status: true,
      profile: {
        select: {
          fullName: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!recipient || recipient.status !== 'ACTIVE') {
    throw new ChatNotFoundError('Recipient user was not found or is inactive in this community.');
  }

  // Lexicographical ordering to prevent duplicate reciprocal conversations
  const [userOneId, userTwoId] =
    initiatorId < recipientId ? [initiatorId, recipientId] : [recipientId, initiatorId];

  let conversation = await client.directConversation.findUnique({
    where: {
      userOneId_userTwoId: { userOneId, userTwoId },
    },
    include: {
      participants: {
        include: {
          user: {
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
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: directMessageInclude,
      },
    },
  });

  if (!conversation) {
    try {
      conversation = await client.directConversation.create({
        data: {
          userOneId,
          userTwoId,
          participants: {
            create: [
              { userId: userOneId },
              { userId: userTwoId },
            ],
          },
        },
        include: {
          participants: {
            include: {
              user: {
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
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: directMessageInclude,
          },
        },
      });
    } catch (err: unknown) {
      // Handle concurrent creation race condition
      if ((err as { code?: string }).code === 'P2002') {
        conversation = await client.directConversation.findUnique({
          where: {
            userOneId_userTwoId: { userOneId, userTwoId },
          },
          include: {
            participants: {
              include: {
                user: {
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
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: directMessageInclude,
            },
          },
        });
      } else {
        throw err;
      }
    }
  }

  if (!conversation) {
    throw new ChatServiceError('Failed to initialize direct conversation.', 500);
  }

  // Calculate unread count and otherUser profile
  const otherParticipant = conversation.participants.find((p) => p.userId === recipientId);
  const myParticipant = conversation.participants.find((p) => p.userId === initiatorId);

  const otherUser: DirectChatParticipant = {
    id: recipient.id,
    fullName: recipient.profile?.fullName || otherParticipant?.user.profile?.fullName || 'Community Member',
    avatarUrl: recipient.profile?.avatarUrl || otherParticipant?.user.profile?.avatarUrl || null,
    lastReadAt: otherParticipant?.lastReadAt ? otherParticipant.lastReadAt.toISOString() : null,
  };

  const lastMsg = conversation.messages[0] ? mapToDirectMessageItem(conversation.messages[0]) : null;

  const unreadCount = await client.directMessage.count({
    where: {
      conversationId: conversation.id,
      senderId: { not: initiatorId },
      ...(myParticipant?.lastReadAt ? { createdAt: { gt: myParticipant.lastReadAt } } : {}),
    },
  });

  return {
    id: conversation.id,
    otherUser,
    lastMessage: lastMsg,
    unreadCount,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

/**
 * Retrieves user's direct chat inbox ordered by recent activity.
 */
export async function getDirectChatInbox(
  userId: string,
  query: Partial<ListDirectInboxQueryInput> = {},
  db?: PrismaClient
): Promise<DirectInboxResponseData> {
  const client = assertDb(db);
  const limit = Math.min(Math.max(query.limit || 20, 1), 50);

  let cursorFilter: Prisma.DirectConversationWhereInput = {};
  if (query.cursor) {
    const cursorConv = await client.directConversation.findUnique({
      where: { id: query.cursor },
      select: { updatedAt: true },
    });
    if (cursorConv) {
      cursorFilter = {
        updatedAt: { lt: cursorConv.updatedAt },
      };
    }
  }

  const rawConversations = await client.directConversation.findMany({
    where: {
      OR: [{ userOneId: userId }, { userTwoId: userId }],
      ...cursorFilter,
    },
    take: limit + 1,
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: {
        include: {
          user: {
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
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: directMessageInclude,
      },
    },
  });

  const hasMore = rawConversations.length > limit;
  const list = hasMore ? rawConversations.slice(0, limit) : rawConversations;
  const nextCursor = hasMore && list.length > 0 ? list[list.length - 1].id : null;

  const conversations: DirectConversationItem[] = await Promise.all(
    list.map(async (conv) => {
      const otherUserId = conv.userOneId === userId ? conv.userTwoId : conv.userOneId;
      const otherPart = conv.participants.find((p) => p.userId === otherUserId);
      const myPart = conv.participants.find((p) => p.userId === userId);

      const otherUser: DirectChatParticipant = {
        id: otherUserId,
        fullName: otherPart?.user.profile?.fullName || 'Community Member',
        avatarUrl: otherPart?.user.profile?.avatarUrl || null,
        lastReadAt: otherPart?.lastReadAt ? otherPart.lastReadAt.toISOString() : null,
      };

      const lastMessage = conv.messages[0] ? mapToDirectMessageItem(conv.messages[0]) : null;

      const unreadCount = await client.directMessage.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          ...(myPart?.lastReadAt ? { createdAt: { gt: myPart.lastReadAt } } : {}),
        },
      });

      return {
        id: conv.id,
        otherUser,
        lastMessage,
        unreadCount,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
      };
    })
  );

  return {
    conversations,
    nextCursor,
    hasMore,
  };
}

/**
 * Retrieves cursor-paginated messages for a direct conversation.
 */
export async function getDirectMessageHistory(
  conversationId: string,
  userId: string,
  query: ListDirectMessagesQueryInput,
  db?: PrismaClient
): Promise<DirectMessagesResponseData> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, db);

  const limit = Math.min(Math.max(query.limit || 20, 1), 50);

  let cursorFilter: Prisma.DirectMessageWhereInput = {};
  if (query.before) {
    const cursorMsg = await client.directMessage.findUnique({
      where: { id: query.before },
      select: { createdAt: true },
    });
    if (cursorMsg) {
      cursorFilter = {
        createdAt: { lt: cursorMsg.createdAt },
      };
    }
  }

  const rawMessages = await client.directMessage.findMany({
    where: {
      conversationId,
      ...cursorFilter,
    },
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: directMessageInclude,
  });

  const hasMore = rawMessages.length > limit;
  const list = hasMore ? rawMessages.slice(0, limit) : rawMessages;
  const nextCursor = hasMore && list.length > 0 ? list[list.length - 1].id : null;

  return {
    messages: list.map((m) => mapToDirectMessageItem(m, userId)),
    nextCursor,
    hasMore,
  };
}

/**
 * Sends a direct message inside a conversation and updates conversation timestamp and read status.
 * Overload-safe: supports both (convId, senderId, content, tempId?, db?, attachment?) and (convId, senderId, content, attachment?, tempId?, db?).
 */
export async function sendDirectMessage(
  conversationId: string,
  senderId: string,
  contentOrOptions?: string | { content?: string; attachment?: ChatAttachmentInput; tempId?: string; replyToMessageId?: string; db?: PrismaClient },
  attachmentOrTempId?: string | ChatAttachmentInput,
  tempIdOrDb?: string | PrismaClient,
  db?: PrismaClient,
  attachment?: ChatAttachmentInput,
  replyToMessageId?: string
): Promise<DirectMessageItem> {
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
  await verifyDirectConversationAccess(conversationId, senderId, client);

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

  // Cross-conversation validation: replyToMessageId must belong to this direct conversation
  if (sanitizedReplyToMessageId) {
    const parent = await client.directMessage.findUnique({
      where: { id: sanitizedReplyToMessageId },
      select: { id: true, conversationId: true },
    });
    if (!parent || parent.conversationId !== conversationId) {
      throw new ChatServiceError('Cannot reply to a message from a different conversation.', 400);
    }
  }

  // 1. Idempotency fast-path: Check if message already exists with this clientMessageId
  if (resolvedTempId) {
    try {
      const existing = await client.directMessage.findFirst({
        where: {
          conversationId,
          senderId,
          clientMessageId: resolvedTempId,
        },
        include: directMessageInclude,
      });
      if (existing) {
        return mapToDirectMessageItem(existing, senderId);
      }
    } catch {
      // Suppress if column query fails on unmigrated database
    }
  }

  if (resolvedAttachment) {
    if (!resolvedAttachment.storagePath || !resolvedAttachment.storagePath.includes(conversationId)) {
      throw new ChatServiceError('Invalid attachment path for this conversation.', 400);
    }
    const existingAttachment = await client.chatAttachment.findFirst({
      where: { storagePath: resolvedAttachment.storagePath },
      include: {
        directMessage: {
          include: directMessageInclude,
        },
      },
    });
    if (existingAttachment) {
      if (
        existingAttachment.directMessage &&
        existingAttachment.directMessage.conversationId === conversationId &&
        existingAttachment.directMessage.senderId === senderId &&
        (!resolvedTempId || (existingAttachment.directMessage as any).clientMessageId === resolvedTempId)
      ) {
        return mapToDirectMessageItem(existingAttachment.directMessage, senderId);
      }
      throw new ChatServiceError('Attachment has already been associated with an existing message.', 400);
    }
  }

  const idempotencyKey = resolvedTempId
    ? chatIdempotencyService.buildKey(conversationId, 'DIRECT', conversationId, senderId, resolvedTempId)
    : undefined;

  return await chatIdempotencyService.executeIdempotent(idempotencyKey, async () => {
    // 1. Check if message already exists with this clientMessageId
    if (resolvedTempId) {
      try {
        const existing = await client.directMessage.findFirst({
          where: {
            conversationId,
            senderId,
            clientMessageId: resolvedTempId,
          },
          include: directMessageInclude,
        });
        if (existing) {
          return mapToDirectMessageItem(existing, senderId);
        }
      } catch {
        // Suppress if column query fails on unmigrated database
      }
    }

    const now = new Date();

    let message: any;
    try {
      message = await client.directMessage.create({
        data: {
          conversationId,
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
        include: directMessageInclude,
      });
    } catch (createErr: any) {
      // P2002: Unique constraint violation (concurrent duplicate insert)
      if (createErr?.code === 'P2002' && resolvedTempId) {
        const existing = await client.directMessage.findFirst({
          where: {
            conversationId,
            senderId,
            clientMessageId: resolvedTempId,
          },
          include: directMessageInclude,
        });
        if (existing) {
          return mapToDirectMessageItem(existing, senderId);
        }
      }

      // Graceful fallback if clientMessageId or replyToMessageId column does not exist yet in live database
      if (createErr?.message && (createErr.message.includes('clientMessageId') || createErr.message.includes('replyToMessageId') || createErr.message.includes('column'))) {
        message = await client.directMessage.create({
          data: {
            conversationId,
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
                    duration: resolvedAttachment.duration != null ? Math.round(resolvedAttachment.duration) : null,
                  },
                },
              }
              : {}),
          },
          include: directMessageInclude,
        });
      } else {
        throw createErr;
      }
    }

    await client.directConversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    });

    // Automatically mark sender's lastReadAt to now
    await client.directConversationParticipant.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId: senderId,
        },
      },
      update: { lastReadAt: now },
      create: {
        conversationId,
        userId: senderId,
        lastReadAt: now,
      },
    });

    // Non-blocking FCM push notification dispatch to conversation recipient
    try {
      const conv = await client.directConversation.findUnique({
        where: { id: conversationId },
        select: { userOneId: true, userTwoId: true },
      });
      if (conv) {
        const recipientId = conv.userOneId === senderId ? conv.userTwoId : conv.userOneId;
        const senderName = message.sender?.profile?.fullName || 'Community Member';
        const pushBody = resolvedAttachment
          ? resolvedAttachment.type === 'IMAGE'
            ? 'Sent a photo'
            : resolvedAttachment.type === 'VIDEO'
              ? 'Sent a video'
              : resolvedAttachment.type === 'AUDIO'
                ? 'Sent a voice note'
                : 'Sent a document'
          : 'Sent you a message';

        await dispatchPushNotificationToUser(
          {
            recipientId,
            category: 'personalMessages',
            title: senderName,
            body: pushBody,
            routingPayload: {
              type: 'PERSONAL_CHAT',
              conversationId,
              entityId: message.id,
            },
            actorId: senderId,
          },
          client
        );
      }
    } catch (pushErr) {
      console.warn('[Direct Chat] FCM push notification dispatch warning (suppressed):', pushErr);
    }

    return mapToDirectMessageItem(message, senderId);
  });
}

/**
 * Toggles an emoji reaction on a direct message.
 * If user already reacted with this emoji, removes it (toggle off).
 * If user reacted with a different emoji, updates it (one reaction per user).
 * If user has not reacted, creates it.
 */
export async function toggleDirectMessageReaction(
  conversationId: string,
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

  await verifyDirectConversationAccess(conversationId, userId, client);

  const message = await client.directMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });

  if (!message || message.conversationId !== conversationId) {
    throw new ChatNotFoundError('Message not found in this conversation.');
  }

  const existing = await client.directMessageReaction.findUnique({
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
        await client.directMessageReaction.delete({
          where: { id: existing.id },
        });
      } catch (delErr: any) {
        if (delErr?.code !== 'P2025') throw delErr;
      }
      action = 'removed';
    } else {
      try {
        await client.directMessageReaction.update({
          where: { id: existing.id },
          data: { emoji },
        });
        action = 'updated';
      } catch (updateErr: any) {
        if (updateErr?.code === 'P2025') {
          await client.directMessageReaction.create({
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
      await client.directMessageReaction.create({
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
        const raceExisting = await client.directMessageReaction.findUnique({
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
              await client.directMessageReaction.delete({ where: { id: raceExisting.id } });
            } catch { }
            action = 'removed';
          } else {
            await client.directMessageReaction.update({
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

  const allReactions = await client.directMessageReaction.findMany({
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
    reactions,
    action,
  };
}

/**
 * Removes any active reaction from the user on a direct message.
 */
export async function removeDirectMessageReaction(
  conversationId: string,
  messageId: string,
  userId: string,
  db?: PrismaClient
): Promise<ToggleChatReactionResponseData> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, client);

  const message = await client.directMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true },
  });

  if (!message || message.conversationId !== conversationId) {
    throw new ChatNotFoundError('Message not found in this conversation.');
  }

  try {
    await client.directMessageReaction.delete({
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

  const allReactions = await client.directMessageReaction.findMany({
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
    reactions,
    action: 'removed',
  };
}

/**
 * Marks conversation as read for the user up to the current timestamp.
 */
export async function markDirectConversationAsRead(
  conversationId: string,
  userId: string,
  db?: PrismaClient
): Promise<{ conversationId: string; userId: string; readAt: string }> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, db);

  const now = new Date();

  await client.directConversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    update: { lastReadAt: now },
    create: {
      conversationId,
      userId,
      lastReadAt: now,
    },
  });

  return {
    conversationId,
    userId,
    readAt: now.toISOString(),
  };
}

/**
 * Authorizes and retrieves the signed URL for a chat media attachment.
 * Strictly guarantees that only authorized direct conversation participants
 * or authorized group members can access the private storage object.
 */
export async function getChatAttachmentDetails(
  attachmentId: string,
  userId: string,
  db?: PrismaClient
): Promise<{
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storagePath: string;
  url: string;
}> {
  const client = assertDb(db);
  const attachment = await client.chatAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      directMessage: {
        include: {
          conversation: true,
        },
      },
      chatMessage: {
        include: {
          group: true,
        },
      },
    },
  });

  if (!attachment) {
    throw new ChatNotFoundError('Attachment not found.');
  }

  // 1. Direct message access authorization
  if (attachment.directMessage) {
    const conv = attachment.directMessage.conversation;
    if (conv.userOneId !== userId && conv.userTwoId !== userId) {
      throw new ForbiddenChatError('Access denied: You are not a participant in this conversation.');
    }
  }

  // 2. Group chat access authorization
  if (attachment.chatMessage) {
    const group = attachment.chatMessage.group;
    if (group.privacy === 'PRIVATE') {
      const membership = await client.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId: group.id,
            userId,
          },
        },
      });
      if (!membership) {
        throw new ForbiddenChatError('Access denied: You are not a member of this private group.');
      }
    }
  }

  const signedUrl = await createTemporarySignedChatAttachmentUrl(attachment.storagePath, 3600);

  return {
    id: attachment.id,
    type: attachment.type,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSizeBytes: attachment.fileSizeBytes,
    storagePath: attachment.storagePath,
    url: signedUrl,
  };
}

/**
 * Searches messages within a specific direct conversation.
 * Strictly verifies participant authorization (non-participants receive 403 Forbidden).
 * Supports text search in content & attachment filenames, sender filter, date range, and pagination.
 */
export async function searchDirectMessages(
  conversationId: string,
  userId: string,
  query: ChatSearchQueryInput,
  db?: PrismaClient
): Promise<PaginatedChatSearchResponse> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, db);

  const limit = Math.min(Math.max(query.limit || 20, 1), 50);
  const cursorDate = query.cursor ? new Date(query.cursor) : undefined;
  const startDate = query.startDate ? new Date(query.startDate) : undefined;
  const endDate = query.endDate ? new Date(query.endDate) : undefined;

  const searchKeyword = query.q.trim();

  const where: Prisma.DirectMessageWhereInput = {
    conversationId,
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
    client.directMessage.findMany({
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: directMessageInclude,
    }),
    client.directMessage.count({
      where: {
        conversationId,
        OR: where.OR,
        ...(query.senderId ? { senderId: query.senderId } : {}),
      },
    }),
  ]);

  const hasMore = rawMessages.length > limit;
  const sliced = hasMore ? rawMessages.slice(0, limit) : rawMessages;
  const nextCursor = sliced.length > 0 ? sliced[sliced.length - 1].createdAt.toISOString() : null;

  const results: ChatSearchResultItem[] = sliced.map((msg) => {
    const item = mapToDirectMessageItem(msg, userId);
    return {
      id: item.id,
      conversationId,
      conversationType: 'DIRECT',
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
 * for a direct conversation with signed temporary URLs.
 */
export async function getDirectMediaGallery(
  conversationId: string,
  userId: string,
  query: ChatMediaQueryInput,
  db?: PrismaClient
): Promise<PaginatedChatMediaResponse> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, db);

  const limit = Math.min(Math.max(query.limit || 30, 1), 50);
  const cursorDate = query.cursor ? new Date(query.cursor) : undefined;

  const where: Prisma.ChatAttachmentWhereInput = {
    directMessage: {
      conversationId,
    },
    ...(query.type ? { type: query.type } : {}),
    ...(cursorDate && !isNaN(cursorDate.getTime()) ? { createdAt: { lt: cursorDate } } : {}),
  };

  const rawAttachments = await client.chatAttachment.findMany({
    where,
    take: limit + 1,
    orderBy: { createdAt: 'desc' },
    include: {
      directMessage: {
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
        messageId: att.directMessageId || '',
        conversationId,
        type: att.type,
        fileName: att.fileName,
        mimeType: att.mimeType,
        fileSizeBytes: att.fileSizeBytes,
        storagePath: att.storagePath,
        url: signedUrl,
        duration: att.duration ?? undefined,
        createdAt: att.createdAt instanceof Date ? att.createdAt.toISOString() : String(att.createdAt),
        senderId: att.directMessage?.senderId || '',
        senderName: att.directMessage?.sender?.profile?.fullName || 'Community Member',
        senderAvatarUrl: att.directMessage?.sender?.profile?.avatarUrl || null,
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
export async function getDirectMessageContext(
  conversationId: string,
  messageId: string,
  userId: string,
  limit: number = 30,
  db?: PrismaClient
): Promise<ChatMessageContextResponse> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, db);

  const targetMsg = await client.directMessage.findFirst({
    where: { id: messageId, conversationId },
    include: directMessageInclude,
  });

  if (!targetMsg) {
    throw new ChatNotFoundError('Target message not found.');
  }

  const half = Math.floor(limit / 2);

  // Older messages
  const olderMessages = await client.directMessage.findMany({
    where: { conversationId, createdAt: { lt: targetMsg.createdAt } },
    take: half,
    orderBy: { createdAt: 'desc' },
    include: directMessageInclude,
  });

  // Newer messages
  const newerMessages = await client.directMessage.findMany({
    where: { conversationId, createdAt: { gt: targetMsg.createdAt } },
    take: half,
    orderBy: { createdAt: 'asc' },
    include: directMessageInclude,
  });

  const allRaw = [...newerMessages.reverse(), targetMsg, ...olderMessages];
  const targetIndex = newerMessages.length;

  const mapped = allRaw.map((m) => mapToDirectMessageItem(m, userId));

  return {
    targetMessageId: messageId,
    messages: mapped,
    targetIndex,
  };
}

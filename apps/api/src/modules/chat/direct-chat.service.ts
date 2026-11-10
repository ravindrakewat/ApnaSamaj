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
  DELETED_CHAT_MESSAGE_PLACEHOLDER,
  MessageDeleteScope,
  DeleteChatMessageResponseData,
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
  BadRequestChatError,
  aggregateReactions,
} from './chat.service';
import { createTemporarySignedChatAttachmentUrl, resolveChatAttachmentUrl, populateSignedAttachmentUrls } from '../../services/storage.service';
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
} satisfies Prisma.DirectMessageInclude;

const legacyDirectMessageSelect = {
  id: true,
  conversationId: true,
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

type RawDirectMessage = Prisma.DirectMessageGetPayload<{
  include: typeof directMessageInclude;
}>;

export function mapToDirectMessageItem(item: any, currentUserId?: string): DirectMessageItem {
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
      directMessageId: att.directMessageId,
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
    conversationId: item.conversationId,
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

  let conversation: any = await client.directConversation.findUnique({
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
            select: legacyDirectMessageSelect,
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
              select: legacyDirectMessageSelect,
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
  const otherParticipant = conversation.participants.find((p: any) => p.userId === recipientId);
  const myParticipant = conversation.participants.find((p: any) => p.userId === initiatorId);

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

  let rawConversations: any[] = [];
  try {
    rawConversations = await client.directConversation.findMany({
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
          where: {
            deletions: {
              none: { userId },
            },
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: directMessageInclude,
        },
      },
    });
  } catch {
    rawConversations = await client.directConversation.findMany({
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
          select: legacyDirectMessageSelect,
        },
      },
    });
  }

  const hasMore = rawConversations.length > limit;
  const list = hasMore ? rawConversations.slice(0, limit) : rawConversations;
  const nextCursor = hasMore && list.length > 0 ? list[list.length - 1].id : null;

  const conversations: DirectConversationItem[] = await Promise.all(
    list.map(async (conv) => {
      const otherUserId = conv.userOneId === userId ? conv.userTwoId : conv.userOneId;
      const otherPart = conv.participants?.find((p: any) => p.userId === otherUserId);
      const myPart = conv.participants?.find((p: any) => p.userId === userId);

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

  let rawMessages: any[] = [];
  try {
    rawMessages = await client.directMessage.findMany({
      where: {
        conversationId,
        ...cursorFilter,
        deletions: {
          none: { userId },
        },
      },
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: directMessageInclude,
    });
  } catch {
    try {
      rawMessages = await (client.directMessage as any).findMany({
        where: {
          conversationId,
          ...cursorFilter,
        },
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        select: legacyDirectMessageSelect,
      });
    } catch {
      rawMessages = await client.directMessage.findMany({
        where: {
          conversationId,
          ...cursorFilter,
        },
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: directMessageInclude,
      });
    }
  }

  const hasMore = rawMessages.length > limit;
  const list = hasMore ? rawMessages.slice(0, limit) : rawMessages;
  const nextCursor = hasMore && list.length > 0 ? list[list.length - 1].id : null;

  const mappedMessages = list.map((m) => mapToDirectMessageItem(m, userId));
  await populateSignedAttachmentUrls(mappedMessages);

  return {
    messages: mappedMessages,
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
        const mapped = mapToDirectMessageItem(existing, senderId);
        await populateSignedAttachmentUrls([mapped]);
        return mapped;
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
        const mapped = mapToDirectMessageItem(existingAttachment.directMessage, senderId);
        await populateSignedAttachmentUrls([mapped]);
        return mapped;
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
          const mapped = mapToDirectMessageItem(existing, senderId);
          await populateSignedAttachmentUrls([mapped]);
          return mapped;
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
          const mapped = mapToDirectMessageItem(existing, senderId);
          await populateSignedAttachmentUrls([mapped]);
          return mapped;
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

    const mapped = mapToDirectMessageItem(message, senderId);
    await populateSignedAttachmentUrls([mapped]);
    return mapped;
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

  // Deletion revocation check: do not serve attachments from deleted messages
  if (
    (attachment.directMessage && (attachment.directMessage.isDeletedForEveryone || attachment.directMessage.content === DELETED_CHAT_MESSAGE_PLACEHOLDER)) ||
    (attachment.chatMessage && (attachment.chatMessage.isDeletedForEveryone || attachment.chatMessage.content === DELETED_CHAT_MESSAGE_PLACEHOLDER))
  ) {
    throw new ForbiddenChatError('Attachment access revoked: Message was deleted.');
  }

  // Also verify user hasn't deleted this message for themselves
  if (attachment.directMessageId) {
    try {
      const isDeletedForMe = await (client as any).directMessageDeletion.findUnique({
        where: {
          messageId_userId: {
            messageId: attachment.directMessageId,
            userId,
          },
        },
      });
      if (isDeletedForMe) {
        throw new ForbiddenChatError('Attachment access revoked: Message was deleted.');
      }
    } catch {
      // ignore if unmigrated
    }
  }

  if (attachment.chatMessageId) {
    try {
      const isDeletedForMe = await (client as any).chatMessageDeletion.findUnique({
        where: {
          messageId_userId: {
            messageId: attachment.chatMessageId,
            userId,
          },
        },
      });
      if (isDeletedForMe) {
        throw new ForbiddenChatError('Attachment access revoked: Message was deleted.');
      }
    } catch {
      // ignore if unmigrated
    }
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

  // Escape ILIKE wildcard characters so a bare `%` or `_` does not match all rows.
  // Prisma passes `contains` values through to PostgreSQL ILIKE without escaping them,
  // meaning `%` matches any sequence and `_` matches any single character.
  const rawKeyword = query.q.trim();
  const searchKeyword = rawKeyword.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

  const baseWhere: Prisma.DirectMessageWhereInput = {
    conversationId,
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
    const where: Prisma.DirectMessageWhereInput = {
      ...baseWhere,
      isDeletedForEveryone: false,
      deletions: {
        none: { userId },
      },
    };

    [rawMessages, totalMatches] = await Promise.all([
      client.directMessage.findMany({
        where,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: directMessageInclude,
      }),
      client.directMessage.count({
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
        (client.directMessage as any).findMany({
          where: baseWhere,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          select: legacyDirectMessageSelect,
        }),
        client.directMessage.count({
          where: {
            conversationId,
            content: { not: DELETED_CHAT_MESSAGE_PLACEHOLDER },
            OR: baseWhere.OR,
            ...(query.senderId ? { senderId: query.senderId } : {}),
          },
        }),
      ]);
    } catch {
      [rawMessages, totalMatches] = await Promise.all([
        client.directMessage.findMany({
          where: baseWhere,
          take: limit + 1,
          orderBy: { createdAt: 'desc' },
          include: directMessageInclude,
        }),
        client.directMessage.count({
          where: {
            conversationId,
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

  let rawAttachments: any[] = [];
  try {
    const where: Prisma.ChatAttachmentWhereInput = {
      directMessage: {
        conversationId,
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
  } catch {
    const fallbackWhere: Prisma.ChatAttachmentWhereInput = {
      directMessage: {
        conversationId,
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
  }

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

  let targetMsg: any;
  try {
    targetMsg = await client.directMessage.findFirst({
      where: { id: messageId, conversationId },
      include: directMessageInclude,
    });
  } catch {
    targetMsg = await (client.directMessage as any).findFirst({
      where: { id: messageId, conversationId },
      select: legacyDirectMessageSelect,
    });
  }

  if (!targetMsg) {
    throw new ChatNotFoundError('Target message not found.');
  }

  try {
    const isDeletedForMe = await (client as any).directMessageDeletion.findUnique({
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
    // Older messages
    olderMessages = await client.directMessage.findMany({
      where: { conversationId, createdAt: { lt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'desc' },
      include: directMessageInclude,
    });

    // Newer messages
    newerMessages = await client.directMessage.findMany({
      where: { conversationId, createdAt: { gt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'asc' },
      include: directMessageInclude,
    });
  } catch {
    olderMessages = await (client.directMessage as any).findMany({
      where: { conversationId, createdAt: { lt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'desc' },
      select: legacyDirectMessageSelect,
    });

    newerMessages = await (client.directMessage as any).findMany({
      where: { conversationId, createdAt: { gt: targetMsg.createdAt } },
      take: half,
      orderBy: { createdAt: 'asc' },
      select: legacyDirectMessageSelect,
    });
  }

  const allRaw = [...newerMessages.reverse(), targetMsg, ...olderMessages];
  const targetIndex = newerMessages.length;

  const mapped = allRaw.map((m) => mapToDirectMessageItem(m, userId));
  await populateSignedAttachmentUrls(mapped);

  return {
    targetMessageId: messageId,
    messages: mapped,
    targetIndex,
  };
}

/**
 * Deletes a direct message for the requesting user (ME) or for both participants (EVERYONE).
 * - "ME": Persisted in DirectMessageDeletion so it disappears only for the requesting user.
 * - "EVERYONE": Replaces content with deleted placeholder, revokes attachments/reactions.
 *   - Only the message sender can delete for everyone.
 *   - Allowed within 60 minutes of sending.
 */
export async function deleteDirectMessage(
  conversationId: string,
  messageId: string,
  userId: string,
  scope: MessageDeleteScope,
  db?: PrismaClient
): Promise<DeleteChatMessageResponseData> {
  const client = assertDb(db);
  await verifyDirectConversationAccess(conversationId, userId, db);

  const message = await client.directMessage.findFirst({
    where: { id: messageId, conversationId },
  });

  if (!message) {
    throw new ChatNotFoundError('Direct message not found.');
  }

  if (scope === 'ME') {
    try {
      await (client as any).directMessageDeletion.upsert({
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
      console.warn('[Direct Chat Service] DirectMessageDeletion write failed (unmigrated DB?), falling back:', err);
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

    if (message.senderId !== userId) {
      throw new ForbiddenChatError('Only the message sender can delete this message for everyone.');
    }

    const ageMs = Date.now() - message.createdAt.getTime();
    const WINDOW_MS = 60 * 60 * 1000; // 60 minutes
    if (ageMs > WINDOW_MS) {
      throw new BadRequestChatError('Messages can only be deleted for everyone within 60 minutes of sending.');
    }

    try {
      await client.directMessage.update({
        where: { id: messageId },
        data: {
          content: DELETED_CHAT_MESSAGE_PLACEHOLDER,
          isDeletedForEveryone: true,
          deletedAt: new Date(),
          deletedByUserId: userId,
        },
      });
    } catch {
      await client.directMessage.update({
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

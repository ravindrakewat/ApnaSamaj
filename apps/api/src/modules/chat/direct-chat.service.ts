import { Prisma, PrismaClient } from '@apnasamaj/database';
import {
  DirectMessageItem,
  DirectMessagesResponseData,
  DirectConversationItem,
  DirectInboxResponseData,
  DirectChatParticipant,
  ChatAttachmentItem,
  ChatAttachmentInput,
} from '@apnasamaj/shared-types';
import {
  ListDirectMessagesQueryInput,
  ListDirectInboxQueryInput,
} from '@apnasamaj/validation';
import {
  ChatServiceError,
  ChatNotFoundError,
  ForbiddenChatError,
} from './chat.service';
import { createTemporarySignedChatAttachmentUrl } from '../../services/storage.service';
import { dispatchPushNotificationToUser } from '../notifications/push-notification.service';

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
} satisfies Prisma.DirectMessageInclude;

type RawDirectMessage = Prisma.DirectMessageGetPayload<{
  include: typeof directMessageInclude;
}>;

export function mapToDirectMessageItem(item: RawDirectMessage): DirectMessageItem {
  return {
    id: item.id,
    conversationId: item.conversationId,
    senderId: item.senderId,
    content: item.content,
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
      directMessageId: att.directMessageId,
      type: att.type,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSizeBytes: att.fileSizeBytes,
      storagePath: att.storagePath,
      url: `https://mock-storage.apnasamaj.local/chat-attachments/${att.storagePath}?token=mock-signed-token&expires=3600`,
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
    messages: list.map(mapToDirectMessageItem),
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
  content?: string,
  attachmentOrTempId?: string | ChatAttachmentInput,
  tempIdOrDb?: string | PrismaClient,
  db?: PrismaClient,
  attachment?: ChatAttachmentInput
): Promise<DirectMessageItem> {
  let resolvedTempId: string | undefined;
  let resolvedDb: PrismaClient | undefined;
  let resolvedAttachment: ChatAttachmentInput | undefined;

  if (typeof attachmentOrTempId === 'string' || attachmentOrTempId === undefined) {
    resolvedTempId = attachmentOrTempId;
    resolvedDb = tempIdOrDb as PrismaClient | undefined;
    resolvedAttachment = (db as unknown as ChatAttachmentInput) || attachment;
  } else {
    resolvedAttachment = attachmentOrTempId;
    resolvedTempId = typeof tempIdOrDb === 'string' ? tempIdOrDb : undefined;
    resolvedDb = db || (typeof tempIdOrDb !== 'string' ? (tempIdOrDb as PrismaClient) : undefined);
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

  if (resolvedAttachment) {
    if (!resolvedAttachment.storagePath || !resolvedAttachment.storagePath.includes(conversationId)) {
      throw new ChatServiceError('Invalid attachment path for this conversation.', 400);
    }
    const existingAttachment = await client.chatAttachment.findFirst({
      where: { storagePath: resolvedAttachment.storagePath },
      select: { id: true },
    });
    if (existingAttachment) {
      throw new ChatServiceError('Attachment has already been associated with an existing message.', 400);
    }
  }

  const now = new Date();

  // Create message and update conversation updatedAt
  const message = await client.directMessage.create({
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
              },
            },
          }
        : {}),
    },
    include: directMessageInclude,
  });

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

  return mapToDirectMessageItem(message);
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

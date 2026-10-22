import { prisma, Prisma } from '@apnasamaj/database';
import {
  ChatMessageItem,
  ChatMessagesResponseData,
} from '@apnasamaj/shared-types';
import { ListGroupMessagesQueryInput } from '@apnasamaj/validation';

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
} satisfies Prisma.ChatMessageInclude;

type RawChatMessage = Prisma.ChatMessageGetPayload<{
  include: typeof chatMessageInclude;
}>;

function mapToChatMessageItem(item: RawChatMessage): ChatMessageItem {
  return {
    id: item.id,
    groupId: item.groupId,
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
  requireActiveMembership: boolean = false
): Promise<{ group: { id: string; name: string; slug: string; privacy: string }; isMember: boolean }> {
  const group = await prisma.group.findFirst({
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

  const membership = await prisma.groupMember.findUnique({
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
  query: ListGroupMessagesQueryInput
): Promise<ChatMessagesResponseData> {
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, userId, false);

  const limit = Math.min(Math.max(query.limit || 20, 1), 50);
  const beforeDate = query.before ? new Date(query.before) : undefined;

  try {
    const where: Prisma.ChatMessageWhereInput = {
      groupId: group.id,
      ...(beforeDate && !isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
    };

    const rawMessages = await prisma.chatMessage.findMany({
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
 */
export async function sendChatMessage(
  groupIdOrSlug: string,
  senderId: string,
  content: string,
  _tempId?: string
): Promise<ChatMessageItem> {
  const { group } = await verifyGroupChatAccess(groupIdOrSlug, senderId, true);

  const trimmed = content ? content.trim() : '';
  if (!trimmed || trimmed.length < 1) {
    throw new ChatServiceError('Message content cannot be empty.', 400);
  }
  if (trimmed.length > 2000) {
    throw new ChatServiceError('Message content cannot exceed 2000 characters.', 400);
  }

  try {
    const message = await prisma.chatMessage.create({
      data: {
        groupId: group.id,
        senderId,
        content: trimmed,
      },
      include: chatMessageInclude,
    });

    return mapToChatMessageItem(message as unknown as RawChatMessage);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ChatMessage') || msg.includes('does not exist')) {
      throw new ChatServiceError('Chat service is temporarily offline (database migration pending).', 503);
    }
    throw err;
  }
}

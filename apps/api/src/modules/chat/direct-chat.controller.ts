import { Response } from 'express';
import {
  ApiResponse,
  DirectInboxResponseData,
  DirectConversationItem,
  DirectMessagesResponseData,
  DirectMessageItem,
  ToggleChatReactionResponseData,
  PaginatedChatSearchResponse,
  PaginatedChatMediaResponse,
  ChatMessageContextResponse,
} from '@apnasamaj/shared-types';
import {
  idParamSchema,
  createDirectConversationSchema,
  sendDirectMessageSchema,
  listDirectMessagesQuerySchema,
  listDirectInboxQuerySchema,
  toggleChatReactionSchema,
  chatSearchQuerySchema,
  chatMediaQuerySchema,
  chatMessageContextParamSchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getOrCreateDirectConversation,
  getDirectChatInbox,
  getDirectMessageHistory,
  sendDirectMessage,
  markDirectConversationAsRead,
  verifyDirectConversationAccess,
  getChatAttachmentDetails,
  toggleDirectMessageReaction,
  removeDirectMessageReaction,
  searchDirectMessages,
  getDirectMediaGallery,
  getDirectMessageContext,
} from './direct-chat.service';
import {
  ChatServiceError,
  ChatNotFoundError,
  ForbiddenChatError,
} from './chat.service';
import { getIO } from './chat.socket';
import { uploadChatAttachment } from '../../services/storage.service';

/**
 * GET /api/v1/chat/inbox
 * Retrieves user's direct messaging inbox with unread counts and last message previews.
 */
export async function getDirectInboxHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedQuery = listDirectInboxQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid query parameters.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getDirectChatInbox(userId, parsedQuery.data, req.db);

    const response: ApiResponse<DirectInboxResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to retrieve chat inbox.');
  }
}

/**
 * POST /api/v1/chat/direct
 * Initiates or retrieves an existing 1-on-1 direct conversation with a community member.
 */
export async function createDirectConversationHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedBody = createDirectConversationSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const response: ApiResponse = {
        success: false,
        error: parsedBody.error.errors[0]?.message || 'Invalid recipient ID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const conversation = await getOrCreateDirectConversation(
      userId,
      parsedBody.data.recipientId,
      req.db
    );

    const response: ApiResponse<DirectConversationItem> = {
      success: true,
      data: conversation,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to create direct conversation.');
  }
}

/**
 * GET /api/v1/chat/conversations/:id/messages
 * Retrieves cursor-paginated message history for a direct conversation.
 */
export async function getDirectMessagesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid conversation ID format.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = listDirectMessagesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid query parameters.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getDirectMessageHistory(
      parsedParams.data.id,
      userId,
      parsedQuery.data,
      req.db
    );

    const response: ApiResponse<DirectMessagesResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to retrieve conversation messages.');
  }
}

/**
 * POST /api/v1/chat/conversations/:id/messages
 * Sends a message in a direct conversation and emits real-time event.
 */
export async function sendDirectMessageHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid conversation ID format.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = sendDirectMessageSchema.safeParse(req.body);
    if (!parsedBody.success) {
      const response: ApiResponse = {
        success: false,
        error: parsedBody.error.errors[0]?.message || 'Invalid message payload.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const savedMessage = await sendDirectMessage(
      parsedParams.data.id,
      userId,
      parsedBody.data.content,
      parsedBody.data.attachment,
      parsedBody.data.tempId,
      req.db,
      undefined,
      parsedBody.data.replyToMessageId
    );

    // Broadcast over WebSocket if socket server is initialized
    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug || 'default';
      const conversationRoom = `${tenantSlug}:conversation:${savedMessage.conversationId}`;
      io.to(conversationRoom).emit('direct:new_message', {
        message: savedMessage,
        tempId: parsedBody.data.tempId,
      });
    } catch {
      // Socket not initialized or offline - continue silently
    }

    const response: ApiResponse<DirectMessageItem> = {
      success: true,
      data: savedMessage,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to send message.');
  }
}

/**
 * POST /api/v1/chat/conversations/:id/read
 * Marks direct conversation as read for the current user.
 */
export async function markDirectConversationReadHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid conversation ID format.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const result = await markDirectConversationAsRead(
      parsedParams.data.id,
      userId,
      req.db
    );

    // Broadcast read event over WebSocket
    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug || 'default';
      const conversationRoom = `${tenantSlug}:conversation:${result.conversationId}`;
      io.to(conversationRoom).emit('direct:message_read', result);
    } catch {
      // Socket not initialized or offline
    }

    const response: ApiResponse<{ conversationId: string; readAt: string }> = {
      success: true,
      data: {
        conversationId: result.conversationId,
        readAt: result.readAt,
      },
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to mark conversation as read.');
  }
}

/**
 * POST /api/v1/chat/conversations/:id/attachments
 * Uploads media attachment (image, video, document) for a direct conversation.
 * Strictly verifies authenticated user is an active participant in this conversation.
 */
export async function uploadDirectAttachmentHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid conversation ID format.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const conversationId = parsedParams.data.id;

    // Security check: verify user is a participant of this conversation
    await verifyDirectConversationAccess(conversationId, userId, req.db);

    if (!req.file || !req.file.buffer) {
      const response: ApiResponse = {
        success: false,
        error: 'No file was provided for upload.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const tenantSlug = req.tenant?.slug || 'default';
    const duration = req.body?.duration ? parseFloat(req.body.duration) : undefined;
    const attachmentResult = await uploadChatAttachment({
      tenantSlug,
      conversationId,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
      duration: !isNaN(duration as number) ? duration : undefined,
    });

    const response: ApiResponse<{ attachment: typeof attachmentResult }> = {
      success: true,
      data: { attachment: attachmentResult },
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to upload chat attachment.');
  }
}

/**
 * GET /api/v1/chat/attachments/:id/url
 * Retrieves a fresh temporary signed URL for an authorized user to access a chat attachment.
 */
export async function getChatAttachmentUrlHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid attachment ID format.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const details = await getChatAttachmentDetails(parsedParams.data.id, userId, req.db);

    const response: ApiResponse<typeof details> = {
      success: true,
      data: details,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to retrieve attachment URL.');
  }
}

function handleChatError(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof ChatNotFoundError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(404).json(response);
    return;
  }

  if (err instanceof ForbiddenChatError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(403).json(response);
    return;
  }

  if (err instanceof ChatServiceError) {
    const response: ApiResponse = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
    res.status(err.statusCode).json(response);
    return;
  }

  console.error('[Direct Chat Controller] Error:', err);
  const response: ApiResponse = {
    success: false,
    error: fallbackMessage,
    timestamp: new Date().toISOString(),
  };
  res.status(500).json(response);
}

/**
 * POST /api/v1/chat/conversations/:id/messages/:messageId/reactions
 * Toggles an emoji reaction on a direct message.
 */
export async function toggleDirectMessageReactionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid conversation identifier.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const messageId = req.params.messageId;
  if (!messageId) {
    res.status(400).json({
      success: false,
      error: 'Message identifier is required.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const parsedBody = toggleChatReactionSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      success: false,
      error: parsedBody.error.errors[0]?.message || 'Invalid reaction emoji.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const result = await toggleDirectMessageReaction(
      parsedParams.data.id,
      messageId,
      userId,
      parsedBody.data.emoji,
      req.db
    );

    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug || 'default';
      const conversationRoom = `${tenantSlug}:conversation:${parsedParams.data.id}`;
      io.to(conversationRoom).emit('direct:reaction', {
        conversationId: parsedParams.data.id,
        conversationType: 'DIRECT',
        messageId,
        reactions: result.reactions,
        userId,
        emoji: parsedBody.data.emoji,
        action: result.action,
      });
    } catch {
      // Non-blocking socket emission
    }

    const response: ApiResponse<ToggleChatReactionResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to update direct message reaction.');
  }
}

/**
 * DELETE /api/v1/chat/conversations/:id/messages/:messageId/reactions
 * Removes any active reaction from the user on a direct message.
 */
export async function removeDirectMessageReactionHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const parsedParams = idParamSchema.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid conversation identifier.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const messageId = req.params.messageId;
  if (!messageId) {
    res.status(400).json({
      success: false,
      error: 'Message identifier is required.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const result = await removeDirectMessageReaction(
      parsedParams.data.id,
      messageId,
      userId,
      req.db
    );

    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug || 'default';
      const conversationRoom = `${tenantSlug}:conversation:${parsedParams.data.id}`;
      io.to(conversationRoom).emit('direct:reaction', {
        conversationId: parsedParams.data.id,
        conversationType: 'DIRECT',
        messageId,
        reactions: result.reactions,
        userId,
        emoji: '',
        action: 'removed',
      });
    } catch {
      // Non-blocking socket emission
    }

    const response: ApiResponse<ToggleChatReactionResponseData> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to remove direct message reaction.');
  }
}

/**
 * GET /api/v1/chat/conversations/:id/search
 * Searches messages within a direct conversation.
 */
export async function searchDirectMessagesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ success: false, error: 'Invalid conversation ID format.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedQuery = chatSearchQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: parsedQuery.error.errors[0]?.message || 'Invalid search query parameters.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await searchDirectMessages(parsedParams.data.id, userId, parsedQuery.data, req.db);

    const response: ApiResponse<PaginatedChatSearchResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to search direct messages.');
  }
}

/**
 * GET /api/v1/chat/conversations/:id/media
 * Retrieves paginated media gallery items for a direct conversation.
 */
export async function getDirectMediaGalleryHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ success: false, error: 'Invalid conversation ID format.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedQuery = chatMediaQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: parsedQuery.error.errors[0]?.message || 'Invalid media query parameters.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await getDirectMediaGallery(parsedParams.data.id, userId, parsedQuery.data, req.db);

    const response: ApiResponse<PaginatedChatMediaResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to retrieve direct media gallery.');
  }
}

/**
 * GET /api/v1/chat/conversations/:id/messages/:messageId/context
 * Retrieves context around a specific direct message for jump navigation.
 */
export async function getDirectMessageContextHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedParams = chatMessageContextParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ success: false, error: 'Invalid conversation ID or message ID.', timestamp: new Date().toISOString() });
      return;
    }

    const data = await getDirectMessageContext(parsedParams.data.id, parsedParams.data.messageId, userId, 30, req.db);

    const response: ApiResponse<ChatMessageContextResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    handleChatError(res, err, 'Failed to retrieve direct message context.');
  }
}

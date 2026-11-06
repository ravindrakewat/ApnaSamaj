import { Response } from 'express';
import {
  ApiResponse,
  ChatMessagesResponseData,
  ChatMessageItem,
  ToggleChatReactionResponseData,
  PaginatedChatSearchResponse,
  PaginatedChatMediaResponse,
  ChatMessageContextResponse,
} from '@apnasamaj/shared-types';
import {
  idParamSchema,
  listGroupMessagesQuerySchema,
  sendChatMessageSchema,
  groupIdSchema,
  toggleChatReactionSchema,
  chatSearchQuerySchema,
  chatMediaQuerySchema,
  chatMessageContextParamSchema,
} from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getGroupChatHistory,
  sendChatMessage,
  verifyGroupChatAccess,
  toggleChatMessageReaction,
  removeChatMessageReaction,
  searchGroupMessages,
  getGroupMediaGallery,
  getGroupMessageContext,
  ChatServiceError,
  ChatNotFoundError,
  ForbiddenChatError,
} from './chat.service';
import { getIO } from './chat.socket';
import { uploadChatAttachment } from '../../services/storage.service';

/**
 * GET /api/v1/groups/:id/messages
 * Retrieves cursor-paginated chat history for a group.
 */
export async function getGroupMessagesHandler(
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

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid group ID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedQuery = listGroupMessagesQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid query parameters.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getGroupChatHistory(parsedGroupId.data, userId, parsedQuery.data, req.db);

    const response: ApiResponse<ChatMessagesResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
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

    console.error('[Chat Controller] getGroupMessages error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve group messages.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * POST /api/v1/groups/:id/messages
 * HTTP fallback for sending a chat message.
 */
export async function sendGroupMessageHandler(
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

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid group ID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const parsedBody = sendChatMessageSchema.safeParse({
      ...req.body,
      groupId: parsedGroupId.data,
    });

    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]?.message || 'Invalid message content.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const message = await sendChatMessage(
      parsedGroupId.data,
      userId,
      parsedBody.data.content,
      parsedBody.data.attachment,
      parsedBody.data.tempId,
      req.db,
      undefined,
      parsedBody.data.replyToMessageId
    );

    // Broadcast through Socket.IO if connected, scoped to tenant
    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug;
      const roomName = tenantSlug ? `${tenantSlug}:group:${message.groupId}` : `group:${message.groupId}`;
      io.to(roomName).emit('new_message', {
        message,
        tempId: parsedBody.data.tempId,
      });
    } catch {
      // Non-blocking if socket server is standalone
    }

    const response: ApiResponse<ChatMessageItem> = {
      success: true,
      message: 'Message sent successfully.',
      data: message,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err: unknown) {
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

    console.error('[Chat Controller] sendGroupMessage error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to send group message.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * POST /api/v1/groups/:id/attachments
 * Uploads media attachment (image, video, document) for a community group chat.
 * Strictly verifies authenticated user is an active member of this group.
 */
export async function uploadGroupAttachmentHandler(
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

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid group ID format.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const groupId = parsedGroupId.data;

    // Security check: verify user is an active member of this group (cannot upload if not active member)
    await verifyGroupChatAccess(groupId, userId, true, req.db);

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
      groupId,
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
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ForbiddenChatError) {
      res.status(403).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ChatServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[Chat Controller] uploadGroupAttachment error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload group attachment.', timestamp: new Date().toISOString() });
  }
}

/**
 * POST /api/v1/groups/:id/messages/:messageId/reactions
 * Toggles an emoji reaction on a group chat message.
 */
export async function toggleGroupMessageReactionHandler(
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

  const parsedGroupId = groupIdSchema.safeParse(req.params.id);
  if (!parsedGroupId.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid group identifier.',
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
    const result = await toggleChatMessageReaction(
      parsedGroupId.data,
      messageId,
      userId,
      parsedBody.data.emoji,
      req.db
    );

    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug;
      const targetGroupId = result.groupId || parsedGroupId.data;
      const roomName = tenantSlug ? `${tenantSlug}:group:${targetGroupId}` : `group:${targetGroupId}`;
      io.to(roomName).emit('chat:reaction', {
        conversationId: targetGroupId,
        conversationType: 'GROUP',
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
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ForbiddenChatError) {
      res.status(403).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ChatServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[Chat Controller] toggleGroupMessageReaction error:', err);
    res.status(500).json({ success: false, error: 'Failed to update reaction.', timestamp: new Date().toISOString() });
  }
}

/**
 * DELETE /api/v1/groups/:id/messages/:messageId/reactions
 * Removes any active reaction from the user on a group chat message.
 */
export async function removeGroupMessageReactionHandler(
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

  const parsedGroupId = groupIdSchema.safeParse(req.params.id);
  if (!parsedGroupId.success) {
    res.status(400).json({
      success: false,
      error: 'Invalid group identifier.',
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
    const result = await removeChatMessageReaction(
      parsedGroupId.data,
      messageId,
      userId,
      req.db
    );

    try {
      const io = getIO();
      const tenantSlug = req.tenant?.slug;
      const targetGroupId = result.groupId || parsedGroupId.data;
      const roomName = tenantSlug ? `${tenantSlug}:group:${targetGroupId}` : `group:${targetGroupId}`;
      io.to(roomName).emit('chat:reaction', {
        conversationId: targetGroupId,
        conversationType: 'GROUP',
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
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ForbiddenChatError) {
      res.status(403).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ChatServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[Chat Controller] removeGroupMessageReaction error:', err);
    res.status(500).json({ success: false, error: 'Failed to remove reaction.', timestamp: new Date().toISOString() });
  }
}

/**
 * GET /api/v1/groups/:id/chat/search
 * Searches messages within a group chat.
 */
export async function searchGroupMessagesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      res.status(400).json({ success: false, error: 'Invalid group ID.', timestamp: new Date().toISOString() });
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

    const data = await searchGroupMessages(parsedGroupId.data, userId, parsedQuery.data, req.db);

    const response: ApiResponse<PaginatedChatSearchResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ForbiddenChatError) {
      res.status(403).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ChatServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[Chat Controller] searchGroupMessages error:', err);
    res.status(500).json({ success: false, error: 'Failed to search messages.', timestamp: new Date().toISOString() });
  }
}

/**
 * GET /api/v1/groups/:id/chat/media
 * Retrieves paginated media gallery items for a group chat.
 */
export async function getGroupMediaGalleryHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required.', timestamp: new Date().toISOString() });
      return;
    }

    const parsedGroupId = groupIdSchema.safeParse(req.params.id);
    if (!parsedGroupId.success) {
      res.status(400).json({ success: false, error: 'Invalid group ID.', timestamp: new Date().toISOString() });
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

    const data = await getGroupMediaGallery(parsedGroupId.data, userId, parsedQuery.data, req.db);

    const response: ApiResponse<PaginatedChatMediaResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ForbiddenChatError) {
      res.status(403).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ChatServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[Chat Controller] getGroupMediaGallery error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve media gallery.', timestamp: new Date().toISOString() });
  }
}

/**
 * GET /api/v1/groups/:id/chat/messages/:messageId/context
 * Retrieves context around a specific message for jump navigation.
 */
export async function getGroupMessageContextHandler(
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
      res.status(400).json({ success: false, error: 'Invalid group ID or message ID.', timestamp: new Date().toISOString() });
      return;
    }

    const data = await getGroupMessageContext(parsedParams.data.id, parsedParams.data.messageId, userId, 30, req.db);

    const response: ApiResponse<ChatMessageContextResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ForbiddenChatError) {
      res.status(403).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    if (err instanceof ChatServiceError) {
      res.status(err.statusCode).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
      return;
    }
    console.error('[Chat Controller] getGroupMessageContext error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve message context.', timestamp: new Date().toISOString() });
  }
}

import { Response } from 'express';
import { ApiResponse, ChatMessagesResponseData, ChatMessageItem } from '@apnasamaj/shared-types';
import { idParamSchema, listGroupMessagesQuerySchema, sendChatMessageSchema, groupIdSchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getGroupChatHistory,
  sendChatMessage,
  verifyGroupChatAccess,
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
      req.db
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
    const attachmentResult = await uploadChatAttachment({
      tenantSlug,
      groupId,
      fileBuffer: req.file.buffer,
      originalName: req.file.originalname,
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

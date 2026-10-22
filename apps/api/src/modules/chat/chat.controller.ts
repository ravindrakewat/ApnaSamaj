import { Response } from 'express';
import { ApiResponse, ChatMessagesResponseData, ChatMessageItem } from '@apnasamaj/shared-types';
import { idParamSchema, listGroupMessagesQuerySchema, sendChatMessageSchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getGroupChatHistory,
  sendChatMessage,
  ChatServiceError,
  ChatNotFoundError,
  ForbiddenChatError,
} from './chat.service';
import { getIO } from './chat.socket';

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

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
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

    const data = await getGroupChatHistory(parsedParams.data.id, userId, parsedQuery.data);

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

    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
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
      groupId: parsedParams.data.id,
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
      parsedParams.data.id,
      userId,
      parsedBody.data.content,
      parsedBody.data.tempId
    );

    // Broadcast through Socket.IO if connected
    try {
      const io = getIO();
      io.to(`group:${message.groupId}`).emit('new_message', {
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

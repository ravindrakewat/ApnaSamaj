import { Response } from 'express';
import {
  ApiResponse,
  UnreadCountResponse,
  NotificationsResponseData,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
} from '@apnasamaj/shared-types';
import { idParamSchema, notificationsQuerySchema } from '@apnasamaj/validation';
import { AuthenticatedRequest } from '../../middleware/authenticate';
import {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  NotificationServiceError,
  NotificationNotFoundError,
} from './notifications.service';

/**
 * GET /api/v1/notifications/unread-count
 */
export async function getUnreadCountHandler(
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

    const data = await getUnreadCount(userId);
    const response: ApiResponse<UnreadCountResponse> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof NotificationServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Notifications Controller] getUnreadCount error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve unread notification count.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * GET /api/v1/notifications
 */
export async function getNotificationsHandler(
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

    const parsedQuery = notificationsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      const issue = parsedQuery.error.issues[0]?.message || 'Invalid query parameters.';
      const response: ApiResponse = {
        success: false,
        error: issue,
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await getNotifications(userId, parsedQuery.data);
    const response: ApiResponse<NotificationsResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof NotificationServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Notifications Controller] getNotifications error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to retrieve notifications.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * PATCH /api/v1/notifications/:id/read
 */
export async function markAsReadHandler(
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
        error: 'Invalid notification ID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await markAsRead(parsedParams.data.id, userId);
    const response: ApiResponse<MarkNotificationReadResponse> = {
      success: true,
      message: 'Notification marked as read.',
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof NotificationNotFoundError) {
      const response: ApiResponse = {
        success: false,
        error: 'Notification not found.',
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    if (err instanceof NotificationServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Notifications Controller] markAsRead error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to update notification.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * PATCH /api/v1/notifications/read-all
 */
export async function markAllAsReadHandler(
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

    const data = await markAllAsRead(userId);
    const response: ApiResponse<MarkAllNotificationsReadResponse> = {
      success: true,
      message: 'All notifications marked as read.',
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof NotificationServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Notifications Controller] markAllAsRead error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to mark notifications as read.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

/**
 * DELETE /api/v1/notifications/:id
 */
export async function deleteNotificationHandler(
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
        error: 'Invalid notification ID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    await deleteNotification(parsedParams.data.id, userId);
    const response: ApiResponse = {
      success: true,
      message: 'Notification removed successfully.',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof NotificationNotFoundError) {
      const response: ApiResponse = {
        success: false,
        error: 'Notification not found.',
        timestamp: new Date().toISOString(),
      };
      res.status(404).json(response);
      return;
    }

    if (err instanceof NotificationServiceError) {
      const response: ApiResponse = {
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      };
      res.status(err.statusCode).json(response);
      return;
    }

    console.error('[Notifications Controller] deleteNotification error:', err);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to remove notification.',
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

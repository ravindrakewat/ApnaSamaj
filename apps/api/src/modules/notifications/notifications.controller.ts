import { Response } from 'express';
import {
  ApiResponse,
  UnreadCountResponse,
  NotificationsResponseData,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  RegisterDeviceTokenResponseData,
  NotificationPreferencesItem,
} from '@apnasamaj/shared-types';
import {
  notificationIdParamSchema,
  notificationsQuerySchema,
  registerDeviceTokenSchema,
  deviceTokenParamSchema,
  updateNotificationPreferencesSchema,
} from '@apnasamaj/validation';
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
import {
  registerDevicePushToken,
  deactivateDevicePushToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  PushServiceError,
} from './push-notification.service';

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

    const data = await getUnreadCount(userId, req.db);
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

    const data = await getNotifications(userId, parsedQuery.data, req.db);
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

    const parsedParams = notificationIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: parsedParams.error.issues[0]?.message || 'Invalid notification ID format. Expected a valid UUID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await markAsRead(parsedParams.data.id, userId, req.db);
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

    const data = await markAllAsRead(userId, req.db);
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

    const parsedParams = notificationIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      const response: ApiResponse = {
        success: false,
        error: parsedParams.error.issues[0]?.message || 'Invalid notification ID format. Expected a valid UUID.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    await deleteNotification(parsedParams.data.id, userId, req.db);
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

/**
 * POST /api/v1/notifications/devices/register
 * Registers or updates an FCM device push token for the authenticated user.
 */
export async function registerDeviceHandler(
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

    const parsed = registerDeviceTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      const response: ApiResponse = {
        success: false,
        error: parsed.error.errors[0]?.message || 'Invalid device registration data.',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const data = await registerDevicePushToken(userId, parsed.data, req.db);

    const response: ApiResponse<RegisterDeviceTokenResponseData> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof PushServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    console.error('[Notifications Controller] registerDevice error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to register device token.',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * DELETE /api/v1/notifications/devices/:id
 * Deactivates a device push token for the authenticated user upon logout or unregister.
 */
export async function deactivateDeviceHandler(
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

    const parsed = deviceTokenParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors[0]?.message || 'Invalid device token parameter.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await deactivateDevicePushToken(userId, parsed.data.id, req.db);

    const response: ApiResponse = {
      success: true,
      message: 'Device push token deactivated successfully.',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PushServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    console.error('[Notifications Controller] deactivateDevice error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate device token.',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * GET /api/v1/notifications/preferences
 * Retrieves user's push notification preferences.
 */
export async function getNotificationPreferencesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await getNotificationPreferences(userId, req.db);

    const response: ApiResponse<NotificationPreferencesItem> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PushServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    console.error('[Notifications Controller] getNotificationPreferences error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve notification preferences.',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * PATCH /api/v1/notifications/preferences
 * Updates user's push notification preferences.
 */
export async function updateNotificationPreferencesHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const parsed = updateNotificationPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors[0]?.message || 'Invalid notification preferences data.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const data = await updateNotificationPreferences(userId, parsed.data, req.db);

    const response: ApiResponse<NotificationPreferencesItem> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof PushServiceError) {
      res.status(err.statusCode).json({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }
    console.error('[Notifications Controller] updateNotificationPreferences error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences.',
      timestamp: new Date().toISOString(),
    });
  }
}

import { Router } from 'express';
import { authenticateToken } from '../../middleware/authenticate';
import { requireActiveUser } from '../../middleware/authorize';
import {
  getUnreadCountHandler,
  getNotificationsHandler,
  markAsReadHandler,
  markAllAsReadHandler,
  deleteNotificationHandler,
} from './notifications.controller';

export const notificationsRouter = Router();

// All notification endpoints require authenticated and active user status
notificationsRouter.use(authenticateToken, requireActiveUser);

// GET /api/v1/notifications/unread-count - Fast unread notification count badge
notificationsRouter.get('/unread-count', getUnreadCountHandler);

// GET /api/v1/notifications - Paginated notification feed with optional unread-only filter
notificationsRouter.get('/', getNotificationsHandler);

// PATCH /api/v1/notifications/read-all - Mark all unread notifications as read
notificationsRouter.patch('/read-all', markAllAsReadHandler);

// PATCH /api/v1/notifications/:id/read - Mark a single notification as read
notificationsRouter.patch('/:id/read', markAsReadHandler);

// DELETE /api/v1/notifications/:id - Delete a notification
notificationsRouter.delete('/:id', deleteNotificationHandler);

export default notificationsRouter;

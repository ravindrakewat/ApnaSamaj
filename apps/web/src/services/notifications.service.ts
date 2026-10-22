import {
  UnreadCountResponse,
  NotificationsResponseData,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
} from '@apnasamaj/shared-types';
import { apiFetch } from './api.client';

export interface FetchNotificationsParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

/**
 * Retrieves the fast unread notification counter for badge display.
 */
export async function fetchUnreadCount(): Promise<UnreadCountResponse> {
  const response = await apiFetch<UnreadCountResponse>('/api/v1/notifications/unread-count', {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch unread notification count.');
  }

  return response.data;
}

/**
 * Retrieves paginated notifications with optional unread-only filtering.
 */
export async function fetchNotifications(
  params: FetchNotificationsParams = {}
): Promise<NotificationsResponseData> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.set('page', params.page.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.unreadOnly !== undefined) queryParams.set('unreadOnly', String(params.unreadOnly));

  const queryString = queryParams.toString();
  const endpoint = `/api/v1/notifications${queryString ? `?${queryString}` : ''}`;

  const response = await apiFetch<NotificationsResponseData>(endpoint, {
    method: 'GET',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to fetch notifications.');
  }

  return response.data;
}

/**
 * Marks a specific notification as read.
 */
export async function markNotificationAsRead(id: string): Promise<MarkNotificationReadResponse> {
  const response = await apiFetch<MarkNotificationReadResponse>(`/api/v1/notifications/${id}/read`, {
    method: 'PATCH',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to mark notification as read.');
  }

  return response.data;
}

/**
 * Marks all unread notifications as read.
 */
export async function markAllNotificationsAsRead(): Promise<MarkAllNotificationsReadResponse> {
  const response = await apiFetch<MarkAllNotificationsReadResponse>('/api/v1/notifications/read-all', {
    method: 'PATCH',
  });

  if (!response.success || !response.data) {
    throw new Error(response.error || 'Failed to mark all notifications as read.');
  }

  return response.data;
}

/**
 * Deletes a notification by ID.
 */
export async function deleteNotification(id: string): Promise<void> {
  const response = await apiFetch<void>(`/api/v1/notifications/${id}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    throw new Error(response.error || 'Failed to delete notification.');
  }
}

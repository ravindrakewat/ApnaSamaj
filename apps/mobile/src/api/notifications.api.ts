import { apiClient } from './client';
import {
  RegisterDeviceTokenInput,
  RegisterDeviceTokenResponseData,
  NotificationPreferencesItem,
  UpdateNotificationPreferencesInput,
  NotificationsResponseData,
  UnreadCountResponse,
  MarkNotificationReadResponse,
  MarkAllNotificationsReadResponse,
  ApiResponse,
} from '@apnasamaj/shared-types';

export interface GetNotificationsParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export const notificationsApi = {
  /**
   * Retrieves a paginated list of notifications for the authenticated user and active tenant.
   * Optionally filtered by unreadOnly.
   */
  async getNotifications(params?: GetNotificationsParams): Promise<NotificationsResponseData> {
    const queryParams: Record<string, string | number | boolean> = {};
    if (params?.page !== undefined) queryParams.page = params.page;
    if (params?.limit !== undefined) queryParams.limit = params.limit;
    if (params?.unreadOnly !== undefined) queryParams.unreadOnly = params.unreadOnly;

    const res = await apiClient.get<ApiResponse<NotificationsResponseData>>(
      '/notifications',
      queryParams
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to retrieve notifications.');
    }
    return res.data;
  },

  /**
   * Retrieves the current unread notification count for badge display.
   */
  async getUnreadCount(): Promise<number> {
    const res = await apiClient.get<ApiResponse<UnreadCountResponse>>(
      '/notifications/unread-count'
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to retrieve unread count.');
    }
    return res.data.unreadCount;
  },

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(id: string): Promise<MarkNotificationReadResponse> {
    const res = await apiClient.patch<ApiResponse<MarkNotificationReadResponse>>(
      `/notifications/${encodeURIComponent(id)}/read`
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to mark notification as read.');
    }
    return res.data;
  },

  /**
   * Marks all unread notifications as read.
   */
  async markAllAsRead(): Promise<MarkAllNotificationsReadResponse> {
    const res = await apiClient.patch<ApiResponse<MarkAllNotificationsReadResponse>>(
      '/notifications/read-all'
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to mark all notifications as read.');
    }
    return res.data;
  },

  /**
   * Deletes a notification by ID.
   */
  async deleteNotification(id: string): Promise<void> {
    const res = await apiClient.delete<ApiResponse<{ success: boolean }>>(
      `/notifications/${encodeURIComponent(id)}`
    );
    if (res.error) {
      throw new Error(res.error);
    }
  },

  /**
   * Registers or updates an FCM device push token with the backend for the authenticated user.
   * Scoped to the current active tenant community.
   */
  async registerDeviceToken(
    input: RegisterDeviceTokenInput
  ): Promise<RegisterDeviceTokenResponseData> {
    const res = await apiClient.post<ApiResponse<RegisterDeviceTokenResponseData>>(
      '/notifications/devices/register',
      input
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to register device push token.');
    }
    return res.data;
  },

  /**
   * Deactivates a device push token upon user logout or app unregister.
   */
  async deactivateDeviceToken(idOrToken: string): Promise<void> {
    await apiClient.delete<ApiResponse>(
      `/notifications/devices/${encodeURIComponent(idOrToken)}`
    );
  },

  /**
   * Retrieves the current user's push notification preferences.
   */
  async getNotificationPreferences(): Promise<NotificationPreferencesItem> {
    const res = await apiClient.get<ApiResponse<NotificationPreferencesItem>>(
      '/notifications/preferences'
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to retrieve notification preferences.');
    }
    return res.data;
  },

  /**
   * Updates the current user's push notification preferences.
   */
  async updateNotificationPreferences(
    input: UpdateNotificationPreferencesInput
  ): Promise<NotificationPreferencesItem> {
    const res = await apiClient.patch<ApiResponse<NotificationPreferencesItem>>(
      '/notifications/preferences',
      input
    );
    if (!res.data) {
      throw new Error(res.error || 'Failed to update notification preferences.');
    }
    return res.data;
  },
};


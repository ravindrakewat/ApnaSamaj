import { apiClient } from './client';
import {
  RegisterDeviceTokenInput,
  RegisterDeviceTokenResponseData,
  NotificationPreferencesItem,
  UpdateNotificationPreferencesInput,
  ApiResponse,
} from '@apnasamaj/shared-types';

export const notificationsApi = {
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


import { z } from 'zod';

export const notificationIdSchema = z.string().uuid('Invalid notification ID format. Expected a valid UUID.');

export const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification ID format. Expected a valid UUID.'),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;

export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  unreadOnly: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional())
    .optional(),
});

export type NotificationsQueryInput = z.infer<typeof notificationsQuerySchema>;

// --------------------------------------------------------
// FCM PUSH NOTIFICATIONS & PREFERENCES SCHEMAS
// --------------------------------------------------------

export const registerDeviceTokenSchema = z.object({
  token: z.string().min(10, 'Device registration token must be at least 10 characters.').max(1024),
  platform: z.enum(['ANDROID', 'IOS']),
  tokenType: z.enum(['FCM', 'APNS']).optional(),
  deviceId: z.string().max(255).optional(),
});

export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenSchema>;

export const deviceTokenParamSchema = z.object({
  id: z.string().min(1, 'Device token or ID is required.').max(1024),
});

export type DeviceTokenParam = z.infer<typeof deviceTokenParamSchema>;

export const updateNotificationPreferencesSchema = z.object({
  personalMessages: z.boolean().optional(),
  groupMessages: z.boolean().optional(),
  matrimonial: z.boolean().optional(),
  likes: z.boolean().optional(),
  comments: z.boolean().optional(),
  announcements: z.boolean().optional(),
  communityUpdates: z.boolean().optional(),
});

export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

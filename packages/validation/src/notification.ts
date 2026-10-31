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

import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  role: z.enum(['SUPER_ADMIN', 'COMMUNITY_ADMIN', 'MODERATOR', 'MEMBER']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], {
    required_error: 'Status is required and must be either ACTIVE or SUSPENDED',
  }),
  reason: z.string().trim().max(500, 'Reason must not exceed 500 characters').optional(),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

export const updateUserRoleSchema = z.object({
  role: z.enum(['MEMBER', 'MODERATOR', 'COMMUNITY_ADMIN'], {
    required_error: 'Role is required and must be MEMBER, MODERATOR, or COMMUNITY_ADMIN',
  }),
  reason: z.string().trim().max(500, 'Reason must not exceed 500 characters').optional(),
});

export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;


const dateStringSchema = z
  .string()
  .trim()
  .refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  });

export const listAuditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    action: z.string().trim().optional(),
    targetType: z.string().trim().optional(),
    actorId: z.string().uuid('Invalid actor ID format').optional(),
    fromDate: dateStringSchema.optional(),
    toDate: dateStringSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.fromDate && data.toDate) {
        return new Date(data.fromDate) <= new Date(data.toDate);
      }
      return true;
    },
    {
      message: 'fromDate must be earlier than or equal to toDate',
      path: ['toDate'],
    }
  );

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;


export const moderationAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

export type ModerationAnalyticsQuery = z.infer<typeof moderationAnalyticsQuerySchema>;

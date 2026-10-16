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

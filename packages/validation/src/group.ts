import { z } from 'zod';

export const groupIdSchema = z.string().uuid('Invalid group ID format. Expected a valid UUID.');

export const groupUserIdSchema = z.string().uuid('Invalid user ID format. Expected a valid UUID.');

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Group name must be at least 3 characters')
    .max(100, 'Group name cannot exceed 100 characters'),
  description: z.string().trim().max(1000, 'Description cannot exceed 1000 characters').optional(),
  privacy: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  coverUrl: z.string().url('Cover image must be a valid URL').optional().or(z.literal('')),
});

export const listGroupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().trim().max(100, 'Search query cannot exceed 100 characters.').optional(),
  privacy: z.enum(['PUBLIC', 'PRIVATE']).optional(),
});

export const updateGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Group name must be at least 3 characters')
    .max(100, 'Group name cannot exceed 100 characters')
    .optional(),
  description: z.string().trim().max(1000, 'Description cannot exceed 1000 characters').nullable().optional(),
  privacy: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  coverUrl: z.string().url('Cover image must be a valid URL').nullable().optional().or(z.literal('')),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER'], {
    required_error: 'Role is required and must be ADMIN, MODERATOR, or MEMBER',
  }),
});

export const addGroupMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID format. Expected a valid UUID.'),
});

export const listGroupMembersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
  search: z.string().trim().max(100, 'Search query cannot exceed 100 characters.').optional(),
  role: z.enum(['ADMIN', 'MODERATOR', 'MEMBER']).optional(),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
export type ListGroupMembersQuery = z.infer<typeof listGroupMembersQuerySchema>;

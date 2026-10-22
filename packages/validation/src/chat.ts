import { z } from 'zod';

export const sendChatMessageSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  content: z
    .string()
    .trim()
    .min(1, 'Message content cannot be empty')
    .max(2000, 'Message content cannot exceed 2000 characters'),
  tempId: z.string().optional(),
});

export type SendChatMessageSchemaInput = z.infer<typeof sendChatMessageSchema>;

export const listGroupMessagesQuerySchema = z.object({
  before: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListGroupMessagesQueryInput = z.infer<typeof listGroupMessagesQuerySchema>;

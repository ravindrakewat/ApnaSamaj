import { z } from 'zod';

export const chatAttachmentInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
  fileName: z.string().min(1, 'Filename is required').max(255),
  mimeType: z.string().min(1, 'MIME type is required').max(100),
  fileSizeBytes: z.number().int().positive().max(52428800, 'File size exceeds maximum allowed limit (50MB)'),
  storagePath: z.string().min(1, 'Storage path is required').max(500),
});

export type ChatAttachmentInputSchema = z.infer<typeof chatAttachmentInputSchema>;

export const sendChatMessageSchema = z
  .object({
    groupId: z.string().min(1, 'Group ID is required'),
    content: z
      .string()
      .trim()
      .max(2000, 'Message content cannot exceed 2000 characters')
      .optional()
      .default(''),
    attachment: chatAttachmentInputSchema.optional(),
    tempId: z.string().optional(),
  })
  .refine(
    (data) => (data.content && data.content.trim().length > 0) || !!data.attachment,
    {
      message: 'Either message content or an attachment is required.',
      path: ['content'],
    }
  );

export type SendChatMessageSchemaInput = z.infer<typeof sendChatMessageSchema>;

export const listGroupMessagesQuerySchema = z.object({
  before: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListGroupMessagesQueryInput = z.infer<typeof listGroupMessagesQuerySchema>;

export const createDirectConversationSchema = z.object({
  recipientId: z.string().uuid('Invalid recipient ID format'),
});

export type CreateDirectConversationSchemaInput = z.infer<typeof createDirectConversationSchema>;

export const sendDirectMessageSchema = z
  .object({
    content: z
      .string()
      .trim()
      .max(2000, 'Message content cannot exceed 2000 characters')
      .optional()
      .default(''),
    attachment: chatAttachmentInputSchema.optional(),
    tempId: z.string().optional(),
  })
  .refine(
    (data) => (data.content && data.content.trim().length > 0) || !!data.attachment,
    {
      message: 'Either message content or an attachment is required.',
      path: ['content'],
    }
  );

export type SendDirectMessageSchemaInput = z.infer<typeof sendDirectMessageSchema>;

export const listDirectMessagesQuerySchema = z.object({
  before: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListDirectMessagesQueryInput = z.infer<typeof listDirectMessagesQuerySchema>;

export const listDirectInboxQuerySchema = z.object({
  cursor: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type ListDirectInboxQueryInput = z.infer<typeof listDirectInboxQuerySchema>;

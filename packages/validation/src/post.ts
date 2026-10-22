import { z } from 'zod';

export const postTypeEnum = z.enum(['GENERAL', 'ANNOUNCEMENT', 'EVENT']);

export const postMediaItemSchema = z.object({
  url: z.string().url('Invalid media URL'),
  thumbnail: z.string().url().optional(),
  order: z.number().int().min(0).default(0),
});

export type PostMediaItemInput = z.infer<typeof postMediaItemSchema>;

export const createPostSchema = z
  .object({
    content: z
      .string()
      .trim()
      .max(5000, 'Post content must not exceed 5000 characters')
      .default(''),
    type: postTypeEnum.default('GENERAL'),
    groupId: z.string().uuid('Invalid group ID').optional(),
    media: z
      .array(postMediaItemSchema)
      .max(4, 'A maximum of 4 images can be attached per post')
      .optional()
      .default([]),
  })
  .refine(
    (data) => (data.content && data.content.trim().length > 0) || (data.media && data.media.length > 0),
    {
      message: 'Post must contain either text content or at least one image',
      path: ['content'],
    }
  );

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    content: z
      .string()
      .trim()
      .max(5000, 'Post content must not exceed 5000 characters')
      .optional(),
    type: postTypeEnum.optional(),
    media: z
      .array(postMediaItemSchema)
      .max(4, 'A maximum of 4 images can be attached per post')
      .optional(),
  })
  .refine(
    (data) =>
      data.content !== undefined || data.type !== undefined || data.media !== undefined,
    {
      message: 'At least one field (content, type, or media) must be provided for update',
    }
  );

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const feedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  type: postTypeEnum.optional(),
  authorId: z.string().uuid('Invalid author ID').optional(),
});

export type FeedQueryInput = z.infer<typeof feedQuerySchema>;

// --------------------------------------------------------
// COMMENTS VALIDATION SCHEMAS
// --------------------------------------------------------

export const createCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment cannot exceed 1000 characters'),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment cannot exceed 1000 characters'),
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

export const commentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type CommentsQueryInput = z.infer<typeof commentsQuerySchema>;

export const commentIdParamSchema = z.object({
  id: z.string().min(1, 'Post ID is required'),
  commentId: z.string().min(1, 'Comment ID is required'),
});

export type CommentIdParam = z.infer<typeof commentIdParamSchema>;

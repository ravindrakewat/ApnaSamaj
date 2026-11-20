import { z } from 'zod';

export const postTypeEnum = z.enum(['GENERAL', 'ANNOUNCEMENT', 'EVENT']);
export const postMediaTypeEnum = z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']);

export const MAX_VIDEO_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_VIDEO_DURATION_SECONDS = 90; // 90 seconds
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;
export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

export const postIdSchema = z.string().uuid('Invalid post ID format. Expected a valid UUID.');
export const commentIdSchema = z.string().uuid('Invalid comment ID format. Expected a valid UUID.');
export const postCommentIdSchema = z.object({
  id: z.string().uuid('Invalid post ID format. Expected a valid UUID.'),
  commentId: z.string().uuid('Invalid comment ID format. Expected a valid UUID.'),
});

export type PostIdParam = z.infer<typeof postIdSchema>;
export type SingleCommentIdParam = z.infer<typeof commentIdSchema>;
export type PostCommentIdParam = z.infer<typeof postCommentIdSchema>;

export interface ParsedYouTubeVideo {
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  thumbnailUrl: string;
  startTimeSeconds?: number;
}

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const ALLOWED_YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);

/**
 * Parses optional YouTube start time parameters (e.g. ?t=120, ?t=120s, ?t=1m30s, ?start=120).
 */
export function parseYouTubeStartTime(tParam?: string | null): number | undefined {
  if (!tParam) return undefined;
  const clean = tParam.trim().toLowerCase();

  // Check pure digits or digits with 's' suffix (e.g., 120, 120s)
  if (/^\d+s?$/.test(clean)) {
    const num = parseInt(clean.replace('s', ''), 10);
    return isNaN(num) || num <= 0 ? undefined : num;
  }

  // Check format like 1h2m30s or 2m30s
  const match = clean.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (match && (match[1] || match[2] || match[3])) {
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    const secs = match[3] ? parseInt(match[3], 10) : 0;
    const total = hours * 3600 + mins * 60 + secs;
    return total > 0 ? total : undefined;
  }

  return undefined;
}

/**
 * Reusable YouTube URL parser and canonicalizer.
 * - Enforces HTTPS protocol.
 * - Rejects deceptive hostnames, HTML/iframe/script injection, and malformed IDs.
 * - Extracts valid 11-char video ID (^[a-zA-Z0-9_-]{11}$).
 * - Ignores non-essential tracking parameters (feature, si, ab_channel).
 * - Preserves start time.
 * - Generates canonical privacy-enhanced embed URL (https://www.youtube-nocookie.com/embed/VIDEO_ID).
 */
export function parseYouTubeUrl(rawUrl: string): ParsedYouTubeVideo | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  // Reject strings containing HTML tags or scripts
  if (/[<>]/.test(trimmed) || /javascript:/i.test(trimmed)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // Strictly enforce HTTPS
  if (parsed.protocol !== 'https:') {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_YOUTUBE_HOSTS.has(hostname)) {
    return null;
  }

  let candidateId: string | null = null;

  // Extract start time from t or start query parameters
  const tParam = parsed.searchParams.get('t') || parsed.searchParams.get('start');
  const startTimeSeconds = parseYouTubeStartTime(tParam);

  if (hostname === 'youtu.be') {
    // Format: https://youtu.be/VIDEO_ID
    const pathnameParts = parsed.pathname.split('/').filter(Boolean);
    if (pathnameParts.length >= 1) {
      candidateId = pathnameParts[0];
    }
  } else if (hostname === 'www.youtube-nocookie.com') {
    // Format: https://www.youtube-nocookie.com/embed/VIDEO_ID
    const pathnameParts = parsed.pathname.split('/').filter(Boolean);
    if (pathnameParts.length >= 2 && pathnameParts[0] === 'embed') {
      candidateId = pathnameParts[1];
    }
  } else {
    // Hostname is youtube.com, www.youtube.com, or m.youtube.com
    if (parsed.pathname === '/watch') {
      // Format: https://www.youtube.com/watch?v=VIDEO_ID
      candidateId = parsed.searchParams.get('v');
    } else if (parsed.pathname.startsWith('/shorts/')) {
      // Format: https://www.youtube.com/shorts/VIDEO_ID
      const pathnameParts = parsed.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'shorts') {
        candidateId = pathnameParts[1];
      }
    } else if (parsed.pathname.startsWith('/live/')) {
      // Format: https://www.youtube.com/live/VIDEO_ID
      const pathnameParts = parsed.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'live') {
        candidateId = pathnameParts[1];
      }
    } else if (parsed.pathname.startsWith('/embed/')) {
      // Format: https://www.youtube.com/embed/VIDEO_ID
      const pathnameParts = parsed.pathname.split('/').filter(Boolean);
      if (pathnameParts.length >= 2 && pathnameParts[0] === 'embed') {
        candidateId = pathnameParts[1];
      }
    }
  }

  if (!candidateId || !YOUTUBE_VIDEO_ID_REGEX.test(candidateId)) {
    return null;
  }

  const embedUrl = startTimeSeconds
    ? `https://www.youtube-nocookie.com/embed/${candidateId}?start=${startTimeSeconds}`
    : `https://www.youtube-nocookie.com/embed/${candidateId}`;

  const watchUrl = startTimeSeconds
    ? `https://www.youtube.com/watch?v=${candidateId}&t=${startTimeSeconds}`
    : `https://www.youtube.com/watch?v=${candidateId}`;

  const thumbnailUrl = `https://img.youtube.com/vi/${candidateId}/hqdefault.jpg`;

  return {
    videoId: candidateId,
    embedUrl,
    watchUrl,
    thumbnailUrl,
    startTimeSeconds,
  };
}

export const postMediaItemSchema = z
  .object({
    url: z.string().url('Invalid media URL'),
    thumbnail: z.string().url().optional(),
    order: z.number().int().min(0).default(0),
    mediaType: postMediaTypeEnum.default('IMAGE'),
  })
  .refine(
    (item) => {
      const lower = item.url.toLowerCase();
      const isYoutubeHost =
        lower.includes('youtube.com') ||
        lower.includes('youtu.be') ||
        lower.includes('youtube-nocookie.com');

      if (isYoutubeHost) {
        return parseYouTubeUrl(item.url) !== null;
      }

      if (item.mediaType === 'VIDEO') {
        // If mediaType is VIDEO, it must be either a valid YouTube URL or a valid direct video file URL
        const isYt = parseYouTubeUrl(item.url) !== null;
        const isDirectVideo =
          /\.(mp4|webm|mov|ogg)($|\?)/i.test(item.url) ||
          item.url.includes('/storage/v1/object/public/') ||
          item.url.includes('mock-storage');
        return isYt || isDirectVideo;
      }

      return true;
    },
    {
      message: 'Invalid video URL: must be a valid YouTube URL or direct video file',
      path: ['url'],
    }
  );

export type PostMediaItemInput = z.infer<typeof postMediaItemSchema>;

// --------------------------------------------------------
// LINK PREVIEW SCHEMAS & UTILITIES
// --------------------------------------------------------

export const linkPreviewSchema = z.object({
  url: z.string().url('Invalid URL format').max(2048),
  normalizedUrl: z.string().url('Invalid normalized URL format').max(2048),
  provider: z.enum(['youtube', 'amazon', 'general']),
  title: z.string().trim().min(1, 'Title is required').max(300),
  description: z.string().trim().max(1000).optional().nullable(),
  thumbnailUrl: z.string().url().max(2048).optional().nullable(),
  siteName: z.string().trim().max(100).optional().nullable(),
  authorName: z.string().trim().max(150).optional().nullable(),
  productId: z.string().trim().max(100).optional().nullable(),
  mediaType: z.enum(['video', 'product', 'article', 'website']).optional().nullable(),
  favIcon: z.string().url().max(2048).optional().nullable(),
});

export type LinkPreviewSchemaInput = z.infer<typeof linkPreviewSchema>;

export const getLinkPreviewQuerySchema = z.object({
  url: z.string().trim().min(1, 'URL is required').max(2048),
});

export type GetLinkPreviewQueryInput = z.infer<typeof getLinkPreviewQuerySchema>;

/**
 * Extracts all valid HTTP and HTTPS URLs from user text input.
 * Strips terminal punctuation like trailing commas, periods, or brackets.
 * Returns deduplicated URLs in order of appearance.
 */
export function extractUrlsFromText(text?: string | null): string[] {
  if (!text || typeof text !== 'string') return [];
  const urlRegex = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  const seen = new Set<string>();
  const cleanList: string[] = [];

  for (const raw of matches) {
    // Strip trailing punctuation often typed at the end of sentences
    const cleaned = raw.replace(/[.,;:!?)\]>]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        if (!seen.has(cleaned)) {
          seen.add(cleaned);
          cleanList.push(cleaned);
        }
      }
    } catch {
      // Invalid URL format, ignore
    }
  }

  return cleanList;
}

/**
 * Identifies the provider for a given URL (YouTube, Amazon, or General Website).
 */
export function detectLinkProvider(urlStr: string): 'youtube' | 'amazon' | 'general' {
  if (!urlStr || typeof urlStr !== 'string') return 'general';
  try {
    const parsed = new URL(urlStr.trim());
    const host = parsed.hostname.toLowerCase();

    // YouTube check
    if (
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'www.youtu.be' ||
      host === 'www.youtube-nocookie.com'
    ) {
      return 'youtube';
    }

    // Amazon check
    if (
      host === 'amazon.in' ||
      host === 'www.amazon.in' ||
      host === 'amazon.com' ||
      host === 'www.amazon.com' ||
      host === 'amzn.in' ||
      host === 'amzn.to' ||
      host === 'a.co'
    ) {
      return 'amazon';
    }

    return 'general';
  } catch {
    return 'general';
  }
}

/**
 * Extracts Amazon 10-character ASIN from standard product paths.
 */
export function extractAmazonAsin(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const parsed = new URL(urlStr.trim());
    // Match /dp/ASIN, /gp/product/ASIN, /gp/aw/d/ASIN, /d/ASIN
    const match = parsed.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})/i);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    return null;
  } catch {
    return null;
  }
}

export const createPostSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(150, 'Post title must not exceed 150 characters')
      .optional()
      .nullable(),
    content: z
      .string()
      .trim()
      .max(5000, 'Post content must not exceed 5000 characters')
      .default(''),
    type: postTypeEnum.default('GENERAL'),
    groupId: z.string().uuid('Invalid group ID').optional(),
    media: z
      .array(postMediaItemSchema)
      .max(5, 'A maximum of 5 media attachments can be attached per post')
      .optional()
      .default([]),
    linkPreview: linkPreviewSchema.optional().nullable(),
  })
  .refine(
    (data) =>
      (data.content && data.content.trim().length > 0) ||
      (data.title && data.title.trim().length > 0) ||
      (data.media && data.media.length > 0) ||
      Boolean(data.linkPreview),
    {
      message: 'Post must contain either text content, media attachment, or link preview',
      path: ['content'],
    }
  )
  .refine(
    (data) => {
      if (data.type === 'ANNOUNCEMENT' || data.type === 'EVENT') {
        return typeof data.title === 'string' && data.title.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Title is required for this post type',
      path: ['title'],
    }
  )
  .refine(
    (data) => {
      if (!data.media) return true;
      const videoCount = data.media.filter(
        (m) => m.mediaType === 'VIDEO' || parseYouTubeUrl(m.url) !== null
      ).length;
      return videoCount <= 1;
    },
    {
      message: 'Only one video can be attached per post',
      path: ['media'],
    }
  );

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    title: z
      .string()
      .trim()
      .max(150, 'Post title must not exceed 150 characters')
      .optional()
      .nullable(),
    content: z
      .string()
      .trim()
      .max(5000, 'Post content must not exceed 5000 characters')
      .optional(),
    type: postTypeEnum.optional(),
    media: z
      .array(postMediaItemSchema)
      .max(5, 'A maximum of 5 media attachments can be attached per post')
      .optional(),
    linkPreview: linkPreviewSchema.optional().nullable(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.content !== undefined ||
      data.type !== undefined ||
      data.media !== undefined ||
      data.linkPreview !== undefined,
    {
      message: 'At least one field (title, content, type, media, or linkPreview) must be provided for update',
    }
  )
  .refine(
    (data) => {
      if (data.type === 'ANNOUNCEMENT' || data.type === 'EVENT') {
        if (data.title !== undefined) {
          return typeof data.title === 'string' && data.title.trim().length > 0;
        }
      }
      return true;
    },
    {
      message: 'Title is required for this post type',
      path: ['title'],
    }
  )
  .refine(
    (data) => {
      if (!data.media) return true;
      const videoCount = data.media.filter(
        (m) => m.mediaType === 'VIDEO' || parseYouTubeUrl(m.url) !== null
      ).length;
      return videoCount <= 1;
    },
    {
      message: 'Only one video can be attached per post',
      path: ['media'],
    }
  );

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const feedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  type: postTypeEnum.optional(),
  authorId: z.string().uuid('Invalid author ID').optional(),
  search: z.string().trim().max(100, 'Search query cannot exceed 100 characters.').optional(),
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

export const commentIdParamSchema = postCommentIdSchema;

export type CommentIdParam = z.infer<typeof commentIdParamSchema>;

// --------------------------------------------------------
// POST REPORTING VALIDATION SCHEMAS
// --------------------------------------------------------

export const reportPostReasonEnum = z.enum([
  'SPAM',
  'HARASSMENT',
  'HATE_SPEECH',
  'INAPPROPRIATE_CONTENT',
  'MISINFORMATION',
  'OTHER',
]);

export type ReportPostReason = z.infer<typeof reportPostReasonEnum>;

export const reportPostSchema = z.object({
  reason: reportPostReasonEnum,
  details: z
    .string()
    .trim()
    .max(1000, 'Report details cannot exceed 1000 characters')
    .optional(),
});

export type ReportPostInput = z.infer<typeof reportPostSchema>;

// --------------------------------------------------------
// MODERATION QUEUE & REVIEW WORKFLOW SCHEMAS
// --------------------------------------------------------

export const reportReviewDecisionEnum = z.enum(['DISMISSED', 'ACTIONED']);
export type ReportReviewDecision = z.infer<typeof reportReviewDecisionEnum>;

export const reviewReportSchema = z.object({
  decision: reportReviewDecisionEnum,
  notes: z
    .string()
    .trim()
    .max(500, 'Review notes cannot exceed 500 characters')
    .optional(),
});

export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

export const moderationQueueQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  status: z.enum(['ALL', 'PENDING', 'DISMISSED', 'ACTIONED']).default('ALL'),
  reason: reportPostReasonEnum.optional(),
});

export type ModerationQueueQueryInput = z.infer<typeof moderationQueueQuerySchema>;



export const submitPostAppealSchema = z.object({
  postId: z.string().uuid('Invalid post ID format'),
  reason: z.string().trim().min(3, 'Appeal reason is required').max(100, 'Reason must not exceed 100 characters'),
  details: z.string().trim().max(1000, 'Details must not exceed 1000 characters').optional(),
});

export type SubmitPostAppealInput = z.infer<typeof submitPostAppealSchema>;

export const reviewPostAppealSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REJECTED'], {
    required_error: 'Status must be UNDER_REVIEW, APPROVED, or REJECTED',
  }),
  reviewNotes: z.string().trim().max(1000, 'Review notes must not exceed 1000 characters').optional(),
});

export type ReviewPostAppealInput = z.infer<typeof reviewPostAppealSchema>;

export const listMemberPostAppealsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

export type ListMemberPostAppealsQueryInput = z.infer<typeof listMemberPostAppealsQuerySchema>;

export const listAdminPostAppealsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  status: z.enum(['ALL', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']).default('ALL'),
});

export type ListAdminPostAppealsQueryInput = z.infer<typeof listAdminPostAppealsQuerySchema>;


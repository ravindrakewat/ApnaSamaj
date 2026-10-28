import { z } from 'zod';

export const postTypeEnum = z.enum(['GENERAL', 'ANNOUNCEMENT', 'EVENT']);
export const postMediaTypeEnum = z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']);

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
          item.url.includes('/storage/v1/object/public/');
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
      .max(4, 'A maximum of 4 media attachments can be attached per post')
      .optional()
      .default([]),
  })
  .refine(
    (data) => (data.content && data.content.trim().length > 0) || (data.media && data.media.length > 0),
    {
      message: 'Post must contain either text content or at least one media attachment',
      path: ['content'],
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
    content: z
      .string()
      .trim()
      .max(5000, 'Post content must not exceed 5000 characters')
      .optional(),
    type: postTypeEnum.optional(),
    media: z
      .array(postMediaItemSchema)
      .max(4, 'A maximum of 4 media attachments can be attached per post')
      .optional(),
  })
  .refine(
    (data) =>
      data.content !== undefined || data.type !== undefined || data.media !== undefined,
    {
      message: 'At least one field (content, type, or media) must be provided for update',
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


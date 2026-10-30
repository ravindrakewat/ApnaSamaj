import { UserRole } from './user';

export type PostType = 'GENERAL' | 'ANNOUNCEMENT' | 'EVENT';

export const PostType = {
  GENERAL: 'GENERAL' as const,
  ANNOUNCEMENT: 'ANNOUNCEMENT' as const,
  EVENT: 'EVENT' as const,
};

export type PostMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

export const PostMediaType = {
  IMAGE: 'IMAGE' as const,
  VIDEO: 'VIDEO' as const,
  DOCUMENT: 'DOCUMENT' as const,
};

export interface PostAuthor {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  role: UserRole;
  city?: string | null;
  state?: string | null;
}

export interface PostMediaItem {
  id: string;
  postId?: string;
  mediaType: PostMediaType;
  url: string;
  thumbnail?: string | null;
  order: number;
  createdAt?: string;
}

export interface PostMediaInput {
  url: string;
  thumbnail?: string;
  order?: number;
  mediaType?: PostMediaType;
}

export interface PostItem {
  id: string;
  authorId: string | null;
  author: PostAuthor;
  groupId?: string | null;
  group?: { id: string; name: string; slug: string; privacy?: 'PUBLIC' | 'PRIVATE' } | null;
  type: PostType;
  content: string;
  isPinned: boolean;
  media: PostMediaItem[];
  likesCount: number;
  commentsCount: number;
  viewsCount?: number;
  uniqueMembersCount?: number;
  isLikedByMe?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostRequest {
  content: string;
  type?: PostType;
  media?: PostMediaInput[];
}

export interface UpdatePostRequest {
  content?: string;
  type?: PostType;
  media?: PostMediaInput[];
}

export interface UploadMediaResponseData {
  url: string;
  storagePath: string;
  mediaType: 'IMAGE';
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
}

export interface FeedPaginationMeta {
  page: number;
  limit: number;
  totalPosts: number;
  totalPages: number;
  hasMore: boolean;
}

export interface FeedQueryParams {
  page?: number;
  limit?: number;
  type?: PostType;
  authorId?: string;
  search?: string;
}

export interface FeedResponseData {
  posts: PostItem[];
  pagination: FeedPaginationMeta;
}

// --------------------------------------------------------
// LIKES & COMMENTS TYPES
// --------------------------------------------------------

export interface PostLikesResponseData {
  postId: string;
  likesCount: number;
  isLikedByMe: boolean;
}

export interface PostViewsResponseData {
  postId: string;
  totalViews: number;
  uniqueMembers: number;
  hasViewed: boolean;
}

export interface CommentAuthor {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  role: UserRole;
  city?: string | null;
  state?: string | null;
}

export interface CommentItem {
  id: string;
  postId: string;
  authorId: string;
  author: CommentAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommentRequest {
  content: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface CommentsPaginationMeta {
  page: number;
  limit: number;
  totalComments: number;
  totalPages: number;
  hasMore: boolean;
}

export interface CommentsResponseData {
  comments: CommentItem[];
  pagination: CommentsPaginationMeta;
}

// --------------------------------------------------------
// POST REPORTING TYPES
// --------------------------------------------------------

export type ReportPostReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'HATE_SPEECH'
  | 'INAPPROPRIATE_CONTENT'
  | 'MISINFORMATION'
  | 'OTHER';

export interface ReportPostRequest {
  reason: ReportPostReason;
  details?: string;
}

export interface ReportPostResponseData {
  message: string;
}

// --------------------------------------------------------
// MODERATION QUEUE & REVIEW WORKFLOW TYPES
// --------------------------------------------------------

export type ReportReviewDecision = 'DISMISSED' | 'ACTIONED';
export type ReportReviewStatus = 'PENDING' | 'DISMISSED' | 'ACTIONED';

export interface ReportReviewOutcome {
  id: string;
  decision: ReportReviewDecision;
  notes?: string | null;
  moderatorId: string;
  moderatorRole: UserRole;
  reviewedAt: string;
}

export interface ModerationQueueItem {
  id: string;
  postId: string;
  reason: ReportPostReason;
  details?: string | null;
  createdAt: string;
  status: ReportReviewStatus;
  advisoryFlags?: string[];
  reporter: {
    id: string;
    phone: string;
    fullName?: string | null;
  };
  post: {
    id: string;
    content: string;
    type: PostType;
    createdAt: string;
    isDeleted: boolean;
    author: {
      id: string;
      fullName: string;
      avatarUrl?: string | null;
    } | null;
    group?: {
      id: string;
      name: string;
      privacy?: 'PUBLIC' | 'PRIVATE';
    } | null;
  } | null;
  latestReview: ReportReviewOutcome | null;
}

export interface ModerationQueueResponseData {
  reports: ModerationQueueItem[];
  pagination: {
    page: number;
    limit: number;
    totalReports: number;
    totalPages: number;
  };
}

export interface ReviewReportRequest {
  decision: ReportReviewDecision;
  notes?: string;
}

export interface ReviewReportResponseData {
  message: string;
  reportId: string;
  status: ReportReviewStatus;
  review: ReportReviewOutcome;
}

export interface ModerationQueueUpdatePayload {
  reportId?: string;
  postId?: string;
  action: 'REPORT_REVIEWED' | 'POST_MODERATED';
  status?: ReportReviewDecision | 'ACTIONED';
  timestamp: string;
}



export interface DailyModerationTrend {
  date: string;
  received: number;
  resolved: number;
  actioned: number;
  dismissed: number;
}

export interface ModerationAnalyticsResponseData {
  totalReports: number;
  pendingReports: number;
  actionedReports: number;
  dismissedReports: number;
  reportsLast7Days: number;
  reportsLast30Days: number;
  averageResolutionTimeMinutes: number | null;
  averageResolutionTimeHours: number | null;
  reportsByReason: Record<ReportPostReason, number>;
  dailyTrends: DailyModerationTrend[];
  postsRemovedCount: number;
}

export type PostAppealStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface SubmitPostAppealRequest {
  postId: string;
  reason: string;
  details?: string;
}

export interface ReviewPostAppealRequest {
  status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
}

export interface PostAppealItem {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string;
  reason: string;
  details?: string | null;
  status: PostAppealStatus;
  moderatorId?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
}

export interface PostAppealsListResponseData {
  appeals: PostAppealItem[];
  total: number;
}

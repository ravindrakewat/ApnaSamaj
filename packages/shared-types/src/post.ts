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
}

export interface PostItem {
  id: string;
  authorId: string;
  author: PostAuthor;
  groupId?: string | null;
  group?: { id: string; name: string; slug: string } | null;
  type: PostType;
  content: string;
  isPinned: boolean;
  media: PostMediaItem[];
  likesCount: number;
  commentsCount: number;
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

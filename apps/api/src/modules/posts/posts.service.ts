import { prisma, PostType as DbPostType, UserStatus as DbUserStatus, MediaType as DbMediaType } from '@apnasamaj/database';
import {
  PostItem,
  FeedResponseData,
  UserRole,
  PostType,
  PostMediaItem,
  PostLikesResponseData,
  CommentItem,
  CommentsResponseData,
} from '@apnasamaj/shared-types';
import { CreatePostInput, UpdatePostInput, FeedQueryInput } from '@apnasamaj/validation';
import {
  deleteStorageObjects,
  extractStoragePathFromUrl,
} from '../../services/storage.service';

export class PostServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'PostServiceError';
    this.statusCode = statusCode;
  }
}

export class PostNotFoundError extends PostServiceError {
  constructor(message: string = 'Post not found or is unavailable.') {
    super(message, 404);
  }
}

export class ForbiddenPostActionError extends PostServiceError {
  constructor(message: string = 'Forbidden: You do not have permission to perform this action.') {
    super(message, 403);
  }
}

interface PostWithAuthorAndMedia {
  id: string;
  authorId: string;
  groupId: string | null;
  type: DbPostType;
  content: string;
  isPinned: boolean;
  createdAt: Date;
  updatedAt: Date;
  media: {
    id: string;
    postId: string;
    mediaType: DbMediaType;
    url: string;
    thumbnail: string | null;
    order: number;
    createdAt: Date;
  }[];
  author: {
    id: string;
    role: string;
    status: DbUserStatus;
    profile: {
      fullName: string;
      avatarUrl: string | null;
      city: string | null;
      state: string | null;
    } | null;
  };
  _count?: {
    likes?: number;
    comments?: number;
  };
  likes?: { id: string }[];
}

function mapToPostItem(
  post: PostWithAuthorAndMedia,
  currentUserId?: string
): PostItem {
  const isLiked =
    post.likes && post.likes.length > 0
      ? true
      : currentUserId
      ? false
      : false;

  return {
    id: post.id,
    authorId: post.authorId,
    groupId: post.groupId,
    type: post.type as unknown as PostType,
    content: post.content,
    isPinned: post.isPinned,
    media: (post.media || []).map((m): PostMediaItem => ({
      id: m.id,
      postId: m.postId,
      mediaType: m.mediaType as unknown as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
      url: m.url,
      thumbnail: m.thumbnail,
      order: m.order,
      createdAt: m.createdAt.toISOString(),
    })),
    likesCount: post._count?.likes ?? 0,
    commentsCount: post._count?.comments ?? 0,
    isLikedByMe: isLiked,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    author: {
      id: post.author.id,
      fullName: post.author.profile?.fullName || 'Community Member',
      avatarUrl: post.author.profile?.avatarUrl || null,
      role: post.author.role as unknown as UserRole,
      city: post.author.profile?.city || null,
      state: post.author.profile?.state || null,
    },
  };
}

function mapToCommentItem(comment: {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    role: string;
    profile: {
      fullName: string;
      avatarUrl: string | null;
      city: string | null;
      state: string | null;
    } | null;
  };
}): CommentItem {
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorId,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: {
      id: comment.author.id,
      fullName: comment.author.profile?.fullName || 'Community Member',
      avatarUrl: comment.author.profile?.avatarUrl || null,
      role: comment.author.role as unknown as UserRole,
      city: comment.author.profile?.city || null,
      state: comment.author.profile?.state || null,
    },
  };
}

const postIncludeAuthorAndMedia = {
  media: {
    orderBy: { order: 'asc' },
  },
  author: {
    select: {
      id: true,
      role: true,
      status: true,
      profile: {
        select: {
          fullName: true,
          avatarUrl: true,
          city: true,
          state: true,
        },
      },
    },
  },
} as const;

/**
 * Ensures that a target post exists and that its author is in ACTIVE status.
 * Posts whose authors are suspended or inactive are deemed unavailable.
 */
export async function verifyActivePost(postId: string): Promise<{ id: string; authorId: string }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      author: {
        select: { status: true },
      },
    },
  });

  if (!post || post.author.status !== DbUserStatus.ACTIVE) {
    throw new PostNotFoundError('Post not found or is unavailable.');
  }

  return { id: post.id, authorId: post.authorId };
}

/**
 * Creates a new post in the community, with optional media attachments.
 * If database persistence fails, cleans up any newly uploaded Supabase Storage objects.
 */
export async function createPost(authorId: string, input: CreatePostInput): Promise<PostItem> {
  const mediaInputs = input.media || [];

  if (mediaInputs.length > 4) {
    throw new PostServiceError('A maximum of 4 images can be attached per post.', 400);
  }

  try {
    const post = await prisma.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          authorId,
          content: input.content || '',
          type: (input.type as unknown as DbPostType) || DbPostType.GENERAL,
        },
      });

      if (mediaInputs.length > 0) {
        await tx.postMedia.createMany({
          data: mediaInputs.map((item, index) => ({
            postId: newPost.id,
            mediaType: DbMediaType.IMAGE,
            url: item.url,
            thumbnail: item.thumbnail || null,
            order: item.order ?? index,
          })),
        });
      }

      return tx.post.findUnique({
        where: { id: newPost.id },
        include: {
          ...postIncludeAuthorAndMedia,
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
        },
      });
    });

    if (!post) {
      throw new PostServiceError('Failed to create post record.', 500);
    }

    return mapToPostItem(post as unknown as PostWithAuthorAndMedia, authorId);
  } catch (err) {
    // Cleanup uploaded storage objects on failed database persistence
    const storagePathsToClean = mediaInputs
      .map((m) => extractStoragePathFromUrl(m.url))
      .filter(Boolean) as string[];

    if (storagePathsToClean.length > 0) {
      deleteStorageObjects(storagePathsToClean).catch((cleanupErr) =>
        console.error('[Posts Service] Failed to clean up storage objects after failed post insert:', cleanupErr)
      );
    }

    throw err;
  }
}

/**
 * Lists community feed posts with pagination and optional type filter.
 * Only posts from ACTIVE users are returned in the public community feed.
 */
export async function getCommunityFeed(
  query: FeedQueryInput,
  currentUserId?: string
): Promise<FeedResponseData> {
  const { page, limit, type, authorId } = query;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    author: {
      status: DbUserStatus.ACTIVE,
    },
  };

  if (type) {
    where.type = type as unknown as DbPostType;
  }

  if (authorId) {
    where.authorId = authorId;
  }

  const [totalPosts, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        ...postIncludeAuthorAndMedia,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
      },
    }),
  ]);

  const totalPages = Math.ceil(totalPosts / limit) || 1;
  const hasMore = page < totalPages;

  return {
    posts: (posts as unknown as PostWithAuthorAndMedia[]).map((p) => mapToPostItem(p, currentUserId)),
    pagination: {
      page,
      limit,
      totalPosts,
      totalPages,
      hasMore,
    },
  };
}

/**
 * Retrieves a single post by ID including attached media and interaction counts.
 */
export async function getPostById(postId: string, currentUserId?: string): Promise<PostItem> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      ...postIncludeAuthorAndMedia,
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
      likes: currentUserId
        ? {
            where: { userId: currentUserId },
            select: { id: true },
          }
        : false,
    },
  });

  if (!post || post.author.status !== DbUserStatus.ACTIVE) {
    throw new PostNotFoundError();
  }

  return mapToPostItem(post as unknown as PostWithAuthorAndMedia, currentUserId);
}

/**
 * Edits one's own post content, type, or media attachments.
 * Removes orphaned storage objects from Supabase Storage if media is deleted.
 */
export async function updatePost(
  postId: string,
  userId: string,
  _userRole: UserRole,
  input: UpdatePostInput
): Promise<PostItem> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: true, author: { select: { status: true } } },
  });

  if (!post || post.author.status !== DbUserStatus.ACTIVE) {
    throw new PostNotFoundError();
  }

  // Only author can edit post
  if (post.authorId !== userId) {
    throw new ForbiddenPostActionError('You can only edit your own posts.');
  }

  if (input.media && input.media.length > 4) {
    throw new PostServiceError('A maximum of 4 images can be attached per post.', 400);
  }

  const updateData: { content?: string; type?: DbPostType } = {};
  if (input.content !== undefined) updateData.content = input.content;
  if (input.type !== undefined) updateData.type = input.type as unknown as DbPostType;

  // Track media to delete from storage if media was updated
  let removedStoragePaths: string[] = [];

  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.post.update({
        where: { id: postId },
        data: updateData,
      });
    }

    if (input.media !== undefined) {
      const currentUrls = new Set(input.media.map((m) => m.url));
      const removedMedia = post.media.filter((m) => !currentUrls.has(m.url));
      removedStoragePaths = removedMedia
        .map((m) => extractStoragePathFromUrl(m.url))
        .filter(Boolean) as string[];

      // Replace post media
      await tx.postMedia.deleteMany({ where: { postId } });

      if (input.media.length > 0) {
        await tx.postMedia.createMany({
          data: input.media.map((item, index) => ({
            postId,
            mediaType: DbMediaType.IMAGE,
            url: item.url,
            thumbnail: item.thumbnail || null,
            order: item.order ?? index,
          })),
        });
      }
    }

    return tx.post.findUnique({
      where: { id: postId },
      include: {
        ...postIncludeAuthorAndMedia,
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: {
          where: { userId },
          select: { id: true },
        },
      },
    });
  });

  if (!updated) {
    throw new PostServiceError('Failed to update post.', 500);
  }

  // Clean up removed storage objects asynchronously
  if (removedStoragePaths.length > 0) {
    deleteStorageObjects(removedStoragePaths).catch((err) =>
      console.warn('[Posts Service] Failed to delete removed media from storage:', err)
    );
  }

  return mapToPostItem(updated as unknown as PostWithAuthorAndMedia, userId);
}

/**
 * Deletes a post. Allowed for post author or administrative moderators.
 * Automatically cleans up PostMedia records, Supabase Storage objects, and records an AuditLog if moderated.
 */
export async function deletePost(
  postId: string,
  userId: string,
  userRole: UserRole,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: true },
  });

  if (!post) {
    throw new PostNotFoundError();
  }

  const isOwner = post.authorId === userId;
  const isModerator = [
    UserRole.SUPER_ADMIN,
    UserRole.COMMUNITY_ADMIN,
    UserRole.MODERATOR,
  ].includes(userRole);

  if (!isOwner && !isModerator) {
    throw new ForbiddenPostActionError('You do not have permission to delete this post.');
  }

  // Extract storage paths to delete
  const storagePaths = (post.media || [])
    .map((m) => extractStoragePathFromUrl(m.url))
    .filter(Boolean) as string[];

  await prisma.post.delete({
    where: { id: postId },
  });

  // Clean up Supabase storage files
  if (storagePaths.length > 0) {
    deleteStorageObjects(storagePaths).catch((err) =>
      console.warn('[Posts Service] Failed to delete post media from storage:', err)
    );
  }

  // If deleted by an administrative moderator on behalf of moderation, record in AuditLog
  if (!isOwner && isModerator) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'MODERATION_DELETE_POST',
        targetType: 'Post',
        targetId: postId,
        details: {
          postAuthorId: post.authorId,
          moderatorRole: userRole,
          mediaCount: post.media?.length || 0,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  }
}

// --------------------------------------------------------
// LIKES SERVICE LOGIC
// --------------------------------------------------------

/**
 * Likes a post. Atomic and idempotent via database unique constraint.
 * Repeated likes safely return the current state without duplicating.
 */
export async function likePost(postId: string, userId: string): Promise<PostLikesResponseData> {
  await verifyActivePost(postId);

  await prisma.postLike.upsert({
    where: {
      postId_userId: { postId, userId },
    },
    create: {
      postId,
      userId,
    },
    update: {}, // No-op if already liked
  });

  const likesCount = await prisma.postLike.count({ where: { postId } });

  return {
    postId,
    likesCount,
    isLikedByMe: true,
  };
}

/**
 * Unlikes a post. Idempotent deletion.
 */
export async function unlikePost(postId: string, userId: string): Promise<PostLikesResponseData> {
  await verifyActivePost(postId);

  await prisma.postLike.deleteMany({
    where: {
      postId,
      userId,
    },
  });

  const likesCount = await prisma.postLike.count({ where: { postId } });

  return {
    postId,
    likesCount,
    isLikedByMe: false,
  };
}

/**
 * Retrieves like count and current user's like status for a post.
 */
export async function getPostLikes(
  postId: string,
  currentUserId?: string
): Promise<PostLikesResponseData> {
  await verifyActivePost(postId);

  const [likesCount, userLike] = await Promise.all([
    prisma.postLike.count({ where: { postId } }),
    currentUserId
      ? prisma.postLike.findUnique({
          where: { postId_userId: { postId, userId: currentUserId } },
        })
      : null,
  ]);

  return {
    postId,
    likesCount,
    isLikedByMe: Boolean(userLike),
  };
}

// --------------------------------------------------------
// COMMENTS SERVICE LOGIC
// --------------------------------------------------------

/**
 * Lists paginated comments for a post in chronological order.
 */
export async function getPostComments(
  postId: string,
  page: number = 1,
  limit: number = 10
): Promise<CommentsResponseData> {
  await verifyActivePost(postId);

  const skip = (page - 1) * limit;

  const [totalComments, comments] = await Promise.all([
    prisma.comment.count({ where: { postId } }),
    prisma.comment.findMany({
      where: { postId },
      skip,
      take: limit,
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            role: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
                city: true,
                state: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(totalComments / limit) || 1;
  const hasMore = page < totalPages;

  return {
    comments: comments.map(mapToCommentItem),
    pagination: {
      page,
      limit,
      totalComments,
      totalPages,
      hasMore,
    },
  };
}

/**
 * Adds a comment to a community post.
 */
export async function createComment(
  postId: string,
  authorId: string,
  content: string
): Promise<CommentItem> {
  await verifyActivePost(postId);

  const trimmed = content.trim();
  if (!trimmed) {
    throw new PostServiceError('Comment content cannot be empty.', 400);
  }

  const comment = await prisma.comment.create({
    data: {
      postId,
      authorId,
      content: trimmed,
    },
    include: {
      author: {
        select: {
          id: true,
          role: true,
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
              city: true,
              state: true,
            },
          },
        },
      },
    },
  });

  return mapToCommentItem(comment);
}

/**
 * Updates one's own comment.
 */
export async function updateComment(
  postId: string,
  commentId: string,
  userId: string,
  content: string
): Promise<CommentItem> {
  await verifyActivePost(postId);

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment || comment.postId !== postId) {
    throw new PostServiceError('Comment not found.', 404);
  }

  if (comment.authorId !== userId) {
    throw new ForbiddenPostActionError('You can only edit your own comments.');
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new PostServiceError('Comment content cannot be empty.', 400);
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { content: trimmed },
    include: {
      author: {
        select: {
          id: true,
          role: true,
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
              city: true,
              state: true,
            },
          },
        },
      },
    },
  });

  return mapToCommentItem(updated);
}

/**
 * Deletes a comment. Only the comment author or administrative moderators are authorized.
 * When deleted by an administrator, records an AuditLog entry.
 */
export async function deleteComment(
  postId: string,
  commentId: string,
  userId: string,
  userRole: UserRole,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await verifyActivePost(postId);

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment || comment.postId !== postId) {
    throw new PostServiceError('Comment not found.', 404);
  }

  const isOwner = comment.authorId === userId;
  const isModerator = [
    UserRole.SUPER_ADMIN,
    UserRole.COMMUNITY_ADMIN,
    UserRole.MODERATOR,
  ].includes(userRole);

  if (!isOwner && !isModerator) {
    throw new ForbiddenPostActionError('You do not have permission to delete this comment.');
  }

  // Audit log for administrative moderation
  if (!isOwner && isModerator) {
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'MODERATION_DELETE_COMMENT',
        targetType: 'Comment',
        targetId: commentId,
        details: {
          postId,
          commentAuthorId: comment.authorId,
          moderatorRole: userRole,
          contentPreview: comment.content.slice(0, 100),
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  }

  await prisma.comment.delete({
    where: { id: commentId },
  });
}

import { prisma, PostType as DbPostType, UserStatus as DbUserStatus, MediaType as DbMediaType } from '@apnasamaj/database';
import {
  PostItem,
  FeedResponseData,
  UserRole,
  PostType,
  PostMediaItem,
  PostLikesResponseData,
  PostViewsResponseData,
  CommentItem,
  CommentsResponseData,
} from '@apnasamaj/shared-types';
import { CreatePostInput, UpdatePostInput, FeedQueryInput } from '@apnasamaj/validation';
import {
  deleteStorageObjects,
  extractStoragePathFromUrl,
} from '../../services/storage.service';
import { sendNotificationSafely } from '../notifications/notifications.service';

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
  group?: {
    id: string;
    name: string;
    slug: string;
  } | null;
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
    group: post.group
      ? {
          id: post.group.id,
          name: post.group.name,
          slug: post.group.slug,
        }
      : null,
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
    viewsCount: (post._count as any)?.views ?? 0,
    uniqueMembersCount: (post._count as any)?.views ?? 0,
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
    select: {
      id: true,
      postId: true,
      mediaType: true,
      url: true,
      thumbnail: true,
      order: true,
      createdAt: true,
    },
    orderBy: { order: 'asc' as const },
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
  group: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} as const;

/**
 * Ensures that a target post exists and that its author is in ACTIVE status.
 * If the post belongs to a PRIVATE group, caller must be an active group member.
 * Posts whose authors are suspended, or from private groups where caller is not a member,
 * return a generic 404 to avoid leaking post existence.
 */
export async function verifyActivePost(
  postId: string,
  currentUserId?: string
): Promise<{ id: string; authorId: string; groupId: string | null }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      groupId: true,
      author: {
        select: { status: true },
      },
      group: {
        select: {
          id: true,
          privacy: true,
        },
      },
    },
  });

  if (!post || post.author.status !== DbUserStatus.ACTIVE) {
    throw new PostNotFoundError('Post not found or is unavailable.');
  }

  // If post belongs to a PRIVATE group, verify that currentUserId is a member
  if (post.group && post.group.privacy === 'PRIVATE') {
    if (!currentUserId) {
      throw new PostNotFoundError('Post not found or is unavailable.');
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: post.group.id,
          userId: currentUserId,
        },
      },
    });

    if (!membership) {
      throw new PostNotFoundError('Post not found or is unavailable.');
    }
  }

  return { id: post.id, authorId: post.authorId, groupId: post.groupId };
}

const ANNOUNCEMENT_ALLOWED_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.COMMUNITY_ADMIN,
  UserRole.MODERATOR,
];

export function canPublishAnnouncement(role?: UserRole): boolean {
  if (!role) return false;
  return ANNOUNCEMENT_ALLOWED_ROLES.includes(role);
}

export const PIN_ALLOWED_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.COMMUNITY_ADMIN,
  UserRole.MODERATOR,
];

export function canPinPost(role?: UserRole): boolean {
  if (!role) return false;
  return PIN_ALLOWED_ROLES.includes(role);
}

/**
 * Creates a new post in the community, with optional media attachments.
 * If database persistence fails, cleans up any newly uploaded Supabase Storage objects.
 */
export async function createPost(
  authorId: string,
  authorRoleOrInput: UserRole | CreatePostInput,
  maybeInput?: CreatePostInput
): Promise<PostItem> {
  const authorRole: UserRole =
    typeof authorRoleOrInput === 'string' ? authorRoleOrInput : UserRole.MEMBER;
  const input: CreatePostInput =
    typeof authorRoleOrInput === 'string' ? maybeInput! : authorRoleOrInput;

  // Only SUPER_ADMIN, COMMUNITY_ADMIN, and MODERATOR can publish ANNOUNCEMENT posts
  if (input.type === PostType.ANNOUNCEMENT && !canPublishAnnouncement(authorRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can publish announcements.'
    );
  }

  const mediaInputs = input.media || [];

  if (mediaInputs.length > 4) {
    throw new PostServiceError('A maximum of 4 images can be attached per post.', 400);
  }

  // Validate group if groupId is provided
  let targetGroupId: string | null = null;
  if (input.groupId) {
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: {
        id: true,
        privacy: true,
        members: {
          where: { userId: authorId },
          select: { id: true, role: true },
        },
      },
    });

    if (!group) {
      throw new PostServiceError('Target group not found.', 404);
    }

    const isMember = group.members.length > 0;
    if (!isMember) {
      if (group.privacy === 'PRIVATE') {
        throw new ForbiddenPostActionError('You must be a member of this private group to publish posts.');
      }
      throw new ForbiddenPostActionError('You must be a member of this group to publish posts.');
    }

    targetGroupId = group.id;
  }

  try {
    const post = await prisma.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          authorId,
          groupId: targetGroupId,
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
    // Exclude posts from PRIVATE groups unless caller is an active member
    OR: [
      { groupId: null },
      { group: { privacy: 'PUBLIC' } },
      ...(currentUserId
        ? [{ group: { privacy: 'PRIVATE', members: { some: { userId: currentUserId } } } }]
        : []),
    ],
  };

  if (type) {
    where.type = type as unknown as DbPostType;
  }

  if (authorId) {
    where.authorId = authorId;
  }

  const postInclude = {
    ...postIncludeAuthorAndMedia,
    _count: {
      select: {
        likes: true,
        comments: true,
        views: true,
      },
    },
    likes: currentUserId
      ? {
          where: { userId: currentUserId },
          select: { id: true },
        }
      : false,
  };

  let totalPosts: number;
  let posts: any[];

  if (page === 1) {
    // For page 1, fetch posts first using PostgreSQL relation join strategy
    posts = await (prisma.post.findMany as any)({
      relationLoadStrategy: 'join',
      where,
      skip: 0,
      take: limit,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: postInclude,
    });

    // If fewer posts than limit are returned, the entire matching set fits on page 1.
    // totalPosts is mathematically guaranteed to equal posts.length, safely skipping count().
    if (posts.length < limit) {
      totalPosts = posts.length;
    } else {
      totalPosts = await prisma.post.count({ where });
    }
  } else {
    // For subsequent pages, run count and findMany concurrently to preserve exact pagination
    [totalPosts, posts] = await Promise.all([
      prisma.post.count({ where }),
      (prisma.post.findMany as any)({
        relationLoadStrategy: 'join',
        where,
        skip,
        take: limit,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        include: postInclude,
      }),
    ]);
  }

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
  await verifyActivePost(postId, currentUserId);

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      ...postIncludeAuthorAndMedia,
      _count: {
        select: {
          likes: true,
          comments: true,
          views: true,
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
  userRole: UserRole,
  input: UpdatePostInput
): Promise<PostItem> {
  const activePost = await verifyActivePost(postId, userId);

  // Only author can edit post
  if (activePost.authorId !== userId) {
    throw new ForbiddenPostActionError('You can only edit your own posts.');
  }

  // Only SUPER_ADMIN, COMMUNITY_ADMIN, and MODERATOR can set type to ANNOUNCEMENT
  if (input.type === PostType.ANNOUNCEMENT && !canPublishAnnouncement(userRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can set post type to announcement.'
    );
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: true },
  });

  if (!post) {
    throw new PostNotFoundError();
  }

  // Prevent moving content across group boundaries or detaching from a group
  if ((input as any).groupId !== undefined && (input as any).groupId !== post.groupId) {
    throw new PostServiceError('Moving posts across group boundaries is not permitted.', 400);
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
            views: true,
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
  const isModerator = [
    UserRole.SUPER_ADMIN,
    UserRole.COMMUNITY_ADMIN,
    UserRole.MODERATOR,
  ].includes(userRole);

  if (!isModerator) {
    await verifyActivePost(postId, userId);
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { media: true },
  });

  if (!post) {
    throw new PostNotFoundError();
  }

  const isOwner = post.authorId === userId;

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

    // Notify author of moderation action
    sendNotificationSafely({
      recipientId: post.authorId,
      actorId: userId,
      type: 'POST_MODERATED',
      title: 'Post Removed by Moderation',
      message: 'Your post was removed by a community moderator for violating community guidelines.',
      entityType: 'Post',
      entityId: postId,
    }).catch((err) =>
      console.warn('[Posts Service] Failed to send moderation notification:', err)
    );
  }
}

/**
 * Pins a post to the top of feeds.
 * Only SUPER_ADMIN, COMMUNITY_ADMIN, and MODERATOR may pin posts.
 * Idempotent: pinning an already pinned post is safe and does not corrupt state.
 */
export async function pinPost(
  postId: string,
  userId: string,
  userRole: UserRole
): Promise<PostItem> {
  if (!canPinPost(userRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can pin posts.'
    );
  }

  await verifyActivePost(postId, userId);

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { isPinned: true },
    include: {
      ...postIncludeAuthorAndMedia,
      _count: {
        select: {
          likes: true,
          comments: true,
          views: true,
        },
      },
      likes: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return mapToPostItem(updated as unknown as PostWithAuthorAndMedia, userId);
}

/**
 * Unpins a post.
 * Only SUPER_ADMIN, COMMUNITY_ADMIN, and MODERATOR may unpin posts.
 * Idempotent: unpinning an already unpinned post is safe and does not corrupt state.
 */
export async function unpinPost(
  postId: string,
  userId: string,
  userRole: UserRole
): Promise<PostItem> {
  if (!canPinPost(userRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can unpin posts.'
    );
  }

  await verifyActivePost(postId, userId);

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { isPinned: false },
    include: {
      ...postIncludeAuthorAndMedia,
      _count: {
        select: {
          likes: true,
          comments: true,
          views: true,
        },
      },
      likes: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  return mapToPostItem(updated as unknown as PostWithAuthorAndMedia, userId);
}

// --------------------------------------------------------
// LIKES SERVICE LOGIC
// --------------------------------------------------------

/**
 * Likes a post. Atomic and idempotent via database unique constraint.
 * Repeated likes safely return the current state without duplicating.
 */
export async function likePost(postId: string, userId: string): Promise<PostLikesResponseData> {
  const post = await verifyActivePost(postId, userId);

  // Check if like already existed before upserting (to avoid duplicate notifications for repeated likes)
  const existingLike = await prisma.postLike.findUnique({
    where: {
      postId_userId: { postId, userId },
    },
  });

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

  // If this was a new like and not a self-like, notify the post author
  if (!existingLike && post.authorId !== userId) {
    prisma.profile
      .findUnique({
        where: { userId },
        select: { fullName: true },
      })
      .then((actorProfile) => {
        const actorName = actorProfile?.fullName || 'Someone';
        sendNotificationSafely({
          recipientId: post.authorId,
          actorId: userId,
          type: 'POST_LIKE',
          title: 'New Like',
          message: `${actorName} liked your post.`,
          entityType: 'Post',
          entityId: postId,
        });
      })
      .catch((err) =>
        console.warn('[Posts Service] Failed to send like notification:', err)
      );
  }

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
  await verifyActivePost(postId, userId);

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
  await verifyActivePost(postId, currentUserId);

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
// VIEWS SERVICE LOGIC
// --------------------------------------------------------

/**
 * Records a post view for the authenticated member.
 * Atomic and idempotent via database unique constraint @@unique([postId, userId]).
 * Repeated view attempts by the same member return the current counts without duplicate records.
 * Never stores or returns viewer identities/names.
 */
export async function recordPostView(
  postId: string,
  userId: string
): Promise<PostViewsResponseData> {
  await verifyActivePost(postId, userId);

  try {
    await prisma.postView.upsert({
      where: {
        postId_userId: { postId, userId },
      },
      create: {
        postId,
        userId,
      },
      update: {}, // No-op if already viewed
    });

    const count = await prisma.postView.count({
      where: { postId },
    });

    return {
      postId,
      totalViews: count,
      uniqueMembers: count,
      hasViewed: true,
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2021') {
      return {
        postId,
        totalViews: 0,
        uniqueMembers: 0,
        hasViewed: true,
      };
    }
    throw err;
  }
}

/**
 * Retrieves aggregate view analytics for a post.
 * Returns only totalViews and uniqueMembers; never viewer identities.
 */
export async function getPostViews(
  postId: string,
  userId: string
): Promise<PostViewsResponseData> {
  await verifyActivePost(postId, userId);

  try {
    const [count, userView] = await Promise.all([
      prisma.postView.count({ where: { postId } }),
      prisma.postView.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { id: true },
      }),
    ]);

    return {
      postId,
      totalViews: count,
      uniqueMembers: count,
      hasViewed: Boolean(userView),
    };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'P2021') {
      return {
        postId,
        totalViews: 0,
        uniqueMembers: 0,
        hasViewed: false,
      };
    }
    throw err;
  }
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
  limit: number = 10,
  currentUserId?: string
): Promise<CommentsResponseData> {
  await verifyActivePost(postId, currentUserId);

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
  const post = await verifyActivePost(postId, authorId);

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

  // Notify post author if not a self-comment
  if (post.authorId !== authorId) {
    const actorName = comment.author.profile?.fullName || 'Someone';
    const preview = trimmed.length > 50 ? `${trimmed.substring(0, 47)}...` : trimmed;
    sendNotificationSafely({
      recipientId: post.authorId,
      actorId: authorId,
      type: 'POST_COMMENT',
      title: 'New Comment',
      message: `${actorName} commented: "${preview}"`,
      entityType: 'Post',
      entityId: postId,
    }).catch((err) =>
      console.warn('[Posts Service] Failed to send comment notification:', err)
    );
  }

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
  await verifyActivePost(postId, userId);

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
  const isModerator = [
    UserRole.SUPER_ADMIN,
    UserRole.COMMUNITY_ADMIN,
    UserRole.MODERATOR,
  ].includes(userRole);

  if (!isModerator) {
    await verifyActivePost(postId, userId);
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
  });

  if (!comment || comment.postId !== postId) {
    throw new PostServiceError('Comment not found.', 404);
  }

  const isOwner = comment.authorId === userId;

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

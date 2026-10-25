import { PrismaClient, Prisma, UserStatus as DbUserStatus } from '@apnasamaj/database';
import {
  GroupPrivacy,
  GroupMemberRole,
  GroupListItem,
  GroupDetails,
  GroupMemberItem,
  ListGroupsResponseData,
  CreateGroupInput,
  UpdateGroupInput,
  GroupMemberActionResult,
  PostItem,
  PostMediaItem,
  UserRole,
  PostType,
} from '@apnasamaj/shared-types';
import { ListGroupsQuery } from '@apnasamaj/validation';
import { uploadPostMedia, deleteStorageObjects, extractStoragePathFromUrl } from '../../services/storage.service';
import { sendNotificationSafely } from '../notifications/notifications.service';

export class GroupServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'GroupServiceError';
    this.statusCode = statusCode;
  }
}

export class GroupNotFoundError extends GroupServiceError {
  constructor(message: string = 'Group not found.') {
    super(message, 404);
  }
}

export class ForbiddenGroupActionError extends GroupServiceError {
  constructor(message: string = 'Forbidden: Access to this group or action is restricted.') {
    super(message, 403);
  }
}

function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new GroupServiceError('Tenant database connection is required for group operations.', 400);
  }
  return db;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'samaj-mandal'
  );
}

/**
 * Lists community groups with pagination, search, and privacy filtering.
 */
export async function listGroups(
  query: ListGroupsQuery,
  currentUserId: string,
  db?: PrismaClient
): Promise<ListGroupsResponseData> {
  const client = assertDb(db);
  const { page = 1, limit = 12, search, privacy } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.GroupWhereInput = {};

  if (privacy) {
    where.privacy = privacy as GroupPrivacy;
  }

  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  const groupSelect = {
    id: true,
    name: true,
    slug: true,
    description: true,
    coverUrl: true,
    privacy: true,
    createdAt: true,
    _count: {
      select: {
        members: true,
        posts: true,
      },
    },
    members: {
      where: { userId: currentUserId },
      select: { role: true },
    },
  } as const;

  type RawGroup = Prisma.GroupGetPayload<{ select: typeof groupSelect }>;
  let totalGroups: number;
  let rawGroups: RawGroup[];

  if (page === 1) {
    rawGroups = await client.group.findMany({
      where,
      skip: 0,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: groupSelect,
    });

    if (rawGroups.length < limit) {
      totalGroups = rawGroups.length;
    } else {
      totalGroups = await client.group.count({ where });
    }
  } else {
    const [count, items] = await Promise.all([
      client.group.count({ where }),
      client.group.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: groupSelect,
      }),
    ]);
    totalGroups = count;
    rawGroups = items;
  }

  const groups: GroupListItem[] = rawGroups.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    description: g.description,
    coverUrl: g.coverUrl,
    privacy: g.privacy as unknown as GroupPrivacy,
    membersCount: g._count.members,
    postsCount: g._count.posts,
    isMember: g.members.length > 0,
    myRole: (g.members[0]?.role as unknown as GroupMemberRole) || null,
    createdAt: g.createdAt.toISOString(),
  }));

  return {
    groups,
    pagination: {
      page,
      limit,
      totalGroups,
      totalPages: Math.ceil(totalGroups / limit) || 1,
    },
  };
}

/**
 * Retrieves full details for a group by slug.
 * Private groups hide members list from unauthorized non-members.
 */
export async function getGroupBySlug(
  slug: string,
  currentUserId: string,
  db?: PrismaClient
): Promise<GroupDetails> {
  const client = assertDb(db);
  const group = await client.group.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      coverUrl: true,
      privacy: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          members: true,
          posts: true,
        },
      },
      creator: {
        select: {
          id: true,
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      },
      members: {
        select: {
          id: true,
          groupId: true,
          userId: true,
          role: true,
          joinedAt: true,
          user: {
            select: {
              id: true,
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
        orderBy: { joinedAt: 'asc' },
        take: 100,
      },
    },
  });

  if (!group) {
    throw new GroupNotFoundError();
  }

  const myMembership = group.members.find((m) => m.userId === currentUserId);
  const isMember = Boolean(myMembership);
  const myRole = (myMembership?.role as unknown as GroupMemberRole) || null;

  // Private group access restriction:
  // If private and user is not a member, hide internal member roster
  const canViewMembers = group.privacy === 'PUBLIC' || isMember;

  const mappedMembers: GroupMemberItem[] = canViewMembers
    ? group.members.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        userId: m.userId,
        role: m.role as unknown as GroupMemberRole,
        joinedAt: m.joinedAt.toISOString(),
        user: {
          id: m.user.id,
          fullName: m.user.profile?.fullName || 'Community Member',
          avatarUrl: m.user.profile?.avatarUrl || null,
          city: m.user.profile?.city || null,
          state: m.user.profile?.state || null,
        },
      }))
    : [];

  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    coverUrl: group.coverUrl,
    privacy: group.privacy as unknown as GroupPrivacy,
    createdById: group.createdById,
    creator: {
      id: group.creator.id,
      fullName: group.creator.profile?.fullName || 'Community Member',
      avatarUrl: group.creator.profile?.avatarUrl || null,
    },
    membersCount: group._count.members,
    postsCount: group._count.posts,
    isMember,
    myRole,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    members: mappedMembers,
  };
}

/**
 * Creates a new community group with unique slug and registers creator as ADMIN.
 */
export async function createGroup(
  userId: string,
  input: CreateGroupInput,
  db?: PrismaClient
): Promise<GroupDetails> {
  const client = assertDb(db);
  const baseSlug = slugify(input.name);
  let slug = baseSlug;
  let counter = 1;

  while (await client.group.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const group = await client.$transaction(async (tx) => {
    const created = await tx.group.create({
      data: {
        name: input.name,
        slug,
        description: input.description || null,
        coverUrl: input.coverUrl || null,
        privacy: (input.privacy as GroupPrivacy) || 'PUBLIC',
        createdById: userId,
      },
    });

    // Creator is automatically registered as group ADMIN
    await tx.groupMember.create({
      data: {
        groupId: created.id,
        userId,
        role: 'ADMIN',
      },
    });

    return created;
  });

  return getGroupBySlug(group.slug, userId, client);
}

/**
 * Joins a public group.
 * Private groups reject direct self-joining without invite/approval.
 */
export async function joinGroup(
  groupId: string,
  userId: string,
  db?: PrismaClient
): Promise<{ success: boolean; message: string; role: GroupMemberRole }> {
  const client = assertDb(db);
  const group = await client.group.findUnique({
    where: { id: groupId },
    select: { id: true, privacy: true },
  });

  if (!group) {
    throw new GroupNotFoundError();
  }

  if (group.privacy === 'PRIVATE') {
    throw new ForbiddenGroupActionError(
      'Cannot self-join private group. Membership requires an invitation or approval.'
    );
  }

  const existingMembership = await client.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId,
      },
    },
  });

  if (existingMembership) {
    throw new GroupServiceError('You are already a member of this group.', 400);
  }

  const newMember = await client.groupMember.create({
    data: {
      groupId,
      userId,
      role: 'MEMBER',
    },
  });

  return {
    success: true,
    message: 'Successfully joined group.',
    role: newMember.role as unknown as GroupMemberRole,
  };
}

/**
 * Leaves a group.
 * Sole administrators cannot leave without transferring ownership.
 * Uses atomic transaction and row-level locking on the group to prevent
 * concurrent leave requests from leaving a group without an administrator.
 */
export async function leaveGroup(
  groupId: string,
  userId: string,
  db?: PrismaClient
): Promise<{ success: boolean; message: string }> {
  const client = assertDb(db);
  return client.$transaction(async (tx) => {
    // Acquire a row-level lock on the Group row to serialize membership changes and prevent race conditions
    const groups = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE
    `;

    if (!groups || groups.length === 0) {
      throw new GroupNotFoundError();
    }

    const membership = await tx.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new GroupServiceError('You are not a member of this group.', 400);
    }

    if (membership.role === 'ADMIN') {
      const adminCount = await tx.groupMember.count({
        where: {
          groupId,
          role: 'ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new GroupServiceError(
          'As the sole administrator, you cannot leave the group without assigning another admin first.',
          400
        );
      }
    }

    await tx.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    return {
      success: true,
      message: 'Successfully left group.',
    };
  });
}

/**
 * Retrieves discussions for a group.
 * Private groups strictly enforce membership authorization.
 */
export async function getGroupPosts(
  slug: string,
  currentUserId: string,
  page: number = 1,
  limit: number = 10,
  db?: PrismaClient
): Promise<{
  posts: PostItem[];
  pagination: { page: number; limit: number; totalPosts: number; totalPages: number; hasMore: boolean };
}> {
  const client = assertDb(db);
  const group = await client.group.findUnique({
    where: { slug },
    select: {
      id: true,
      privacy: true,
      members: {
        where: { userId: currentUserId },
        select: { id: true },
      },
    },
  });

  if (!group) {
    throw new GroupNotFoundError();
  }

  const isMember = group.members.length > 0;

  if (group.privacy === 'PRIVATE' && !isMember) {
    throw new ForbiddenGroupActionError(
      'You must be a member of this private group to view its discussions.'
    );
  }

  const skip = (page - 1) * limit;
  const where: Prisma.PostWhereInput = {
    groupId: group.id,
    author: {
      status: DbUserStatus.ACTIVE,
    },
  };

  const [totalPosts, posts] = await Promise.all([
    client.post.count({ where }),
    client.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        authorId: true,
        groupId: true,
        type: true,
        content: true,
        isPinned: true,
        createdAt: true,
        updatedAt: true,
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
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        likes: {
          where: { userId: currentUserId },
          select: { id: true },
        },
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

  const mappedPosts: PostItem[] = posts.map((p) => ({
    id: p.id,
    authorId: p.authorId,
    groupId: p.groupId,
    type: p.type as unknown as PostType,
    content: p.content,
    isPinned: p.isPinned,
    media: p.media.map((m): PostMediaItem => ({
      id: m.id,
      postId: m.postId,
      mediaType: m.mediaType as unknown as 'IMAGE' | 'VIDEO' | 'DOCUMENT',
      url: m.url,
      thumbnail: m.thumbnail,
      order: m.order,
      createdAt: m.createdAt.toISOString(),
    })),
    likesCount: p._count.likes,
    commentsCount: p._count.comments,
    isLikedByMe: p.likes.length > 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    author: {
      id: p.author.id,
      fullName: p.author.profile?.fullName || 'Community Member',
      avatarUrl: p.author.profile?.avatarUrl || null,
      role: p.author.role as unknown as UserRole,
      city: p.author.profile?.city || null,
      state: p.author.profile?.state || null,
    },
  }));

  const totalPages = Math.ceil(totalPosts / limit) || 1;

  return {
    posts: mappedPosts,
    pagination: {
      page,
      limit,
      totalPosts,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

/**
 * Updates community group settings.
 * Only group administrators or platform SUPER_ADMIN can update group details.
 * Preserves group slug to maintain bookmark and permalink stability.
 */
export async function updateGroup(
  groupId: string,
  userId: string,
  userRole: UserRole,
  input: UpdateGroupInput,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<GroupDetails> {
  const client = assertDb(db);
  const group = await client.group.findUnique({
    where: { id: groupId },
    select: { id: true, slug: true, privacy: true },
  });

  if (!group) {
    throw new GroupNotFoundError();
  }

  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;

  if (!isSuperAdmin) {
    const membership = await client.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenGroupActionError('Only group administrators can edit group settings.');
    }
  }

  const updateData: {
    name?: string;
    description?: string | null;
    privacy?: GroupPrivacy;
    coverUrl?: string | null;
  } = {};

  if (input.name !== undefined && input.name.trim().length >= 3) {
    updateData.name = input.name.trim();
  }
  if (input.description !== undefined) {
    updateData.description = input.description ? input.description.trim() : null;
  }
  if (input.privacy !== undefined) {
    updateData.privacy = input.privacy as GroupPrivacy;
  }
  if (input.coverUrl !== undefined) {
    updateData.coverUrl = input.coverUrl ? input.coverUrl.trim() : null;
  }

  await client.$transaction(async (tx) => {
    await tx.group.update({
      where: { id: groupId },
      data: updateData,
    });

    // Record audit log entry
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: 'GROUP_SETTINGS_UPDATE',
        targetType: 'Group',
        targetId: groupId,
        details: {
          updatedFields: Object.keys(updateData),
          name: updateData.name,
          privacy: updateData.privacy,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  });

  return getGroupBySlug(group.slug, userId, client);
}

/**
 * Manages group member roles (ADMIN, MODERATOR, MEMBER).
 * Uses atomic row-level locking on the Group record to prevent demoting the sole group administrator.
 */
export async function updateGroupMemberRole(
  groupId: string,
  targetUserId: string,
  newRole: GroupMemberRole,
  actorId: string,
  actorRole: UserRole,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<GroupMemberActionResult> {
  const client = assertDb(db);
  const result = await client.$transaction(async (tx) => {
    // Acquire a row-level lock on the Group row to serialize membership changes
    const groups = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE
    `;

    if (!groups || groups.length === 0) {
      throw new GroupNotFoundError();
    }

    const isSuperAdmin = actorRole === UserRole.SUPER_ADMIN;

    if (!isSuperAdmin) {
      const actorMembership = await tx.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: actorId,
          },
        },
        select: { role: true },
      });

      if (!actorMembership || actorMembership.role !== 'ADMIN') {
        throw new ForbiddenGroupActionError('Only group administrators can manage member roles.');
      }
    }

    const targetMembership = await tx.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
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

    if (!targetMembership) {
      throw new GroupServiceError('Target user is not a member of this group.', 404);
    }

    // Protect against demoting the sole administrator
    if (targetMembership.role === 'ADMIN' && newRole !== 'ADMIN') {
      const adminCount = await tx.groupMember.count({
        where: {
          groupId,
          role: 'ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new GroupServiceError(
          'Cannot demote the sole administrator of the group. Assign another administrator first.',
          400
        );
      }
    }

    const updated = await tx.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId,
        },
      },
      data: {
        role: newRole,
      },
      include: {
        user: {
          select: {
            id: true,
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

    // Record immutable audit log
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'GROUP_ROLE_UPDATE',
        targetType: 'GroupMember',
        targetId: updated.id,
        details: {
          groupId,
          targetUserId,
          previousRole: targetMembership.role,
          newRole,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    return {
      success: true,
      message: 'Member role updated successfully.',
      member: {
        id: updated.id,
        groupId: updated.groupId,
        userId: updated.userId,
        role: updated.role as unknown as GroupMemberRole,
        joinedAt: updated.joinedAt.toISOString(),
        user: {
          id: updated.user.id,
          fullName: updated.user.profile?.fullName || 'Community Member',
          avatarUrl: updated.user.profile?.avatarUrl || null,
          city: updated.user.profile?.city || null,
          state: updated.user.profile?.state || null,
        },
      },
    };
  });

  // Safe notification side-effect after successful transaction
  if (actorId !== targetUserId) {
    sendNotificationSafely(
      {
        recipientId: targetUserId,
        actorId,
        type: 'GROUP_ROLE_UPDATE',
        title: 'Group Role Updated',
        message: `Your role in the group was updated to ${newRole}.`,
        entityType: 'Group',
        entityId: groupId,
      },
      client
    ).catch((err) =>
      console.warn('[Groups Service] Failed to send role update notification:', err)
    );
  }

  return result;
}

/**
 * Removes a member from the group.
 * Follows strict role hierarchy and prevents removing the sole administrator.
 * Self-removal is disallowed here (users must use leaveGroup).
 */
export async function removeGroupMember(
  groupId: string,
  targetUserId: string,
  actorId: string,
  actorRole: UserRole,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<{ success: boolean; message: string }> {
  const client = assertDb(db);
  if (targetUserId === actorId) {
    throw new GroupServiceError('To leave the group, please use the leave group option.', 400);
  }

  const result = await client.$transaction(async (tx) => {
    // Acquire a row-level lock on the Group row
    const groups = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE
    `;

    if (!groups || groups.length === 0) {
      throw new GroupNotFoundError();
    }

    const isSuperAdmin = actorRole === UserRole.SUPER_ADMIN;
    let actorGroupRole: GroupMemberRole | null = null;

    if (!isSuperAdmin) {
      const actorMembership = await tx.groupMember.findUnique({
        where: {
          groupId_userId: {
            groupId,
            userId: actorId,
          },
        },
        select: { role: true },
      });

      if (!actorMembership || (actorMembership.role !== 'ADMIN' && actorMembership.role !== 'MODERATOR')) {
        throw new ForbiddenGroupActionError('Only group administrators and moderators can remove members.');
      }

      actorGroupRole = actorMembership.role as unknown as GroupMemberRole;
    }

    const targetMembership = await tx.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      throw new GroupServiceError('Target user is not a member of this group.', 404);
    }

    // Role hierarchy checks
    if (!isSuperAdmin) {
      if (actorGroupRole === GroupMemberRole.MODERATOR) {
        if (targetMembership.role === 'ADMIN' || targetMembership.role === 'MODERATOR') {
          throw new ForbiddenGroupActionError('Group moderators cannot remove administrators or fellow moderators.');
        }
      }
    }

    // Last-admin protection
    if (targetMembership.role === 'ADMIN') {
      const adminCount = await tx.groupMember.count({
        where: {
          groupId,
          role: 'ADMIN',
        },
      });

      if (adminCount <= 1) {
        throw new GroupServiceError('Cannot remove the sole administrator of the group. Assign another administrator first.', 400);
      }
    }

    await tx.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId,
        },
      },
    });

    // Record immutable audit log
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'GROUP_MEMBER_REMOVE',
        targetType: 'GroupMember',
        targetId: targetMembership.id,
        details: {
          groupId,
          removedUserId: targetUserId,
          removedRole: targetMembership.role,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    return {
      success: true,
      message: 'Member removed from group successfully.',
    };
  });

  // Safe notification side-effect after successful transaction
  if (actorId !== targetUserId) {
    sendNotificationSafely(
      {
        recipientId: targetUserId,
        actorId,
        type: 'GROUP_MEMBER_REMOVED',
        title: 'Removed from Group',
        message: 'You have been removed from the group.',
        entityType: 'Group',
        entityId: groupId,
      },
      client
    ).catch((err) =>
      console.warn('[Groups Service] Failed to send member removal notification:', err)
    );
  }

  return result;
}

/**
 * Uploads and sets a group cover image using existing safe upload storage service.
 */
export async function uploadGroupCover(
  groupId: string,
  userId: string,
  userRole: UserRole,
  fileBuffer: Buffer,
  mimetype: string,
  originalName: string,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<{ success: boolean; coverUrl: string }> {
  const client = assertDb(db);
  const group = await client.group.findUnique({
    where: { id: groupId },
    select: { id: true, slug: true, coverUrl: true },
  });

  if (!group) {
    throw new GroupNotFoundError();
  }

  const isSuperAdmin = userRole === UserRole.SUPER_ADMIN;

  if (!isSuperAdmin) {
    const membership = await client.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      select: { role: true },
    });

    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenGroupActionError('Only group administrators can update the cover image.');
    }
  }

  // Preserve previous cover URL to safely clean up after successful commit
  const previousCoverUrl = group.coverUrl;

  // 1. Upload new cover image using storage service
  const uploadResult = await uploadPostMedia(userId, fileBuffer, mimetype, originalName);

  // 2. Persist group coverUrl and GROUP_SETTINGS_UPDATE audit log atomically
  try {
    await client.$transaction(async (tx) => {
      await tx.group.update({
        where: { id: groupId },
        data: { coverUrl: uploadResult.url },
      });

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'GROUP_SETTINGS_UPDATE',
          targetType: 'Group',
          targetId: groupId,
          details: {
            updatedFields: ['coverUrl'],
            coverUrl: uploadResult.url,
          },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    });
  } catch (dbError: unknown) {
    // 3. Database transaction failed after upload: attempt cleanup of orphaned storage object
    try {
      await deleteStorageObjects([uploadResult.storagePath]);
    } catch (cleanupError: unknown) {
      console.error(
        '[Groups Service] Failed to cleanup orphaned cover storage object after DB error:',
        cleanupError instanceof Error ? cleanupError.message : cleanupError
      );
    }
    // Re-throw original database error to preserve accurate error reporting to the caller
    throw dbError;
  }

  // 4. On successful commit, clean up previous cover image if it was an application-managed storage path
  if (previousCoverUrl && previousCoverUrl !== uploadResult.url) {
    const oldStoragePath = extractStoragePathFromUrl(previousCoverUrl);
    if (oldStoragePath) {
      deleteStorageObjects([oldStoragePath]).catch((err: unknown) => {
        console.warn(
          '[Groups Service] Failed to clean up previous group cover image:',
          err instanceof Error ? err.message : err
        );
      });
    }
  }

  return {
    success: true,
    coverUrl: uploadResult.url,
  };
}


import { prisma, Role as DbRole, UserStatus as DbUserStatus, Prisma, PrismaClient } from '@apnasamaj/database';
import {
  AdminUserDetails,
  AdminUserListItem,
  ListUsersResponseData,
  SafeUserProfile,
  UserRole,
  UserStatus,
  AuthUser,
} from '@apnasamaj/shared-types';
import { ListUsersQuery } from '@apnasamaj/validation';
import { sendNotificationSafely } from '../../notifications/notifications.service';

export class AdminServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AdminServiceError';
    this.statusCode = statusCode;
  }
}

export class UserNotFoundError extends AdminServiceError {
  constructor(message: string = 'User not found.') {
    super(message, 404);
  }
}

export class PrivilegeError extends AdminServiceError {
  constructor(message: string = 'Forbidden: Insufficient privileges for this operation.') {
    super(message, 403);
  }
}

const safeUserSelect = {
  id: true,
  phone: true,
  role: true,
  status: true,
  isPhoneVerified: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      id: true,
      fullName: true,
      gender: true,
      dateOfBirth: true,
      bio: true,
      avatarUrl: true,
      city: true,
      state: true,
      subCaste: true,
      gotra: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

/**
 * Lists users with pagination, text search on phone or full name, and role/status filtering.
 */
export async function listAdminUsers(query: ListUsersQuery, db?: PrismaClient): Promise<ListUsersResponseData> {
  if (!db) {
    throw new AdminServiceError('Tenant database client is required for user administration.', 400);
  }
  const client = db;
  const { page = 1, limit = 10, search, role, status } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};

  if (role) {
    where.role = role as DbRole;
  }

  if (status) {
    where.status = status as DbUserStatus;
  }

  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      { phone: { contains: term } },
      {
        profile: {
          fullName: { contains: term, mode: 'insensitive' },
        },
      },
    ];
  }

  type RawUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;
  let totalUsers: number;
  let rawUsers: RawUser[];

  if (page === 1) {
    // For page 1, fetch up to limit records.
    rawUsers = await client.user.findMany({
      where,
      skip: 0,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: safeUserSelect,
    });

    // If fewer than limit records are returned, the entire matching set fits on page 1,
    // so totalUsers is mathematically guaranteed to equal rawUsers.length.
    if (rawUsers.length < limit) {
      totalUsers = rawUsers.length;
    } else {
      totalUsers = await client.user.count({ where });
    }
  } else {
    // For subsequent pages, run count and findMany concurrently without transaction overhead
    [totalUsers, rawUsers] = await Promise.all([
      client.user.count({ where }),
      client.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: safeUserSelect,
      }),
    ]);
  }

  const totalPages = Math.ceil(totalUsers / limit) || 1;

  const users: AdminUserListItem[] = rawUsers.map((u) => ({
    id: u.id,
    phone: u.phone,
    role: u.role as unknown as UserRole,
    status: u.status as unknown as UserStatus,
    isPhoneVerified: u.isPhoneVerified,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    profile: u.profile
      ? {
          id: u.profile.id,
          fullName: u.profile.fullName,
          gender: u.profile.gender,
          dateOfBirth: u.profile.dateOfBirth?.toISOString() || null,
          bio: u.profile.bio,
          avatarUrl: u.profile.avatarUrl,
          city: u.profile.city,
          state: u.profile.state,
          subCaste: u.profile.subCaste,
          gotra: u.profile.gotra,
          createdAt: u.profile.createdAt.toISOString(),
          updatedAt: u.profile.updatedAt.toISOString(),
        }
      : null,
  }));

  return {
    users,
    pagination: {
      page,
      limit,
      totalUsers,
      totalPages,
    },
  };
}

/**
 * Retrieves comprehensive sanitized user details including social engagement counters.
 */
export async function getAdminUserDetails(userId: string, db?: PrismaClient): Promise<AdminUserDetails> {
  if (!db) {
    throw new AdminServiceError('Tenant database client is required for user administration.', 400);
  }
  const client = db;
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      ...safeUserSelect,
      _count: {
        select: {
          posts: true,
          groupMemberships: true,
          comments: true,
        },
      },
    },
  });

  if (!user) {
    throw new UserNotFoundError();
  }

  return {
    id: user.id,
    phone: user.phone,
    role: user.role as unknown as UserRole,
    status: user.status as unknown as UserStatus,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    profile: user.profile
      ? {
          id: user.profile.id,
          fullName: user.profile.fullName,
          gender: user.profile.gender,
          dateOfBirth: user.profile.dateOfBirth?.toISOString() || null,
          bio: user.profile.bio,
          avatarUrl: user.profile.avatarUrl,
          city: user.profile.city,
          state: user.profile.state,
          subCaste: user.profile.subCaste,
          gotra: user.profile.gotra,
          createdAt: user.profile.createdAt.toISOString(),
          updatedAt: user.profile.updatedAt.toISOString(),
        }
      : null,
    _count: user._count,
  };
}

/**
 * Updates a user's account status (ACTIVE or SUSPENDED) with strict privilege checks,
 * immediate session revocation upon suspension, and audit logging.
 */
export async function updateAdminUserStatus(
  targetUserId: string,
  newStatus: 'ACTIVE' | 'SUSPENDED',
  actor: AuthUser,
  reason?: string,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<AdminUserDetails> {
  if (!db) {
    throw new AdminServiceError('Tenant database client is required for user administration.', 400);
  }
  const client = db;

  // 1. Prevent self-modification of status
  if (targetUserId === actor.id) {
    throw new AdminServiceError('Administrators cannot modify their own account status.', 400);
  }

  // 2. Fetch target user
  const targetUser = await client.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      role: true,
      status: true,
    },
  });

  if (!targetUser) {
    throw new UserNotFoundError();
  }

  // 3. Privilege Check: Only SUPER_ADMIN can alter an account with role SUPER_ADMIN
  if (
    targetUser.role === DbRole.SUPER_ADMIN &&
    actor.role !== UserRole.SUPER_ADMIN
  ) {
    throw new PrivilegeError('Only Super Admins can alter accounts with the Super Admin role.');
  }

  const previousStatus = targetUser.status;

  // 4. Atomic status update, refresh token revocation (if suspended), and audit log creation
  await client.$transaction(async (tx) => {
    // A. Update user status
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        status: newStatus as DbUserStatus,
      },
    });

    // B. If user is suspended, immediately revoke all active refresh tokens
    if (newStatus === 'SUSPENDED') {
      await tx.refreshToken.updateMany({
        where: {
          userId: targetUserId,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
        },
      });
    }

    // C. Create immutable audit log entry
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'USER_STATUS_UPDATE',
        targetType: 'USER',
        targetId: targetUserId,
        details: {
          previousStatus,
          newStatus,
          reason: reason || null,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  });

  // Safe notification side-effect after successful transaction within tenant database
  sendNotificationSafely(
    {
      recipientId: targetUserId,
      actorId: actor.id,
      type: 'ACCOUNT_STATUS_UPDATE',
      title: 'Account Status Updated',
      message: `Your account status has been updated to ${newStatus}.${reason ? ` Reason: ${reason}` : ''}`,
      entityType: 'User',
      entityId: targetUserId,
    },
    client
  ).catch((err) =>
    console.warn('[Admin Users Service] Failed to send account status notification:', err)
  );

  return getAdminUserDetails(targetUserId, client);
}

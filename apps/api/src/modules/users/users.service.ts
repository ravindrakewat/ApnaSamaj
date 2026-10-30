import { Gender, Prisma, PrismaClient } from '@apnasamaj/database';
import {
  SafeUserProfile,
  UserRole,
  UserStatus,
  PublicDirectoryMember,
  DirectoryResponseData,
  PublicMemberProfile,
} from '@apnasamaj/shared-types';
import { UpdateProfileInput, DirectoryQuery } from '@apnasamaj/validation';
import { uploadAvatarMedia, deleteStorageObjects, extractStoragePathFromUrl } from '../../services/storage.service';

export class UserServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'UserServiceError';
    this.statusCode = statusCode;
  }
}

export class UserNotFoundError extends UserServiceError {
  constructor(message: string = 'User not found.') {
    super(message, 404);
  }
}

/**
 * Validates that an active tenant PrismaClient instance is provided.
 * Throws a 400 UserServiceError if missing to prevent silent fallback.
 */
function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new UserServiceError('Tenant database client is required for user operations.', 400);
  }
  return db;
}

export interface CurrentMemberProfile {
  id: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  profile: SafeUserProfile | null;
}

/**
 * Retrieves the full sanitized profile of the current authenticated member.
 * Operates strictly within the caller's tenant database.
 */
export async function getMyProfile(userId: string, db?: PrismaClient): Promise<CurrentMemberProfile> {
  const client = assertDb(db);
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
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
          createdAt: user.profile.createdAt ? user.profile.createdAt.toISOString() : user.createdAt.toISOString(),
          updatedAt: user.profile.updatedAt ? user.profile.updatedAt.toISOString() : user.updatedAt.toISOString(),
        }
      : null,
  };
}

/**
 * Updates only the permitted self-editable profile fields for the member.
 * Members CANNOT update role, status, isPhoneVerified, or phone number through this endpoint.
 */
export async function updateMyProfile(
  userId: string,
  input: UpdateProfileInput,
  db?: PrismaClient
): Promise<CurrentMemberProfile> {
  const client = assertDb(db);
  // Verify user existence
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, profile: { select: { id: true } } },
  });

  if (!user) {
    throw new UserNotFoundError();
  }

  // Sanitize and map permitted fields only
  const updateData: {
    fullName?: string;
    gender?: Gender | null;
    dateOfBirth?: Date | null;
    bio?: string | null;
    avatarUrl?: string | null;
    city?: string | null;
    state?: string | null;
    subCaste?: string | null;
    gotra?: string | null;
  } = {};

  if (input.fullName !== undefined) updateData.fullName = input.fullName;
  if (input.gender !== undefined) updateData.gender = input.gender as Gender | null;
  if (input.dateOfBirth !== undefined) {
    updateData.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
  }
  if (input.bio !== undefined) updateData.bio = input.bio;
  if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
  if (input.city !== undefined) updateData.city = input.city;
  if (input.state !== undefined) updateData.state = input.state;
  if (input.subCaste !== undefined) updateData.subCaste = input.subCaste;
  if (input.gotra !== undefined) updateData.gotra = input.gotra;

  // Upsert profile
  if (user.profile) {
    await client.profile.update({
      where: { userId },
      data: updateData,
    });
  } else {
    await client.profile.create({
      data: {
        userId,
        fullName: updateData.fullName || 'Member',
        ...updateData,
      },
    });
  }

  return getMyProfile(userId, client);
}

const publicDirectorySelect = {
  id: true,
  createdAt: true,
  profile: {
    select: {
      id: true,
      fullName: true,
      gender: true,
      bio: true,
      avatarUrl: true,
      city: true,
      state: true,
      subCaste: true,
      gotra: true,
    },
  },
} as const;

/**
 * Lists active verified members for the community directory.
 * Never exposes phone numbers, password hashes, auth tokens, or administrative fields.
 * Restricted strictly to active users.
 *
 * TENANT ISOLATION (Phase 15C.2 Pilot):
 * Explicitly requires a tenant-bound PrismaClient instance (`db`).
 * Does NOT silently fall back to the global Prisma singleton.
 */
export async function getDirectoryMembers(
  query: DirectoryQuery,
  db?: PrismaClient
): Promise<DirectoryResponseData> {
  if (!db) {
    throw new UserServiceError('Tenant database client is required for directory operations.', 400);
  }
  const { page = 1, limit = 12, search, city, state, gotra, subCaste } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    status: 'ACTIVE',
  };

  const andConditions: Prisma.UserWhereInput[] = [];

  if (city && city.trim().length > 0) {
    andConditions.push({
      profile: {
        city: { contains: city.trim(), mode: 'insensitive' },
      },
    });
  }

  if (state && state.trim().length > 0) {
    andConditions.push({
      profile: {
        state: { contains: state.trim(), mode: 'insensitive' },
      },
    });
  }

  if (subCaste && subCaste.trim().length > 0) {
    andConditions.push({
      profile: {
        subCaste: { contains: subCaste.trim(), mode: 'insensitive' },
      },
    });
  }

  if (gotra && gotra.trim().length > 0) {
    andConditions.push({
      profile: {
        gotra: { contains: gotra.trim(), mode: 'insensitive' },
      },
    });
  }

  if (search && search.trim().length > 0) {
    const term = search.trim();
    andConditions.push({
      profile: {
        OR: [
          { fullName: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { state: { contains: term, mode: 'insensitive' } },
          { gotra: { contains: term, mode: 'insensitive' } },
          { subCaste: { contains: term, mode: 'insensitive' } },
        ],
      },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  type RawDirectoryUser = Prisma.UserGetPayload<{ select: typeof publicDirectorySelect }>;
  let totalMembers: number;
  let rawUsers: RawDirectoryUser[];

  if (page === 1) {
    rawUsers = await db.user.findMany({
      where,
      skip: 0,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: publicDirectorySelect,
    });

    if (rawUsers.length < limit) {
      totalMembers = rawUsers.length;
    } else {
      totalMembers = await db.user.count({ where });
    }
  } else {
    const [count, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: publicDirectorySelect,
      }),
    ]);
    totalMembers = count;
    rawUsers = users;
  }

  const members: PublicDirectoryMember[] = rawUsers.map((u) => ({
    id: u.id,
    fullName: u.profile?.fullName || 'Community Member',
    avatarUrl: u.profile?.avatarUrl || null,
    gender: u.profile?.gender || null,
    bio: u.profile?.bio || null,
    city: u.profile?.city || null,
    state: u.profile?.state || null,
    subCaste: u.profile?.subCaste || null,
    gotra: u.profile?.gotra || null,
    joinedAt: u.createdAt.toISOString(),
  }));

  return {
    members,
    pagination: {
      page,
      limit,
      totalMembers,
      totalPages: Math.ceil(totalMembers / limit) || 1,
    },
  };
}

/**
 * Uploads a profile avatar for the authenticated user.
 * Reuses safe magic-byte, MIME, and size validation from storage service.
 * Cleans up newly uploaded image if database update fails.
 * Safely cleans up superseded application-managed avatar only after commit, with strict user namespace validation.
 */
export async function uploadMyAvatar(
  userId: string,
  fileBuffer: Buffer,
  mimetype: string,
  originalName: string,
  db?: PrismaClient
): Promise<{ avatarUrl: string }> {
  const client = assertDb(db);
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profile: {
        select: {
          id: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!user) {
    throw new UserNotFoundError();
  }

  const previousAvatarUrl = user.profile?.avatarUrl || null;

  // 1. Upload new avatar buffer using storage service
  const uploadResult = await uploadAvatarMedia(userId, fileBuffer, mimetype, originalName);

  // 2. Persist avatarUrl to database
  try {
    if (user.profile) {
      await client.profile.update({
        where: { userId },
        data: { avatarUrl: uploadResult.url },
      });
    } else {
      await client.profile.create({
        data: {
          userId,
          fullName: 'Member',
          avatarUrl: uploadResult.url,
        },
      });
    }
  } catch (dbError: unknown) {
    // 3. Database update failed: cleanup the newly uploaded file to avoid orphaned storage objects
    try {
      await deleteStorageObjects([uploadResult.storagePath]);
    } catch (cleanupError: unknown) {
      console.error(
        '[Users Service] Failed to cleanup orphaned avatar storage object after DB error:',
        cleanupError instanceof Error ? cleanupError.message : cleanupError
      );
    }
    throw dbError;
  }

  // 4. Safely clean up superseded avatar only if it belongs to this user in application storage
  if (previousAvatarUrl && previousAvatarUrl !== uploadResult.url) {
    const oldStoragePath = extractStoragePathFromUrl(previousAvatarUrl);
    // Strict namespace validation: ensure the path belongs strictly to this user's avatar storage.
    // Avatar replacement must never delete post-media objects (posts/userId/).
    if (oldStoragePath && oldStoragePath.startsWith(`avatars/${userId}/`)) {
      deleteStorageObjects([oldStoragePath]).catch((err: unknown) => {
        console.warn(
          '[Users Service] Failed to clean up previous avatar:',
          err instanceof Error ? err.message : err
        );
      });
    }
  }

  return { avatarUrl: uploadResult.url };
}

/**
 * Retrieves public profile information for a community member.
 * Only ACTIVE members are discoverable; never exposes phone numbers, password hashes, or sensitive account fields.
 */
export async function getPublicMemberProfile(
  targetUserId: string,
  db?: PrismaClient
): Promise<PublicMemberProfile> {
  const client = assertDb(db);
  const user = await client.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          fullName: true,
          gender: true,
          bio: true,
          avatarUrl: true,
          city: true,
          state: true,
          subCaste: true,
          gotra: true,
        },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    throw new UserNotFoundError('Member profile not found or unavailable.');
  }

  return {
    id: user.id,
    fullName: user.profile?.fullName || 'Community Member',
    avatarUrl: user.profile?.avatarUrl || null,
    gender: user.profile?.gender || null,
    bio: user.profile?.bio || null,
    city: user.profile?.city || null,
    state: user.profile?.state || null,
    subCaste: user.profile?.subCaste || null,
    gotra: user.profile?.gotra || null,
    role: user.role as unknown as UserRole,
    joinedAt: user.createdAt.toISOString(),
  };
}

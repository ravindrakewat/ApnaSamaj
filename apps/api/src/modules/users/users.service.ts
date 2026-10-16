import { prisma, Gender } from '@apnasamaj/database';
import { SafeUserProfile, UserRole, UserStatus } from '@apnasamaj/shared-types';
import { UpdateProfileInput } from '@apnasamaj/validation';

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
 */
export async function getMyProfile(userId: string): Promise<CurrentMemberProfile> {
  const user = await prisma.user.findUnique({
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
          createdAt: user.profile.createdAt.toISOString(),
          updatedAt: user.profile.updatedAt.toISOString(),
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
  input: UpdateProfileInput
): Promise<CurrentMemberProfile> {
  // Verify user existence
  const user = await prisma.user.findUnique({
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
    await prisma.profile.update({
      where: { userId },
      data: updateData,
    });
  } else {
    await prisma.profile.create({
      data: {
        userId,
        fullName: updateData.fullName || 'Member',
        ...updateData,
      },
    });
  }

  return getMyProfile(userId);
}

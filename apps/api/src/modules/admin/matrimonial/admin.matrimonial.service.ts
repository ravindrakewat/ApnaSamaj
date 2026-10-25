import { prisma, Prisma, PrismaClient } from '@apnasamaj/database';
import {
  AuthUser,
  AdminMatrimonialProfileListItem,
  AdminMatrimonialProfileDetail,
  PaginatedAdminMatrimonialProfilesResponse,
  MatrimonialProfileStatus,
  MaritalStatus,
  ManglikStatus,
  EmploymentSector,
  FamilyType,
  FamilyValues,
  DietType,
  HabitFrequency,
  Gender,
} from '@apnasamaj/shared-types';
import {
  AdminModerateMatrimonialProfileInput,
  ListAdminMatrimonialProfilesQueryInput,
  AdminModerateMatrimonialPhotoInput,
} from '@apnasamaj/validation';
import { sendNotificationSafely } from '../../notifications/notifications.service';
import {
  isMatrimonialTableMissingError,
  MatrimonialMigrationPendingError,
  MatrimonialNotFoundError,
  MatrimonialServiceError,
} from '../../matrimonial/matrimonial.service';

/**
 * Calculates user's age from birth date safely.
 */
function calculateAge(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * Lists matrimonial profiles for administrative moderation with pagination and filtering.
 */
export async function listAdminMatrimonialProfiles(
  query: ListAdminMatrimonialProfilesQueryInput,
  db?: PrismaClient
): Promise<PaginatedAdminMatrimonialProfilesResponse> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client is required for matrimonial administration.', 400);
  }
  const client = db;
  const { status = 'PENDING_APPROVAL', page = 1, limit = 10, search } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.MatrimonialProfileWhereInput = {};

  if (status && status !== 'ALL') {
    where.status = status as MatrimonialProfileStatus;
  }

  if (search && search.trim().length > 0) {
    const cleanSearch = search.trim();
    where.OR = [
      { user: { profile: { fullName: { contains: cleanSearch, mode: 'insensitive' } } } },
      { user: { phone: { contains: cleanSearch, mode: 'insensitive' } } },
      { workCity: { contains: cleanSearch, mode: 'insensitive' } },
      { occupation: { contains: cleanSearch, mode: 'insensitive' } },
      { subCaste: { contains: cleanSearch, mode: 'insensitive' } },
      { gotra: { contains: cleanSearch, mode: 'insensitive' } },
    ];
  }

  try {
    const [total, rawProfiles] = await Promise.all([
      client.matrimonialProfile.count({ where }),
      client.matrimonialProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              profile: {
                select: {
                  fullName: true,
                  gender: true,
                  dateOfBirth: true,
                  avatarUrl: true,
                  city: true,
                  state: true,
                  subCaste: true,
                  gotra: true,
                },
              },
            },
          },
          photos: {
            select: {
              id: true,
              isApproved: true,
            },
          },
          approvedBy: {
            select: {
              id: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const profiles: AdminMatrimonialProfileListItem[] = rawProfiles.map((raw) => {
      const p = raw.user.profile;
      const unapprovedPhotos = raw.photos.filter((ph) => !ph.isApproved).length;

      return {
        id: raw.id,
        userId: raw.user.id,
        fullName: p?.fullName || 'Community Member',
        phone: raw.user.phone,
        gender: (p?.gender as Gender) || null,
        age: calculateAge(p?.dateOfBirth),
        city: raw.workCity || p?.city || null,
        state: raw.workState || p?.state || null,
        avatarUrl: p?.avatarUrl || null,
        maritalStatus: raw.maritalStatus as MaritalStatus,
        highestEducation: raw.highestEducation,
        occupation: raw.occupation,
        status: raw.status as MatrimonialProfileStatus,
        rejectionReason: raw.rejectionReason,
        approvedAt: raw.approvedAt ? raw.approvedAt.toISOString() : null,
        approvedBy: raw.approvedBy
          ? {
              id: raw.approvedBy.id,
              fullName: raw.approvedBy.profile?.fullName || 'Administrator',
            }
          : null,
        photosCount: raw.photos.length,
        unapprovedPhotosCount: unapprovedPhotos,
        createdAt: raw.createdAt.toISOString(),
        updatedAt: raw.updatedAt.toISOString(),
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      profiles,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Admin Matrimonial Service] Table does not exist (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Retrieves full matrimonial profile details and submitted photos for admin review.
 */
export async function getAdminMatrimonialProfileDetails(
  profileId: string,
  db?: PrismaClient
): Promise<AdminMatrimonialProfileDetail> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client is required for matrimonial administration.', 400);
  }
  const client = db;
  try {
    const raw = await client.matrimonialProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            status: true,
            profile: {
              select: {
                fullName: true,
                gender: true,
                dateOfBirth: true,
                avatarUrl: true,
                city: true,
                state: true,
                subCaste: true,
                gotra: true,
              },
            },
          },
        },
        photos: {
          orderBy: { order: 'asc' },
        },
        partnerPreference: true,
        approvedBy: {
          select: {
            id: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!raw) {
      throw new MatrimonialNotFoundError('Matrimonial profile not found.');
    }

    return {
      id: raw.id,
      userId: raw.userId,
      status: raw.status as MatrimonialProfileStatus,
      rejectionReason: raw.rejectionReason,
      maritalStatus: raw.maritalStatus as MaritalStatus,
      heightCm: raw.heightCm,
      weightKg: raw.weightKg,
      motherTongue: raw.motherTongue,
      religion: raw.religion,
      caste: raw.caste,
      subCaste: raw.subCaste,
      gotra: raw.gotra,
      manglik: raw.manglik as ManglikStatus,
      birthTime: raw.birthTime,
      birthCity: raw.birthCity,
      rashi: raw.rashi,
      nakshatra: raw.nakshatra,
      highestEducation: raw.highestEducation,
      educationDetails: raw.educationDetails,
      employedIn: raw.employedIn as EmploymentSector,
      occupation: raw.occupation,
      companyName: raw.companyName,
      annualIncome: raw.annualIncome,
      workCity: raw.workCity,
      workState: raw.workState,
      workCountry: raw.workCountry,
      familyType: raw.familyType as FamilyType,
      familyValues: raw.familyValues as FamilyValues,
      fatherName: raw.fatherName,
      fatherOccupation: raw.fatherOccupation,
      motherName: raw.motherName,
      motherOccupation: raw.motherOccupation,
      brothersCount: raw.brothersCount,
      brothersMarried: raw.brothersMarried,
      sistersCount: raw.sistersCount,
      sistersMarried: raw.sistersMarried,
      familyNativePlace: raw.familyNativePlace,
      aboutFamily: raw.aboutFamily,
      diet: raw.diet as DietType,
      smoking: raw.smoking as HabitFrequency,
      drinking: raw.drinking as HabitFrequency,
      aboutMe: raw.aboutMe,
      partnerExpectations: raw.partnerExpectations,
      approvedAt: raw.approvedAt ? raw.approvedAt.toISOString() : null,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      photos: raw.photos.map((ph) => ({
        id: ph.id,
        profileId: ph.profileId,
        url: ph.url,
        order: ph.order,
        isPrimary: ph.isPrimary,
        isApproved: ph.isApproved,
        createdAt: ph.createdAt.toISOString(),
      })),
      partnerPreference: raw.partnerPreference
        ? {
            id: raw.partnerPreference.id,
            profileId: raw.partnerPreference.profileId,
            minAge: raw.partnerPreference.minAge,
            maxAge: raw.partnerPreference.maxAge,
            minHeightCm: raw.partnerPreference.minHeightCm,
            maxHeightCm: raw.partnerPreference.maxHeightCm,
            maritalStatuses: raw.partnerPreference.maritalStatuses as MaritalStatus[],
            manglik: (raw.partnerPreference.manglik as ManglikStatus) || null,
            diet: (raw.partnerPreference.diet as DietType) || null,
            preferredEducations: raw.partnerPreference.preferredEducations,
            preferredOccupations: raw.partnerPreference.preferredOccupations,
            preferredCities: raw.partnerPreference.preferredCities,
            preferredStates: raw.partnerPreference.preferredStates,
            minIncome: raw.partnerPreference.minIncome,
            notes: raw.partnerPreference.notes,
            createdAt: raw.partnerPreference.createdAt.toISOString(),
            updatedAt: raw.partnerPreference.updatedAt.toISOString(),
          }
        : null,
      user: {
        id: raw.user.id,
        phone: raw.user.phone,
        status: raw.user.status,
        profile: raw.user.profile
          ? {
              fullName: raw.user.profile.fullName,
              gender: (raw.user.profile.gender as Gender) || null,
              dateOfBirth: raw.user.profile.dateOfBirth?.toISOString() || null,
              avatarUrl: raw.user.profile.avatarUrl || null,
              city: raw.user.profile.city || null,
              state: raw.user.profile.state || null,
              subCaste: raw.user.profile.subCaste || null,
              gotra: raw.user.profile.gotra || null,
            }
          : null,
      },
      approvedBy: raw.approvedBy
        ? {
            id: raw.approvedBy.id,
            fullName: raw.approvedBy.profile?.fullName || 'Administrator',
          }
        : null,
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Admin Matrimonial Service] Table does not exist (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Moderates a matrimonial profile (APPROVED, REJECTED, HIDDEN) with strict:
 * - Anti-self-approval rule
 * - Audit logging
 * - Safe user notification side-effects
 */
export async function moderateMatrimonialProfile(
  profileId: string,
  actor: AuthUser,
  input: AdminModerateMatrimonialProfileInput,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<AdminMatrimonialProfileDetail> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client is required for matrimonial administration.', 400);
  }
  const client = db;
  const { status: newStatus, rejectionReason } = input;

  try {
    const profile = await client.matrimonialProfile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        status: true,
        approvedAt: true,
        approvedById: true,
      },
    });

    if (!profile) {
      throw new MatrimonialNotFoundError('Matrimonial profile not found.');
    }

    // 1. Anti-self-approval enforcement
    if (profile.userId === actor.id) {
      throw new MatrimonialServiceError(
        'Administrators cannot approve or moderate their own matrimonial profile.',
        403
      );
    }

    // 2. Prevent duplicate processing if already at target status
    if (profile.status === newStatus) {
      return getAdminMatrimonialProfileDetails(profileId, client);
    }

    const previousStatus = profile.status;

    // 3. Perform atomic state update and audit log creation
    await client.$transaction(async (tx) => {
      await tx.matrimonialProfile.update({
        where: { id: profileId },
        data: {
          status: newStatus as MatrimonialProfileStatus,
          rejectionReason: newStatus === 'REJECTED' ? rejectionReason : null,
          approvedAt: newStatus === 'APPROVED' ? new Date() : (newStatus === 'REJECTED' ? null : profile.approvedAt),
          approvedById: newStatus === 'APPROVED' ? actor.id : (newStatus === 'REJECTED' ? null : profile.approvedById),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'MATRIMONIAL_PROFILE_MODERATED',
          targetType: 'MATRIMONIAL_PROFILE',
          targetId: profileId,
          details: {
            previousStatus,
            newStatus,
            reason: newStatus === 'REJECTED' ? rejectionReason : null,
            profileUserId: profile.userId,
          },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    });

    // 4. Safe notification side-effect after committed transaction within tenant database
    if (newStatus === 'APPROVED') {
      sendNotificationSafely(
        {
          recipientId: profile.userId,
          actorId: actor.id,
          type: 'MATRIMONIAL_PROFILE_APPROVED',
          title: 'Matrimonial Profile Approved',
          message: 'Congratulations! Your matrimonial profile has been approved and is now visible in community discovery.',
          entityType: 'MatrimonialProfile',
          entityId: profileId,
        },
        client
      ).catch((err) =>
        console.warn('[Admin Matrimonial Service] Failed to send approval notification:', err)
      );
    } else if (newStatus === 'REJECTED') {
      sendNotificationSafely(
        {
          recipientId: profile.userId,
          actorId: actor.id,
          type: 'MATRIMONIAL_PROFILE_REJECTED',
          title: 'Matrimonial Profile Changes Requested',
          message: `Your matrimonial profile requires changes: ${rejectionReason}`,
          entityType: 'MatrimonialProfile',
          entityId: profileId,
        },
        client
      ).catch((err) =>
        console.warn('[Admin Matrimonial Service] Failed to send rejection notification:', err)
      );
    }

    return getAdminMatrimonialProfileDetails(profileId, client);
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Admin Matrimonial Service] Table does not exist (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Moderates a matrimonial photo (approving or hiding from discovery).
 */
export async function moderateMatrimonialPhoto(
  photoId: string,
  actor: AuthUser,
  input: AdminModerateMatrimonialPhotoInput,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<{ id: string; isApproved: boolean }> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client is required for matrimonial administration.', 400);
  }
  const client = db;
  try {
    const photo = await client.matrimonialPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new MatrimonialNotFoundError('Matrimonial photo not found.');
    }

    if (photo.isApproved === input.isApproved) {
      return { id: photo.id, isApproved: photo.isApproved };
    }

    const previousApproved = photo.isApproved;

    await client.$transaction(async (tx) => {
      await tx.matrimonialPhoto.update({
        where: { id: photoId },
        data: {
          isApproved: input.isApproved,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'MATRIMONIAL_PHOTO_MODERATED',
          targetType: 'MATRIMONIAL_PHOTO',
          targetId: photoId,
          details: {
            profileId: photo.profileId,
            previousApproved,
            newApproved: input.isApproved,
          },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    });

    return { id: photo.id, isApproved: input.isApproved };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Admin Matrimonial Service] Table does not exist (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

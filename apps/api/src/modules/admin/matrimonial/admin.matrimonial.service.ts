import { prisma, Prisma, PrismaClient } from '@apnasamaj/database';
import {
  AuthUser,
  AdminMatrimonialProfileListItem,
  AdminMatrimonialProfileDetail,
  PaginatedAdminMatrimonialProfilesResponse,
  MatrimonialProfileStatus,
  MatrimonialModerationMetrics,
  MatrimonialDocumentItem,
  MatrimonialReportItem,
  PaginatedAdminMatrimonialDocumentsResponse,
  PaginatedAdminMatrimonialReportsResponse,
  MatrimonialDocumentType,
  MatrimonialDocumentStatus,
  MatrimonialReportReason,
  MatrimonialReportStatus,
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
  AdminModerateMatrimonialDocumentInput,
  ListAdminMatrimonialDocumentsQueryInput,
  AdminModerateMatrimonialReportInput,
  ListAdminMatrimonialReportsQueryInput,
} from '@apnasamaj/validation';
import { sendNotificationSafely } from '../../notifications/notifications.service';
import { createTemporarySignedDocumentUrl } from '../../../services/storage.service';
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
              url: true,
              isPrimary: true,
              isApproved: true,
              order: true,
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
      const primaryPhoto = raw.photos.find((ph) => ph.isPrimary) || raw.photos[0] || null;
      const primaryPhotoUrl = primaryPhoto?.url || p?.avatarUrl || null;

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
        primaryPhotoUrl,
        maritalStatus: raw.maritalStatus as MaritalStatus,
        highestEducation: raw.highestEducation,
        occupation: raw.occupation,
        status: raw.status as MatrimonialProfileStatus,
        rejectionReason: raw.rejectionReason,
        isVerified: (raw as any).isVerified ?? false,
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
      isVerified: (raw as any).isVerified ?? false,
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
          rejectionReason: (newStatus === 'REJECTED' || newStatus === 'SUSPENDED') ? rejectionReason : null,
          approvedAt: newStatus === 'APPROVED' ? new Date() : (newStatus === 'REJECTED' || newStatus === 'SUSPENDED' ? null : profile.approvedAt),
          approvedById: newStatus === 'APPROVED' ? actor.id : (newStatus === 'REJECTED' || newStatus === 'SUSPENDED' ? null : profile.approvedById),
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
            reason: (newStatus === 'REJECTED' || newStatus === 'SUSPENDED') ? rejectionReason : null,
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
          actorId: null, // Keep reviewer identity confidential
          type: 'MATRIMONIAL_PROFILE_APPROVED',
          title: 'वैवाहिक प्रोफ़ाइल स्वीकृत (Profile Approved)',
          message: 'बधाई हो! आपकी वैवाहिक प्रोफ़ाइल स्वीकृत कर दी गई है और अब समुदाय में दिखाई दे रही है।',
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
          actorId: null, // Keep reviewer identity confidential
          type: 'MATRIMONIAL_PROFILE_REJECTED',
          title: 'वैवाहिक प्रोफ़ाइल समीक्षा (Changes Requested)',
          message: `आपकी वैवाहिक प्रोफ़ाइल में सुधार की आवश्यकता है: ${rejectionReason}`,
          entityType: 'MatrimonialProfile',
          entityId: profileId,
        },
        client
      ).catch((err) =>
        console.warn('[Admin Matrimonial Service] Failed to send rejection notification:', err)
      );
    } else if (newStatus === 'SUSPENDED') {
      sendNotificationSafely(
        {
          recipientId: profile.userId,
          actorId: null, // Keep reviewer identity confidential
          type: 'MATRIMONIAL_PROFILE_SUSPENDED',
          title: 'वैवाहिक प्रोफ़ाइल निलंबित (Profile Suspended)',
          message: `आपकी वैवाहिक प्रोफ़ाइल निलंबित कर दी गई है: ${rejectionReason}`,
          entityType: 'MatrimonialProfile',
          entityId: profileId,
        },
        client
      ).catch((err) =>
        console.warn('[Admin Matrimonial Service] Failed to send suspension notification:', err)
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


/**
 * Returns comprehensive statistics for the admin matrimonial moderation overview.
 */
export async function getAdminMatrimonialMetrics(
  db?: PrismaClient
): Promise<MatrimonialModerationMetrics> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client is required for matrimonial administration.', 400);
  }
  const client = db;

  try {
    const [
      totalProfiles,
      pendingApprovals,
      approvedProfiles,
      rejectedProfiles,
      suspendedProfiles,
    ] = await Promise.all([
      client.matrimonialProfile.count(),
      client.matrimonialProfile.count({ where: { status: 'PENDING_APPROVAL' } }),
      client.matrimonialProfile.count({ where: { status: 'APPROVED' } }),
      client.matrimonialProfile.count({ where: { status: 'REJECTED' } }),
      client.matrimonialProfile.count({ where: { status: 'SUSPENDED' } }),
    ]);

    let pendingDocuments = 0;
    try {
      pendingDocuments = await (client as any).matrimonialDocument.count({
        where: { status: 'PENDING' },
      });
    } catch {
      // Graceful fallback
    }

    let openReports = 0;
    let resolvedReports = 0;
    try {
      openReports = await (client as any).matrimonialReport.count({
        where: { status: { in: ['PENDING', 'UNDER_INVESTIGATION'] } },
      });
      resolvedReports = await (client as any).matrimonialReport.count({
        where: { status: { in: ['RESOLVED', 'DISMISSED'] } },
      });
    } catch {
      // Graceful fallback
    }

    return {
      totalProfiles,
      pendingApprovals,
      approvedProfiles,
      rejectedProfiles,
      suspendedProfiles,
      pendingDocuments,
      openReports,
      resolvedReports,
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Lists verification documents for administrative review.
 */
export async function listAdminMatrimonialDocuments(
  query: ListAdminMatrimonialDocumentsQueryInput,
  db?: PrismaClient
): Promise<PaginatedAdminMatrimonialDocumentsResponse> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client required.', 400);
  }
  const client = db;
  const { status = 'PENDING', page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }

  try {
    const [total, docs] = await Promise.all([
      (client as any).matrimonialDocument.count({ where }),
      (client as any).matrimonialDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            select: {
              status: true,
              user: {
                select: {
                  phone: true,
                  profile: { select: { fullName: true } },
                },
              },
            },
          },
          reviewedBy: {
            select: {
              id: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      documents: docs.map((d: any) => ({
        id: d.id,
        profileId: d.profileId,
        documentType: d.documentType as MatrimonialDocumentType,
        documentName: d.documentName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        status: d.status as MatrimonialDocumentStatus,
        rejectionReason: d.rejectionReason,
        userFullName: d.profile?.user?.profile?.fullName || 'Community Member',
        userPhone: d.profile?.user?.phone || '—',
        profileStatus: d.profile?.status as MatrimonialProfileStatus,
        reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
        reviewedBy: d.reviewedBy
          ? {
              id: d.reviewedBy.id,
              fullName: d.reviewedBy.profile?.fullName || 'Administrator',
            }
          : null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
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
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Generates a temporary short-lived signed URL for an authorized admin to view a verification document.
 */
export async function getAdminMatrimonialDocumentSignedUrl(
  documentId: string,
  actor: AuthUser,
  db?: PrismaClient
): Promise<{ signedUrl: string; documentName: string; mimeType: string }> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client required.', 400);
  }
  const client = db;

  const doc = await (client as any).matrimonialDocument.findUnique({
    where: { id: documentId },
    select: { storagePath: true, documentName: true, mimeType: true },
  });

  if (!doc) {
    throw new MatrimonialNotFoundError('Verification document not found.');
  }

  const signedUrl = await createTemporarySignedDocumentUrl(doc.storagePath, 300); // 5 min expiry
  return {
    signedUrl,
    documentName: doc.documentName,
    mimeType: doc.mimeType,
  };
}

/**
 * Approves or rejects a verification document with mandatory reason on rejection.
 */
export async function moderateAdminMatrimonialDocument(
  documentId: string,
  actor: AuthUser,
  input: AdminModerateMatrimonialDocumentInput,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<MatrimonialDocumentItem> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client required.', 400);
  }
  const client = db;
  const { status: newStatus, rejectionReason } = input;

  const doc = await (client as any).matrimonialDocument.findUnique({
    where: { id: documentId },
    include: {
      profile: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!doc) {
    throw new MatrimonialNotFoundError('Verification document not found.');
  }

  // Prevent self-review
  if (doc.profile.userId === actor.id) {
    throw new MatrimonialServiceError('Administrators cannot moderate their own documents.', 403);
  }

  const previousStatus = doc.status;

  await client.$transaction(async (tx) => {
    await (tx as any).matrimonialDocument.update({
      where: { id: documentId },
      data: {
        status: newStatus,
        rejectionReason: newStatus === 'REJECTED' ? rejectionReason : null,
        reviewedAt: new Date(),
        reviewedById: actor.id,
      },
    });

    // Recalculate identity verification based exclusively on approved GOVERNMENT_ID documents.
    // Education, Occupation, and Other documents never independently award identity verification.
    const approvedGovId = await (tx as any).matrimonialDocument.findFirst({
      where: {
        profileId: doc.profileId,
        status: 'APPROVED',
        documentType: 'GOVERNMENT_ID',
      },
    });

    const isIdentityVerified = Boolean(approvedGovId);

    await (tx as any).matrimonialProfile.update({
      where: { id: doc.profileId },
      data: {
        isVerified: isIdentityVerified,
        verifiedAt: isIdentityVerified ? (doc.profile.verifiedAt || new Date()) : null,
        verifiedById: isIdentityVerified ? actor.id : null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MATRIMONIAL_DOCUMENT_MODERATED',
        targetType: 'MATRIMONIAL_DOCUMENT',
        targetId: documentId,
        details: {
          previousStatus,
          newStatus,
          rejectionReason: newStatus === 'REJECTED' ? rejectionReason : null,
          profileId: doc.profileId,
          profileUserId: doc.profile.userId,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  });

  // Safe notification
  if (newStatus === 'APPROVED') {
    sendNotificationSafely(
      {
        recipientId: doc.profile.userId,
        actorId: null,
        type: 'MATRIMONIAL_DOCUMENT_APPROVED',
        title: 'दस्तावेज़ सत्यापित (Document Verified)',
        message: `बधाई हो! आपका "${doc.documentName}" दस्तावेज़ सत्यापित कर दिया गया है और आपकी प्रोफ़ाइल पर सत्यापित बैज जोड़ दिया गया है।`,
        entityType: 'MatrimonialDocument',
        entityId: documentId,
      },
      client
    ).catch((err) => console.warn('[Admin Matrimonial Service] Doc approved notification warning:', err));
  } else if (newStatus === 'REJECTED') {
    sendNotificationSafely(
      {
        recipientId: doc.profile.userId,
        actorId: null,
        type: 'MATRIMONIAL_DOCUMENT_REJECTED',
        title: 'दस्तावेज़ अस्वीकृत (Document Rejected)',
        message: `आपका "${doc.documentName}" दस्तावेज़ अस्वीकृत किया गया है: ${rejectionReason}. कृपया सही दस्तावेज़ पुनः अपलोड करें।`,
        entityType: 'MatrimonialDocument',
        entityId: documentId,
      },
      client
    ).catch((err) => console.warn('[Admin Matrimonial Service] Doc rejected notification warning:', err));
  }

  return {
    id: doc.id,
    profileId: doc.profileId,
    documentType: doc.documentType as MatrimonialDocumentType,
    documentName: doc.documentName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    status: newStatus as MatrimonialDocumentStatus,
    rejectionReason: newStatus === 'REJECTED' ? rejectionReason : null,
    reviewedAt: new Date().toISOString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Lists matrimonial profile reports for admin investigation.
 */
export async function listAdminMatrimonialReports(
  query: ListAdminMatrimonialReportsQueryInput,
  db?: PrismaClient
): Promise<PaginatedAdminMatrimonialReportsResponse> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client required.', 400);
  }
  const client = db;
  const { status = 'PENDING', page = 1, limit = 10 } = query;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }

  try {
    const [total, reports] = await Promise.all([
      (client as any).matrimonialReport.count({ where }),
      (client as any).matrimonialReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: {
            select: {
              id: true,
              profile: { select: { fullName: true } },
            },
          },
          reportedProfile: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  phone: true,
                  profile: { select: { fullName: true } },
                },
              },
            },
          },
          resolvedBy: {
            select: {
              id: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      reports: reports.map((r: any) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporterName: r.reporter?.profile?.fullName || 'Community Member',
        reportedProfileId: r.reportedProfileId,
        reportedUserId: r.reportedProfile?.userId,
        reportedUserName: r.reportedProfile?.user?.profile?.fullName || 'Community Member',
        reportedUserPhone: r.reportedProfile?.user?.phone || '—',
        reason: r.reason as MatrimonialReportReason,
        explanation: r.explanation,
        status: r.status as MatrimonialReportStatus,
        adminNotes: r.adminNotes,
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        resolvedBy: r.resolvedBy
          ? {
              id: r.resolvedBy.id,
              fullName: r.resolvedBy.profile?.fullName || 'Administrator',
            }
          : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
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
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Moderates / resolves a report against a profile, optionally suspending the profile.
 */
export async function moderateAdminMatrimonialReport(
  reportId: string,
  actor: AuthUser,
  input: AdminModerateMatrimonialReportInput,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<MatrimonialReportItem> {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client required.', 400);
  }
  const client = db;
  const { status: newStatus, adminNotes, action = 'NONE' } = input;

  const report = await (client as any).matrimonialReport.findUnique({
    where: { id: reportId },
    include: {
      reportedProfile: {
        select: {
          id: true,
          userId: true,
          status: true,
        },
      },
    },
  });

  if (!report) {
    throw new MatrimonialNotFoundError('Matrimonial report not found.');
  }

  await client.$transaction(async (tx) => {
    await (tx as any).matrimonialReport.update({
      where: { id: reportId },
      data: {
        status: newStatus,
        adminNotes: adminNotes || null,
        resolvedAt: newStatus === 'RESOLVED' || newStatus === 'DISMISSED' ? new Date() : null,
        resolvedById: newStatus === 'RESOLVED' || newStatus === 'DISMISSED' ? actor.id : null,
      },
    });

    if (action === 'SUSPEND_PROFILE') {
      await (tx as any).matrimonialProfile.update({
        where: { id: report.reportedProfileId },
        data: {
          status: 'SUSPENDED',
          rejectionReason: 'Account suspended following community report investigation and guideline violations.',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'MATRIMONIAL_PROFILE_MODERATED',
          targetType: 'MATRIMONIAL_PROFILE',
          targetId: report.reportedProfileId,
          details: {
            previousStatus: report.reportedProfile.status,
            newStatus: 'SUSPENDED',
            publicReason: 'Account suspended following community report investigation and guideline violations.', hasAdminNotes: Boolean(adminNotes),
            reportId,
          },
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'MATRIMONIAL_REPORT_MODERATED',
        targetType: 'MATRIMONIAL_REPORT',
        targetId: reportId,
        details: {
          status: newStatus,
          action,
          adminNotes,
          reportedProfileId: report.reportedProfileId,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  });

  return {
    id: report.id,
    reporterId: report.reporterId,
    reportedProfileId: report.reportedProfileId,
    reason: report.reason as MatrimonialReportReason,
    explanation: report.explanation,
    status: newStatus as MatrimonialReportStatus,
    adminNotes: adminNotes || null,
    resolvedAt: new Date().toISOString(),
    createdAt: report.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Lists matrimonial moderation audit history.
 */
export async function listAdminMatrimonialAuditLogs(
  page: number = 1,
  limit: number = 20,
  db?: PrismaClient
) {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database client required.', 400);
  }
  const client = db;
  const skip = (page - 1) * limit;

  const where: Prisma.AuditLogWhereInput = {
    targetType: {
      in: ['MATRIMONIAL_PROFILE', 'MATRIMONIAL_DOCUMENT', 'MATRIMONIAL_REPORT'],
    },
  };

  const [total, logs] = await Promise.all([
    client.auditLog.count({ where }),
    client.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            phone: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    logs: logs.map((l) => ({
      id: l.id,
      actorId: l.actorId,
      actorName: l.actor?.profile?.fullName || 'Administrator',
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      details: l.details,
      createdAt: l.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

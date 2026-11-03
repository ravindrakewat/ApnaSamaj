import { PrismaClient, Prisma } from '@apnasamaj/database';
import {
  OwnMatrimonialProfile,
  MatrimonialPhotoItem,
  MatrimonialPartnerPreferenceItem,
  PublicMatrimonialProfileListItem,
  PublicMatrimonialProfileDetail,
  MatrimonialInterestItem,
  MatrimonialProfileStatus,
  MaritalStatus,
  ManglikStatus,
  EmploymentSector,
  FamilyType,
  FamilyValues,
  DietType,
  HabitFrequency,
  MatrimonialInterestStatus,
  PaginatedMatrimonialProfilesResponse,
  PaginatedMatrimonialInterestsResponse,
  Gender,
  MatrimonialDocumentItem,
  MatrimonialReportItem,
  MatrimonialBlockItem,
  MatrimonialDocumentType,
  MatrimonialDocumentStatus,
  MatrimonialReportReason,
  MatrimonialReportStatus,
} from '@apnasamaj/shared-types';
import {
  UpsertMatrimonialProfileInput,
  UpdatePartnerPreferenceInput,
  ListMatrimonialProfilesQueryInput,
  SendMatrimonialInterestInput,
  RespondMatrimonialInterestInput,
  UploadMatrimonialDocumentInput,
  CreateMatrimonialReportInput,
} from '@apnasamaj/validation';
import {
  uploadMatrimonialMedia,
  uploadMatrimonialVerificationDocument,
  deleteStorageObjects,
  deleteMatrimonialDocumentObject,
  extractStoragePathFromUrl,
} from '../../services/storage.service';
import { sendNotificationSafely } from '../notifications/notifications.service';

export class MatrimonialServiceError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'MatrimonialServiceError';
    this.statusCode = statusCode;
  }
}

export class MatrimonialNotFoundError extends MatrimonialServiceError {
  constructor(message: string = 'Matrimonial profile not found.') {
    super(message, 404);
  }
}

export class MatrimonialMigrationPendingError extends MatrimonialServiceError {
  constructor(
    message: string = 'Matrimonial service is temporarily offline (database migration pending).'
  ) {
    super(message, 503);
  }
}

export class MatrimonialValidationError extends MatrimonialServiceError {
  public errors?: Record<string, string>;
  constructor(message: string = 'Validation failed.', errors?: Record<string, string>) {
    super(message, 400);
    this.name = 'MatrimonialValidationError';
    this.errors = errors;
  }
}

function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new MatrimonialServiceError('Tenant database connection is required for matrimonial operations.', 400);
  }
  return db;
}

/**
 * Checks whether an error indicates that the Matrimonial database tables have not been migrated yet.
 */
export function isMatrimonialTableMissingError(err: unknown): boolean {
  if (!err) return false;
  const prismaErr = err as { code?: string; message?: string };
  if (prismaErr.code === 'P2021') {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    (msg.includes('MatrimonialProfile') ||
      msg.includes('MatrimonialPhoto') ||
      msg.includes('MatrimonialPartnerPreference') ||
      msg.includes('MatrimonialInterest')) &&
    (msg.includes('does not exist') || msg.includes('does not exist in the current database'))
  );
}

const matrimonialProfileInclude = {
  photos: {
    orderBy: { order: 'asc' },
  },
  partnerPreference: true,
} satisfies Prisma.MatrimonialProfileInclude;

type RawMatrimonialProfile = Prisma.MatrimonialProfileGetPayload<{
  include: typeof matrimonialProfileInclude;
}>;

function mapToOwnMatrimonialProfile(raw: RawMatrimonialProfile): OwnMatrimonialProfile {
  return {
    id: raw.id,
    userId: raw.userId,
    status: raw.status as MatrimonialProfileStatus,
    rejectionReason: raw.rejectionReason,
    isVerified: (raw as any).isVerified ?? false,
    isIdentityVerified: (raw as any).isVerified ?? false,
    isEducationVerified: ((raw as any).documents || []).some((d: any) => d.documentType === 'EDUCATION_PROOF'),
    isProfessionVerified: ((raw as any).documents || []).some((d: any) => d.documentType === 'OCCUPATION_PROOF'),
    isPhotoReviewed: (raw.photos || []).some((ph: any) => ph.isApproved),
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
    photos: (raw.photos || []).map((p) => ({
      id: p.id,
      profileId: p.profileId,
      url: p.url,
      order: p.order,
      isPrimary: p.isPrimary,
      isApproved: p.isApproved,
      createdAt: p.createdAt.toISOString(),
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
  };
}

/**
 * Retrieves the current authenticated user's own matrimonial profile.
 * Returns null if the user has not created a matrimonial profile yet.
 */
export async function getMyMatrimonialProfile(
  userId: string,
  db?: PrismaClient
): Promise<OwnMatrimonialProfile | null> {
  const client = assertDb(db);
  try {
    const raw = await client.matrimonialProfile.findUnique({
      where: { userId },
      include: matrimonialProfileInclude,
    });

    if (!raw) return null;
    return mapToOwnMatrimonialProfile(raw);
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Creates or updates the current authenticated user's own matrimonial profile.
 * Protected moderation/administrative fields (status, approvedAt, approvedById) cannot be set by the client.
 */
export async function upsertMyMatrimonialProfile(
  userId: string,
  input: UpsertMatrimonialProfileInput,
  db?: PrismaClient
): Promise<OwnMatrimonialProfile> {
  const client = assertDb(db);
  try {
    // Check if profile already exists
    const existing = await client.matrimonialProfile.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });

    let saved: RawMatrimonialProfile;

    if (existing) {
      // Updating existing profile: if previously rejected, clear rejectionReason
      const updateData: Prisma.MatrimonialProfileUpdateInput = {
        maritalStatus: input.maritalStatus,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        motherTongue: input.motherTongue,
        religion: input.religion,
        caste: input.caste,
        subCaste: input.subCaste,
        gotra: input.gotra,
        manglik: input.manglik,
        birthTime: input.birthTime,
        birthCity: input.birthCity,
        rashi: input.rashi,
        nakshatra: input.nakshatra,
        highestEducation: input.highestEducation,
        educationDetails: input.educationDetails,
        employedIn: input.employedIn,
        occupation: input.occupation,
        companyName: input.companyName,
        annualIncome: input.annualIncome,
        workCity: input.workCity,
        workState: input.workState,
        workCountry: input.workCountry,
        familyType: input.familyType,
        familyValues: input.familyValues,
        fatherName: input.fatherName,
        fatherOccupation: input.fatherOccupation,
        motherName: input.motherName,
        motherOccupation: input.motherOccupation,
        brothersCount: input.brothersCount,
        brothersMarried: input.brothersMarried,
        sistersCount: input.sistersCount,
        sistersMarried: input.sistersMarried,
        familyNativePlace: input.familyNativePlace,
        aboutFamily: input.aboutFamily,
        diet: input.diet,
        smoking: input.smoking,
        drinking: input.drinking,
        aboutMe: input.aboutMe,
        partnerExpectations: input.partnerExpectations,
        ...(existing.status === 'REJECTED'
          ? { status: 'DRAFT', rejectionReason: null }
          : {}),
      };

      saved = await client.matrimonialProfile.update({
        where: { userId },
        data: updateData,
        include: matrimonialProfileInclude,
      });
    } else {
      // Creating new profile: starts in DRAFT status
      const createData: Prisma.MatrimonialProfileCreateInput = {
        user: { connect: { id: userId } },
        status: 'DRAFT',
        maritalStatus: input.maritalStatus,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        motherTongue: input.motherTongue,
        religion: input.religion,
        caste: input.caste,
        subCaste: input.subCaste,
        gotra: input.gotra,
        manglik: input.manglik,
        birthTime: input.birthTime,
        birthCity: input.birthCity,
        rashi: input.rashi,
        nakshatra: input.nakshatra,
        highestEducation: input.highestEducation,
        educationDetails: input.educationDetails,
        employedIn: input.employedIn,
        occupation: input.occupation,
        companyName: input.companyName,
        annualIncome: input.annualIncome,
        workCity: input.workCity,
        workState: input.workState,
        workCountry: input.workCountry,
        familyType: input.familyType,
        familyValues: input.familyValues,
        fatherName: input.fatherName,
        fatherOccupation: input.fatherOccupation,
        motherName: input.motherName,
        motherOccupation: input.motherOccupation,
        brothersCount: input.brothersCount,
        brothersMarried: input.brothersMarried,
        sistersCount: input.sistersCount,
        sistersMarried: input.sistersMarried,
        familyNativePlace: input.familyNativePlace,
        aboutFamily: input.aboutFamily,
        diet: input.diet,
        smoking: input.smoking,
        drinking: input.drinking,
        aboutMe: input.aboutMe,
        partnerExpectations: input.partnerExpectations,
      };

      saved = await client.matrimonialProfile.create({
        data: createData,
        include: matrimonialProfileInclude,
      });
    }

    return mapToOwnMatrimonialProfile(saved);
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Creates or updates partner preferences for the authenticated member's matrimonial profile.
 */
export async function upsertMyPartnerPreferences(
  userId: string,
  input: UpdatePartnerPreferenceInput,
  db?: PrismaClient
): Promise<MatrimonialPartnerPreferenceItem> {
  const client = assertDb(db);
  try {
    const profile = await client.matrimonialProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new MatrimonialNotFoundError('Please create your matrimonial profile before setting partner preferences.');
    }

    const saved = await client.matrimonialPartnerPreference.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        minAge: input.minAge,
        maxAge: input.maxAge,
        minHeightCm: input.minHeightCm,
        maxHeightCm: input.maxHeightCm,
        maritalStatuses: input.maritalStatuses,
        manglik: input.manglik,
        diet: input.diet,
        preferredEducations: input.preferredEducations,
        preferredOccupations: input.preferredOccupations,
        preferredCities: input.preferredCities,
        preferredStates: input.preferredStates,
        minIncome: input.minIncome,
        notes: input.notes,
      },
      update: {
        minAge: input.minAge,
        maxAge: input.maxAge,
        minHeightCm: input.minHeightCm,
        maxHeightCm: input.maxHeightCm,
        maritalStatuses: input.maritalStatuses,
        manglik: input.manglik,
        diet: input.diet,
        preferredEducations: input.preferredEducations,
        preferredOccupations: input.preferredOccupations,
        preferredCities: input.preferredCities,
        preferredStates: input.preferredStates,
        minIncome: input.minIncome,
        notes: input.notes,
      },
    });

    return {
      id: saved.id,
      profileId: saved.profileId,
      minAge: saved.minAge,
      maxAge: saved.maxAge,
      minHeightCm: saved.minHeightCm,
      maxHeightCm: saved.maxHeightCm,
      maritalStatuses: saved.maritalStatuses as MaritalStatus[],
      manglik: (saved.manglik as ManglikStatus) || null,
      diet: (saved.diet as DietType) || null,
      preferredEducations: saved.preferredEducations,
      preferredOccupations: saved.preferredOccupations,
      preferredCities: saved.preferredCities,
      preferredStates: saved.preferredStates,
      minIncome: saved.minIncome,
      notes: saved.notes,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Submits the member's matrimonial profile for community admin approval.
 * - Profile must exist (404 if missing)
 * - Allowed only from DRAFT or REJECTED status (409 conflict otherwise)
 * - Validates completeness of required fields (400 validation error if incomplete)
 * - Atomically transitions status to PENDING_APPROVAL and clears rejectionReason
 * - Logs audit record
 */
export async function submitMyMatrimonialProfile(
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string },
  db?: PrismaClient
): Promise<OwnMatrimonialProfile> {
  const client = assertDb(db);
  try {
    const profile = await client.matrimonialProfile.findUnique({
      where: { userId },
      include: matrimonialProfileInclude,
    });

    if (!profile) {
      throw new MatrimonialNotFoundError(
        'Matrimonial profile not found. Please create and save your profile details before submitting for approval.'
      );
    }

    if (profile.status === 'PENDING_APPROVAL') {
      throw new MatrimonialServiceError(
        'Your matrimonial profile has already been submitted and is currently pending admin approval.',
        409
      );
    }

    if (profile.status === 'APPROVED') {
      throw new MatrimonialServiceError(
        'Your matrimonial profile is already approved and visible in discovery.',
        409
      );
    }

    if (profile.status === 'HIDDEN') {
      throw new MatrimonialServiceError(
        'Your matrimonial profile is hidden. Please contact an administrator to reactivate your profile.',
        409
      );
    }

    if (profile.status !== 'DRAFT' && profile.status !== 'REJECTED') {
      throw new MatrimonialServiceError(
        `Profile with status "${profile.status}" cannot be submitted for approval. Only DRAFT or REJECTED profiles may be submitted.`,
        409
      );
    }

    // Required fields completeness validation
    const fieldErrors: Record<string, string> = {};

    if (!profile.maritalStatus) {
      fieldErrors.maritalStatus = 'Marital status is required.';
    }
    if (!profile.heightCm || profile.heightCm < 120 || profile.heightCm > 250) {
      fieldErrors.heightCm = 'Height must be between 120 and 250 cm.';
    }
    if (!profile.highestEducation || profile.highestEducation.trim().length < 2) {
      fieldErrors.highestEducation = 'Highest education is required.';
    }
    if (!profile.occupation || profile.occupation.trim().length < 2) {
      fieldErrors.occupation = 'Occupation is required.';
    }
    if (!profile.annualIncome || profile.annualIncome.trim().length < 1) {
      fieldErrors.annualIncome = 'Annual income is required.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      const firstErrorMessage = Object.values(fieldErrors)[0];
      throw new MatrimonialValidationError(
        `Cannot submit profile. Required profile information is missing: ${firstErrorMessage}`,
        fieldErrors
      );
    }

    // Atomic status transition and audit log recording
    const updated = await client.$transaction(async (tx) => {
      const updateResult = await tx.matrimonialProfile.updateMany({
        where: {
          id: profile.id,
          userId,
          status: { in: ['DRAFT', 'REJECTED'] },
        },
        data: {
          status: 'PENDING_APPROVAL',
          rejectionReason: null,
        },
      });

      if (updateResult.count === 0) {
        throw new MatrimonialServiceError(
          'Profile submission could not be completed due to a concurrent state change. Please refresh your profile.',
          409
        );
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'MATRIMONIAL_PROFILE_SUBMITTED',
          targetType: 'MATRIMONIAL_PROFILE',
          targetId: profile.id,
          details: {
            previousStatus: profile.status,
            newStatus: 'PENDING_APPROVAL',
          },
          ipAddress: meta?.ipAddress || null,
          userAgent: meta?.userAgent || null,
        },
      });

      return tx.matrimonialProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: matrimonialProfileInclude,
      });
    });

    return mapToOwnMatrimonialProfile(updated);
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Uploads a matrimonial gallery photo (maximum 5 photos per profile).
 * Automatically marks the first photo as primary.
 */
export async function uploadMyMatrimonialPhoto(
  userId: string,
  fileBuffer: Buffer,
  claimedMime?: string,
  originalName: string = 'matrimonial.jpg',
  isPrimary?: boolean,
  db?: PrismaClient
): Promise<MatrimonialPhotoItem> {
  const client = assertDb(db);
  const profile = await client.matrimonialProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      photos: {
        select: { id: true, isPrimary: true, order: true },
      },
    },
  });

  if (!profile) {
    throw new MatrimonialNotFoundError('Please create your matrimonial profile before uploading photos.');
  }

  if (profile.photos.length >= 5) {
    throw new MatrimonialServiceError('You can upload a maximum of 5 matrimonial photos.', 400);
  }

  // 1. Upload to Supabase Storage
  const uploadResult = await uploadMatrimonialMedia(userId, fileBuffer, claimedMime, originalName);

  // 2. Determine primary photo status
  const shouldBePrimary = isPrimary !== undefined ? isPrimary : profile.photos.length === 0;

  try {
    // If setting as primary, unset previous primary
    if (shouldBePrimary && profile.photos.some((p) => p.isPrimary)) {
      await client.matrimonialPhoto.updateMany({
        where: { profileId: profile.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const nextOrder = profile.photos.length;

    const photo = await client.matrimonialPhoto.create({
      data: {
        profileId: profile.id,
        url: uploadResult.url,
        order: nextOrder,
        isPrimary: shouldBePrimary,
        isApproved: true,
      },
    });

    return {
      id: photo.id,
      profileId: photo.profileId,
      url: photo.url,
      order: photo.order,
      isPrimary: photo.isPrimary,
      isApproved: photo.isApproved,
      createdAt: photo.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    // Database write failed: safely clean up the uploaded storage object
    deleteStorageObjects([uploadResult.storagePath]).catch((cleanupErr) => {
      console.warn('[Matrimonial Service] Failed to clean up orphaned storage object:', cleanupErr);
    });

    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Deletes a matrimonial photo belonging to the authenticated member.
 * If the primary photo is deleted, promotes the next available photo to primary.
 */
export async function deleteMyMatrimonialPhoto(
  userId: string,
  photoId: string,
  db?: PrismaClient
): Promise<void> {
  const client = assertDb(db);
  try {
    const photo = await client.matrimonialPhoto.findUnique({
      where: { id: photoId },
      include: {
        profile: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!photo || photo.profile.userId !== userId) {
      throw new MatrimonialNotFoundError('Photo not found or unauthorized.');
    }

    const wasPrimary = photo.isPrimary;
    const profileId = photo.profileId;

    // Delete photo from database
    await client.matrimonialPhoto.delete({
      where: { id: photoId },
    });

    // If deleted photo was primary, promote oldest remaining photo to primary
    if (wasPrimary) {
      const remainingPhoto = await client.matrimonialPhoto.findFirst({
        where: { profileId },
        orderBy: { order: 'asc' },
      });

      if (remainingPhoto) {
        await client.matrimonialPhoto.update({
          where: { id: remainingPhoto.id },
          data: { isPrimary: true },
        });
      }
    }

    // Safely remove file from Supabase Storage with strict namespace check
    const storagePath = extractStoragePathFromUrl(photo.url);
    if (storagePath && storagePath.startsWith(`matrimonial/${userId}/`)) {
      deleteStorageObjects([storagePath]).catch((err) => {
        console.warn('[Matrimonial Service] Failed to remove storage object:', err);
      });
    }
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Calculates a user's age from their date of birth safely.
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
 * Lists discovery matrimonial profiles with multi-criteria filters and pagination.
 * STRICT PRIVACY: Returns only APPROVED profiles belonging to ACTIVE users.
 * STRICT ISOLATION: Excludes requesting user's own profile.
 * STRICT SECURITY: Never exposes phone, email, or passwords.
 */
export async function listDiscoveryProfiles(
  currentUserId: string,
  query: ListMatrimonialProfilesQueryInput,
  db?: PrismaClient
): Promise<PaginatedMatrimonialProfilesResponse> {
  const client = assertDb(db);
  const {
    gender,
    minAge,
    maxAge,
    minHeightCm,
    maxHeightCm,
    maritalStatus,
    city,
    state,
    subCaste,
    gotra,
    manglik,
    diet,
    education,
    occupation,
    page = 1,
    limit = 12,
  } = query;

  const skip = (page - 1) * limit;

  // Discovery criteria: Only APPROVED profiles belonging to ACTIVE users, excluding self
  const where: Prisma.MatrimonialProfileWhereInput = {
    status: 'APPROVED',
    user: {
      status: 'ACTIVE',
      id: { not: currentUserId },
    },
  };

  // Exclude blocked users (either user blocked them or they blocked current user)
  try {
    const blockedRecords = await (client as any).matrimonialBlock.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedUserId: currentUserId }],
      },
      select: { blockerId: true, blockedUserId: true },
    });
    const excludedUserIds = new Set<string>();
    for (const b of blockedRecords) {
      if (b.blockerId === currentUserId) excludedUserIds.add(b.blockedUserId);
      if (b.blockedUserId === currentUserId) excludedUserIds.add(b.blockerId);
    }
    if (excludedUserIds.size > 0) {
      where.userId = { notIn: Array.from(excludedUserIds) };
    }
  } catch (blockErr) {
    // Graceful fallback if table does not exist
  }

  if (gender) {
    where.user = {
      ...(where.user as Prisma.UserWhereInput),
      profile: {
        gender,
      },
    };
  }

  if (minAge !== undefined || maxAge !== undefined) {
    const now = new Date();
    const dobFilter: Prisma.DateTimeNullableFilter = {};
    if (minAge !== undefined) {
      const maxDob = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate());
      dobFilter.lte = maxDob;
    }
    if (maxAge !== undefined) {
      const minDob = new Date(now.getFullYear() - (maxAge + 1), now.getMonth(), now.getDate());
      dobFilter.gte = minDob;
    }
    where.user = {
      ...(where.user as Prisma.UserWhereInput),
      profile: {
        ...((where.user as Prisma.UserWhereInput)?.profile as Prisma.ProfileWhereInput),
        dateOfBirth: dobFilter,
      },
    };
  }

  if (minHeightCm !== undefined || maxHeightCm !== undefined) {
    where.heightCm = {};
    if (minHeightCm !== undefined) where.heightCm.gte = minHeightCm;
    if (maxHeightCm !== undefined) where.heightCm.lte = maxHeightCm;
  }

  if (maritalStatus) {
    where.maritalStatus = maritalStatus;
  }

  if (city && city.trim().length > 0) {
    const cleanCity = city.trim();
    where.OR = [
      { workCity: { contains: cleanCity, mode: 'insensitive' } },
      { user: { profile: { city: { contains: cleanCity, mode: 'insensitive' } } } },
    ];
  }

  if (state && state.trim().length > 0) {
    where.workState = { contains: state.trim(), mode: 'insensitive' };
  }

  if (subCaste && subCaste.trim().length > 0) {
    where.subCaste = { contains: subCaste.trim(), mode: 'insensitive' };
  }

  if (gotra && gotra.trim().length > 0) {
    where.gotra = { contains: gotra.trim(), mode: 'insensitive' };
  }

  if (manglik) {
    where.manglik = manglik;
  }

  if (diet) {
    where.diet = diet;
  }

  if (education && education.trim().length > 0) {
    where.highestEducation = { contains: education.trim(), mode: 'insensitive' };
  }

  if (occupation && occupation.trim().length > 0) {
    where.occupation = { contains: occupation.trim(), mode: 'insensitive' };
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
            where: { isApproved: true },
            select: { id: true, url: true, isPrimary: true, order: true },
            orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }],
          },
        },
      }),
    ]);

    // Check interaction status between current user and target profiles
    const targetUserIds = rawProfiles.map((p) => p.user.id);
    const interests =
      targetUserIds.length > 0
        ? await client.matrimonialInterest.findMany({
            where: {
              OR: [
                { senderId: currentUserId, receiverId: { in: targetUserIds } },
                { senderId: { in: targetUserIds }, receiverId: currentUserId },
              ],
            },
            select: {
              senderId: true,
              receiverId: true,
              status: true,
            },
          })
        : [];

    const interestMap = new Map<string, MatrimonialInterestStatus>();
    for (const item of interests) {
      const otherId = item.senderId === currentUserId ? item.receiverId : item.senderId;
      interestMap.set(otherId, item.status as MatrimonialInterestStatus);
    }

    const profiles: PublicMatrimonialProfileListItem[] = rawProfiles.map((raw) => {
      const p = raw.user.profile;
      const primaryPhoto = raw.photos.find((ph) => ph.isPrimary) || raw.photos[0] || null;
      const primaryPhotoUrl = primaryPhoto?.url || p?.avatarUrl || null;
      return {
        id: raw.id,
        userId: raw.user.id,
        fullName: p?.fullName || 'Community Member',
        gender: (p?.gender as Gender) || null,
        age: calculateAge(p?.dateOfBirth),
        city: raw.workCity || p?.city || null,
        state: raw.workState || p?.state || null,
        avatarUrl: p?.avatarUrl || null,
        primaryPhotoUrl,
        maritalStatus: raw.maritalStatus as MaritalStatus,
        heightCm: raw.heightCm,
        highestEducation: raw.highestEducation,
        employedIn: raw.employedIn as EmploymentSector,
        occupation: raw.occupation,
        annualIncome: raw.annualIncome,
        subCaste: raw.subCaste || p?.subCaste || null,
        gotra: raw.gotra || p?.gotra || null,
        manglik: raw.manglik as ManglikStatus,
        diet: raw.diet as DietType,
        photosCount: raw.photos.length,
        isVerified: (raw as any).isVerified ?? false,
        interestStatus: interestMap.get(raw.user.id) || null,
        createdAt: raw.createdAt.toISOString(),
      };
    });

    const totalPages = Math.ceil(total / limit);

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
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Retrieves safe profile details for a matrimonial profile by ID.
 * CONTACT PRIVACY: Unlocks contact phone ONLY if database confirms a mutually accepted interest.
 */
export async function getDiscoveryProfileById(
  currentUserId: string,
  profileId: string,
  db?: PrismaClient
): Promise<PublicMatrimonialProfileDetail> {
  const client = assertDb(db);
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
          where: { isApproved: true },
          orderBy: { order: 'asc' },
        },
        partnerPreference: true,
      },
    });

    if (!raw || raw.user.status !== 'ACTIVE') {
      throw new MatrimonialNotFoundError('Matrimonial profile not found.');
    }

    // Must be APPROVED unless viewing one's own profile
    if (raw.status !== 'APPROVED' && raw.userId !== currentUserId) {
      throw new MatrimonialNotFoundError('Matrimonial profile not found or not approved.');
    }

    // Check if privacy block exists between viewer and target
    if (raw.userId !== currentUserId) {
      try {
        const isBlocked = await (client as any).matrimonialBlock.findFirst({
          where: {
            OR: [
              { blockerId: currentUserId, blockedUserId: raw.userId },
              { blockerId: raw.userId, blockedUserId: currentUserId },
            ],
          },
        });
        if (isBlocked) {
          throw new MatrimonialNotFoundError('Matrimonial profile not found.');
        }
      } catch (blockErr) {
        if (blockErr instanceof MatrimonialNotFoundError) throw blockErr;
      }
    }

    // Check contact visibility via mutually accepted interest
    let interestStatus: MatrimonialInterestStatus | null = null;
    let unlockedContact: { phone: string; isMutualAccepted: boolean } | null = null;

    if (raw.userId === currentUserId) {
      unlockedContact = {
        phone: raw.user.phone,
        isMutualAccepted: true,
      };
    } else {
      const interest = await client.matrimonialInterest.findFirst({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: raw.userId },
            { senderId: raw.userId, receiverId: currentUserId },
          ],
        },
        select: { status: true },
      });

      if (interest) {
        interestStatus = interest.status as MatrimonialInterestStatus;
        if (interest.status === 'ACCEPTED') {
          unlockedContact = {
            phone: raw.user.phone,
            isMutualAccepted: true,
          };
        }
      }
    }

    const p = raw.user.profile;
    const primaryPhoto = raw.photos.find((ph) => ph.isPrimary) || raw.photos[0] || null;
    const primaryPhotoUrl = primaryPhoto?.url || p?.avatarUrl || null;
    return {
      id: raw.id,
      userId: raw.user.id,
      fullName: p?.fullName || 'Community Member',
      gender: (p?.gender as Gender) || null,
      age: calculateAge(p?.dateOfBirth),
      city: raw.workCity || p?.city || null,
      state: raw.workState || p?.state || null,
      avatarUrl: p?.avatarUrl || null,
      primaryPhotoUrl,
      isVerified: (raw as any).isVerified ?? false,
      maritalStatus: raw.maritalStatus as MaritalStatus,
      heightCm: raw.heightCm,
      weightKg: raw.weightKg,
      motherTongue: raw.motherTongue,
      religion: raw.religion,
      caste: raw.caste,
      subCaste: raw.subCaste || p?.subCaste || null,
      gotra: raw.gotra || p?.gotra || null,
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
      photosCount: raw.photos.length,
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
      interestStatus,
      unlockedContact,
      createdAt: raw.createdAt.toISOString(),
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Sends a matrimonial interest / connection request to another member.
 * STRICT CONSTRAINTS:
 * - Senders cannot send an interest to themselves.
 * - Both sender and receiver must have APPROVED matrimonial profiles.
 * - Senders cannot send duplicate requests if one already exists.
 * - Dispatches safe in-app notification only after DB commit.
 */
export async function sendInterest(
  currentUserId: string,
  input: SendMatrimonialInterestInput,
  db?: PrismaClient
): Promise<MatrimonialInterestItem> {
  const client = assertDb(db);
  const { receiverId, message } = input;

  if (receiverId === currentUserId) {
    throw new MatrimonialServiceError('You cannot send an interest request to yourself.', 400);
  }
  try {
    // 0. Verify no active block exists between sender and receiver in either direction
    const isBlocked = await (client as any).matrimonialBlock.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedUserId: receiverId },
          { blockerId: receiverId, blockedUserId: currentUserId },
        ],
      },
    });
    if (isBlocked) {
      throw new MatrimonialServiceError(
        'Cannot send interest request; interaction between these profiles is blocked.',
        403
      );
    }
    // 1. Verify receiver exists, is ACTIVE, and has an APPROVED matrimonial profile
    const receiver = await client.user.findUnique({
      where: { id: receiverId },
      select: {
        id: true,
        status: true,
        matrimonialProfile: {
          select: { id: true, status: true },
        },
      },
    });

    if (
      !receiver ||
      receiver.status !== 'ACTIVE' ||
      !receiver.matrimonialProfile ||
      receiver.matrimonialProfile.status !== 'APPROVED'
    ) {
      throw new MatrimonialNotFoundError('Target member does not have an active approved matrimonial profile.');
    }

    // 2. Verify sender has an APPROVED matrimonial profile
    const senderProfile = await client.matrimonialProfile.findUnique({
      where: { userId: currentUserId },
      select: { id: true, status: true },
    });

    if (!senderProfile || senderProfile.status !== 'APPROVED') {
      throw new MatrimonialServiceError(
        'You must have an approved matrimonial profile before sending interest requests.',
        400
      );
    }

    // 3. Check for existing interest in either direction
    const existing = await client.matrimonialInterest.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId },
          { senderId: receiverId, receiverId: currentUserId },
        ],
      },
    });

    if (existing) {
      if (existing.senderId === currentUserId) {
        if (existing.status === 'PENDING') {
          throw new MatrimonialServiceError('You have already sent a pending interest request to this member.', 409);
        }
        if (existing.status === 'ACCEPTED') {
          throw new MatrimonialServiceError('You already have an accepted connection with this member.', 409);
        }
        if (existing.status === 'DECLINED') {
          throw new MatrimonialServiceError('Your previous interest request was declined.', 409);
        }
        if (existing.status === 'WITHDRAWN') {
          throw new MatrimonialServiceError('Your previous interest request was withdrawn.', 409);
        }
      } else {
        if (existing.status === 'PENDING') {
          throw new MatrimonialServiceError(
            'This member has already sent you an interest request. You can accept their request instead.',
            409
          );
        }
        if (existing.status === 'ACCEPTED') {
          throw new MatrimonialServiceError('You already have an accepted connection with this member.', 409);
        }
      }
    }

    // 4. Create the interest
    const interest = await client.matrimonialInterest.create({
      data: {
        senderId: currentUserId,
        receiverId,
        message: message ? message.trim() : null,
        status: 'PENDING',
      },
    });

    // 5. Side-effect: Dispatch in-app notification after successful DB commit
    sendNotificationSafely(
      {
        recipientId: receiverId,
        actorId: currentUserId,
        type: 'MATRIMONIAL_INTEREST_RECEIVED',
        title: 'New Matrimonial Interest',
        message: 'A member has expressed interest in your matrimonial profile.',
        entityType: 'MATRIMONIAL_INTEREST',
        entityId: interest.id,
      },
      client
    );

    return {
      id: interest.id,
      senderId: interest.senderId,
      receiverId: interest.receiverId,
      status: interest.status as MatrimonialInterestStatus,
      message: interest.message,
      respondedAt: interest.respondedAt ? interest.respondedAt.toISOString() : null,
      createdAt: interest.createdAt.toISOString(),
      updatedAt: interest.updatedAt.toISOString(),
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    const prismaErr = err as { code?: string };
    if (prismaErr.code === 'P2002') {
      throw new MatrimonialServiceError('An interest request already exists with this member.', 409);
    }
    throw err;
  }
}

/**
 * Lists received interest requests for the authenticated user.
 */
export async function listReceivedInterests(
  currentUserId: string,
  page: number = 1,
  limit: number = 20,
  db?: PrismaClient
): Promise<PaginatedMatrimonialInterestsResponse> {
  const client = assertDb(db);
  const skip = (page - 1) * limit;

  try {
    const [total, items] = await Promise.all([
      client.matrimonialInterest.count({
        where: { receiverId: currentUserId },
      }),
      client.matrimonialInterest.findMany({
        where: { receiverId: currentUserId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
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
              matrimonialProfile: {
                select: {
                  id: true,
                  maritalStatus: true,
                  heightCm: true,
                  highestEducation: true,
                  employedIn: true,
                  occupation: true,
                  annualIncome: true,
                  subCaste: true,
                  gotra: true,
                  manglik: true,
                  diet: true,
                  createdAt: true,
                  photos: {
                    where: { isApproved: true },
                    select: { id: true, url: true, isPrimary: true, order: true },
                    orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }],
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const interests: MatrimonialInterestItem[] = items.map((item) => {
      let otherPartyProfile: PublicMatrimonialProfileListItem | null = null;
      const s = item.sender;
      const mp = s.matrimonialProfile;
      const p = s.profile;
      if (mp) {
        const primaryPhoto = mp.photos.find((ph) => ph.isPrimary) || mp.photos[0] || null;
        const primaryPhotoUrl = primaryPhoto?.url || p?.avatarUrl || null;
        otherPartyProfile = {
          id: mp.id,
          userId: s.id,
          fullName: p?.fullName || 'Community Member',
          gender: (p?.gender as Gender) || null,
          age: calculateAge(p?.dateOfBirth),
          city: p?.city || null,
          state: p?.state || null,
          avatarUrl: p?.avatarUrl || null,
          primaryPhotoUrl,
          maritalStatus: mp.maritalStatus as MaritalStatus,
          heightCm: mp.heightCm,
          highestEducation: mp.highestEducation,
          employedIn: mp.employedIn as EmploymentSector,
          occupation: mp.occupation,
          annualIncome: mp.annualIncome,
          subCaste: mp.subCaste || p?.subCaste || null,
          gotra: mp.gotra || p?.gotra || null,
          manglik: mp.manglik as ManglikStatus,
          diet: mp.diet as DietType,
          photosCount: mp.photos.length,
          interestStatus: item.status as MatrimonialInterestStatus,
          createdAt: mp.createdAt.toISOString(),
        };
      }

      return {
        id: item.id,
        senderId: item.senderId,
        receiverId: item.receiverId,
        status: item.status as MatrimonialInterestStatus,
        message: item.message,
        respondedAt: item.respondedAt ? item.respondedAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        otherPartyProfile,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      interests,
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
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Lists sent interest requests created by the authenticated user.
 */
export async function listSentInterests(
  currentUserId: string,
  page: number = 1,
  limit: number = 20,
  db?: PrismaClient
): Promise<PaginatedMatrimonialInterestsResponse> {
  const client = assertDb(db);
  const skip = (page - 1) * limit;

  try {
    const [total, items] = await Promise.all([
      client.matrimonialInterest.count({
        where: { senderId: currentUserId },
      }),
      client.matrimonialInterest.findMany({
        where: { senderId: currentUserId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          receiver: {
            select: {
              id: true,
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
              matrimonialProfile: {
                select: {
                  id: true,
                  maritalStatus: true,
                  heightCm: true,
                  highestEducation: true,
                  employedIn: true,
                  occupation: true,
                  annualIncome: true,
                  subCaste: true,
                  gotra: true,
                  manglik: true,
                  diet: true,
                  createdAt: true,
                  photos: {
                    where: { isApproved: true },
                    select: { id: true, url: true, isPrimary: true, order: true },
                    orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }],
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const interests: MatrimonialInterestItem[] = items.map((item) => {
      let otherPartyProfile: PublicMatrimonialProfileListItem | null = null;
      const r = item.receiver;
      const mp = r.matrimonialProfile;
      const p = r.profile;
      if (mp) {
        const primaryPhoto = mp.photos.find((ph) => ph.isPrimary) || mp.photos[0] || null;
        const primaryPhotoUrl = primaryPhoto?.url || p?.avatarUrl || null;
        otherPartyProfile = {
          id: mp.id,
          userId: r.id,
          fullName: p?.fullName || 'Community Member',
          gender: (p?.gender as Gender) || null,
          age: calculateAge(p?.dateOfBirth),
          city: p?.city || null,
          state: p?.state || null,
          avatarUrl: p?.avatarUrl || null,
          primaryPhotoUrl,
          maritalStatus: mp.maritalStatus as MaritalStatus,
          heightCm: mp.heightCm,
          highestEducation: mp.highestEducation,
          employedIn: mp.employedIn as EmploymentSector,
          occupation: mp.occupation,
          annualIncome: mp.annualIncome,
          subCaste: mp.subCaste || p?.subCaste || null,
          gotra: mp.gotra || p?.gotra || null,
          manglik: mp.manglik as ManglikStatus,
          diet: mp.diet as DietType,
          photosCount: mp.photos.length,
          interestStatus: item.status as MatrimonialInterestStatus,
          createdAt: mp.createdAt.toISOString(),
        };
      }

      return {
        id: item.id,
        senderId: item.senderId,
        receiverId: item.receiverId,
        status: item.status as MatrimonialInterestStatus,
        message: item.message,
        respondedAt: item.respondedAt ? item.respondedAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        otherPartyProfile,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      interests,
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
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}

/**
 * Responds to a matrimonial interest request (ACCEPT, DECLINE, WITHDRAW).
 * STRICT OWNERSHIP & TRANSITION RULES:
 * - Only receiver can ACCEPT or DECLINE.
 * - Only sender can WITHDRAW.
 * - Only PENDING requests can be responded to.
 * - Notification dispatched to sender upon acceptance.
 */
export async function respondToInterest(
  currentUserId: string,
  interestId: string,
  input: RespondMatrimonialInterestInput,
  db?: PrismaClient
): Promise<MatrimonialInterestItem> {
  const client = assertDb(db);
  const { status } = input;

  try {
    const interest = await client.matrimonialInterest.findUnique({
      where: { id: interestId },
    });

    if (!interest) {
      throw new MatrimonialNotFoundError('Interest request not found.');
    }

    if (status === 'ACCEPTED') {
      const isBlocked = await (client as any).matrimonialBlock.findFirst({
        where: {
          OR: [
            { blockerId: interest.senderId, blockedUserId: interest.receiverId },
            { blockerId: interest.receiverId, blockedUserId: interest.senderId },
          ],
        },
      });
      if (isBlocked) {
        throw new MatrimonialServiceError(
          'Cannot accept interest request; interaction between these profiles is blocked.',
          403
        );
      }
    }
    if (status === 'ACCEPTED' || status === 'DECLINED') {
      if (interest.receiverId !== currentUserId) {
        throw new MatrimonialServiceError(
          'Only the recipient of this interest request can accept or decline it.',
          403
        );
      }
      if (interest.status !== 'PENDING') {
        throw new MatrimonialServiceError(
          `Cannot ${status.toLowerCase()} an interest request that is already ${interest.status.toLowerCase()}.`,
          400
        );
      }
    } else if (status === 'WITHDRAWN') {
      if (interest.senderId !== currentUserId) {
        throw new MatrimonialServiceError(
          'Only the sender of this interest request can withdraw it.',
          403
        );
      }
      if (interest.status !== 'PENDING') {
        throw new MatrimonialServiceError(
          `Cannot withdraw an interest request that is already ${interest.status.toLowerCase()}.`,
          400
        );
      }
    } else {
      throw new MatrimonialServiceError(`Invalid status transition to ${status}.`, 400);
    }

    const updated = await client.matrimonialInterest.update({
      where: { id: interestId },
      data: {
        status,
        respondedAt: new Date(),
      },
    });

    // Notify sender when interest request is accepted
    if (status === 'ACCEPTED') {
      sendNotificationSafely(
        {
          recipientId: interest.senderId,
          actorId: currentUserId,
          type: 'MATRIMONIAL_INTEREST_ACCEPTED',
          title: 'Matrimonial Interest Accepted',
          message: 'Your matrimonial interest request was accepted! Contact details are now unlocked.',
          entityType: 'MATRIMONIAL_INTEREST',
          entityId: interest.id,
        },
        client
      );
    }

    return {
      id: updated.id,
      senderId: updated.senderId,
      receiverId: updated.receiverId,
      status: updated.status as MatrimonialInterestStatus,
      message: updated.message,
      respondedAt: updated.respondedAt ? updated.respondedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  } catch (err: unknown) {
    if (isMatrimonialTableMissingError(err)) {
      console.warn('[Matrimonial Service] Table does not exist in database (migration pending):', err);
      throw new MatrimonialMigrationPendingError();
    }
    throw err;
  }
}


// ---------------------------------------------------------------------------
// 4. Verification Documents Management
// ---------------------------------------------------------------------------

/**
 * Uploads a verification document for member's matrimonial profile.
 */
export async function uploadVerificationDocument(
  userId: string,
  input: UploadMatrimonialDocumentInput,
  fileBuffer: Buffer,
  originalName: string,
  db?: PrismaClient
): Promise<MatrimonialDocumentItem> {
  const client = assertDb(db);
  const profile = await client.matrimonialProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    throw new MatrimonialNotFoundError('Matrimonial profile not found. Please create your profile first.');
  }

  // Enforce max 5 documents
  const docCount = await (client as any).matrimonialDocument.count({
    where: { profileId: profile.id },
  });
  if (docCount >= 5) {
    throw new MatrimonialServiceError('You can upload a maximum of 5 verification documents.', 400);
  }

  const uploadResult = await uploadMatrimonialVerificationDocument(userId, fileBuffer, originalName);

  const doc = await (client as any).matrimonialDocument.create({
    data: {
      profileId: profile.id,
      documentType: input.documentType,
      documentName: input.documentName,
      storagePath: uploadResult.storagePath,
      fileSize: uploadResult.fileSizeBytes,
      mimeType: uploadResult.mimeType,
      status: 'PENDING',
    },
  });

  return {
    id: doc.id,
    profileId: doc.profileId,
    documentType: doc.documentType as MatrimonialDocumentType,
    documentName: doc.documentName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    status: doc.status as MatrimonialDocumentStatus,
    rejectionReason: doc.rejectionReason,
    reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Lists submitted verification documents for current member's matrimonial profile.
 */
export async function listMyVerificationDocuments(
  userId: string,
  db?: PrismaClient
): Promise<MatrimonialDocumentItem[]> {
  const client = assertDb(db);
  const profile = await client.matrimonialProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    return [];
  }

  const docs = await (client as any).matrimonialDocument.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
  });

  return docs.map((d: any) => ({
    id: d.id,
    profileId: d.profileId,
    documentType: d.documentType as MatrimonialDocumentType,
    documentName: d.documentName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    status: d.status as MatrimonialDocumentStatus,
    rejectionReason: d.rejectionReason,
    reviewedAt: d.reviewedAt ? d.reviewedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

/**
 * Deletes a submitted verification document if pending or rejected.
 */
export async function deleteMyVerificationDocument(
  userId: string,
  documentId: string,
  db?: PrismaClient
): Promise<void> {
  const client = assertDb(db);
  const profile = await client.matrimonialProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    throw new MatrimonialNotFoundError('Profile not found.');
  }

  const doc = await (client as any).matrimonialDocument.findFirst({
    where: { id: documentId, profileId: profile.id },
  });
  if (!doc) {
    throw new MatrimonialNotFoundError('Document not found.');
  }

  if (doc.status === 'APPROVED') {
    throw new MatrimonialServiceError('Approved verification documents cannot be deleted. Please contact support.', 400);
  }

  await (client as any).matrimonialDocument.delete({
    where: { id: documentId },
  });

  if (doc.storagePath) {
    await deleteMatrimonialDocumentObject(doc.storagePath);
  try {
    const approvedGovId = await (client as any).matrimonialDocument.findFirst({
      where: {
        profileId: profile.id,
        status: 'APPROVED',
        documentType: 'GOVERNMENT_ID',
      },
    });
    if (!approvedGovId) {
      await (client as any).matrimonialProfile.update({
        where: { id: profile.id },
        data: { isVerified: false, verifiedAt: null, verifiedById: null },
      });
    }
  } catch {
    // Graceful fallback
  }
  }
}

// ---------------------------------------------------------------------------
// 5. Reporting & Blocking Profiles
// ---------------------------------------------------------------------------

/**
 * Reports a matrimonial profile with categorized reason and optional description.
 */
export async function reportMatrimonialProfile(
  reporterId: string,
  profileId: string,
  input: CreateMatrimonialReportInput,
  db?: PrismaClient
): Promise<void> {
  const client = assertDb(db);
  const target = await client.matrimonialProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true },
  });
  if (!target) {
    throw new MatrimonialNotFoundError('Target matrimonial profile not found.');
  }

  if (target.userId === reporterId) {
    throw new MatrimonialServiceError('You cannot report your own profile.', 400);
  }

  const existing = await (client as any).matrimonialReport.findFirst({
    where: { reporterId, reportedProfileId: profileId },
  });
  if (existing) {
    throw new MatrimonialServiceError('You have already submitted a report for this profile.', 409);
  }

  await (client as any).matrimonialReport.create({
    data: {
      reporterId,
      reportedProfileId: profileId,
      reason: input.reason,
      explanation: input.explanation || null,
      status: 'PENDING',
    },
  });
}

/**
 * Blocks another member's profile, hiding them from discovery and interactions.
 */
export async function blockMatrimonialProfile(
  userId: string,
  profileId: string,
  db?: PrismaClient
): Promise<void> {
  const client = assertDb(db);
  const target = await client.matrimonialProfile.findUnique({
    where: { id: profileId },
    select: { userId: true },
  });
  if (!target) {
    throw new MatrimonialNotFoundError('Matrimonial profile not found.');
  }

  if (target.userId === userId) {
    throw new MatrimonialServiceError('You cannot block yourself.', 400);
  }

  await (client as any).matrimonialBlock.upsert({
    where: {
      blockerId_blockedUserId: {
        blockerId: userId,
        blockedUserId: target.userId,
      },
    },
    create: {
      blockerId: userId,
      blockedUserId: target.userId,
    },
    update: {},
  });
}

/**
 * Unblocks a previously blocked member.
 */
export async function unblockMatrimonialProfile(
  userId: string,
  profileId: string,
  db?: PrismaClient
): Promise<void> {
  const client = assertDb(db);
  const target = await client.matrimonialProfile.findUnique({
    where: { id: profileId },
    select: { userId: true },
  });
  if (!target) {
    throw new MatrimonialNotFoundError('Matrimonial profile not found.');
  }

  await (client as any).matrimonialBlock.deleteMany({
    where: {
      blockerId: userId,
      blockedUserId: target.userId,
    },
  });
}

/**
 * Lists members currently blocked by the requesting user.
 */
export async function listMyBlockedUsers(
  userId: string,
  db?: PrismaClient
): Promise<MatrimonialBlockItem[]> {
  const client = assertDb(db);
  const blocks = await (client as any).matrimonialBlock.findMany({
    where: { blockerId: userId },
    include: {
      blockedUser: {
        select: {
          id: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return blocks.map((b: any) => ({
    id: b.id,
    blockedUserId: b.blockedUserId,
    blockedUserName: b.blockedUser?.profile?.fullName || 'Community Member',
    createdAt: b.createdAt.toISOString(),
  }));
}

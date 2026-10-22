import { z } from 'zod';

export const matrimonialProfileStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'HIDDEN',
]);

export const maritalStatusSchema = z.enum([
  'NEVER_MARRIED',
  'DIVORCED',
  'WIDOWED',
  'AWAITING_DIVORCE',
]);

export const manglikStatusSchema = z.enum([
  'MANGLIK',
  'NON_MANGLIK',
  'ANSHIK',
  'DONT_KNOW',
]);

export const employmentSectorSchema = z.enum([
  'PRIVATE_SECTOR',
  'GOVERNMENT_PSU',
  'BUSINESS_SELF_EMPLOYED',
  'DEFENSE',
  'NOT_WORKING',
]);

export const familyTypeSchema = z.enum(['NUCLEAR', 'JOINT']);

export const familyValuesSchema = z.enum(['TRADITIONAL', 'MODERATE', 'LIBERAL']);

export const dietTypeSchema = z.enum([
  'VEGETARIAN',
  'NON_VEGETARIAN',
  'EGGETARIAN',
  'JAIN',
]);

export const habitFrequencySchema = z.enum(['NO', 'YES', 'OCCASIONALLY']);

export const matrimonialInterestStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
]);

/**
 * Validation schema for creating or updating a matrimonial profile.
 */
export const upsertMatrimonialProfileSchema = z
  .object({
    maritalStatus: maritalStatusSchema,
    heightCm: z.number().int().min(120, 'Height must be at least 120 cm').max(250, 'Height cannot exceed 250 cm'),
    weightKg: z.number().int().min(30).max(300).optional().nullable(),
    motherTongue: z.string().trim().min(2).max(50).default('Hindi'),
    religion: z.string().trim().min(2).max(50).default('Hindu'),
    caste: z.string().trim().max(50).optional().nullable(),
    subCaste: z.string().trim().max(50).optional().nullable(),
    gotra: z.string().trim().max(50).optional().nullable(),
    manglik: manglikStatusSchema.default('DONT_KNOW'),

    birthTime: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, 'Birth time must be in HH:MM format')
      .optional()
      .nullable(),
    birthCity: z.string().trim().max(100).optional().nullable(),
    rashi: z.string().trim().max(50).optional().nullable(),
    nakshatra: z.string().trim().max(50).optional().nullable(),

    highestEducation: z.string().trim().min(2, 'Highest education is required').max(100),
    educationDetails: z.string().trim().max(300).optional().nullable(),
    employedIn: employmentSectorSchema.default('PRIVATE_SECTOR'),
    occupation: z.string().trim().min(2, 'Occupation is required').max(100),
    companyName: z.string().trim().max(100).optional().nullable(),
    annualIncome: z.string().trim().min(1, 'Annual income is required').max(50),
    workCity: z.string().trim().max(100).optional().nullable(),
    workState: z.string().trim().max(100).optional().nullable(),
    workCountry: z.string().trim().max(100).default('India'),

    familyType: familyTypeSchema.default('NUCLEAR'),
    familyValues: familyValuesSchema.default('TRADITIONAL'),
    fatherName: z.string().trim().max(100).optional().nullable(),
    fatherOccupation: z.string().trim().max(100).optional().nullable(),
    motherName: z.string().trim().max(100).optional().nullable(),
    motherOccupation: z.string().trim().max(100).optional().nullable(),
    brothersCount: z.number().int().min(0).max(20).default(0),
    brothersMarried: z.number().int().min(0).max(20).default(0),
    sistersCount: z.number().int().min(0).max(20).default(0),
    sistersMarried: z.number().int().min(0).max(20).default(0),
    familyNativePlace: z.string().trim().max(100).optional().nullable(),
    aboutFamily: z.string().trim().max(2000).optional().nullable(),

    diet: dietTypeSchema.default('VEGETARIAN'),
    smoking: habitFrequencySchema.default('NO'),
    drinking: habitFrequencySchema.default('NO'),

    aboutMe: z.string().trim().max(3000).optional().nullable(),
    partnerExpectations: z.string().trim().max(3000).optional().nullable(),
  })
  .refine((data) => data.brothersMarried <= data.brothersCount, {
    message: 'Married brothers count cannot exceed total brothers count',
    path: ['brothersMarried'],
  })
  .refine((data) => data.sistersMarried <= data.sistersCount, {
    message: 'Married sisters count cannot exceed total sisters count',
    path: ['sistersMarried'],
  });

export type UpsertMatrimonialProfileInput = z.infer<typeof upsertMatrimonialProfileSchema>;

/**
 * Validation schema for updating partner preferences.
 */
export const updatePartnerPreferenceSchema = z
  .object({
    minAge: z.number().int().min(18, 'Minimum age must be at least 18').max(80).default(18),
    maxAge: z.number().int().min(18).max(80, 'Maximum age cannot exceed 80').default(45),
    minHeightCm: z.number().int().min(120).max(250).default(140),
    maxHeightCm: z.number().int().min(120).max(250).default(210),
    maritalStatuses: z.array(maritalStatusSchema).default([]),
    manglik: manglikStatusSchema.optional().nullable(),
    diet: dietTypeSchema.optional().nullable(),
    preferredEducations: z.array(z.string().trim().max(100)).max(15).default([]),
    preferredOccupations: z.array(z.string().trim().max(100)).max(15).default([]),
    preferredCities: z.array(z.string().trim().max(100)).max(15).default([]),
    preferredStates: z.array(z.string().trim().max(100)).max(15).default([]),
    minIncome: z.string().trim().max(50).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((data) => data.minAge <= data.maxAge, {
    message: 'Minimum age cannot be greater than maximum age',
    path: ['minAge'],
  })
  .refine((data) => data.minHeightCm <= data.maxHeightCm, {
    message: 'Minimum height cannot be greater than maximum height',
    path: ['minHeightCm'],
  });

export type UpdatePartnerPreferenceInput = z.infer<typeof updatePartnerPreferenceSchema>;

/**
 * Validation schema for expressing / sending interest.
 */
export const sendMatrimonialInterestSchema = z.object({
  receiverId: z.string().uuid('Invalid receiver user ID'),
  message: z.string().trim().max(500, 'Message cannot exceed 500 characters').optional().nullable(),
});

export type SendMatrimonialInterestInput = z.infer<typeof sendMatrimonialInterestSchema>;

/**
 * Validation schema for responding to an interest request.
 */
export const respondMatrimonialInterestSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED', 'WITHDRAWN'], {
    errorMap: () => ({ message: 'Status must be ACCEPTED, DECLINED, or WITHDRAWN' }),
  }),
});

export type RespondMatrimonialInterestInput = z.infer<typeof respondMatrimonialInterestSchema>;

/**
 * Validation schema for querying discovery matrimonial profiles.
 */
export const listMatrimonialProfilesQuerySchema = z.object({
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  minAge: z.coerce.number().int().min(18).max(80).optional(),
  maxAge: z.coerce.number().int().min(18).max(80).optional(),
  minHeightCm: z.coerce.number().int().min(120).max(250).optional(),
  maxHeightCm: z.coerce.number().int().min(120).max(250).optional(),
  maritalStatus: maritalStatusSchema.optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  subCaste: z.string().trim().max(100).optional(),
  gotra: z.string().trim().max(100).optional(),
  manglik: manglikStatusSchema.optional(),
  diet: dietTypeSchema.optional(),
  education: z.string().trim().max(100).optional(),
  occupation: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export type ListMatrimonialProfilesQueryInput = z.infer<typeof listMatrimonialProfilesQuerySchema>;

/**
 * Validation schema for admin matrimonial profile moderation.
 */
export const adminModerateMatrimonialProfileSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED', 'HIDDEN']),
    rejectionReason: z.string().trim().min(5).max(500).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.status === 'REJECTED') {
        return Boolean(data.rejectionReason && data.rejectionReason.length >= 5);
      }
      return true;
    },
    {
      message: 'Rejection reason is required when rejecting a matrimonial profile',
      path: ['rejectionReason'],
    }
  );

export type AdminModerateMatrimonialProfileInput = z.infer<typeof adminModerateMatrimonialProfileSchema>;

/**
 * Validation schema for admin listing matrimonial profiles.
 */
export const listAdminMatrimonialProfilesQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'HIDDEN', 'ALL'])
    .optional()
    .default('PENDING_APPROVAL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
});

export type ListAdminMatrimonialProfilesQueryInput = z.infer<
  typeof listAdminMatrimonialProfilesQuerySchema
>;

/**
 * Validation schema for admin photo moderation.
 */
export const adminModerateMatrimonialPhotoSchema = z.object({
  isApproved: z.boolean(),
});

export type AdminModerateMatrimonialPhotoInput = z.infer<
  typeof adminModerateMatrimonialPhotoSchema
>;

import { z } from 'zod';
import { normalizeIndianPhone, indianPhoneRegex } from './phone.js';
import type { BulkImportMemberRow } from '@apnasamaj/shared-types';

/**
 * Security boundary: Fields that must NEVER be accepted from imported spreadsheet rows.
 * Prevents privilege escalation, authentication bypass, status spoofing, and tenant crossing.
 */
export const FORBIDDEN_BULK_IMPORT_FIELDS = [
  'role',
  'password',
  'passwordHash',
  'status',
  'tenantId',
  'tenant',
  'community',
  'communitySlug',
  'db',
  'isPhoneVerified',
  'id',
  'userId',
] as const;

/**
 * Checks a raw parsed record for any forbidden administrative or security keys.
 * Returns a list of offending keys found.
 */
export function checkForbiddenImportFields(raw: Record<string, unknown>): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const lowerKeys = Object.keys(raw).map((k) => k.toLowerCase().trim());
  return FORBIDDEN_BULK_IMPORT_FIELDS.filter((forbidden) =>
    lowerKeys.includes(forbidden.toLowerCase())
  );
}

/**
 * Validates member full name:
 * - Trims whitespace
 * - Minimum 2 characters, maximum 100 characters
 */
export const bulkImportFullNameSchema = z
  .string({ required_error: 'Full name is required' })
  .trim()
  .min(2, 'Full name must be at least 2 characters')
  .max(100, 'Full name must not exceed 100 characters');

/**
 * Validates and normalizes Indian mobile numbers for bulk import:
 * - Accepts 10 digits (e.g. 9876543210), leading 0, 91 prefix, or +91 prefix
 * - Normalizes to E.164 (+91XXXXXXXXXX) using canonical normalizeIndianPhone
 * - Validates against standard Indian mobile regex (/^\+91[6-9]\d{9}$/)
 * - Tolerates numeric cell inputs from Excel spreadsheets
 */
export const bulkImportPhoneSchema = z.preprocess(
  (val) => {
    if (typeof val === 'number') {
      return String(Math.floor(val));
    }
    if (typeof val === 'string') {
      return val.trim();
    }
    return val;
  },
  z
    .string({ required_error: 'Mobile number is required' })
    .min(10, 'Mobile number must be at least 10 digits')
    .transform((val) => normalizeIndianPhone(val))
    .refine((val) => indianPhoneRegex.test(val), {
      message: 'Invalid Indian mobile number. Must be a 10-digit number starting with 6, 7, 8, or 9.',
    })
);

/**
 * Validates and normalizes gender:
 * - Accepts MALE, FEMALE, OTHER (case-insensitive e.g. "Male", "female", "M", "F")
 * - Treats null, undefined, or empty string as null
 */
export const bulkImportGenderSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') {
      const trimmed = val.trim().toUpperCase();
      if (trimmed === '') return null;
      if (trimmed === 'M' || trimmed === 'MALE') return 'MALE';
      if (trimmed === 'F' || trimmed === 'FEMALE') return 'FEMALE';
      if (trimmed === 'O' || trimmed === 'OTHER') return 'OTHER';
      return trimmed;
    }
    return val;
  },
  z
    .enum(['MALE', 'FEMALE', 'OTHER'], {
      errorMap: () => ({ message: 'Gender must be MALE, FEMALE, or OTHER' }),
    })
    .nullable()
    .optional()
);

/**
 * Optional string field helper with trimming, empty-string-to-null coercion, and length limits.
 */
function optionalStringSchema(fieldName: string, maxLen = 100) {
  return z.preprocess(
    (val) => {
      if (val === null || val === undefined) return null;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed === '' ? null : trimmed;
      }
      return String(val).trim();
    },
    z
      .string()
      .max(maxLen, `${fieldName} must not exceed ${maxLen} characters`)
      .nullable()
      .optional()
  );
}

export const bulkImportCitySchema = optionalStringSchema('City', 100);
export const bulkImportStateSchema = optionalStringSchema('State', 100);
export const bulkImportSubCasteSchema = optionalStringSchema('Sub-caste', 100);
export const bulkImportGotraSchema = optionalStringSchema('Gotra', 100);

/**
 * Strict schema for an individual member import row:
 * - Rejects any unauthorized keys (role, password, status, tenant, etc.)
 * - Validates required fields: fullName, phone
 * - Normalizes optional fields: gender, city, state, subCaste, gotra
 */
export const bulkImportRowSchema = z
  .object({
    fullName: bulkImportFullNameSchema,
    phone: bulkImportPhoneSchema,
    gender: bulkImportGenderSchema.default(null),
    city: bulkImportCitySchema.default(null),
    state: bulkImportStateSchema.default(null),
    subCaste: bulkImportSubCasteSchema.default(null),
    gotra: bulkImportGotraSchema.default(null),
  })
  .strict();

export type BulkImportRowInput = z.infer<typeof bulkImportRowSchema>;

/**
 * Execution options schema:
 * Controls duplicate skipping behavior during batch execution.
 */
export const bulkImportOptionsSchema = z.object({
  skipExisting: z.coerce.boolean().default(true),
});

export type BulkImportOptions = z.infer<typeof bulkImportOptionsSchema>;

/**
 * Helper to validate a raw parsed row and extract clean typed data or detailed errors.
 */
export function validateBulkImportRow(
  raw: Record<string, unknown>,
  rowNumber: number
): { success: true; data: BulkImportMemberRow } | { success: false; errors: Array<{ field: string; message: string; rowNumber: number; value?: string | null }> } {
  // First check forbidden fields
  const forbiddenKeys = checkForbiddenImportFields(raw);
  if (forbiddenKeys.length > 0) {
    return {
      success: false,
      errors: forbiddenKeys.map((key) => ({
        rowNumber,
        field: key,
        value: String(raw[key] ?? ''),
        message: `Security violation: Field "${key}" is strictly forbidden in bulk import.`,
      })),
    };
  }

  const result = bulkImportRowSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.errors.map((err) => ({
      rowNumber,
      field: err.path.join('.') || 'row',
      value: err.path.length > 0 ? String(raw[err.path[0]] ?? '') : undefined,
      message: err.message,
    }));
    return { success: false, errors };
  }

  return { success: true, data: result.data as BulkImportMemberRow };
}


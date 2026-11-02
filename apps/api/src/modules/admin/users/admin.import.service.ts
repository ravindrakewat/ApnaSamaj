import crypto from 'node:crypto';
import {
  PrismaClient,
  Role as DbRole,
  UserStatus as DbUserStatus,
  Prisma,
} from '@apnasamaj/database';
import type {
  AuthUser,
  BulkImportPreviewSummary,
  BulkImportExecuteResult,
  BulkImportRowError,
  BulkImportPreviewRow,
} from '@apnasamaj/shared-types';
import type { BulkImportOptions } from '@apnasamaj/validation';
import {
  generateImportTemplate,
  parseExcelBuffer,
  ParsedExcelRow,
  ExcelServiceError,
} from './excel.service';
import { hashPassword } from '../../auth/auth.password';

export class AdminImportError extends ExcelServiceError {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode);
    this.name = 'AdminImportError';
  }
}

function assertDb(db?: PrismaClient): PrismaClient {
  if (!db) {
    throw new AdminImportError(
      'Tenant database client is required for member bulk import.',
      400
    );
  }
  return db;
}

/**
 * Streams the pre-formatted Excel import template.
 */
export async function getImportTemplate(): Promise<Buffer> {
  return generateImportTemplate();
}

/**
 * Dry-run preview of an Excel upload:
 * - Parses and validates spreadsheet buffer.
 * - Detects intra-file duplicate phone numbers.
 * - Queries the target tenant database to identify already registered members.
 * - ZERO database writes performed.
 */
export async function previewBulkImport(
  fileBuffer: Buffer,
  db?: PrismaClient
): Promise<BulkImportPreviewSummary> {
  const client = assertDb(db);

  // 1. Parse Excel buffer and run schema validations
  const parseResult = await parseExcelBuffer(fileBuffer);

  // 2. Extract candidate phone numbers from valid rows
  const candidatePhones = parseResult.validRows.map((r) => r.data.phone);

  // 3. Query target community database for existing registrations
  const existingUsers =
    candidatePhones.length > 0
      ? await client.user.findMany({
          where: { phone: { in: candidatePhones } },
          select: { phone: true },
        })
      : [];

  const existingPhoneSet = new Set(existingUsers.map((u) => u.phone));

  let validCount = 0;
  let existingInDbCount = 0;
  const previewRows: BulkImportPreviewRow[] = [];
  const errors: BulkImportRowError[] = [...parseResult.errors];

  // 4. Correlate with database records to build accurate preview
  for (const row of parseResult.allPreviewRows) {
    if (row.status === 'VALID' && existingPhoneSet.has(row.phone)) {
      existingInDbCount++;
      const existingError: BulkImportRowError = {
        rowNumber: row.rowNumber,
        field: 'phone',
        value: row.phone,
        message: 'Mobile number is already registered in this community database.',
      };
      errors.push(existingError);
      previewRows.push({
        ...row,
        status: 'EXISTING_IN_DB',
        errors: [existingError.message],
      });
    } else {
      if (row.status === 'VALID') {
        validCount++;
      }
      previewRows.push(row);
    }
  }

  return {
    totalRows: parseResult.totalDataRows,
    validCount,
    duplicateInFileCount: parseResult.duplicateInFileRows.length,
    existingInDbCount,
    invalidFormatCount: parseResult.invalidRows.length,
    previewRows: previewRows.slice(0, 50), // Cap preview grid to first 50 rows
    errors,
  };
}

const CHUNK_SIZE = 50;

/**
 * Executes atomic bulk member import:
 * - Re-validates data from scratch (stateless, zero-trust).
 * - Identifies and safely skips existing accounts without overwriting them.
 * - Assigns strict least-privileged Role.MEMBER in backend code.
 * - Follows approval workflow: assigns UserStatus.PENDING and isPhoneVerified: false.
 * - Generates high-entropy cryptographic dummy password hashes (Argon2id).
 * - Inserts User + Profile records atomically within chunked transaction boundaries.
 * - Records an immutable AuditLog entry for administrator accountability.
 */
export async function executeBulkImport(
  fileBuffer: Buffer,
  options: BulkImportOptions,
  actor: AuthUser,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient,
  communitySlug?: string
): Promise<BulkImportExecuteResult> {
  const client = assertDb(db);

  // 1. Re-validate uploaded spreadsheet from scratch
  const parseResult = await parseExcelBuffer(fileBuffer);

  // 2. Identify existing accounts in tenant database
  const candidatePhones = parseResult.validRows.map((r) => r.data.phone);
  const existingUsers =
    candidatePhones.length > 0
      ? await client.user.findMany({
          where: { phone: { in: candidatePhones } },
          select: { phone: true },
        })
      : [];

  const existingPhoneSet = new Set(existingUsers.map((u) => u.phone));

  let skippedExistingCount = 0;
  const rowsToImport: ParsedExcelRow[] = [];

  for (const row of parseResult.validRows) {
    if (existingPhoneSet.has(row.data.phone)) {
      skippedExistingCount++;
    } else {
      rowsToImport.push(row);
    }
  }

  let importedCount = 0;
  let failedCount = parseResult.invalidRows.length;
  const errors: BulkImportRowError[] = [...parseResult.errors];

  // 3. Process candidate rows in transaction chunks of 50
  for (let i = 0; i < rowsToImport.length; i += CHUNK_SIZE) {
    const chunk = rowsToImport.slice(i, i + CHUNK_SIZE);

    try {
      await client.$transaction(async (tx) => {
        for (const item of chunk) {
          // Cryptographically secure dummy password hash (Argon2id)
          const dummyPlaintext = crypto.randomBytes(32).toString('hex');
          const passwordHash = await hashPassword(dummyPlaintext);

          await tx.user.create({
            data: {
              phone: item.data.phone,
              passwordHash,
              role: DbRole.MEMBER, // Strict least-privilege
              status: DbUserStatus.PENDING, // Existing account approval policy
              isPhoneVerified: false, // Must be verified by member upon claiming
              profile: {
                create: {
                  fullName: item.data.fullName,
                  gender: item.data.gender ? (item.data.gender as any) : null,
                  city: item.data.city || null,
                  state: item.data.state || null,
                  subCaste: item.data.subCaste || null,
                  gotra: item.data.gotra || null,
                },
              },
            },
          });
          importedCount++;
        }
      });
    } catch (chunkError: unknown) {
      // If chunk transaction fails (e.g. concurrent insert race condition),
      // retry members individually within this chunk to maximize partial import success
      for (const item of chunk) {
        try {
          const dummyPlaintext = crypto.randomBytes(32).toString('hex');
          const passwordHash = await hashPassword(dummyPlaintext);

          await client.user.create({
            data: {
              phone: item.data.phone,
              passwordHash,
              role: DbRole.MEMBER,
              status: DbUserStatus.PENDING,
              isPhoneVerified: false,
              profile: {
                create: {
                  fullName: item.data.fullName,
                  gender: item.data.gender ? (item.data.gender as any) : null,
                  city: item.data.city || null,
                  state: item.data.state || null,
                  subCaste: item.data.subCaste || null,
                  gotra: item.data.gotra || null,
                },
              },
            },
          });
          importedCount++;
        } catch (singleError: unknown) {
          // Check for Prisma unique constraint race condition (P2002)
          if (
            singleError instanceof Prisma.PrismaClientKnownRequestError &&
            singleError.code === 'P2002'
          ) {
            skippedExistingCount++;
          } else {
            failedCount++;
            errors.push({
              rowNumber: item.rowNumber,
              field: 'database',
              message:
                (singleError as Error)?.message || 'Database insertion error.',
            });
          }
        }
      }
    }
  }

  // 4. Create immutable AuditLog entry in target tenant database
  let auditLogId: string | undefined;
  try {
    const auditLog = await client.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'USER_BULK_IMPORT',
        targetType: 'COMMUNITY',
        targetId: communitySlug || 'kewat',
        details: {
          totalRows: parseResult.totalDataRows,
          importedCount,
          skippedExistingCount,
          skippedDuplicateCount: parseResult.duplicateInFileRows.length,
          failedCount,
        },
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
    auditLogId = auditLog.id;
  } catch (auditErr) {
    console.warn('[Admin Import Service] Failed to create audit log entry:', auditErr);
  }

  return {
    totalRows: parseResult.totalDataRows,
    importedCount,
    skippedExistingCount,
    skippedDuplicateCount: parseResult.duplicateInFileRows.length,
    failedCount,
    errors,
    auditLogId,
  };
}


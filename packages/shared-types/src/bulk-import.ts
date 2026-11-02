import { Gender } from './user.js';

/**
 * Validated row payload representing a member to be imported from an Excel row.
 * Strictly decoupled from database internals, roles, passwords, or tenant IDs.
 */
export interface BulkImportMemberRow {
  fullName: string;
  phone: string; // Normalized E.164 (+91XXXXXXXXXX)
  gender?: Gender | null;
  city?: string | null;
  state?: string | null;
  subCaste?: string | null;
  gotra?: string | null;
}

/**
 * Status of an individual row during validation or import processing.
 */
export type BulkImportRowStatus =
  | 'VALID'
  | 'DUPLICATE_IN_FILE'
  | 'EXISTING_IN_DB'
  | 'INVALID_FORMAT';

/**
 * Granular row-level error reporting for preview and failure analysis.
 */
export interface BulkImportRowError {
  rowNumber: number;
  field: string;
  value?: string | null;
  message: string;
}

/**
 * Preview representation of an Excel row displayed to administrators prior to execution.
 */
export interface BulkImportPreviewRow {
  rowNumber: number;
  fullName: string;
  phone: string;
  gender?: Gender | null;
  city?: string | null;
  state?: string | null;
  subCaste?: string | null;
  gotra?: string | null;
  status: BulkImportRowStatus;
  errors?: string[];
}

/**
 * Comprehensive summary of an Excel dry-run preview.
 */
export interface BulkImportPreviewSummary {
  totalRows: number;
  validCount: number;
  duplicateInFileCount: number;
  existingInDbCount: number;
  invalidFormatCount: number;
  previewRows: BulkImportPreviewRow[];
  errors: BulkImportRowError[];
}

/**
 * Execution request options for bulk import.
 */
export interface BulkImportExecuteOptions {
  skipExisting?: boolean;
}

/**
 * Outcome of an executed bulk member import transaction.
 */
export interface BulkImportExecuteResult {
  totalRows: number;
  importedCount: number;
  skippedExistingCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  errors: BulkImportRowError[];
  auditLogId?: string;
}


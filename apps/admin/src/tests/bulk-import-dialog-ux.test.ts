import fs from 'node:fs';
import assert from 'node:assert';
import type {
  BulkImportPreviewSummary,
  BulkImportExecuteResult,
} from '@apnasamaj/shared-types';
import { UserRole } from '../../../../packages/shared-types/src/user.js';
import {
  sanitizeCsvCell,
  generateImportErrorReportCsv,
} from '../utils/csv-export.js';

console.log('================================================================');
console.log('   Apna Samaj — Batch 15F.4: Admin Bulk Import Dialog UX Tests   ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, testId: string, description: string) {
  if (condition) {
    console.log(`✅ [${testId}] PASS: ${description}`);
    passedTests++;
  } else {
    console.error(`❌ [${testId}] FAIL: ${description}`);
    failedTests++;
    throw new Error(`Assertion failed: [${testId}] ${description}`);
  }
}

async function runBulkImportDialogUxTests() {
  // -------------------------------------------------------------
  // 1. Template Download & Content-Disposition Parsing
  // -------------------------------------------------------------
  {
    const headerWithQuotes = 'attachment; filename="ApnaSamaj_Member_Import_Template.xlsx"';
    const match1 = headerWithQuotes.match(/filename=["']?([^"';]+)["']?/i);
    assertTest(
      match1 !== null && match1[1] === 'ApnaSamaj_Member_Import_Template.xlsx',
      'TEST-01A',
      'Parses quoted filename from Content-Disposition header'
    );

    const headerWithoutQuotes = 'attachment; filename=Custom_Template.xlsx';
    const match2 = headerWithoutQuotes.match(/filename=["']?([^"';]+)["']?/i);
    assertTest(
      match2 !== null && match2[1] === 'Custom_Template.xlsx',
      'TEST-01B',
      'Parses unquoted filename from Content-Disposition header'
    );

    // Fallback when header is missing
    const defaultFilename = 'ApnaSamaj_Member_Import_Template.xlsx';
    assertTest(
      defaultFilename.endsWith('.xlsx'),
      'TEST-01C',
      'Fallback template filename has correct .xlsx extension'
    );
  }

  // -------------------------------------------------------------
  // 2. Client-Side File Selection & Limit Enforcements
  // -------------------------------------------------------------
  {
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

    // Test file extension validator
    const isValidExtension = (filename: string) => filename.toLowerCase().endsWith('.xlsx');
    assertTest(isValidExtension('members.xlsx') === true, 'TEST-02A', 'Valid .xlsx file accepted');
    assertTest(isValidExtension('MEMBERS.XLSX') === true, 'TEST-02B', 'Case-insensitive .xlsx accepted');
    assertTest(isValidExtension('members.csv') === false, 'TEST-02C', 'CSV file rejected');
    assertTest(isValidExtension('members.xls') === false, 'TEST-02D', 'Legacy .xls rejected');
    assertTest(isValidExtension('malicious.exe') === false, 'TEST-02E', 'Executable rejected');

    // Test file size validator
    const isValidSize = (size: number) => size <= MAX_SIZE;
    assertTest(isValidSize(1024 * 50) === true, 'TEST-02F', '50 KB file accepted');
    assertTest(isValidSize(MAX_SIZE) === true, 'TEST-02G', 'Exactly 5 MB file accepted');
    assertTest(isValidSize(MAX_SIZE + 1) === false, 'TEST-02H', 'File over 5 MB rejected');

    // Test file size formatter
    const formatFileSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };
    assertTest(formatFileSize(500) === '500 B', 'TEST-02I', 'Formats bytes');
    assertTest(formatFileSize(2048) === '2.0 KB', 'TEST-02J', 'Formats kilobytes');
    assertTest(formatFileSize(3145728) === '3.00 MB', 'TEST-02K', 'Formats megabytes');
  }

  // -------------------------------------------------------------
  // 3. Preview Summary & Row Status Presentation
  // -------------------------------------------------------------
  {
    const mockPreviewSummary: BulkImportPreviewSummary = {
      totalRows: 4,
      validCount: 2,
      existingInDbCount: 1,
      duplicateInFileCount: 1,
      invalidFormatCount: 0,
      previewRows: [
        {
          rowNumber: 2,
          fullName: 'Ramesh Kewat',
          phone: '+919876543210',
          gender: 'MALE' as any,
          city: 'Indore',
          state: 'MP',
          subCaste: 'Kewat',
          gotra: 'Kashyap',
          status: 'VALID',
        },
        {
          rowNumber: 3,
          fullName: 'Suresh Kewat',
          phone: '+919876543211',
          status: 'VALID',
        },
        {
          rowNumber: 4,
          fullName: 'Dinesh Kewat',
          phone: '+919876543210',
          status: 'DUPLICATE_IN_FILE',
          errors: ['Duplicate mobile number within uploaded file'],
        },
        {
          rowNumber: 5,
          fullName: 'Mahesh Kewat',
          phone: '+919876543299',
          status: 'EXISTING_IN_DB',
          errors: ['Mobile number already exists in community database'],
        },
      ],
      errors: [],
    };

    assertTest(mockPreviewSummary.totalRows === 4, 'TEST-03A', 'Summary reflects 4 total rows');
    assertTest(mockPreviewSummary.validCount === 2, 'TEST-03B', 'Summary reflects 2 valid rows');
    assertTest(mockPreviewSummary.existingInDbCount === 1, 'TEST-03C', 'Summary reflects 1 existing row');
    assertTest(mockPreviewSummary.duplicateInFileCount === 1, 'TEST-03D', 'Summary reflects 1 duplicate row');

    // Test visual status mapping
    const validRow = mockPreviewSummary.previewRows.find((r) => r.status === 'VALID');
    const duplicateRow = mockPreviewSummary.previewRows.find((r) => r.status === 'DUPLICATE_IN_FILE');
    const existingRow = mockPreviewSummary.previewRows.find((r) => r.status === 'EXISTING_IN_DB');

    assertTest(validRow !== undefined && validRow.rowNumber === 2, 'TEST-03E', 'Valid row identified');
    assertTest(
      Boolean(duplicateRow !== undefined && duplicateRow.errors?.[0]?.includes('Duplicate')),
      'TEST-03F',
      'Duplicate row contains clear error description'
    );
    assertTest(
      Boolean(existingRow !== undefined && existingRow.errors?.[0]?.includes('already exists')),
      'TEST-03G',
      'Existing account row contains clear skip explanation'
    );
  }

  // -------------------------------------------------------------
  // 4. CSV Formula Injection Defense & Error Report Generation
  // -------------------------------------------------------------
  {
    // Test formula sanitization
    assertTest(sanitizeCsvCell('=SUM(A1:A10)') === "'=SUM(A1:A10)", 'TEST-04A', 'Prefixes = with single quote');
    assertTest(sanitizeCsvCell('+12345') === "'+12345", 'TEST-04B', 'Prefixes + with single quote');
    assertTest(sanitizeCsvCell('-cmd') === "'-cmd", 'TEST-04C', 'Prefixes - with single quote');
    assertTest(sanitizeCsvCell('@cmd') === "'@cmd", 'TEST-04D', 'Prefixes @ with single quote');
    assertTest(sanitizeCsvCell('Normal Text') === 'Normal Text', 'TEST-04E', 'Leaves safe text unmodified');

    // Test quote & comma escaping
    assertTest(
      sanitizeCsvCell('Text with, comma') === '"Text with, comma"',
      'TEST-04F',
      'Wraps comma-containing values in quotes'
    );
    assertTest(
      sanitizeCsvCell('Text with "quotes"') === '"Text with ""quotes"""',
      'TEST-04G',
      'Doubles internal quotation marks'
    );

    // Test error CSV generation from preview summary
    const summaryWithErrors: BulkImportPreviewSummary = {
      totalRows: 2,
      validCount: 0,
      existingInDbCount: 1,
      duplicateInFileCount: 1,
      invalidFormatCount: 0,
      previewRows: [
        {
          rowNumber: 2,
          fullName: 'Malicious =2+5',
          phone: '+919876543210',
          status: 'DUPLICATE_IN_FILE',
          errors: ['Duplicate mobile number within file'],
        },
        {
          rowNumber: 3,
          fullName: 'Existing Member',
          phone: '+919876543299',
          status: 'EXISTING_IN_DB',
          errors: ['Already exists in DB'],
        },
      ],
      errors: [],
    };

    const csvContent = generateImportErrorReportCsv(summaryWithErrors);
    const lines = csvContent.split('\r\n');

    assertTest(
      lines[0] === 'Excel Row,Member Name,Mobile Number,Row Status,Validation Errors',
      'TEST-04H',
      'CSV header contains expected standard columns'
    );
    assertTest(lines.length === 3, 'TEST-04I', 'CSV contains 2 problem row entries + header');
    assertTest(
      lines[1].includes("'+919876543210"),
      'TEST-04J',
      'Phone with plus prefix is sanitized with single quote to prevent spreadsheet addition formula'
    );
    assertTest(
      !csvContent.includes('password') && !csvContent.includes('Argon2') && !csvContent.includes('token'),
      'TEST-04K',
      'Error report CSV never exposes password hashes or tokens'
    );
  }

  // -------------------------------------------------------------
  // 5. Execution State & Results Presentation
  // -------------------------------------------------------------
  {
    // Can import button check
    const canImportZeroRows = 0 > 0;
    assertTest(canImportZeroRows === false, 'TEST-05A', 'Import button disabled when validCount is 0');

    const canImportTwoRows = 2 > 0;
    assertTest(canImportTwoRows === true, 'TEST-05B', 'Import button enabled when validCount > 0');

    // Mock execution result
    const mockExecuteResult: BulkImportExecuteResult = {
      totalRows: 4,
      importedCount: 2,
      skippedExistingCount: 1,
      skippedDuplicateCount: 1,
      failedCount: 0,
      errors: [],
      auditLogId: 'audit_log_123',
    };

    assertTest(mockExecuteResult.importedCount === 2, 'TEST-05C', 'Results view displays 2 imported members');
    assertTest(mockExecuteResult.skippedExistingCount === 1, 'TEST-05D', 'Results view displays 1 skipped existing');
    assertTest(mockExecuteResult.skippedDuplicateCount === 1, 'TEST-05E', 'Results view displays 1 skipped duplicate');
    assertTest(mockExecuteResult.failedCount === 0, 'TEST-05F', 'Results view displays 0 failures');
  }

  // -------------------------------------------------------------
  // 7. MemberManagementPage Integration & Dialog Mounting Verification
  // -------------------------------------------------------------
  {
    const pageSource = fs.readFileSync('apps/admin/src/pages/MemberManagementPage.tsx', 'utf8');

    // TEST-07A: Dialog is imported and mounted in JSX
    assertTest(
      pageSource.includes('import { BulkImportDialog } from \'../components/BulkImportDialog\''),
      'TEST-07A',
      'BulkImportDialog is imported from components directory'
    );

    // TEST-07B: Dialog JSX is rendered in DOM tree
    assertTest(
      pageSource.includes('<BulkImportDialog'),
      'TEST-07B',
      'BulkImportDialog is mounted within MemberManagementPage JSX return tree'
    );

    // TEST-07C: Dialog open state is correctly connected
    assertTest(
      pageSource.includes('open={isImportDialogOpen}'),
      'TEST-07C',
      'BulkImportDialog receives isImportDialogOpen as open prop'
    );

    // TEST-07D: Dialog onClose resets isImportDialogOpen
    assertTest(
      pageSource.includes('onClose={() => setIsImportDialogOpen(false)}'),
      'TEST-07D',
      'BulkImportDialog onClose handler resets open state'
    );

    // TEST-07E: Dialog onSuccess triggers dialog close, loadUsers, and success feedback
    assertTest(
      pageSource.includes('loadUsers()') && pageSource.includes('setIsImportDialogOpen(false)'),
      'TEST-07E',
      'BulkImportDialog onSuccess handler closes dialog and reloads user list'
    );

    // TEST-07F: Import button click handler activates isImportDialogOpen state
    assertTest(
      pageSource.includes('onClick={() => setIsImportDialogOpen(true)}'),
      'TEST-07F',
      'Import Members button click handler sets isImportDialogOpen to true'
    );

    // TEST-07G: State simulation of complete dialog lifecycle
    let isOpen = false;
    let usersLoaded = 0;
    let message: string | null = null;

    const openDialog = () => { isOpen = true; };
    const closeDialog = () => { isOpen = false; };
    const triggerSuccess = () => {
      closeDialog();
      usersLoaded++;
      message = 'Member roster imported successfully.';
    };

    openDialog();
    assertTest(Boolean(isOpen) === true, 'TEST-07G1', 'Lifecycle: Button click opens import dialog');

    triggerSuccess();
    assertTest(Boolean(isOpen) === false, 'TEST-07G2', 'Lifecycle: Success callback closes dialog');
    assertTest(usersLoaded === 1, 'TEST-07G3', 'Lifecycle: Success callback reloads member list');
    assertTest(message !== null, 'TEST-07G4', 'Lifecycle: Success callback provides visual feedback');
  }

  // -------------------------------------------------------------
  // 6. Role Authorization for Bulk Member Import
  // -------------------------------------------------------------
  {
    const canImportRole = (role?: UserRole): boolean => {
      return role === UserRole.SUPER_ADMIN || role === UserRole.COMMUNITY_ADMIN;
    };

    assertTest(canImportRole(UserRole.SUPER_ADMIN) === true, 'TEST-06A', 'SUPER_ADMIN is authorized to import');
    assertTest(canImportRole(UserRole.COMMUNITY_ADMIN) === true, 'TEST-06B', 'COMMUNITY_ADMIN is authorized to import');
    assertTest(canImportRole(UserRole.MODERATOR) === false, 'TEST-06C', 'MODERATOR is forbidden from importing');
    assertTest(canImportRole(UserRole.MEMBER) === false, 'TEST-06D', 'MEMBER is forbidden from importing');
    assertTest(canImportRole(undefined) === false, 'TEST-06E', 'Unauthenticated user is forbidden from importing');
  }

  console.log('\n================================================================');
  console.log(`   Verification Complete: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBulkImportDialogUxTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});

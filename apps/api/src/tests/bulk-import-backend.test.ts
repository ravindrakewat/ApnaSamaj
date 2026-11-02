import ExcelJS from 'exceljs';
import {
  generateImportTemplate,
  parseExcelBuffer,
  ExcelValidationError,
} from '../modules/admin/users/excel.service';
import {
  previewBulkImport,
  executeBulkImport,
  AdminImportError,
} from '../modules/admin/users/admin.import.service';
import { UserRole, UserStatus, AuthUser } from '@apnasamaj/shared-types';
import { Prisma } from '@apnasamaj/database';

async function createTestXlsxBuffer(
  headers: string[],
  rows: Array<Array<unknown>>,
  sheetName = 'Members'
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  for (const r of rows) {
    ws.addRow(r);
  }
  const raw = await wb.xlsx.writeBuffer();
  return Buffer.from(raw);
}

async function runBulkImportBackendTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Backend Bulk Member Import Verification Tests   ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // 1. Template Generation Tests
  // -------------------------------------------------------------
  try {
    const templateBuffer = await generateImportTemplate();
    assert(Buffer.isBuffer(templateBuffer) && templateBuffer.length > 0, 'Template generator returns non-empty Buffer');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(templateBuffer as any);

    const sheetNames = wb.worksheets.map((s) => s.name);
    assert(sheetNames.includes('Members'), 'Template contains "Members" worksheet');
    assert(sheetNames.includes('Instructions'), 'Template contains "Instructions" worksheet');

    const membersSheet = wb.getWorksheet('Members')!;
    const headerRow = membersSheet.getRow(1);
    const headers = [1, 2, 3, 4, 5, 6, 7].map((i) => headerRow.getCell(i).value);
    assert(headers[0] === 'Full Name', 'Column 1 is "Full Name"');
    assert(headers[1] === 'Mobile Number', 'Column 2 is "Mobile Number"');
    assert(headers[2] === 'Gender', 'Column 3 is "Gender"');
    assert(headers[3] === 'City', 'Column 4 is "City"');
    assert(headers[4] === 'State', 'Column 5 is "State"');
    assert(headers[5] === 'Sub-Caste', 'Column 6 is "Sub-Caste"');
    assert(headers[6] === 'Gotra', 'Column 7 is "Gotra"');

    assert(membersSheet.rowCount >= 3, 'Template includes header and sample rows');

    const instSheet = wb.getWorksheet('Instructions')!;
    assert(instSheet.rowCount >= 5, 'Instructions worksheet contains formatted guidelines');
  } catch (err) {
    assert(false, `Template generation threw error: ${err}`);
  }

  // -------------------------------------------------------------
  // 2. Parsing Valid XLSX Files
  // -------------------------------------------------------------
  try {
    const validBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number', 'Gender', 'City', 'State', 'Sub-Caste', 'Gotra'],
      [
        ['Ramesh Kewat', '9876543210', 'MALE', 'Indore', 'Madhya Pradesh', 'Kewat', 'Kashyap'],
        ['Suresh Mallah', '+919123456780', 'MALE', 'Bhopal', 'Madhya Pradesh', 'Mallah', 'Vashistha'],
      ]
    );

    const res = await parseExcelBuffer(validBuf);
    assert(res.totalDataRows === 2, 'Total rows parsed is 2');
    assert(res.validRows.length === 2, 'Valid rows count is 2');
    assert(res.validRows[0].data.phone === '+919876543210', 'First phone normalized to E.164');
    assert(res.validRows[1].data.phone === '+919123456780', 'Second phone normalized to E.164');
  } catch (err) {
    assert(false, `Valid parse threw error: ${err}`);
  }

  // -------------------------------------------------------------
  // 3. Malformed and Oversized File Rejections
  // -------------------------------------------------------------
  try {
    const corruptBuf = Buffer.from('NOT AN EXCEL FILE CONTENT');
    await parseExcelBuffer(corruptBuf);
    assert(false, 'Corrupt buffer must be rejected');
  } catch (err) {
    assert(err instanceof ExcelValidationError, 'Corrupt buffer rejected with ExcelValidationError');
  }

  try {
    const oversizedBuf = Buffer.alloc(5.2 * 1024 * 1024, 0);
    await parseExcelBuffer(oversizedBuf);
    assert(false, 'Oversized buffer (>5MB) must be rejected');
  } catch (err) {
    assert(err instanceof ExcelValidationError, 'Oversized buffer rejected with ExcelValidationError');
  }

  // -------------------------------------------------------------
  // 4. Missing and Duplicated Required Headers
  // -------------------------------------------------------------
  try {
    // Missing Mobile Number header
    const missingMobileBuf = await createTestXlsxBuffer(
      ['Full Name', 'City'],
      [['Ramesh Kewat', 'Indore']]
    );
    await parseExcelBuffer(missingMobileBuf);
    assert(false, 'Missing required header must be rejected');
  } catch (err) {
    assert(err instanceof ExcelValidationError, 'Missing required header rejected with ExcelValidationError');
  }

  try {
    // Duplicated Mobile Number header
    const dupHeaderBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number', 'Phone'],
      [['Ramesh Kewat', '9876543210', '9876543210']]
    );
    await parseExcelBuffer(dupHeaderBuf);
    assert(false, 'Duplicated header must be rejected');
  } catch (err) {
    assert(err instanceof ExcelValidationError, 'Duplicated header rejected with ExcelValidationError');
  }

  // -------------------------------------------------------------
  // 5. Forbidden Security Headers Rejection
  // -------------------------------------------------------------
  const forbiddenHeaders = ['Role', 'Password', 'PasswordHash', 'Status', 'TenantId', 'CommunitySlug', 'db'];
  for (const forbidden of forbiddenHeaders) {
    try {
      const maliciousBuf = await createTestXlsxBuffer(
        ['Full Name', 'Mobile Number', forbidden],
        [['Hacker', '9876543210', 'SUPER_ADMIN']]
      );
      await parseExcelBuffer(maliciousBuf);
      assert(false, `Header with forbidden field "${forbidden}" must be rejected`);
    } catch (err) {
      assert(err instanceof ExcelValidationError, `Forbidden header "${forbidden}" rejected with ExcelValidationError`);
    }
  }

  // -------------------------------------------------------------
  // 6. Unrecognized Headers Rejection
  // -------------------------------------------------------------
  try {
    const unrecognizedBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number', 'Salary'],
      [['Ramesh Kewat', '9876543210', '100000']]
    );
    await parseExcelBuffer(unrecognizedBuf);
    assert(false, 'Unrecognized header column must be rejected');
  } catch (err) {
    assert(err instanceof ExcelValidationError, 'Unrecognized column "Salary" rejected with ExcelValidationError');
  }

  // -------------------------------------------------------------
  // 7. Formula Injection Rejection in Data Cells
  // -------------------------------------------------------------
  try {
    const formulaWb = new ExcelJS.Workbook();
    const formulaWs = formulaWb.addWorksheet('Members');
    formulaWs.addRow(['Full Name', 'Mobile Number', 'Gender']);
    const injectedRow = formulaWs.addRow(['Formula User', '9876543210', 'MALE']);
    injectedRow.getCell(2).value = { formula: 'CONCAT("+91", "9876543210")', result: '+919876543210' } as any;

    const formulaBuf = Buffer.from(await formulaWb.xlsx.writeBuffer());
    const parseRes = await parseExcelBuffer(formulaBuf);

    assert(parseRes.invalidRows.length === 1, 'Formula injection row flagged as invalid');
    assert(
      parseRes.errors.some((e) => e.message.includes('Formulas are strictly prohibited')),
      'Formula injection error specifically reported'
    );
  } catch (err) {
    assert(false, `Formula test threw unexpected error: ${err}`);
  }

  // -------------------------------------------------------------
  // 8. Intra-file Duplicate Detection
  // -------------------------------------------------------------
  try {
    const dupPhoneBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number'],
      [
        ['Ramesh Kewat', '9876543210'],
        ['Duplicate Ramesh', '98765-43210'], // Same normalized phone
      ]
    );

    const dupRes = await parseExcelBuffer(dupPhoneBuf);
    assert(dupRes.totalDataRows === 2, 'Total rows is 2');
    assert(dupRes.validRows.length === 1, 'Valid rows count is 1');
    assert(dupRes.duplicateInFileRows.length === 1, 'Duplicate in file count is 1');
    assert(dupRes.duplicateInFileRows[0].firstRowNumber === 2, 'Identified original row number 2');
  } catch (err) {
    assert(false, `Duplicate phone parse threw error: ${err}`);
  }

  // -------------------------------------------------------------
  // 9. Dry-Run Preview with Mock Database (Zero Database Writes)
  // -------------------------------------------------------------
  try {
    let writeOperationsAttempted = 0;
    const mockDb = {
      user: {
        findMany: async ({ where }: any) => {
          // Simulate +919876543210 already exists in DB
          if (where?.phone?.in?.includes('+919876543210')) {
            return [{ phone: '+919876543210' }];
          }
          return [];
        },
        create: async () => {
          writeOperationsAttempted++;
          throw new Error('Dry run must never write to user table!');
        },
        update: async () => {
          writeOperationsAttempted++;
          throw new Error('Dry run must never update user table!');
        },
      },
      profile: {
        create: async () => {
          writeOperationsAttempted++;
          throw new Error('Dry run must never write to profile table!');
        },
      },
    } as unknown as any;

    const previewBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number'],
      [
        ['Existing User', '9876543210'], // In DB
        ['Brand New User', '9123456789'], // Not in DB
        ['Brand New User 2', '9123456789'], // Duplicate of row 3
        ['Invalid User', '12345'], // Invalid phone
      ]
    );

    const preview = await previewBulkImport(previewBuf, mockDb);
    assert(preview.totalRows === 4, 'Preview totalRows is 4');
    assert(preview.validCount === 1, 'Preview validCount is 1 (only Brand New User)');
    assert(preview.existingInDbCount === 1, 'Preview existingInDbCount is 1 (Existing User)');
    assert(preview.duplicateInFileCount === 1, 'Preview duplicateInFileCount is 1');
    assert(preview.invalidFormatCount === 1, 'Preview invalidFormatCount is 1');
    assert(writeOperationsAttempted === 0, 'ZERO database write operations attempted during preview dry-run');
  } catch (err) {
    assert(false, `Preview dry-run threw error: ${err}`);
  }

  // -------------------------------------------------------------
  // 10. Execute Bulk Import with Strict Invariants
  // -------------------------------------------------------------
  try {
    const createdUsers: any[] = [];
    let auditLogCreated: any = null;

    const mockDb = {
      user: {
        findMany: async ({ where }: any) => {
          if (where?.phone?.in?.includes('+919876543210')) {
            return [{ phone: '+919876543210' }];
          }
          return [];
        },
        create: async ({ data }: any) => {
          createdUsers.push(data);
          return { id: `user-uuid-${createdUsers.length}`, ...data };
        },
      },
      auditLog: {
        create: async ({ data }: any) => {
          auditLogCreated = data;
          return { id: 'audit-log-uuid-1', ...data };
        },
      },
      $transaction: async (cb: any) => {
        return cb(mockDb);
      },
    } as unknown as any;

    const execBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number', 'Gender', 'City'],
      [
        ['Existing User', '9876543210', 'MALE', 'Indore'], // Existing -> skip
        ['New Member', '9123456789', 'FEMALE', 'Bhopal'], // Valid new member
      ]
    );

    const mockAdmin: AuthUser = {
      id: 'admin-uuid-1',
      phone: '+919999999999',
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
    };

    const execResult = await executeBulkImport(
      execBuf,
      { skipExisting: true },
      mockAdmin,
      '127.0.0.1',
      'AntigravityTestRunner/1.0',
      mockDb,
      'kewat'
    );

    assert(execResult.totalRows === 2, 'Execution totalRows is 2');
    assert(execResult.importedCount === 1, 'Execution importedCount is 1');
    assert(execResult.skippedExistingCount === 1, 'Execution skippedExistingCount is 1');
    assert(execResult.failedCount === 0, 'Execution failedCount is 0');

    // Verify created user invariants
    assert(createdUsers.length === 1, 'Exactly 1 user record created');
    const newUser = createdUsers[0];
    assert(newUser.role === 'MEMBER', 'Imported user is strictly assigned role "MEMBER"');
    assert(newUser.status === 'PENDING', 'Imported user is strictly assigned status "PENDING"');
    assert(newUser.isPhoneVerified === false, 'Imported user has isPhoneVerified: false');
    assert(
      typeof newUser.passwordHash === 'string' && newUser.passwordHash.startsWith('$argon2id$'),
      'Imported user receives valid, secure Argon2id dummy password hash'
    );
    assert(
      newUser.profile.create.fullName === 'New Member',
      'Profile created atomically with correct full name'
    );
    assert(
      newUser.profile.create.gender === 'FEMALE',
      'Profile created with normalized gender'
    );
    assert(
      newUser.profile.create.city === 'Bhopal',
      'Profile created with city'
    );

    // Verify audit log
    assert(auditLogCreated !== null, 'AuditLog entry was created');
    assert(auditLogCreated.action === 'USER_BULK_IMPORT', 'AuditLog action is "USER_BULK_IMPORT"');
    assert(auditLogCreated.actorId === mockAdmin.id, 'AuditLog actorId matches admin ID');
    assert(auditLogCreated.targetId === 'kewat', 'AuditLog targetId matches community slug');
  } catch (err) {
    assert(false, `Execute bulk import threw error: ${err}`);
  }

  // -------------------------------------------------------------
  // 11. Tenant Boundary Guard
  // -------------------------------------------------------------
  try {
    const validBuf = await createTestXlsxBuffer(
      ['Full Name', 'Mobile Number'],
      [['Ramesh Kewat', '9876543210']]
    );
    await previewBulkImport(validBuf, undefined);
    assert(false, 'Undefined db client must throw AdminImportError');
  } catch (err) {
    assert(err instanceof AdminImportError, 'Missing tenant db client rejected with AdminImportError');
  }

  console.log('================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runBulkImportBackendTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});


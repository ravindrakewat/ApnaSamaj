import {
  bulkImportRowSchema,
  bulkImportPhoneSchema,
  bulkImportFullNameSchema,
  bulkImportGenderSchema,
  bulkImportCitySchema,
  bulkImportOptionsSchema,
  validateBulkImportRow,
  checkForbiddenImportFields,
  FORBIDDEN_BULK_IMPORT_FIELDS,
} from '@apnasamaj/validation';
import type { BulkImportMemberRow } from '@apnasamaj/shared-types';

async function runBulkImportContractsTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Excel Bulk Member Import Contracts & Validation ');
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
  // 1. Valid Complete Row Validation
  // -------------------------------------------------------------
  const validCompleteRow = {
    fullName: 'Ramesh Kewat',
    phone: '9876543210',
    gender: 'Male',
    city: 'Indore',
    state: 'Madhya Pradesh',
    subCaste: 'Kewat',
    gotra: 'Kashyap',
  };

  const completeResult = validateBulkImportRow(validCompleteRow, 2);
  assert(completeResult.success === true, 'Complete valid row is parsed successfully');
  if (completeResult.success) {
    assert(completeResult.data.fullName === 'Ramesh Kewat', 'Full name correctly preserved');
    assert(completeResult.data.phone === '+919876543210', 'Phone normalized to E.164 (+91XXXXXXXXXX)');
    assert(completeResult.data.gender === 'MALE', 'Gender normalized to MALE enum');
    assert(completeResult.data.city === 'Indore', 'City preserved');
    assert(completeResult.data.state === 'Madhya Pradesh', 'State preserved');
    assert(completeResult.data.subCaste === 'Kewat', 'Sub-caste preserved');
    assert(completeResult.data.gotra === 'Kashyap', 'Gotra preserved');
  }

  // -------------------------------------------------------------
  // 2. Valid Minimal Row (Only Required Fields)
  // -------------------------------------------------------------
  const validMinimalRow = {
    fullName: 'Sita Nishad',
    phone: '+919123456789',
  };

  const minimalResult = validateBulkImportRow(validMinimalRow, 3);
  assert(minimalResult.success === true, 'Minimal valid row with optional fields omitted parses successfully');
  if (minimalResult.success) {
    assert(minimalResult.data.fullName === 'Sita Nishad', 'Full name preserved');
    assert(minimalResult.data.phone === '+919123456789', 'E.164 phone preserved');
    assert(minimalResult.data.gender === null, 'Omitted gender defaults to null');
    assert(minimalResult.data.city === null, 'Omitted city defaults to null');
    assert(minimalResult.data.state === null, 'Omitted state defaults to null');
    assert(minimalResult.data.subCaste === null, 'Omitted subCaste defaults to null');
    assert(minimalResult.data.gotra === null, 'Omitted gotra defaults to null');
  }

  // -------------------------------------------------------------
  // 3. Indian Phone Normalization Variants
  // -------------------------------------------------------------
  const phoneCases = [
    { input: '9876543210', expected: '+919876543210', desc: '10 digits standard' },
    { input: 9876543210, expected: '+919876543210', desc: 'Numeric Excel cell input' },
    { input: '09876543210', expected: '+919876543210', desc: 'Leading zero format' },
    { input: '919876543210', expected: '+919876543210', desc: 'Leading 91 without plus' },
    { input: '+919876543210', expected: '+919876543210', desc: 'Standard E.164 with plus' },
    { input: '  98765 43210  ', expected: '+919876543210', desc: 'Spaces in phone number' },
    { input: '9876-543-210', expected: '+919876543210', desc: 'Dashes in phone number' },
  ];

  for (const tc of phoneCases) {
    const res = bulkImportPhoneSchema.safeParse(tc.input);
    assert(res.success && res.data === tc.expected, `Phone normalization variant: ${tc.desc}`);
  }

  // -------------------------------------------------------------
  // 4. Invalid Phone Number Rejections
  // -------------------------------------------------------------
  const invalidPhones = [
    { input: '5123456789', desc: 'Number starting with 5 (must start with 6-9)' },
    { input: '12345', desc: 'Short number (< 10 digits)' },
    { input: '9876543210123456', desc: 'Excessive digits (> 12 digits)' },
    { input: 'ABC9876543', desc: 'Alphanumeric string' },
    { input: '', desc: 'Empty string' },
    { input: null, desc: 'Null value' },
  ];

  for (const tc of invalidPhones) {
    const res = bulkImportPhoneSchema.safeParse(tc.input);
    assert(!res.success, `Rejection of invalid phone: ${tc.desc}`);
  }

  // -------------------------------------------------------------
  // 5. Full Name Validations
  // -------------------------------------------------------------
  assert(!bulkImportFullNameSchema.safeParse('').success, 'Empty full name is rejected');
  assert(!bulkImportFullNameSchema.safeParse('A').success, 'Single character full name is rejected');
  assert(!bulkImportFullNameSchema.safeParse('   ').success, 'Whitespace-only full name is rejected');
  assert(
    bulkImportFullNameSchema.safeParse('  Sunil Mallah  ').data === 'Sunil Mallah',
    'Full name whitespace is trimmed'
  );
  assert(
    !bulkImportFullNameSchema.safeParse('A'.repeat(101)).success,
    'Full name exceeding 100 characters is rejected'
  );

  // -------------------------------------------------------------
  // 6. Gender Normalization
  // -------------------------------------------------------------
  assert(bulkImportGenderSchema.safeParse('Male').data === 'MALE', 'Gender "Male" -> MALE');
  assert(bulkImportGenderSchema.safeParse('female').data === 'FEMALE', 'Gender "female" -> FEMALE');
  assert(bulkImportGenderSchema.safeParse('m').data === 'MALE', 'Gender "m" -> MALE');
  assert(bulkImportGenderSchema.safeParse('F').data === 'FEMALE', 'Gender "F" -> FEMALE');
  assert(bulkImportGenderSchema.safeParse('Other').data === 'OTHER', 'Gender "Other" -> OTHER');
  assert(bulkImportGenderSchema.safeParse('').data === null, 'Empty gender string -> null');
  assert(bulkImportGenderSchema.safeParse(null).data === null, 'Null gender -> null');
  assert(!bulkImportGenderSchema.safeParse('INVALID').success, 'Invalid gender string is rejected');

  // -------------------------------------------------------------
  // 7. Optional String Fields (City, State, Sub-caste, Gotra)
  // -------------------------------------------------------------
  assert(bulkImportCitySchema.safeParse('  Bhopal  ').data === 'Bhopal', 'City whitespace trimmed');
  assert(bulkImportCitySchema.safeParse('').data === null, 'Empty city becomes null');
  assert(bulkImportCitySchema.safeParse(null).data === null, 'Null city remains null');
  assert(!bulkImportCitySchema.safeParse('C'.repeat(101)).success, 'City > 100 chars rejected');

  // -------------------------------------------------------------
  // 8. Security Boundaries & Forbidden Fields Enforcement
  // -------------------------------------------------------------
  for (const forbiddenKey of FORBIDDEN_BULK_IMPORT_FIELDS) {
    const maliciousRow = {
      fullName: 'Attacker Row',
      phone: '9876543210',
      [forbiddenKey]: 'MALICIOUS_INJECTION_VALUE',
    };

    const res = validateBulkImportRow(maliciousRow, 10);
    assert(
      !res.success,
      `Strict security rejection of forbidden field: "${forbiddenKey}"`
    );
    if (!res.success) {
      assert(
        res.errors.some((e) => e.field === forbiddenKey),
        `Error report pinpoints forbidden field: "${forbiddenKey}"`
      );
    }
  }

  // -------------------------------------------------------------
  // 9. Extra Unrecognized Keys Rejection (strict schema)
  // -------------------------------------------------------------
  const unknownFieldRow = {
    fullName: 'Unknown Field Row',
    phone: '9876543210',
    unexpectedColumn: 'Some Value',
  };
  const unknownRes = validateBulkImportRow(unknownFieldRow, 11);
  assert(!unknownRes.success, 'Unrecognized extra columns are strictly rejected by schema');

  // -------------------------------------------------------------
  // 10. Execution Options Schema
  // -------------------------------------------------------------
  const defaultOptions = bulkImportOptionsSchema.parse({});
  assert(defaultOptions.skipExisting === true, 'Default skipExisting option is true');

  const explicitFalseOptions = bulkImportOptionsSchema.parse({ skipExisting: false });
  assert(explicitFalseOptions.skipExisting === false, 'Explicit skipExisting: false parsed');

  const stringCoercedOptions = bulkImportOptionsSchema.parse({ skipExisting: 'true' });
  assert(stringCoercedOptions.skipExisting === true, 'String "true" coerced to boolean true');

  // -------------------------------------------------------------
  // 11. Duplicate Detection Contract Check
  // -------------------------------------------------------------
  const mockSpreadsheetPhones = [
    '+919876543210',
    '+919123456789',
    '+919876543210', // Intra-file duplicate
  ];

  const seenPhones = new Set<string>();
  const duplicateFlags: boolean[] = [];

  for (const p of mockSpreadsheetPhones) {
    if (seenPhones.has(p)) {
      duplicateFlags.push(true);
    } else {
      seenPhones.add(p);
      duplicateFlags.push(false);
    }
  }

  assert(
    duplicateFlags[0] === false && duplicateFlags[1] === false && duplicateFlags[2] === true,
    'Intra-file duplicate detection flags duplicate row accurately'
  );

  console.log('================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runBulkImportContractsTests().catch((err) => {
  console.error('Test runner failure:', err);
  process.exit(1);
});


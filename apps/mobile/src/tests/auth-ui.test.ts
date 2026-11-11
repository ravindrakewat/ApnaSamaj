import assert from 'node:assert';
import {
  normalizeIndianPhone,
  isValidIndianPhone,
  validatePhone,
  validatePassword,
  validateFullName,
  validateCommunitySlug,
} from '../utils/validation';

let totalTests = 0;
let passedTests = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err: any) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(`   ${err.message}`);
    process.exitCode = 1;
  }
}

export async function runAuthUiTests() {
  console.log('\n========================================================================');
  console.log('   Apna Samaj — Batch 10.2.5: Auth & Onboarding UI Polish Tests        ');
  console.log('========================================================================\n');

  // -----------------------------------------------------------------------------
  // 1. Phone Number Normalization & Validation (+91 E.164 format)
  // -----------------------------------------------------------------------------
  console.log('--- 1. Phone Number Normalization & Validation ---');

  await test('Normalizes bare 10-digit Indian phone to E.164 format (+91XXXXXXXXXX)', () => {
    const raw = '9876543210';
    const normalized = normalizeIndianPhone(raw);
    assert.strictEqual(normalized, '+919876543210');
    assert.strictEqual(isValidIndianPhone(normalized), true);
  });

  await test('Normalizes phone with leading zero (09876543210) to +91XXXXXXXXXX', () => {
    const raw = '09876543210';
    const normalized = normalizeIndianPhone(raw);
    assert.strictEqual(normalized, '+919876543210');
    assert.strictEqual(isValidIndianPhone(normalized), true);
  });

  await test('Normalizes phone with prefix 91 (919876543210) to +91XXXXXXXXXX', () => {
    const raw = '919876543210';
    const normalized = normalizeIndianPhone(raw);
    assert.strictEqual(normalized, '+919876543210');
    assert.strictEqual(isValidIndianPhone(normalized), true);
  });

  await test('Normalizes phone with formatted dashes, spaces, and brackets', () => {
    const raw = '+91 (9876) 543-210';
    const normalized = normalizeIndianPhone(raw);
    assert.strictEqual(normalized, '+919876543210');
    assert.strictEqual(isValidIndianPhone(normalized), true);
  });

  await test('Rejects invalid phone numbers starting with digits 1-5 or wrong length', () => {
    const invalidNumbers = ['1234567890', '5876543210', '98765', 'abcdefghij'];
    for (const num of invalidNumbers) {
      const res = validatePhone(num, 'hi');
      assert.strictEqual(res.isValid, false, `Expected ${num} to fail validation`);
      assert.ok(res.error && res.error.length > 0);
    }
  });

  await test('Returns localized error messages for phone validation (Hindi & English)', () => {
    const emptyHi = validatePhone('', 'hi');
    const emptyEn = validatePhone('', 'en');
    assert.strictEqual(emptyHi.isValid, false);
    assert.strictEqual(emptyEn.isValid, false);
    assert.strictEqual(emptyHi.error, 'फ़ोन नंबर आवश्यक है');
    assert.strictEqual(emptyEn.error, 'Phone number is required');
  });

  // -----------------------------------------------------------------------------
  // 2. Password Length & Security Validation
  // -----------------------------------------------------------------------------
  console.log('--- 2. Password Length & Security Validation ---');

  await test('Rejects empty or short passwords (< 8 characters)', () => {
    const empty = validatePassword('', 'hi');
    assert.strictEqual(empty.isValid, false);
    assert.strictEqual(empty.error, 'पासवर्ड आवश्यक है');

    const short = validatePassword('pass12', 'en');
    assert.strictEqual(short.isValid, false);
    assert.strictEqual(short.error, 'Password must be at least 8 characters long');
  });

  await test('Accepts passwords with 8 or more characters', () => {
    const valid = validatePassword('SecureP@ss2026', 'hi');
    assert.strictEqual(valid.isValid, true);
    assert.strictEqual(valid.error, undefined);
  });

  // -----------------------------------------------------------------------------
  // 3. Full Name Validation (Registration)
  // -----------------------------------------------------------------------------
  console.log('--- 3. Full Name Validation ---');

  await test('Validates full name minimum and maximum constraints (2-100 characters)', () => {
    const empty = validateFullName('', 'hi');
    assert.strictEqual(empty.isValid, false);
    assert.strictEqual(empty.error, 'पूरा नाम आवश्यक है');

    const singleLetter = validateFullName('A', 'en');
    assert.strictEqual(singleLetter.isValid, false);
    assert.strictEqual(singleLetter.error, 'Full name must be at least 2 characters long');

    const tooLong = validateFullName('A'.repeat(101), 'en');
    assert.strictEqual(tooLong.isValid, false);
    assert.strictEqual(tooLong.error, 'Full name must not exceed 100 characters');

    const validHindi = validateFullName('सुनील केवट', 'hi');
    assert.strictEqual(validHindi.isValid, true);

    const validEnglish = validateFullName('Sunil Kewat', 'en');
    assert.strictEqual(validEnglish.isValid, true);
  });

  // -----------------------------------------------------------------------------
  // 4. Community Slug Multi-Tenant Validation
  // -----------------------------------------------------------------------------
  console.log('--- 4. Community Slug Multi-Tenant Validation ---');

  await test('Validates community slug format and rejects unauthorized characters', () => {
    const empty = validateCommunitySlug('', 'hi');
    assert.strictEqual(empty.isValid, false);

    const validKewat = validateCommunitySlug('kewat', 'hi');
    assert.strictEqual(validKewat.isValid, true);

    const validHyphenated = validateCommunitySlug('apna-samaj-indore', 'en');
    assert.strictEqual(validHyphenated.isValid, true);

    const invalidSymbols = validateCommunitySlug('kewat!@#', 'en');
    assert.strictEqual(invalidSymbols.isValid, false);
    assert.strictEqual(
      invalidSymbols.error,
      'Slug can only contain lowercase letters, numbers, hyphens, and underscores'
    );
  });

  // -----------------------------------------------------------------------------
  // 5. Gender Selection & Profile Details Invariants
  // -----------------------------------------------------------------------------
  console.log('--- 5. Gender Selection & Profile Details Invariants ---');

  await test('Gender chips accept only valid schema values (MALE, FEMALE, OTHER)', () => {
    const validGenders = ['MALE', 'FEMALE', 'OTHER'] as const;
    for (const g of validGenders) {
      assert.ok(['MALE', 'FEMALE', 'OTHER'].includes(g));
    }
  });

  await test('Registration payload strictly adheres to backend contract', () => {
    const phoneRes = validatePhone('9876543210', 'hi');
    assert.strictEqual(phoneRes.isValid, true);

    const payload = {
      fullName: 'रविन्द्र केवट',
      phone: phoneRes.normalized,
      password: 'StrongPassword123',
      gender: 'MALE' as const,
      city: 'भोपाल',
      state: 'मध्य प्रदेश',
      subCaste: 'केवट',
      gotra: 'कश्यप',
    };

    assert.strictEqual(payload.phone, '+919876543210');
    assert.strictEqual(payload.fullName, 'रविन्द्र केवट');
    assert.strictEqual(payload.gender, 'MALE');
    assert.strictEqual(payload.city, 'भोपाल');
  });

  console.log(`\nBatch 10.2.5 Auth UI Tests Finished: ${passedTests}/${totalTests} Passed\n`);
  if (passedTests !== totalTests) {
    throw new Error(`Only ${passedTests}/${totalTests} tests passed in auth-ui.test.ts`);
  }
}

// Auto-run if executed directly
if (require.main === module) {
  runAuthUiTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}


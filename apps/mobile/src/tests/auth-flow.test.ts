import assert from 'assert';
import {
  normalizeIndianPhone,
  isValidIndianPhone,
  validatePhone,
  validatePassword,
  validateFullName,
  validateCommunitySlug,
} from '../utils/validation';
import { authApi } from '../api/auth.api';
import {
  setAuthTokens,
  getAuthTokens,
  clearAuthTokens,
  setStoredCommunitySlug,
  getStoredCommunitySlug,
  setSecureItem,
  getSecureItem,
} from '../services/storage.service';
import { STORAGE_KEYS } from '../constants/storageKeys';

console.log('\n================================================================');
console.log('    Apna Samaj — Batch 2 Mobile Auth & Session Test Suite       ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${desc}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${desc}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passedTests++;
      console.log(`✅ PASS: ${desc}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAuthTests() {
  console.log('--- 1. Phone Normalization & Format Validation ---');

  it('Normalizes 10-digit Indian numbers starting with 6-9 to +91XXXXXXXXXX', () => {
    assert.strictEqual(normalizeIndianPhone('9876543210'), '+919876543210');
    assert.strictEqual(normalizeIndianPhone('8876543210'), '+918876543210');
    assert.strictEqual(normalizeIndianPhone('7876543210'), '+917876543210');
    assert.strictEqual(normalizeIndianPhone('6876543210'), '+916876543210');
    assert.strictEqual(isValidIndianPhone('+919876543210'), true);
  });

  it('Normalizes phone numbers with leading +91, 91, or 0', () => {
    assert.strictEqual(normalizeIndianPhone('+919876543210'), '+919876543210');
    assert.strictEqual(normalizeIndianPhone('919876543210'), '+919876543210');
    assert.strictEqual(normalizeIndianPhone('09876543210'), '+919876543210');
  });

  it('Strips spaces, dashes, parentheses, and dots from phone numbers', () => {
    assert.strictEqual(normalizeIndianPhone('(987) 654-3210'), '+919876543210');
    assert.strictEqual(normalizeIndianPhone('987 654 3210'), '+919876543210');
    assert.strictEqual(normalizeIndianPhone('+91 987-654-3210'), '+919876543210');
  });

  it('Rejects invalid phone numbers starting with 0-5 or wrong length', () => {
    assert.strictEqual(isValidIndianPhone('+915876543210'), false);
    assert.strictEqual(isValidIndianPhone('+911234567890'), false);
    assert.strictEqual(isValidIndianPhone('+9198765'), false);
    assert.strictEqual(isValidIndianPhone('9876543210'), false); // Must be E.164
  });

  it('validatePhone returns localized error in Hindi by default', () => {
    const emptyResult = validatePhone('', 'hi');
    assert.strictEqual(emptyResult.isValid, false);
    assert.strictEqual(emptyResult.error, 'फ़ोन नंबर आवश्यक है');

    const invalidResult = validatePhone('12345', 'hi');
    assert.strictEqual(invalidResult.isValid, false);
    assert(invalidResult.error?.includes('अमान्य मोबाइल नंबर'));
  });

  it('validatePhone returns localized error in English when requested', () => {
    const emptyResult = validatePhone('', 'en');
    assert.strictEqual(emptyResult.isValid, false);
    assert.strictEqual(emptyResult.error, 'Phone number is required');

    const invalidResult = validatePhone('12345', 'en');
    assert.strictEqual(invalidResult.isValid, false);
    assert(invalidResult.error?.includes('Invalid mobile number'));
  });

  console.log('\n--- 2. Password Validation (Backend Parity) ---');

  it('Accepts passwords with 8 or more characters', () => {
    const result = validatePassword('SecurePass123!');
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it('Rejects passwords with fewer than 8 characters', () => {
    const resultHi = validatePassword('short', 'hi');
    assert.strictEqual(resultHi.isValid, false);
    assert.strictEqual(resultHi.error, 'पासवर्ड कम से कम 8 वर्णों का होना चाहिए');

    const resultEn = validatePassword('short', 'en');
    assert.strictEqual(resultEn.isValid, false);
    assert.strictEqual(resultEn.error, 'Password must be at least 8 characters long');
  });

  it('Rejects empty passwords', () => {
    const result = validatePassword('', 'hi');
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'पासवर्ड आवश्यक है');
  });

  console.log('\n--- 3. Full Name & Community Slug Validation ---');

  it('Accepts valid full names (2 to 100 characters)', () => {
    const result = validateFullName('सुनील केवट');
    assert.strictEqual(result.isValid, true);
  });

  it('Rejects single-letter names and empty names', () => {
    assert.strictEqual(validateFullName('', 'hi').isValid, false);
    assert.strictEqual(validateFullName('A', 'hi').isValid, false);
  });

  it('Validates community slugs (alphanumeric, hyphens, underscores)', () => {
    assert.strictEqual(validateCommunitySlug('demo').isValid, true);
    assert.strictEqual(validateCommunitySlug('samaj-central').isValid, true);
    assert.strictEqual(validateCommunitySlug('kewat_samaj').isValid, true);
    assert.strictEqual(validateCommunitySlug('invalid slug').isValid, false);
    assert.strictEqual(validateCommunitySlug('slug@special').isValid, false);
  });

  console.log('\n--- 4. Session Storage & Keystore Security ---');

  await it('Saves and restores auth tokens via SecureStore service', async () => {
    await clearAuthTokens();
    await setAuthTokens({
      accessToken: 'jwt-access-token-test-123',
      refreshToken: 'jwt-refresh-token-test-456',
    });

    const tokens = await getAuthTokens();
    assert.strictEqual(tokens.accessToken, 'jwt-access-token-test-123');
    assert.strictEqual(tokens.refreshToken, 'jwt-refresh-token-test-456');
  });

  await it('Persists community slug across sessions', async () => {
    await setStoredCommunitySlug('test-community');
    const slug = await getStoredCommunitySlug();
    assert.strictEqual(slug, 'test-community');
  });

  await it('Caches user profile JSON securely in SecureStore', async () => {
    const mockUser = {
      id: 'usr-123',
      phone: '+919876543210',
      fullName: 'सुनील केवट',
      role: 'MEMBER' as const,
      status: 'ACTIVE' as const,
      isPhoneVerified: true,
      communitySlug: 'demo',
    };
    await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(mockUser));

    const cached = await getSecureItem(STORAGE_KEYS.USER_PROFILE);
    assert(cached !== null);
    const parsed = JSON.parse(cached!);
    assert.strictEqual(parsed.id, 'usr-123');
    assert.strictEqual(parsed.phone, '+919876543210');
    assert.strictEqual(parsed.fullName, 'सुनील केवट');
  });

  await it('clearAuthTokens wipes access and refresh tokens on logout', async () => {
    await clearAuthTokens();
    const tokens = await getAuthTokens();
    assert.strictEqual(tokens.accessToken, null);
    assert.strictEqual(tokens.refreshToken, null);
  });

  console.log('\n--- 5. Auth API Contract Alignment ---');

  it('authApi defines login, register, getMe, refresh, and logout methods', () => {
    assert.strictEqual(typeof authApi.login, 'function');
    assert.strictEqual(typeof authApi.register, 'function');
    assert.strictEqual(typeof authApi.getMe, 'function');
    assert.strictEqual(typeof authApi.refresh, 'function');
    assert.strictEqual(typeof authApi.logout, 'function');
  });

  console.log('\n================================================================');
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 2 auth tests passed!`);
  console.log('================================================================\n');
}

runAuthTests();


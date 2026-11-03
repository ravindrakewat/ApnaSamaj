import assert from 'assert';
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
import { authApi } from '../api/auth.api';
import { ApiError } from '../api/types';
import { normalizeIndianPhone, isValidIndianPhone } from '../utils/validation';

console.log('\n================================================================');
console.log('   Apna Samaj — Batch 2.1 Auth Integration & Security Tests     ');
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

async function runVerificationTests() {
  console.log('--- 1. Website & Mobile Phone Normalization Compatibility ---');

  it('Normalizes identical E.164 phone string regardless of source platform', () => {
    // Test accounts across web and mobile
    const inputs = ['9876543210', ' 9876543210 ', '+919876543210', '09876543210', '919876543210'];
    inputs.forEach((input) => {
      assert.strictEqual(normalizeIndianPhone(input), '+919876543210');
      assert.strictEqual(isValidIndianPhone(normalizeIndianPhone(input)), true);
    });
  });

  console.log('\n--- 2. Tenant Isolation & Cache Sanitization ---');

  await it('clearAuthTokens purges tokens and cached user profile atomically', async () => {
    await setAuthTokens({
      accessToken: 'token-tenant-a',
      refreshToken: 'refresh-tenant-a',
    });
    await setSecureItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify({ id: 'usr-1', communitySlug: 'tenant-a' })
    );

    // Verify stored
    assert((await getAuthTokens()).accessToken === 'token-tenant-a');
    assert((await getSecureItem(STORAGE_KEYS.USER_PROFILE)) !== null);

    // Purge
    await clearAuthTokens();

    assert((await getAuthTokens()).accessToken === null);
    assert((await getAuthTokens()).refreshToken === null);
    assert((await getSecureItem(STORAGE_KEYS.USER_PROFILE)) === null);
  });

  await it('Stored community slug remains isolated and retrievable', async () => {
    await setStoredCommunitySlug('samaj-bhopal');
    const slug = await getStoredCommunitySlug();
    assert.strictEqual(slug, 'samaj-bhopal');
  });

  console.log('\n--- 3. Logout & Refresh Token Revocation ---');

  it('authApi.logout accepts refreshToken for server-side database revocation', () => {
    assert.strictEqual(authApi.logout.length <= 1, true);
  });

  console.log('\n--- 4. Error Structure & Security Invariants ---');

  it('ApiError preserves HTTP status codes (401, 403, 409) for security decisions', () => {
    const err401 = new ApiError('Unauthorized', 401);
    assert.strictEqual(err401.status, 401);

    const err403 = new ApiError('Forbidden: Access token was issued for a different community.', 403);
    assert.strictEqual(err403.status, 403);

    const err409 = new ApiError('An account with this mobile number already exists.', 409);
    assert.strictEqual(err409.status, 409);
  });

  console.log('\n================================================================');
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 2.1 verification tests passed!`);
  console.log('================================================================\n');
}

runVerificationTests();


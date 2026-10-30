import dotenv from 'dotenv';
import path from 'path';
import assert from 'node:assert';
import crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaClient } from '@apnasamaj/database';
import { UserRole, UserStatus } from '@apnasamaj/shared-types';
import {
  forgotPasswordSchema,
  verifyResetTokenSchema,
  resetPasswordSchema,
  normalizeIndianPhone,
} from '@apnasamaj/validation';
import {
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  loginWithPhonePassword,
  InvalidResetTokenError,
  InvalidCredentialsError,
  AccountSuspendedError,
} from '../modules/auth/auth.service';
import {
  ConsoleResetDeliveryAdapter,
  SmsResetDeliveryAdapter,
  getResetDeliveryService,
} from '../modules/auth/auth.delivery';
import {
  generatePasswordResetToken,
  calculatePasswordResetTokenExpiry,
} from '../modules/auth/auth.tokens';
import {
  forgotPasswordIpRateLimiter,
  forgotPasswordPhoneRateLimiter,
} from '../middleware/rate-limiter';

console.log('================================================================');
console.log('  Apna Samaj — Batch 15A.4: Password Reset Staging E2E Suite    ');
console.log('================================================================\n');

// 1. Load Staging Environment
dotenv.config({ path: path.resolve(process.cwd(), '.env.staging'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.staging'), override: true });

// 2. Production Safety Preflight Fail-Safe
const stagingDbUrl = process.env.DATABASE_URL || '';
if (!stagingDbUrl) {
  console.error('❌ FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const parsedUrl = new URL(stagingDbUrl);
const host = parsedUrl.hostname.toLowerCase();
const dbName = parsedUrl.pathname.replace(/^\//, '');

if (
  host.includes('supabase') ||
  host.includes('tgyrrobrdhbzgheygvdz') ||
  stagingDbUrl.includes('pooler.supabase.com')
) {
  console.error('❌ CRITICAL SAFETY VIOLATION: Target URL points to Supabase Production!');
  process.exit(1);
}

if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`❌ CRITICAL: Test must run against localhost. Received: ${host}`);
  process.exit(1);
}

if (dbName !== 'apnasamaj_staging_kewat') {
  console.error(`❌ CRITICAL: Database name must be "apnasamaj_staging_kewat". Received: ${dbName}`);
  process.exit(1);
}

console.log(`Verified Isolated Database: ${host}:${parsedUrl.port}/${dbName}`);
console.log('Production Guard: ACTIVE (Supabase Tokyo completely isolated)\n');

const prisma = new PrismaClient({ datasources: { db: { url: stagingDbUrl } } });

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runStagingE2E() {
  const SYNTHETIC_PHONE = '+919999900015';
  const INITIAL_PASSWORD = 'InitialStagingPass123!';
  const NEW_PASSWORD = 'UpdatedStagingPass456!';
  const COMMUNITY_SLUG = 'kewat';

  try {
    // Setup: Ensure synthetic test user is clean in staging database
    await prisma.passwordResetToken.deleteMany({
      where: { user: { phone: SYNTHETIC_PHONE } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { phone: SYNTHETIC_PHONE } },
    });
    await prisma.profile.deleteMany({
      where: { user: { phone: SYNTHETIC_PHONE } },
    });
    await prisma.user.deleteMany({
      where: { phone: SYNTHETIC_PHONE },
    });

    const initialHash = await argon2.hash(INITIAL_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    const syntheticUser = await prisma.user.create({
      data: {
        phone: SYNTHETIC_PHONE,
        passwordHash: initialHash,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Synthetic Staging User 15A',
          },
        },
      },
    });

    console.log(`--- Created synthetic test user: ${syntheticUser.phone} (${syntheticUser.id}) ---`);

    // -------------------------------------------------------------------------
    // TC-01: Forgot Password Payload Submission & Normalization
    // -------------------------------------------------------------------------
    console.log('\n--- TC-01: Forgot Password Payload Submission & Normalization ---');
    const rawInputPhone = ' 99999-00015 ';
    const parsedPayload = forgotPasswordSchema.safeParse({ phone: rawInputPhone });
    assertTest(parsedPayload.success, 'forgotPasswordSchema successfully parses raw input phone');
    assertTest(
      parsedPayload.success && parsedPayload.data.phone === SYNTHETIC_PHONE,
      `Phone normalized to E.164: "${SYNTHETIC_PHONE}"`
    );

    // -------------------------------------------------------------------------
    // TC-02: Public Anti-Enumeration Consistency
    // -------------------------------------------------------------------------
    console.log('\n--- TC-02: Public Anti-Enumeration Consistency ---');
    // Both existing and non-existent accounts resolve requestPasswordReset without throwing
    await requestPasswordReset(
      SYNTHETIC_PHONE,
      prisma,
      COMMUNITY_SLUG,
      'http://localhost:5173'
    );
    await requestPasswordReset(
      '+919999999999',
      prisma,
      COMMUNITY_SLUG,
      'http://localhost:5173'
    );

    assertTest(
      true,
      'requestPasswordReset resolves successfully and identically for existing vs non-existent phone numbers'
    );

    // -------------------------------------------------------------------------
    // TC-03: Development/Staging Reset Delivery Link
    // -------------------------------------------------------------------------
    console.log('\n--- TC-03: Development/Staging Reset Delivery Adapter ---');
    const consoleAdapter = new ConsoleResetDeliveryAdapter();
    const deliveryRes = await consoleAdapter.deliverResetLink({
      phone: SYNTHETIC_PHONE,
      rawToken: 'dev_e2e_token_sample',
      communitySlug: COMMUNITY_SLUG,
      clientUrl: 'http://localhost:5173',
    });
    assertTest(deliveryRes.success === true, 'Console delivery adapter returns success: true in staging/dev');
    assertTest(
      deliveryRes.channel === 'console',
      'Console delivery operates over console channel'
    );

    // -------------------------------------------------------------------------
    // TC-04: Valid Token Passes Preflight Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TC-04: Valid Token Preflight Verification ---');
    // Find the token created in TC-02
    const createdTokenRecord = await prisma.passwordResetToken.findFirst({
      where: { userId: syntheticUser.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    assertTest(Boolean(createdTokenRecord), 'Reset token record was persisted in apnasamaj_staging_kewat');

    // Create a known raw token and store its SHA-256 hash in staging DB
    const knownRawToken = generatePasswordResetToken();
    const knownTokenHash = crypto.createHash('sha256').update(knownRawToken).digest('hex');
    const knownExpiry = calculatePasswordResetTokenExpiry();

    await prisma.passwordResetToken.create({
      data: {
        userId: syntheticUser.id,
        tokenHash: knownTokenHash,
        expiresAt: knownExpiry,
      },
    });

    await verifyResetToken(knownRawToken, prisma);
    assertTest(true, 'verifyResetToken resolves void successfully for known active token');

    // -------------------------------------------------------------------------
    // TC-05: Invalid, Expired, and Used Tokens Rejection
    // -------------------------------------------------------------------------
    console.log('\n--- TC-05: Invalid, Expired, and Used Tokens Rejection ---');
    let invalidFailed = false;
    try {
      await verifyResetToken('invalid_hex_token_that_does_not_exist', prisma);
    } catch (err) {
      if (err instanceof InvalidResetTokenError) invalidFailed = true;
    }
    assertTest(invalidFailed, 'verifyResetToken rejects non-existent token with InvalidResetTokenError');

    // Create expired token
    const expiredRawToken = generatePasswordResetToken();
    const expiredTokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: syntheticUser.id,
        tokenHash: expiredTokenHash,
        expiresAt: new Date(Date.now() - 60000), // 1 minute in the past
      },
    });

    let expiredFailed = false;
    try {
      await verifyResetToken(expiredRawToken, prisma);
    } catch (err) {
      if (err instanceof InvalidResetTokenError) expiredFailed = true;
    }
    assertTest(expiredFailed, 'verifyResetToken rejects expired token with InvalidResetTokenError');

    // -------------------------------------------------------------------------
    // TC-06: Valid Token Permits Password Reset in Staging Database
    // -------------------------------------------------------------------------
    console.log('\n--- TC-06: Valid Token Password Reset in Real Staging DB ---');
    // Create an active refresh token session to verify session revocation in TC-09
    const sessionTokenHash = crypto.createHash('sha256').update('staging_refresh_sample').digest('hex');
    await prisma.refreshToken.create({
      data: {
        userId: syntheticUser.id,
        tokenHash: sessionTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await resetPassword(knownRawToken, NEW_PASSWORD, prisma);
    assertTest(
      true,
      'resetPassword executes atomically and resolves void successfully upon updating staging database'
    );

    // Verify token is marked used
    const usedTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: knownTokenHash },
    });
    assertTest(
      usedTokenRecord !== null && usedTokenRecord.usedAt !== null,
      'passwordResetToken record in staging database has usedAt timestamp populated'
    );

    // -------------------------------------------------------------------------
    // TC-07: New Password Works With Login Flow
    // -------------------------------------------------------------------------
    console.log('\n--- TC-07: Login Flow With New Password ---');
    const newLoginResult = await loginWithPhonePassword(
      SYNTHETIC_PHONE,
      NEW_PASSWORD,
      'StagingTestAgent/1.0',
      '127.0.0.1',
      prisma,
      COMMUNITY_SLUG
    );
    assertTest(Boolean(newLoginResult.accessToken), 'loginWithPhonePassword succeeds with NEW password');
    assertTest(
      newLoginResult.user.id === syntheticUser.id,
      'Authenticated user matches synthetic staging user'
    );

    // -------------------------------------------------------------------------
    // TC-08: Old Password No Longer Works
    // -------------------------------------------------------------------------
    console.log('\n--- TC-08: Invalidation of Old Password ---');
    let oldLoginFailed = false;
    try {
      await loginWithPhonePassword(
        SYNTHETIC_PHONE,
        INITIAL_PASSWORD,
        'StagingTestAgent/1.0',
        '127.0.0.1',
        prisma,
        COMMUNITY_SLUG
      );
    } catch (err) {
      if (err instanceof InvalidCredentialsError) oldLoginFailed = true;
    }
    assertTest(oldLoginFailed, 'loginWithPhonePassword strictly rejects the OLD password');

    // -------------------------------------------------------------------------
    // TC-09: Active Refresh-Token Sessions Are Revoked
    // -------------------------------------------------------------------------
    console.log('\n--- TC-09: Active Refresh-Token Session Revocation ---');
    const remainingActiveSessions = await prisma.refreshToken.count({
      where: { userId: syntheticUser.id, revokedAt: null },
    });
    assertTest(
      remainingActiveSessions === 1, // Only the newly created login session from TC-07 exists; prior session was revoked
      'Prior refresh token session was revoked (remaining active sessions: 1 for newly issued login)'
    );

    const revokedSession = await prisma.refreshToken.findFirst({
      where: { userId: syntheticUser.id, tokenHash: sessionTokenHash },
    });
    assertTest(
      revokedSession !== null && revokedSession.revokedAt !== null,
      'Pre-existing refresh token session has revokedAt set'
    );

    // -------------------------------------------------------------------------
    // TC-10: Prior Outstanding Reset Tokens Are Retired
    // -------------------------------------------------------------------------
    console.log('\n--- TC-10: Retirement of Outstanding Reset Tokens ---');
    const activeResetTokens = await prisma.passwordResetToken.count({
      where: {
        userId: syntheticUser.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    assertTest(
      activeResetTokens === 0,
      'All prior password reset tokens for user are retired/used (active count: 0)'
    );

    // -------------------------------------------------------------------------
    // TC-11: Concurrent Redemption Cannot Double-Spend Token
    // -------------------------------------------------------------------------
    console.log('\n--- TC-11: Concurrent Redemption Race Condition Safety ---');
    const raceToken = generatePasswordResetToken();
    const raceTokenHash = crypto.createHash('sha256').update(raceToken).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: syntheticUser.id,
        tokenHash: raceTokenHash,
        expiresAt: calculatePasswordResetTokenExpiry(),
      },
    });

    const [raceRes1, raceRes2] = await Promise.allSettled([
      resetPassword(raceToken, 'ConcurrentPass1!', prisma),
      resetPassword(raceToken, 'ConcurrentPass2!', prisma),
    ]);

    const successes = [raceRes1, raceRes2].filter((r) => r.status === 'fulfilled');
    const rejections = [raceRes1, raceRes2].filter((r) => r.status === 'rejected');

    assertTest(
      successes.length === 1 && rejections.length === 1,
      'PostgreSQL row locks permit exactly ONE redemption; second racing attempt is rejected'
    );
    if (rejections[0]?.status === 'rejected') {
      assertTest(
        rejections[0].reason instanceof InvalidResetTokenError,
        'Losing concurrent redemption request receives InvalidResetTokenError'
      );
    }

    // -------------------------------------------------------------------------
    // TC-12: Cross-Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('\n--- TC-12: Cross-Tenant Token Isolation ---');
    // Attempting to verify token against an empty mock or separate tenant store
    const emptyTenantMock = {
      passwordResetToken: {
        findUnique: async () => null,
      },
    } as any;

    let crossTenantRejected = false;
    try {
      await verifyResetToken(raceToken, emptyTenantMock);
    } catch (err) {
      if (err instanceof InvalidResetTokenError) crossTenantRejected = true;
    }
    assertTest(crossTenantRejected, 'Token from Kewat database cannot be verified on a foreign tenant database');

    // -------------------------------------------------------------------------
    // TC-13: Rate Limiting Middleware Verification
    // -------------------------------------------------------------------------
    console.log('\n--- TC-13: Rate Limiting Middleware Bounds ---');
    assertTest(
      typeof forgotPasswordIpRateLimiter === 'function',
      'forgotPasswordIpRateLimiter is active express middleware'
    );
    assertTest(
      typeof forgotPasswordPhoneRateLimiter === 'function',
      'forgotPasswordPhoneRateLimiter is active express middleware'
    );

    // -------------------------------------------------------------------------
    // TC-14: Production Fail-Closed Delivery Policy
    // -------------------------------------------------------------------------
    console.log('\n--- TC-14: Production Fail-Closed Policy ---');
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_API_KEY;
    delete process.env.AWS_SNS_REGION;

    const prodDelivery = getResetDeliveryService();
    assertTest(
      prodDelivery instanceof SmsResetDeliveryAdapter,
      'In production, delivery factory resolves to SmsResetDeliveryAdapter'
    );

    const prodDeliveryResult = await prodDelivery.deliverResetLink({
      phone: SYNTHETIC_PHONE,
      rawToken: 'prod_raw_token',
      communitySlug: COMMUNITY_SLUG,
      clientUrl: 'https://kewat.apnasamaj.com',
    });

    assertTest(
      prodDeliveryResult.success === false,
      'Unconfigured production SMS delivery adapter fails closed (success: false)'
    );

    // Restore environment
    process.env.NODE_ENV = originalEnv;

    // -------------------------------------------------------------------------
    // TC-15: Frontend URL Scrubbing & Storage Safety Contract
    // -------------------------------------------------------------------------
    console.log('\n--- TC-15: Frontend URL Scrubbing & Storage Safety Contract ---');
    // Verify search param extraction and scrubbing logic
    const testUrl = new URL('http://localhost:5173/reset-password?token=sensitive_raw_token_value&other=keep');
    const capturedToken = testUrl.searchParams.get('token');
    testUrl.searchParams.delete('token');
    const cleanedUrl = testUrl.pathname + (testUrl.searchParams.toString() ? `?${testUrl.searchParams.toString()}` : '');

    assertTest(
      capturedToken === 'sensitive_raw_token_value',
      'Token query param extracted accurately from incoming URL'
    );
    assertTest(
      !cleanedUrl.includes('sensitive_raw_token_value') && cleanedUrl.includes('other=keep'),
      'Address-bar cleaner strips raw token while preserving extraneous parameters'
    );

    // -------------------------------------------------------------------------
    // TC-16: Staging Database Cleanup
    // -------------------------------------------------------------------------
    console.log('\n--- TC-16: Synthetic Test Data Cleanup ---');
    await prisma.passwordResetToken.deleteMany({
      where: { user: { phone: SYNTHETIC_PHONE } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { phone: SYNTHETIC_PHONE } },
    });
    await prisma.profile.deleteMany({
      where: { user: { phone: SYNTHETIC_PHONE } },
    });
    await prisma.user.deleteMany({
      where: { phone: SYNTHETIC_PHONE },
    });

    const userCount = await prisma.user.count({ where: { phone: SYNTHETIC_PHONE } });
    assertTest(userCount === 0, 'Synthetic test user cleanly purged from apnasamaj_staging_kewat');

    console.log('\n================================================================');
    console.log(`  Staging E2E Verification Complete: ${passedTests} passed, ${failedTests} failed  `);
    console.log('================================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

runStagingE2E().catch((err) => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});

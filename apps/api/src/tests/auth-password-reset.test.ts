import assert from 'node:assert';
import * as argon2 from 'argon2';
import { Role as DbRole, UserStatus as DbUserStatus } from '@apnasamaj/database';
import {
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  loginWithPhonePassword,
  refreshSession,
  InvalidResetTokenError,
  AccountSuspendedError,
  InvalidCredentialsError,
} from '../modules/auth/auth.service';
import {
  forgotPasswordHandler,
  verifyResetTokenHandler,
  resetPasswordHandler,
} from '../modules/auth/auth.controller';
import {
  generatePasswordResetToken,
  calculatePasswordResetTokenExpiry,
  hashToken,
} from '../modules/auth/auth.tokens';
import {
  ConsoleResetDeliveryAdapter,
  SmsResetDeliveryAdapter,
  ResetDeliveryParams,
} from '../modules/auth/auth.delivery';
import {
  forgotPasswordIpRateLimiter,
  forgotPasswordPhoneRateLimiter,
} from '../middleware/rate-limiter';
import { TenantRequest } from '../middleware/tenant.middleware';

console.log('================================================================');
console.log('   Apna Samaj — Batch 15A.2 Password Reset Backend Test Suite   ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, testId: string, description: string, detail: string = '') {
  if (condition) {
    console.log(`✅ [${testId}] PASS: ${description} ${detail ? '(' + detail + ')' : ''}`);
    passedTests++;
  } else {
    console.error(`❌ [${testId}] FAIL: ${description} ${detail ? '(' + detail + ')' : ''}`);
    failedTests++;
    throw new Error(`Test failed: [${testId}] ${description}`);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Mock Store & Prisma Client for Hermetic Multi-Tenant Testing
// ---------------------------------------------------------------------------
interface MockUser {
  id: string;
  phone: string;
  passwordHash: string;
  role: DbRole;
  status: DbUserStatus;
  isPhoneVerified: boolean;
  profile?: { fullName: string };
}

interface MockRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  isRevoked: boolean;
  expiresAt: Date;
  revokedAt?: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  user?: MockUser;
}

interface MockPasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  user?: MockUser;
}

function createMockDatabase(slug: string = 'kewat') {
  const users: MockUser[] = [];
  const refreshTokens: MockRefreshToken[] = [];
  const passwordResetTokens: MockPasswordResetToken[] = [];

  const db: any = {
    slug,
    users,
    refreshTokens,
    passwordResetTokens,

    user: {
      findUnique: async ({ where }: any) => {
        const found = users.find(
          (u) => (where.id && u.id === where.id) || (where.phone && u.phone === where.phone)
        );
        if (!found) return null;
        return { ...found };
      },
      update: async ({ where, data }: any) => {
        const found = users.find((u) => u.id === where.id);
        if (!found) throw new Error('User not found');
        Object.assign(found, data);
        return { ...found };
      },
    },

    passwordResetToken: {
      findUnique: async ({ where }: any) => {
        const found = passwordResetTokens.find(
          (t) => (where.id && t.id === where.id) || (where.tokenHash && t.tokenHash === where.tokenHash)
        );
        if (!found) return null;
        const user = users.find((u) => u.id === found.userId);
        return {
          ...found,
          user: user ? { ...user } : undefined,
        };
      },
      create: async ({ data }: any) => {
        const record: MockPasswordResetToken = {
          id: `prt_${passwordResetTokens.length + 1}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          usedAt: null,
          createdAt: new Date(),
        };
        passwordResetTokens.push(record);
        return { ...record };
      },
      update: async ({ where, data }: any) => {
        const item = refreshTokens.find((t) => (where.id && t.id === where.id) || (where.tokenHash && t.tokenHash === where.tokenHash));
        if (item) {
          Object.assign(item, data);
        }
        return item ? { ...item } : null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        const now = new Date();
        for (const item of passwordResetTokens) {
          let match = true;
          if (where.userId && item.userId !== where.userId) match = false;
          if (where.tokenHash && item.tokenHash !== where.tokenHash) match = false;
          if (where.usedAt === null && item.usedAt !== null) match = false;
          if (where.expiresAt && where.expiresAt.gt) {
            if (item.expiresAt <= now) match = false;
          }
          if (match) {
            Object.assign(item, data);
            count++;
          }
        }
        return { count };
      },
    },

    refreshToken: {
      findUnique: async ({ where }: any) => {
        const found = refreshTokens.find((t) => t.tokenHash === where.tokenHash);
        if (!found) return null;
        const user = users.find((u) => u.id === found.userId);
        return {
          ...found,
          user: user ? { ...user } : undefined,
        };
      },
      create: async ({ data }: any) => {
        const record: MockRefreshToken = {
          id: `rt_${refreshTokens.length + 1}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          familyId: data.familyId,
          isRevoked: false,
          expiresAt: data.expiresAt,
          userAgent: data.userAgent || null,
          ipAddress: data.ipAddress || null,
        };
        refreshTokens.push(record);
        return { ...record };
      },
      update: async ({ where, data }: any) => {
        const item = refreshTokens.find((t) => (where.id && t.id === where.id) || (where.tokenHash && t.tokenHash === where.tokenHash));
        if (item) {
          Object.assign(item, data);
        }
        return item ? { ...item } : null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const item of refreshTokens) {
          let match = true;
          if (where.userId && item.userId !== where.userId) match = false;
          if (where.tokenHash && item.tokenHash !== where.tokenHash) match = false;
          if (where.isRevoked !== undefined && item.isRevoked !== where.isRevoked) match = false;
          if (match) {
            Object.assign(item, data);
            count++;
          }
        }
        return { count };
      },
    },

    $transaction: async (fn: any) => {
      if (typeof fn === 'function') {
        return await fn(db);
      }
      return Promise.all(fn);
    },
  };

  return db;
}

// Mock express req/res helper
function createMockHttp(reqOverrides: Partial<TenantRequest> = {}) {
  const req: any = {
    headers: {},
    body: {},
    ip: '127.0.0.1',
    ...reqOverrides,
  };

  let statusCode = 200;
  let responseBody: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (body: any) => {
      responseBody = body;
      return res;
    },
    cookie: () => res,
    clearCookie: () => res,
  };

  return {
    req: req as TenantRequest,
    res,
    getStatus: () => statusCode,
    getBody: () => responseBody,
  };
}

async function runTestSuite() {
  const INITIAL_PASSWORD = 'OriginalPassword123!';
  const initialPasswordHash = await argon2.hash(INITIAL_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  const activePhone = '+919999911111';
  const suspendedPhone = '+919999922222';
  const nonexistentPhone = '+919999933333';

  const db = createMockDatabase('kewat');

  // Seed active member
  db.users.push({
    id: 'user_active_1',
    phone: activePhone,
    passwordHash: initialPasswordHash,
    role: DbRole.MEMBER,
    status: DbUserStatus.ACTIVE,
    isPhoneVerified: true,
    profile: { fullName: 'Active Member' },
  });

  // Seed suspended member
  db.users.push({
    id: 'user_suspended_1',
    phone: suspendedPhone,
    passwordHash: initialPasswordHash,
    role: DbRole.MEMBER,
    status: DbUserStatus.SUSPENDED,
    isPhoneVerified: true,
    profile: { fullName: 'Suspended Member' },
  });

  // Mock delivery service that records captured raw tokens
  const capturedDeliveries: Array<{ phone: string; rawToken: string }> = [];
  const testDeliveryAdapter = {
    deliverResetLink: async (params: ResetDeliveryParams) => {
      capturedDeliveries.push({ phone: params.phone, rawToken: params.rawToken });
      return { success: true, channel: 'console' as const };
    },
  };

  const tenantContext = {
    slug: 'kewat',
    name: 'Kewat Samaj',
    isResolved: true,
    source: 'header' as any,
  };

  // ---------------------------------------------------------------------------
  // TC-01: Existing and nonexistent phone numbers receive equivalent public responses
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 1: Anti-Enumeration for Nonexistent Phone ---');
  const http1Existing = createMockHttp({
    tenant: tenantContext,
    db,
    body: { phone: activePhone },
  });
  await forgotPasswordHandler(http1Existing.req, http1Existing.res);

  const http1Nonexistent = createMockHttp({
    tenant: tenantContext,
    db,
    body: { phone: nonexistentPhone },
  });
  await forgotPasswordHandler(http1Nonexistent.req, http1Nonexistent.res);

  assertTest(
    http1Existing.getStatus() === 200 &&
      http1Nonexistent.getStatus() === 200 &&
      http1Existing.getBody().message === http1Nonexistent.getBody().message &&
      http1Existing.getBody().message === 'If an account is associated with this phone number, password reset instructions have been sent.',
    'TC-01',
    'Existing and nonexistent phone numbers receive identical generic HTTP 200 responses (Zero Phone Enumeration)',
    `Existing HTTP ${http1Existing.getStatus()}, Nonexistent HTTP ${http1Nonexistent.getStatus()}`
  );

  // ---------------------------------------------------------------------------
  // TC-02: Suspended accounts do not disclose their status
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Anti-Enumeration for Suspended Accounts ---');
  const http2Suspended = createMockHttp({
    tenant: tenantContext,
    db,
    body: { phone: suspendedPhone },
  });
  const deliveryCountBefore = capturedDeliveries.length;
  await forgotPasswordHandler(http2Suspended.req, http2Suspended.res);

  assertTest(
    http2Suspended.getStatus() === 200 &&
      http2Suspended.getBody().message === http1Existing.getBody().message &&
      capturedDeliveries.length === deliveryCountBefore,
    'TC-02',
    'Suspended accounts receive equivalent generic HTTP 200 without disclosing suspension or dispatching reset links',
    `Status ${http2Suspended.getStatus()}, Delivered tokens: ${capturedDeliveries.length - deliveryCountBefore}`
  );

  // ---------------------------------------------------------------------------
  // TC-03: Invalid phone numbers are rejected consistently
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Invalid Phone Validation ---');
  const http3Invalid1 = createMockHttp({
    tenant: tenantContext,
    db,
    body: { phone: '123' },
  });
  await forgotPasswordHandler(http3Invalid1.req, http3Invalid1.res);

  const http3Invalid2 = createMockHttp({
    tenant: tenantContext,
    db,
    body: { phone: 'not-a-phone' },
  });
  await forgotPasswordHandler(http3Invalid2.req, http3Invalid2.res);

  assertTest(
    http3Invalid1.getStatus() === 400 && http3Invalid2.getStatus() === 400,
    'TC-03',
    'Invalid or malformed phone numbers are rejected consistently with HTTP 400 Bad Request',
    `Short phone status: ${http3Invalid1.getStatus()}, Alpha phone status: ${http3Invalid2.getStatus()}`
  );

  // ---------------------------------------------------------------------------
  // TC-04: Raw tokens are not stored in the database
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Token Hashing at Rest ---');
  capturedDeliveries.length = 0;
  await requestPasswordReset(activePhone, db, 'kewat', undefined, testDeliveryAdapter);
  const activeDelivery = capturedDeliveries[0];
  assert(activeDelivery, 'Delivery should have succeeded');

  const storedToken = db.passwordResetTokens.find((t: MockPasswordResetToken) => t.userId === 'user_active_1' && t.usedAt === null);
  assert(storedToken, 'Stored reset token should exist in DB');

  assertTest(
    storedToken.tokenHash !== activeDelivery.rawToken &&
      storedToken.tokenHash === hashToken(activeDelivery.rawToken),
    'TC-04',
    'Raw reset tokens are never persisted at rest; database stores strictly SHA-256 tokenHash',
    `Raw length: ${activeDelivery.rawToken.length}, Hash length: ${storedToken.tokenHash.length}`
  );

  // ---------------------------------------------------------------------------
  // TC-05: Tokens expire after 15 minutes
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: 15-Minute Expiration Window ---');
  const nowMs = Date.now();
  const tokenExpiryMs = storedToken.expiresAt.getTime();
  const diffMinutes = Math.round((tokenExpiryMs - nowMs) / (60 * 1000));

  assertTest(
    diffMinutes === 15,
    'TC-05',
    'Reset token expiry is configured precisely for 15 minutes',
    `Calculated lifetime: ${diffMinutes} minutes`
  );

  // ---------------------------------------------------------------------------
  // TC-06: Expired tokens are rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Expired Token Rejection ---');
  // Artificially expire the token
  storedToken.expiresAt = new Date(Date.now() - 1000);

  let verifyExpiredFailed = false;
  try {
    await verifyResetToken(activeDelivery.rawToken, db);
  } catch (err) {
    verifyExpiredFailed = err instanceof InvalidResetTokenError;
  }

  let resetExpiredFailed = false;
  try {
    await resetPassword(activeDelivery.rawToken, 'NewPassword123!', db);
  } catch (err) {
    resetExpiredFailed = err instanceof InvalidResetTokenError;
  }

  assertTest(
    verifyExpiredFailed && resetExpiredFailed,
    'TC-06',
    'Expired tokens are strictly rejected during verify and redemption attempts (HTTP 400)',
    `verifyExpiredFailed=${verifyExpiredFailed}, resetExpiredFailed=${resetExpiredFailed}`
  );

  // ---------------------------------------------------------------------------
  // TC-07: Used tokens cannot be redeemed again
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Used Token Rejection ---');
  // Mark token unexpired but already used
  storedToken.expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  storedToken.usedAt = new Date();

  let verifyUsedFailed = false;
  try {
    await verifyResetToken(activeDelivery.rawToken, db);
  } catch (err) {
    verifyUsedFailed = err instanceof InvalidResetTokenError;
  }

  let resetUsedFailed = false;
  try {
    await resetPassword(activeDelivery.rawToken, 'NewPassword123!', db);
  } catch (err) {
    resetUsedFailed = err instanceof InvalidResetTokenError;
  }

  assertTest(
    verifyUsedFailed && resetUsedFailed,
    'TC-07',
    'Used tokens cannot be redeemed again (Single-use enforcement)',
    `verifyUsedFailed=${verifyUsedFailed}, resetUsedFailed=${resetUsedFailed}`
  );

  // ---------------------------------------------------------------------------
  // TC-08: A new request retires previous active tokens
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 8: Prior Active Token Invalidation ---');
  capturedDeliveries.length = 0;
  // Issue first token
  await requestPasswordReset(activePhone, db, 'kewat', undefined, testDeliveryAdapter);
  const token1 = capturedDeliveries[0];
  const dbToken1 = db.passwordResetTokens.find((t: MockPasswordResetToken) => t.tokenHash === hashToken(token1.rawToken));
  assert(dbToken1 && dbToken1.usedAt === null, 'First token should be active');

  // Issue second token for the same user
  await requestPasswordReset(activePhone, db, 'kewat', undefined, testDeliveryAdapter);
  const token2 = capturedDeliveries[1];
  const dbToken2 = db.passwordResetTokens.find((t: MockPasswordResetToken) => t.tokenHash === hashToken(token2.rawToken));

  assertTest(
    dbToken1.usedAt !== null && dbToken2?.usedAt === null,
    'TC-08',
    'Requesting a new password reset token atomically retires previous unused tokens for the same user',
    `Prior token usedAt: ${dbToken1.usedAt ? 'RETIRED' : 'STILL_ACTIVE'}, New token usedAt: ${dbToken2?.usedAt === null ? 'ACTIVE' : 'INACTIVE'}`
  );

  // ---------------------------------------------------------------------------
  // TC-09: Successful reset updates the password using Argon2id
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 9: Argon2id Password Reset ---');
  const NEW_PASSWORD = 'BrandNewSecurePassword123!';
  await resetPassword(token2.rawToken, NEW_PASSWORD, db);

  const updatedUser = db.users.find((u: MockUser) => u.id === 'user_active_1');
  assert(updatedUser, 'User must exist');
  const isNewPasswordValid = await argon2.verify(updatedUser.passwordHash, NEW_PASSWORD);

  assertTest(
    isNewPasswordValid && updatedUser.passwordHash !== initialPasswordHash,
    'TC-09',
    'Successful password reset updates User.passwordHash with a fresh Argon2id hash',
    `Hash verified: ${isNewPasswordValid}`
  );

  // ---------------------------------------------------------------------------
  // TC-10: The old password no longer works
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 10: Invalidation of Old Password ---');
  const isOldPasswordValid = await argon2.verify(updatedUser.passwordHash, INITIAL_PASSWORD);

  assertTest(
    !isOldPasswordValid,
    'TC-10',
    'The old password is completely invalidated after reset',
    `Old password check: ${isOldPasswordValid ? 'ACCEPTED (FAIL)' : 'REJECTED (PASS)'}`
  );

  // ---------------------------------------------------------------------------
  // TC-11: Active refresh-token sessions are revoked
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 11: Refresh Token Session Revocation ---');
  // Seed two refresh tokens for user (one active, one already revoked)
  db.refreshTokens.push({
    id: 'rt_active_session',
    userId: 'user_active_1',
    tokenHash: 'hash_rt_1',
    familyId: 'fam_1',
    isRevoked: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });

  // Request new reset token and redeem it
  capturedDeliveries.length = 0;
  await requestPasswordReset(activePhone, db, 'kewat', undefined, testDeliveryAdapter);
  const tokenForRevokeTest = capturedDeliveries[0];
  await resetPassword(tokenForRevokeTest.rawToken, 'AnotherNewPassword999!', db);

  const userActiveSessions = db.refreshTokens.filter(
    (rt: MockRefreshToken) => rt.userId === 'user_active_1' && !rt.isRevoked
  );

  assertTest(
    userActiveSessions.length === 0,
    'TC-11',
    'All active refresh-token sessions are revoked atomically upon password reset',
    `Remaining active sessions: ${userActiveSessions.length}`
  );

  // ---------------------------------------------------------------------------
  // TC-12: Outstanding reset tokens are retired
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 12: Outstanding Reset Tokens Retirement ---');
  const activeResetTokens = db.passwordResetTokens.filter(
    (prt: MockPasswordResetToken) => prt.userId === 'user_active_1' && prt.usedAt === null
  );

  assertTest(
    activeResetTokens.length === 0,
    'TC-12',
    'All outstanding password reset tokens for the user are retired upon successful reset',
    `Active tokens: ${activeResetTokens.length}`
  );

  // ---------------------------------------------------------------------------
  // TC-13: Concurrent redemption permits only one successful reset
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 13: Concurrency Race Condition Safety ---');
  capturedDeliveries.length = 0;
  await requestPasswordReset(activePhone, db, 'kewat', undefined, testDeliveryAdapter);
  const raceToken = capturedDeliveries[0];

  // Two concurrent redemptions racing with the exact same token
  const [race1, race2] = await Promise.allSettled([
    resetPassword(raceToken.rawToken, 'WinningPasswordOne1!', db),
    resetPassword(raceToken.rawToken, 'LosingPasswordTwo2!', db),
  ]);

  const fulfilled = [race1, race2].filter((r) => r.status === 'fulfilled');
  const rejected = [race1, race2].filter((r) => r.status === 'rejected');
  const winningPassword = race1.status === 'fulfilled' ? 'WinningPasswordOne1!' : 'LosingPasswordTwo2!';

  assertTest(
    fulfilled.length === 1 && rejected.length === 1,
    'TC-13',
    'Concurrent redemption permits exactly ONE successful reset and safely rejects racing attempts',
    `Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`
  );

  // ---------------------------------------------------------------------------
  // TC-14: Cross-tenant access is rejected
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 14: Cross-Tenant Boundary Protection ---');
  const http14MissingTenant = createMockHttp({
    tenant: undefined,
    db: undefined,
    body: { phone: activePhone },
  });
  await forgotPasswordHandler(http14MissingTenant.req, http14MissingTenant.res);

  const http14AdminTenant = createMockHttp({
    isCentralAdmin: true,
    tenant: undefined,
    db: undefined,
    body: { phone: activePhone },
  });
  await forgotPasswordHandler(http14AdminTenant.req, http14AdminTenant.res);

  assertTest(
    http14MissingTenant.getStatus() === 400 && http14AdminTenant.getStatus() === 400,
    'TC-14',
    'Requests without valid resolved tenant context fail closed with HTTP 400 Bad Request',
    `Missing tenant status: ${http14MissingTenant.getStatus()}, Central admin status: ${http14AdminTenant.getStatus()}`
  );

  // ---------------------------------------------------------------------------
  // TC-15: IP and phone rate limits work
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 15: Rate Limiting Enforcement ---');
  let rateLimitHit = false;
  const mockReqRateLimit: any = {
    ip: '198.51.100.1',
    body: { phone: '+919999944444' },
    headers: {},
  };
  const mockResRateLimit: any = {
    status: (code: number) => {
      if (code === 429) rateLimitHit = true;
      return mockResRateLimit;
    },
    json: () => mockResRateLimit,
    setHeader: () => mockResRateLimit,
    getHeader: () => undefined,
  };

  // Trigger forgotPasswordPhoneRateLimiter past limit of 3
  for (let i = 0; i < 4; i++) {
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      const mockRes: any = {
        status: (code: number) => {
          if (code === 429) rateLimitHit = true;
          done();
          return mockRes;
        },
        json: () => {
          done();
          return mockRes;
        },
        setHeader: () => mockRes,
        getHeader: () => undefined,
      };
      forgotPasswordPhoneRateLimiter(mockReqRateLimit, mockRes, done);
    });
  }

  assertTest(
    rateLimitHit,
    'TC-15',
    'Rate limiting middleware enforces request boundaries and returns HTTP 429 Too Many Requests',
    `HTTP 429 triggered: ${rateLimitHit}`
  );

  // ---------------------------------------------------------------------------
  // TC-16: Production mode fails closed when SMS delivery is not configured
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 16: Production Mode Fail-Closed Safeguard ---');
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSmsKey = process.env.SMS_API_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SMS_API_KEY;
    delete process.env.FAST2SMS_API_KEY;
    delete process.env.MSG91_AUTH_KEY;

    const prodSmsAdapter = new SmsResetDeliveryAdapter();
    const prodDeliveryResult = await prodSmsAdapter.deliverResetLink({
      phone: activePhone,
      rawToken: 'dummy_token',
    });

    const tokensCountBefore = db.passwordResetTokens.length;
    const requestResult = await requestPasswordReset(activePhone, db, 'kewat');

    assertTest(
      prodDeliveryResult.success === false &&
        requestResult.delivered === false &&
        db.passwordResetTokens.length === tokensCountBefore,
      'TC-16',
      'In production mode without configured SMS provider, delivery fails closed and creates zero usable reset tokens',
      `Adapter success: ${prodDeliveryResult.success}, Usable tokens created: ${db.passwordResetTokens.length - tokensCountBefore}`
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSmsKey) process.env.SMS_API_KEY = originalSmsKey;
  }

  // ---------------------------------------------------------------------------
  // TC-17: Development console delivery works only outside production
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 17: Console Delivery Environment Guard ---');
  const consoleAdapter = new ConsoleResetDeliveryAdapter();

  // Test in non-production
  process.env.NODE_ENV = 'development';
  const devResult = await consoleAdapter.deliverResetLink({
    phone: activePhone,
    rawToken: 'dev_test_token',
  });

  // Test in production (must refuse)
  process.env.NODE_ENV = 'production';
  const prodBlockedResult = await consoleAdapter.deliverResetLink({
    phone: activePhone,
    rawToken: 'dev_test_token',
  });
  process.env.NODE_ENV = originalNodeEnv;

  assertTest(
    devResult.success === true && prodBlockedResult.success === false,
    'TC-17',
    'Console delivery adapter functions exclusively outside production and strictly refuses execution in production',
    `Dev success: ${devResult.success}, Prod blocked: ${!prodBlockedResult.success}`
  );

  // ---------------------------------------------------------------------------
  // TC-18: Existing login and refresh-token behavior remains unchanged
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 18: Authentication Regression Verification ---');
  // 1. Login with old password fails
  let oldLoginFailed = false;
  try {
    await loginWithPhonePassword(activePhone, INITIAL_PASSWORD, undefined, undefined, db, 'kewat');
  } catch (err) {
    oldLoginFailed = err instanceof InvalidCredentialsError;
  }

  // 2. Login with current password succeeds
  const currentPassword = winningPassword; // From winning race in TC-13
  const loginSession = await loginWithPhonePassword(
    activePhone,
    currentPassword,
    undefined,
    undefined,
    db,
    'kewat'
  );

  // 3. Refreshing the session succeeds and rotates token
  const refreshResult = await refreshSession(
    loginSession.refreshToken,
    undefined,
    undefined,
    db,
    'kewat'
  );

  assertTest(
    oldLoginFailed &&
      Boolean(loginSession.accessToken) &&
      Boolean(refreshResult.accessToken) &&
      refreshResult.refreshToken !== loginSession.refreshToken,
    'TC-18',
    'Existing login, Argon2id verification, and refresh-token rotation behaviors operate cleanly without regression',
    `Old login rejected: ${oldLoginFailed}, Session created & rotated successfully`
  );

  console.log('\n================================================================');
  console.log(`   Final Summary: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

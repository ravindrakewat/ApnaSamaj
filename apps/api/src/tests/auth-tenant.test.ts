import assert from 'node:assert';
import * as argon2 from 'argon2';
import { PrismaClient, tenantDbManager, Role as DbRole, UserStatus as DbUserStatus } from '@apnasamaj/database';
import {
  loginWithPhonePassword,
  registerMember,
  refreshSession,
  logoutSession,
  AuthError,
  InvalidCredentialsError,
  DuplicatePhoneError,
  AccountSuspendedError,
  InvalidRefreshTokenError,
  ReplayAttackError,
} from '../modules/auth/auth.service';
import {
  loginHandler,
  registerHandler,
  refreshHandler,
  logoutHandler,
} from '../modules/auth/auth.controller';
import {
  generateAccessToken,
  verifyAccessToken,
  hashToken,
  calculateRefreshTokenExpiry,
} from '../modules/auth/auth.tokens';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authenticate';
import { TenantRequest } from '../middleware/tenant.middleware';
import { UserRole, UserStatus } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15C.5 Authentication & Refresh Isolation  ');
console.log('================================================================\n');

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

// -------------------------------------------------------------
// Isolated In-Memory Mock Prisma Client Factory for Auth
// -------------------------------------------------------------
interface MockAuthUser {
  id: string;
  phone: string;
  passwordHash: string;
  role: DbRole;
  status: DbUserStatus;
  isPhoneVerified: boolean;
  profile?: {
    fullName: string;
    gender?: string | null;
    city?: string | null;
    state?: string | null;
    subCaste?: string | null;
    gotra?: string | null;
  } | null;
}

interface MockRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  isRevoked: boolean;
  replacedBy?: string | null;
  expiresAt: Date;
  revokedAt?: Date | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  user?: MockAuthUser;
}

interface MockAuthStore {
  users: MockAuthUser[];
  refreshTokens: MockRefreshToken[];
}

function createMockAuthPrismaClient(slug: string, initialStore: MockAuthStore) {
  const queryLog: string[] = [];
  const users: MockAuthUser[] = initialStore.users.map((u) => ({ ...u, profile: u.profile ? { ...u.profile } : null }));
  const refreshTokens: MockRefreshToken[] = initialStore.refreshTokens.map((t) => ({ ...t }));

  const client: any = {
    slug,
    queryLog,
    users,
    refreshTokens,
    resetLog: () => {
      queryLog.length = 0;
    },

    user: {
      findUnique: async ({ where, select }: any) => {
        queryLog.push(`user.findUnique(${slug}, ${JSON.stringify(where)})`);
        const found = users.find((u) => (where.id && u.id === where.id) || (where.phone && u.phone === where.phone));
        if (!found) return null;
        return {
          id: found.id,
          phone: found.phone,
          passwordHash: found.passwordHash,
          role: found.role,
          status: found.status,
          isPhoneVerified: found.isPhoneVerified,
          profile: found.profile ? { fullName: found.profile.fullName } : null,
        };
      },
      create: async ({ data, select }: any) => {
        queryLog.push(`user.create(${slug})`);
        const newUser: MockAuthUser = {
          id: `usr_${slug}_${users.length + 1}`,
          phone: data.phone,
          passwordHash: data.passwordHash,
          role: data.role,
          status: data.status,
          isPhoneVerified: data.isPhoneVerified,
          profile: data.profile?.create
            ? {
                fullName: data.profile.create.fullName,
                gender: data.profile.create.gender || null,
                city: data.profile.create.city || null,
                state: data.profile.create.state || null,
                subCaste: data.profile.create.subCaste || null,
                gotra: data.profile.create.gotra || null,
              }
            : null,
        };
        users.push(newUser);
        return {
          id: newUser.id,
          phone: newUser.phone,
          role: newUser.role,
          status: newUser.status,
          isPhoneVerified: newUser.isPhoneVerified,
          profile: newUser.profile ? { fullName: newUser.profile.fullName } : null,
        };
      },
    },

    profile: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`profile.findUnique(${slug}, ${JSON.stringify(where)})`);
        const u = users.find((user) => user.id === where.userId);
        return u?.profile ? { fullName: u.profile.fullName } : null;
      },
    },

    refreshToken: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`refreshToken.findUnique(${slug}, ${JSON.stringify(where)})`);
        const found = refreshTokens.find((t) => t.tokenHash === where.tokenHash);
        if (!found) return null;
        const user = users.find((u) => u.id === found.userId);
        return {
          ...found,
          user: user
            ? {
                id: user.id,
                phone: user.phone,
                role: user.role,
                status: user.status,
                isPhoneVerified: user.isPhoneVerified,
                profile: user.profile ? { fullName: user.profile.fullName } : null,
              }
            : null,
        };
      },
      create: async ({ data }: any) => {
        queryLog.push(`refreshToken.create(${slug})`);
        const newRecord: MockRefreshToken = {
          id: `tok_${slug}_${refreshTokens.length + 1}`,
          userId: data.userId,
          tokenHash: data.tokenHash,
          familyId: data.familyId,
          isRevoked: false,
          replacedBy: null,
          expiresAt: data.expiresAt,
          userAgent: data.userAgent || null,
          ipAddress: data.ipAddress || null,
        };
        refreshTokens.push(newRecord);
        return newRecord;
      },
      update: async ({ where, data }: any) => {
        queryLog.push(`refreshToken.update(${slug})`);
        const item = refreshTokens.find((t) => t.id === where.id);
        if (item) {
          Object.assign(item, data);
        }
        return item;
      },
      updateMany: async ({ where, data }: any) => {
        queryLog.push(`refreshToken.updateMany(${slug})`);
        let count = 0;
        for (const item of refreshTokens) {
          let match = true;
          if (where.tokenHash && item.tokenHash !== where.tokenHash) match = false;
          if (where.familyId && item.familyId !== where.familyId) match = false;
          if (where.isRevoked !== undefined && item.isRevoked !== where.isRevoked) match = false;
          if (match) {
            Object.assign(item, data);
            count++;
          }
        }
        return { count };
      },
    },

    $transaction: async (input: any) => {
      queryLog.push(`$transaction(${slug})`);
      if (typeof input === 'function') {
        return await input(client);
      }
      if (Array.isArray(input)) {
        return await Promise.all(input);
      }
      return input;
    },
  };

  return client;
}

// Helper to simulate express response
function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    cookies: {} as Record<string, any>,
    clearedCookies: [] as string[],
    status: function (code: number) {
      this.statusCode = code;
      return this;
    },
    json: function (payload: any) {
      this.body = payload;
      return this;
    },
    cookie: function (name: string, val: any, opts: any) {
      this.cookies[name] = { val, opts };
      return this;
    },
    clearCookie: function (name: string) {
      this.clearedCookies.push(name);
      delete this.cookies[name];
      return this;
    },
    setHeader: function (key: string, value: string) {
      this.headers[key] = value;
      return this;
    },
  };
  return res;
}

async function runAuthTenantTestSuite() {
  console.log('Setting up isolated test fixtures for Kewat, Gupta, and Central...\n');

  const testPassword = 'SecurePassword123!';
  const hashedPassword = await argon2.hash(testPassword, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  // 1. Kewat Data Store
  const kewatStore: MockAuthStore = {
    users: [
      {
        id: 'usr_kewat_1',
        phone: '+919876543210',
        passwordHash: hashedPassword,
        role: DbRole.MEMBER,
        status: DbUserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: { fullName: 'Ramesh Kewat' },
      },
      {
        id: 'usr_kewat_suspended',
        phone: '+919876543211',
        passwordHash: hashedPassword,
        role: DbRole.MEMBER,
        status: DbUserStatus.SUSPENDED,
        isPhoneVerified: true,
        profile: { fullName: 'Suspended Kewat' },
      },
    ],
    refreshTokens: [],
  };

  // 2. Gupta Data Store
  const guptaStore: MockAuthStore = {
    users: [
      {
        id: 'usr_gupta_1',
        phone: '+919123456789',
        passwordHash: hashedPassword,
        role: DbRole.MEMBER,
        status: DbUserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: { fullName: 'Amit Gupta' },
      },
    ],
    refreshTokens: [],
  };

  // 3. Central Control-Plane Store (Super Admin)
  const centralStore: MockAuthStore = {
    users: [
      {
        id: 'usr_superadmin_1',
        phone: '+919999999999',
        passwordHash: hashedPassword,
        role: DbRole.SUPER_ADMIN,
        status: DbUserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: { fullName: 'Platform Super Admin' },
      },
      {
        id: 'usr_central_member',
        phone: '+919888888888',
        passwordHash: hashedPassword,
        role: DbRole.MEMBER, // Not Super Admin!
        status: DbUserStatus.ACTIVE,
        isPhoneVerified: true,
        profile: { fullName: 'Accidental Central Member' },
      },
    ],
    refreshTokens: [],
  };

  const kewatClient = createMockAuthPrismaClient('kewat', kewatStore);
  const guptaClient = createMockAuthPrismaClient('gupta', guptaStore);
  const centralClient = createMockAuthPrismaClient('central', centralStore);

  // Register with tenantDbManager for controller resolution
  tenantDbManager.setClient('kewat', kewatClient as unknown as PrismaClient);
  tenantDbManager.setClient('gupta', guptaClient as unknown as PrismaClient);

  // -----------------------------------------------------------
  // TEST SUITE 1: loginWithPhonePassword Isolation
  // -----------------------------------------------------------
  console.log('--- Test Suite 1: loginWithPhonePassword Service Isolation ---');

  // Test 1.1: Fails closed when db is missing
  try {
    await loginWithPhonePassword('+919876543210', testPassword, 'UA', '127.0.0.1', undefined);
    assert.fail('Expected error for missing db');
  } catch (err: any) {
    assertTest(
      err instanceof AuthError && err.statusCode === 500 && err.message.includes('Tenant database connection is required'),
      '1.1 loginWithPhonePassword fails closed with 500 when db client is undefined'
    );
  }

  // Test 1.2: Kewat login queries only Kewat DB
  kewatClient.resetLog();
  guptaClient.resetLog();
  centralClient.resetLog();

  const kewatLoginResult = await loginWithPhonePassword(
    '+919876543210',
    testPassword,
    'Mozilla',
    '1.2.3.4',
    kewatClient,
    'kewat'
  );

  assertTest(
    kewatClient.queryLog.some((q: string) => q.includes('user.findUnique(kewat')) &&
      kewatClient.queryLog.some((q: string) => q.includes('refreshToken.create(kewat')),
    '1.2 Kewat login queries and stores refresh token in Kewat DB'
  );
  assertTest(
    guptaClient.queryLog.length === 0 && centralClient.queryLog.length === 0,
    '1.2 Gupta and Central databases receive 0 queries during Kewat login'
  );

  // Test 1.3: Access token includes communitySlug claim
  const decodedKewatToken = verifyAccessToken(kewatLoginResult.accessToken);
  assertTest(
    decodedKewatToken.communitySlug === 'kewat' && decodedKewatToken.sub === 'usr_kewat_1',
    '1.3 Issued access token contains communitySlug: "kewat" and sub: "usr_kewat_1"'
  );

  // Test 1.4: Cross-tenant lookup returns InvalidCredentialsError
  kewatClient.resetLog();
  guptaClient.resetLog();
  try {
    // Ramesh Kewat (+919876543210) does NOT exist in Gupta DB
    await loginWithPhonePassword(
      '+919876543210',
      testPassword,
      'Mozilla',
      '1.2.3.4',
      guptaClient,
      'gupta'
    );
    assert.fail('Expected InvalidCredentialsError');
  } catch (err: any) {
    assertTest(
      err instanceof InvalidCredentialsError && err.statusCode === 401,
      '1.4 Kewat user credentials fail on Gupta DB with 401 InvalidCredentialsError'
    );
    assertTest(
      guptaClient.queryLog.length === 1 && kewatClient.queryLog.length === 0,
      '1.4 Cross-tenant query checked only Gupta DB; Kewat DB was never touched'
    );
  }

  // Test 1.5: Suspended account throws AccountSuspendedError
  try {
    await loginWithPhonePassword(
      '+919876543211',
      testPassword,
      'Mozilla',
      '1.2.3.4',
      kewatClient,
      'kewat'
    );
    assert.fail('Expected AccountSuspendedError');
  } catch (err: any) {
    assertTest(
      err instanceof AccountSuspendedError && err.statusCode === 403,
      '1.5 Suspended Kewat account is rejected with 403 AccountSuspendedError'
    );
  }

  // -----------------------------------------------------------
  // TEST SUITE 2: registerMember Service Isolation
  // -----------------------------------------------------------
  console.log('\n--- Test Suite 2: registerMember Service Isolation ---');

  // Test 2.1: Missing db fails closed with 500
  try {
    await registerMember({ phone: '+919988776655', password: 'NewPassword123!', fullName: 'New Member' });
    assert.fail('Expected error for missing db');
  } catch (err: any) {
    assertTest(
      err instanceof AuthError && err.statusCode === 500,
      '2.1 registerMember fails closed with 500 when db is missing'
    );
  }

  // Test 2.2: Register in Gupta DB creates record strictly in Gupta DB
  kewatClient.resetLog();
  guptaClient.resetLog();
  centralClient.resetLog();

  const newGuptaRegistration = await registerMember(
    {
      phone: '+919000000001',
      password: 'StrongPassword123!',
      fullName: 'Pooja Gupta',
      city: 'Delhi',
      state: 'Delhi',
      subCaste: 'Kanojia',
    },
    'Mozilla',
    '1.2.3.4',
    guptaClient,
    'gupta'
  );

  assertTest(
    guptaClient.queryLog.some((q: string) => q.includes('user.findUnique(gupta')) &&
      guptaClient.queryLog.some((q: string) => q.includes('user.create(gupta')) &&
      guptaClient.queryLog.some((q: string) => q.includes('refreshToken.create(gupta')),
    '2.2 Registration in Gupta executes user and token creation strictly in Gupta DB'
  );
  assertTest(
    kewatClient.queryLog.length === 0 && centralClient.queryLog.length === 0,
    '2.2 Kewat and Central DBs remain untouched during Gupta member registration'
  );
  assertTest(
    guptaClient.users.some((u: MockAuthUser) => u.phone === '+919000000001') &&
      !kewatClient.users.some((u: MockAuthUser) => u.phone === '+919000000001'),
    '2.2 User "+919000000001" exists exclusively in Gupta store, not in Kewat store'
  );

  const decodedGuptaToken = verifyAccessToken(newGuptaRegistration.accessToken);
  assertTest(
    decodedGuptaToken.communitySlug === 'gupta',
    '2.2 Registration access token is stamped with communitySlug: "gupta"'
  );

  // Test 2.3: Duplicate phone check applies per-tenant DB
  try {
    await registerMember(
      { phone: '+919000000001', password: 'AnotherPassword123!', fullName: 'Duplicate Pooja' },
      'Mozilla',
      '1.2.3.4',
      guptaClient,
      'gupta'
    );
    assert.fail('Expected DuplicatePhoneError');
  } catch (err: any) {
    assertTest(
      err instanceof DuplicatePhoneError && err.statusCode === 409,
      '2.3 Registering same phone within Gupta DB triggers 409 DuplicatePhoneError'
    );
  }

  // Same phone can be registered in Kewat DB without collision (separate DBs)
  const kewatWithSamePhone = await registerMember(
    { phone: '+919000000001', password: 'KewatPassword123!', fullName: 'Same Phone In Kewat' },
    'Mozilla',
    '1.2.3.4',
    kewatClient,
    'kewat'
  );
  assertTest(
    Boolean(kewatWithSamePhone.accessToken),
    '2.3 Independent database architecture allows non-conflicting phone registration in Kewat DB'
  );

  // -----------------------------------------------------------
  // TEST SUITE 3: refreshSession & Token Rotation Isolation
  // -----------------------------------------------------------
  console.log('\n--- Test Suite 3: refreshSession & Token Rotation Isolation ---');

  // Test 3.1: Missing db fails closed
  try {
    await refreshSession(kewatLoginResult.refreshToken);
    assert.fail('Expected error for missing db');
  } catch (err: any) {
    assertTest(
      err instanceof AuthError && err.statusCode === 500,
      '3.1 refreshSession fails closed with 500 when db is missing'
    );
  }

  // Test 3.2: Kewat refresh token presented to Gupta DB is rejected with 401
  kewatClient.resetLog();
  guptaClient.resetLog();

  try {
    await refreshSession(kewatLoginResult.refreshToken, 'Mozilla', '1.2.3.4', guptaClient, 'gupta');
    assert.fail('Expected InvalidRefreshTokenError');
  } catch (err: any) {
    assertTest(
      err instanceof InvalidRefreshTokenError && err.statusCode === 401,
      '3.2 Kewat refresh token presented to Gupta DB fails with 401 InvalidRefreshTokenError'
    );
    assertTest(
      guptaClient.queryLog.length === 1 && kewatClient.queryLog.length === 0,
      '3.2 Cross-tenant refresh touched only Gupta DB; Kewat DB was never queried or updated'
    );
  }

  // Test 3.3: Kewat refresh token presented to Kewat DB succeeds and rotates
  kewatClient.resetLog();
  const refreshedKewat = await refreshSession(
    kewatLoginResult.refreshToken,
    'Mozilla',
    '1.2.3.4',
    kewatClient,
    'kewat'
  );

  assertTest(
    kewatClient.queryLog.some((q: string) => q.includes('refreshToken.findUnique(kewat')) &&
      kewatClient.queryLog.some((q: string) => q.includes('$transaction(kewat')),
    '3.3 Valid refresh token rotates session in Kewat DB'
  );
  assertTest(
    refreshedKewat.refreshToken !== kewatLoginResult.refreshToken,
    '3.3 Fresh opaque refresh token is generated (rotation)'
  );

  const decodedRefreshedToken = verifyAccessToken(refreshedKewat.accessToken);
  assertTest(
    decodedRefreshedToken.communitySlug === 'kewat',
    '3.3 Rotated session access token retains communitySlug: "kewat"'
  );

  // Test 3.4: Replay Attack Detection revokes entire family
  try {
    // Replay the old, already-rotated Kewat token
    await refreshSession(kewatLoginResult.refreshToken, 'Mozilla', '1.2.3.4', kewatClient, 'kewat');
    assert.fail('Expected ReplayAttackError');
  } catch (err: any) {
    assertTest(
      err instanceof ReplayAttackError && err.statusCode === 401,
      '3.4 Replaying rotated refresh token triggers ReplayAttackError'
    );
    assertTest(
      kewatClient.queryLog.some((q: string) => q.includes('refreshToken.updateMany(kewat')),
      '3.4 Replay attack causes full family revocation in Kewat DB'
    );
  }

  // -----------------------------------------------------------
  // TEST SUITE 4: logoutSession Isolation
  // -----------------------------------------------------------
  console.log('\n--- Test Suite 4: logoutSession Isolation ---');

  kewatClient.resetLog();
  guptaClient.resetLog();

  await logoutSession(refreshedKewat.refreshToken, kewatClient);
  assertTest(
    kewatClient.queryLog.some((q: string) => q.includes('refreshToken.updateMany(kewat')),
    '4.1 Logout marks token revoked in Kewat DB'
  );
  assertTest(
    guptaClient.queryLog.length === 0,
    '4.1 Gupta DB receives 0 queries during Kewat logout'
  );

  // -----------------------------------------------------------
  // TEST SUITE 5: Controller Tenant Routing & Fail-Closed Guards
  // -----------------------------------------------------------
  console.log('\n--- Test Suite 5: Controller Tenant Routing & Fail-Closed Guards ---');

  // Test 5.1: loginHandler without tenant and not central admin fails closed with HTTP 400
  const unroutedReq: any = {
    body: { phone: '+919876543210', password: testPassword },
    headers: {},
    isCentralAdmin: false,
    tenant: undefined,
    db: undefined,
  };
  const unroutedRes = createMockResponse();

  await loginHandler(unroutedReq, unroutedRes);
  assertTest(
    unroutedRes.statusCode === 400 &&
      unroutedRes.body?.error?.includes('Community context required for member login'),
    '5.1 loginHandler rejects unrouted community request with HTTP 400 Bad Request'
  );

  // Test 5.2: loginHandler on Central Admin with regular MEMBER credentials is rejected with HTTP 403
  const memberAdminReq: any = {
    body: { phone: '+919888888888', password: testPassword }, // Central member, NOT Super Admin!
    headers: { host: 'admin.samaz.in' },
    isCentralAdmin: true,
    tenant: undefined,
    db: centralClient,
  };
  const memberAdminRes = createMockResponse();

  await loginHandler(memberAdminReq, memberAdminRes);
  assertTest(
    memberAdminRes.statusCode === 403 &&
      memberAdminRes.body?.error?.includes('Access to central admin console requires SUPER_ADMIN role'),
    '5.2 loginHandler rejects non-SUPER_ADMIN on central admin console with HTTP 403 Forbidden'
  );

  // Test 5.3: loginHandler on Central Admin with SUPER_ADMIN succeeds
  const superAdminReq: any = {
    body: { phone: '+919999999999', password: testPassword },
    headers: { host: 'admin.samaz.in' },
    isCentralAdmin: true,
    tenant: undefined,
    db: centralClient,
  };
  const superAdminRes = createMockResponse();

  await loginHandler(superAdminReq, superAdminRes);
  assertTest(
    superAdminRes.statusCode === 200 &&
      superAdminRes.body?.data?.user?.role === UserRole.SUPER_ADMIN,
    '5.3 loginHandler allows verified SUPER_ADMIN on central admin console with HTTP 200'
  );

  // Test 5.4: loginHandler on Kewat tenant logs in member and sets cookie
  const kewatReq: any = {
    body: { phone: '+919876543210', password: testPassword },
    headers: { host: 'kewat.samaz.in' },
    isCentralAdmin: false,
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'hostname' },
    db: kewatClient,
  };
  const kewatRes = createMockResponse();

  await loginHandler(kewatReq, kewatRes);
  assertTest(
    kewatRes.statusCode === 200 &&
      Boolean(kewatRes.cookies.refreshToken) &&
      verifyAccessToken(kewatRes.body?.data?.accessToken).communitySlug === 'kewat',
    '5.4 loginHandler succeeds for community member and issues tenant-bound tokens'
  );

  // Test 5.5: registerHandler on Central Admin is rejected with HTTP 400
  const adminRegisterReq: any = {
    body: { phone: '+919777777777', password: testPassword, fullName: 'Admin Imposter' },
    headers: { host: 'admin.samaz.in' },
    isCentralAdmin: true,
    tenant: undefined,
    db: centralClient,
  };
  const adminRegisterRes = createMockResponse();

  await registerHandler(adminRegisterReq, adminRegisterRes);
  assertTest(
    adminRegisterRes.statusCode === 400 &&
      adminRegisterRes.body?.error?.includes('Public registration is disabled on the central admin console'),
    '5.5 registerHandler rejects registration on central admin console with HTTP 400'
  );

  // Test 5.6: registerHandler without tenant is rejected with HTTP 400
  const unroutedRegisterReq: any = {
    body: { phone: '+919777777777', password: testPassword, fullName: 'Unrouted User' },
    headers: {},
    isCentralAdmin: false,
    tenant: undefined,
    db: undefined,
  };
  const unroutedRegisterRes = createMockResponse();

  await registerHandler(unroutedRegisterReq, unroutedRegisterRes);
  assertTest(
    unroutedRegisterRes.statusCode === 400 &&
      unroutedRegisterRes.body?.error?.includes('Community context required for member registration'),
    '5.6 registerHandler rejects registration without community context with HTTP 400'
  );

  // Test 5.7: refreshHandler without tenant clears cookie and rejects with HTTP 400
  const unroutedRefreshReq: any = {
    body: { refreshToken: 'any-token' },
    headers: {},
    isCentralAdmin: false,
    tenant: undefined,
    db: undefined,
  };
  const unroutedRefreshRes = createMockResponse();

  await refreshHandler(unroutedRefreshReq, unroutedRefreshRes);
  assertTest(
    unroutedRefreshRes.statusCode === 400 &&
      unroutedRefreshRes.clearedCookies.includes('refreshToken'),
    '5.7 refreshHandler clears cookie and returns HTTP 400 when tenant context is missing'
  );

  // -----------------------------------------------------------
  // TEST SUITE 6: authenticateToken Cross-Tenant Boundary Guard
  // -----------------------------------------------------------
  console.log('\n--- Test Suite 6: authenticateToken Cross-Tenant Boundary Guard ---');

  // Issue valid Kewat token
  const validKewatJwt = generateAccessToken({
    id: 'usr_kewat_1',
    phone: '+919876543210',
    role: 'MEMBER',
    status: 'ACTIVE',
    communitySlug: 'kewat',
  });

  // Test 6.1: Kewat token sent to Gupta tenant is intercepted and rejected with HTTP 403
  let nextCalled = false;
  const crossTenantReq: any = {
    headers: { authorization: `Bearer ${validKewatJwt}`, host: 'gupta.samaz.in' },
    tenant: { slug: 'gupta', name: 'Gupta Samaj', isResolved: true, source: 'hostname' },
    db: guptaClient,
  };
  const crossTenantRes = createMockResponse();
  guptaClient.resetLog();

  await authenticateToken(crossTenantReq, crossTenantRes, () => {
    nextCalled = true;
  });

  assertTest(
    !nextCalled &&
      crossTenantRes.statusCode === 403 &&
      crossTenantRes.body?.error?.includes('Forbidden: Access token was issued for a different community'),
    '6.1 authenticateToken rejects Kewat token on Gupta tenant with HTTP 403 Forbidden'
  );
  assertTest(
    guptaClient.queryLog.length === 0,
    '6.1 Cross-tenant token rejection occurs before querying Gupta database user table'
  );

  // Test 6.2: Kewat token sent to Kewat tenant succeeds and reloads user from Kewat DB
  nextCalled = false;
  const validKewatReq: any = {
    headers: { authorization: `Bearer ${validKewatJwt}`, host: 'kewat.samaz.in' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'hostname' },
    db: kewatClient,
  };
  const validKewatRes = createMockResponse();
  kewatClient.resetLog();

  await authenticateToken(validKewatReq, validKewatRes, () => {
    nextCalled = true;
  });

  assertTest(
    nextCalled && validKewatReq.user?.id === 'usr_kewat_1',
    '6.2 authenticateToken permits valid Kewat token on Kewat tenant and attaches user'
  );
  assertTest(
    kewatClient.queryLog.some((q: string) => q.includes('user.findUnique(kewat')),
    '6.2 authenticateToken reloaded user real-time status from Kewat database'
  );

  console.log('\n================================================================');
  console.log(`Phase 15C.5 Auth Test Suite Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAuthTenantTestSuite().catch((err) => {
  console.error('Fatal error in auth tenant test suite:', err);
  process.exit(1);
});

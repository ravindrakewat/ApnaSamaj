import assert from 'node:assert';
import {
  getDirectoryMembers,
  getMyProfile,
  updateMyProfile,
  getPublicMemberProfile,
  UserServiceError,
  UserNotFoundError,
} from '../modules/users/users.service';
import {
  getDirectoryHandler,
  getMyProfileHandler,
  updateMyProfileHandler,
  getPublicProfileHandler,
} from '../modules/users/users.controller';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { PrismaClient } from '@apnasamaj/database';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15C.2 Tenant-Bound Service Pilot Tests    ');
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

// ---------------------------------------------------------------------------
// Mock Setup: Isolated In-Memory Tenant Prisma Clients
// ---------------------------------------------------------------------------

interface MockUserRecord {
  id: string;
  phone?: string;
  role?: string;
  createdAt: Date;
  updatedAt?: Date;
  status: string;
  isPhoneVerified?: boolean;
  profile: {
    id: string;
    fullName: string;
    gender: string | null;
    bio: string | null;
    avatarUrl: string | null;
    city: string | null;
    state: string | null;
    subCaste: string | null;
    gotra: string | null;
  } | null;
}

function createMockTenantClient(tenantName: string, mockData: MockUserRecord[]) {
  let findManyCalls = 0;
  let countCalls = 0;
  let lastFindManyArgs: any = null;
  let lastCountArgs: any = null;

  const client = {
    _tenantName: tenantName,
    get findManyCalls() {
      return findManyCalls;
    },
    get countCalls() {
      return countCalls;
    },
    get lastFindManyArgs() {
      return lastFindManyArgs;
    },
    get lastCountArgs() {
      return lastCountArgs;
    },
    resetStats() {
      findManyCalls = 0;
      countCalls = 0;
      lastFindManyArgs = null;
      lastCountArgs = null;
    },
    user: {
      findMany: async (args: any) => {
        findManyCalls++;
        lastFindManyArgs = args;
        return mockData;
      },
      count: async (args: any) => {
        countCalls++;
        lastCountArgs = args;
        return mockData.length;
      },
      findUnique: async (args: any) => {
        const id = args.where?.id;
        const found = mockData.find((u) => u.id === id);
        if (!found) return null;
        return {
          id: found.id,
          phone: found.phone || '+919876543210',
          role: found.role || 'MEMBER',
          status: found.status,
          isPhoneVerified: found.isPhoneVerified ?? true,
          createdAt: found.createdAt,
          updatedAt: found.updatedAt || found.createdAt,
          profile: found.profile
            ? {
                ...found.profile,
                createdAt: found.createdAt,
                updatedAt: found.updatedAt || found.createdAt,
              }
            : null,
        };
      },
    },
    profile: {
      update: async (args: any) => {
        const userId = args.where?.userId;
        const found = mockData.find((u) => u.id === userId);
        if (found && found.profile) {
          Object.assign(found.profile, args.data);
          return found.profile;
        }
        return null;
      },
      create: async (args: any) => {
        const userId = args.data?.userId;
        const found = mockData.find((u) => u.id === userId);
        if (found) {
          found.profile = { id: 'prof-new', ...args.data };
          return found.profile;
        }
        return null;
      },
    },
  };

  return client;
}

const mockKewatUsers: MockUserRecord[] = [
  {
    id: 'kewat-user-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    status: 'ACTIVE',
    profile: {
      id: 'kp-1',
      fullName: 'Ramesh Kewat',
      gender: 'MALE',
      bio: 'Kewat Samaj member',
      avatarUrl: 'https://storage/kewat1.jpg',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      subCaste: 'Kashyap',
      gotra: 'Kashyap',
    },
  },
  {
    id: 'kewat-user-2',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    status: 'ACTIVE',
    profile: {
      id: 'kp-2',
      fullName: 'Suresh Kewat',
      gender: 'MALE',
      bio: 'Active volunteer',
      avatarUrl: null,
      city: 'Prayagraj',
      state: 'Uttar Pradesh',
      subCaste: 'Mallāh',
      gotra: 'Vashistha',
    },
  },
];

const mockGuptaUsers: MockUserRecord[] = [
  {
    id: 'gupta-user-1',
    createdAt: new Date('2026-02-01T00:00:00Z'),
    status: 'ACTIVE',
    profile: {
      id: 'gp-1',
      fullName: 'Anil Gupta',
      gender: 'MALE',
      bio: 'Gupta Samaj member',
      avatarUrl: 'https://storage/gupta1.jpg',
      city: 'Delhi',
      state: 'Delhi',
      subCaste: 'Vaishya',
      gotra: 'Garg',
    },
  },
];

const mockKewatDb = createMockTenantClient('kewat', mockKewatUsers);
const mockGuptaDb = createMockTenantClient('gupta', mockGuptaUsers);

// Mock response creator for controller tests
interface MockResponse {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// 1. Service Tenant Client Routing & Physical Isolation
// ---------------------------------------------------------------------------
console.log('--- 1. Service Tenant Client Routing & Physical Isolation ---');

// Case 1A: Calling getDirectoryMembers with Kewat client
mockKewatDb.resetStats();
mockGuptaDb.resetStats();

async function runServiceTests() {
  const kewatResult = await getDirectoryMembers(
    { page: 1, limit: 12 },
    mockKewatDb as unknown as PrismaClient
  );

  assertTest(kewatResult.members.length === 2, 'Kewat query returns 2 Kewat members');
  assertTest(kewatResult.members[0].fullName === 'Ramesh Kewat', 'First member is Ramesh Kewat');
  assertTest(kewatResult.members[1].fullName === 'Suresh Kewat', 'Second member is Suresh Kewat');
  assertTest(mockKewatDb.findManyCalls === 1, 'mockKewatDb.user.findMany was called exactly once');
  assertTest(mockGuptaDb.findManyCalls === 0, 'mockGuptaDb was NOT called during Kewat query (Zero Cross-Tenant Leakage)');

  // Case 1B: Calling getDirectoryMembers with Gupta client
  mockKewatDb.resetStats();
  mockGuptaDb.resetStats();

  const guptaResult = await getDirectoryMembers(
    { page: 1, limit: 12 },
    mockGuptaDb as unknown as PrismaClient
  );

  assertTest(guptaResult.members.length === 1, 'Gupta query returns 1 Gupta member');
  assertTest(guptaResult.members[0].fullName === 'Anil Gupta', 'Member is Anil Gupta');
  assertTest(mockGuptaDb.findManyCalls === 1, 'mockGuptaDb.user.findMany was called exactly once');
  assertTest(mockKewatDb.findManyCalls === 0, 'mockKewatDb was NOT called during Gupta query (Zero Cross-Tenant Leakage)');

  // ---------------------------------------------------------------------------
  // 2. Strict Rejection of Missing Tenant Database Client (Fail-Closed)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Strict Rejection of Missing Database Client (Fail-Closed) ---');

  let missingClientError: any = null;
  try {
    await getDirectoryMembers({ page: 1, limit: 12 }, undefined);
  } catch (err) {
    missingClientError = err;
  }

  assertTest(missingClientError !== null, 'Throws error when tenant database client is missing');
  assertTest(
    missingClientError instanceof UserServiceError,
    'Error is instance of UserServiceError'
  );
  assertTest(
    missingClientError?.statusCode === 400,
    'Throws HTTP 400 Bad Request'
  );
  assertTest(
    missingClientError?.message === 'Tenant database client is required for directory operations.',
    'Clear explanatory error message returned'
  );

  // ---------------------------------------------------------------------------
  // 3. Controller Tenant Context Validation & Explicit db Propagation
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Controller Tenant Context Validation & req.db Propagation ---');

  // Case 3A: Valid request with Kewat tenant context and db
  mockKewatDb.resetStats();
  const validKewatReq = {
    query: { page: '1', limit: '10' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'hostname' },
    db: mockKewatDb as unknown as PrismaClient,
    user: { id: 'user-1', role: 'MEMBER', status: 'ACTIVE' },
  } as unknown as AuthenticatedRequest;
  const res3A = createMockResponse();

  await getDirectoryHandler(validKewatReq, res3A as any);

  assertTest(res3A.statusCode === 200, 'Controller returns HTTP 200 for valid tenant request');
  assertTest(res3A.body?.success === true, 'Response body indicates success');
  assertTest(res3A.body?.data?.members?.length === 2, 'Returns 2 Kewat members in response data');
  assertTest(mockKewatDb.findManyCalls === 1, 'Explicitly propagated req.db was queried');

  // Case 3B: Request missing req.tenant or req.db (Fail-Closed Guard)
  const missingTenantReq = {
    query: { page: '1', limit: '10' },
    tenant: undefined,
    db: undefined,
    user: { id: 'user-1', role: 'MEMBER', status: 'ACTIVE' },
  } as unknown as AuthenticatedRequest;
  const res3B = createMockResponse();

  await getDirectoryHandler(missingTenantReq, res3B as any);

  assertTest(res3B.statusCode === 400, 'Controller returns HTTP 400 when tenant context is missing');
  assertTest(res3B.body?.success === false, 'Response body indicates failure');
  assertTest(
    res3B.body?.error?.includes('Community context and tenant database are required'),
    'Returns clear 400 error explaining tenant requirement'
  );

  // Case 3C: Request with invalid query parameters
  const invalidQueryReq = {
    query: { page: 'invalid-number' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'hostname' },
    db: mockKewatDb as unknown as PrismaClient,
    user: { id: 'user-1', role: 'MEMBER', status: 'ACTIVE' },
  } as unknown as AuthenticatedRequest;
  const res3C = createMockResponse();

  await getDirectoryHandler(invalidQueryReq, res3C as any);

  assertTest(res3C.statusCode === 400, 'Returns HTTP 400 for invalid query parameters');

  // ---------------------------------------------------------------------------
  // 4. Query Filtering & Parameter Verification on Tenant Client
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Query Filtering & Parameter Passing on Tenant Client ---');

  mockKewatDb.resetStats();
  const filterQueryReq = {
    query: { page: '2', limit: '10', city: 'Varanasi', search: 'Kewat' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'hostname' },
    db: mockKewatDb as unknown as PrismaClient,
    user: { id: 'user-1', role: 'MEMBER', status: 'ACTIVE' },
  } as unknown as AuthenticatedRequest;
  const res4 = createMockResponse();

  await getDirectoryHandler(filterQueryReq, res4 as any);

  assertTest(res4.statusCode === 200, 'Returns HTTP 200 for filtered query');
  assertTest(mockKewatDb.findManyCalls === 1, 'findMany was called');
  assertTest(mockKewatDb.countCalls === 1, 'count was called for page 2');
  assertTest(mockKewatDb.lastFindManyArgs?.skip === 10, 'skip is correctly calculated as (2-1)*10 = 10');
  assertTest(mockKewatDb.lastFindManyArgs?.take === 10, 'take is 10');
  assertTest(
    mockKewatDb.lastFindManyArgs?.where?.status === 'ACTIVE',
    'where clause strictly filters for status ACTIVE'
  );
  assertTest(
    Array.isArray(mockKewatDb.lastFindManyArgs?.where?.AND),
    'where clause constructs AND conditions for city and search term'
  );

  // ---------------------------------------------------------------------------
  // 5. User Profile Tenant Isolation Tests (getMyProfile, updateMyProfile, getPublicMemberProfile)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. User Profile Tenant Isolation & Context Enforcement ---');

  // 5a. getMyProfile queries the supplied tenant database
  const kewatProfile = await getMyProfile('kewat-user-1', mockKewatDb as unknown as PrismaClient);
  assertTest(kewatProfile.id === 'kewat-user-1', 'getMyProfile retrieved user-1 from Kewat client');
  assertTest(kewatProfile.profile?.fullName === 'Ramesh Kewat', 'getMyProfile returned correct name from Kewat');

  // Cross-tenant getMyProfile fails closed with UserNotFoundError
  try {
    await getMyProfile('kewat-user-1', mockGuptaDb as unknown as PrismaClient);
    assertTest(false, 'Cross-tenant getMyProfile should have thrown UserNotFoundError');
  } catch (err: any) {
    assertTest(
      err instanceof UserNotFoundError && err.statusCode === 404,
      'Cross-tenant getMyProfile throws 404 UserNotFoundError'
    );
  }

  // Missing db client for getMyProfile fails closed with 400 UserServiceError
  try {
    await getMyProfile('kewat-user-1');
    assertTest(false, 'getMyProfile without db should fail');
  } catch (err: any) {
    assertTest(
      err instanceof UserServiceError && err.statusCode === 400,
      'getMyProfile without db throws 400 UserServiceError'
    );
  }

  // 5b. updateMyProfile queries and writes to supplied tenant database only
  const updated = await updateMyProfile(
    'kewat-user-1',
    { fullName: 'Ramesh Kewat Updated', city: 'Varanasi Central' },
    mockKewatDb as unknown as PrismaClient
  );
  assertTest(updated.profile?.fullName === 'Ramesh Kewat Updated', 'updateMyProfile updated profile on Kewat client');

  // Cross-tenant updateMyProfile fails closed with 404
  try {
    await updateMyProfile(
      'kewat-user-1',
      { fullName: 'Malicious Update' },
      mockGuptaDb as unknown as PrismaClient
    );
    assertTest(false, 'Cross-tenant updateMyProfile should fail with 404');
  } catch (err: any) {
    assertTest(
      err instanceof UserNotFoundError && err.statusCode === 404,
      'Cross-tenant updateMyProfile throws 404 UserNotFoundError'
    );
  }

  // Missing db client for updateMyProfile fails closed with 400
  try {
    await updateMyProfile('kewat-user-1', { fullName: 'No DB' });
    assertTest(false, 'updateMyProfile without db should fail');
  } catch (err: any) {
    assertTest(
      err instanceof UserServiceError && err.statusCode === 400,
      'updateMyProfile without db throws 400 UserServiceError'
    );
  }

  // 5c. getPublicMemberProfile queries supplied tenant database
  const publicProf = await getPublicMemberProfile('kewat-user-1', mockKewatDb as unknown as PrismaClient);
  assertTest(publicProf.id === 'kewat-user-1', 'getPublicMemberProfile retrieved member from Kewat client');
  assertTest(publicProf.fullName === 'Ramesh Kewat Updated', 'getPublicMemberProfile returned updated name');

  // Cross-tenant getPublicMemberProfile fails closed with 404
  try {
    await getPublicMemberProfile('kewat-user-1', mockGuptaDb as unknown as PrismaClient);
    assertTest(false, 'Cross-tenant getPublicMemberProfile should fail with 404');
  } catch (err: any) {
    assertTest(
      err instanceof UserNotFoundError && err.statusCode === 404,
      'Cross-tenant getPublicMemberProfile throws 404 UserNotFoundError'
    );
  }

  // Missing db client for getPublicMemberProfile fails closed with 400
  try {
    await getPublicMemberProfile('kewat-user-1');
    assertTest(false, 'getPublicMemberProfile without db should fail');
  } catch (err: any) {
    assertTest(
      err instanceof UserServiceError && err.statusCode === 400,
      'getPublicMemberProfile without db throws 400 UserServiceError'
    );
  }

  // 5d. Profile Controller Handlers: Tenant context guard & req.db propagation
  // getMyProfileHandler with valid tenant
  const validProfileReq = {
    user: { id: 'kewat-user-1', role: 'MEMBER', status: 'ACTIVE' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'header' },
    db: mockKewatDb as unknown as PrismaClient,
  } as unknown as AuthenticatedRequest;
  const resMyProf = createMockResponse();
  await getMyProfileHandler(validProfileReq, resMyProf as any);
  assertTest(resMyProf.statusCode === 200, 'getMyProfileHandler returns 200 with valid tenant');
  assertTest(resMyProf.body?.data?.id === 'kewat-user-1', 'getMyProfileHandler returns caller profile');

  // getMyProfileHandler with missing tenant context
  const missingTenantProfileReq = {
    user: { id: 'kewat-user-1', role: 'MEMBER', status: 'ACTIVE' },
    tenant: undefined,
    db: undefined,
  } as unknown as AuthenticatedRequest;
  const resMissingTenant = createMockResponse();
  await getMyProfileHandler(missingTenantProfileReq, resMissingTenant as any);
  assertTest(resMissingTenant.statusCode === 400, 'getMyProfileHandler returns 400 when tenant context is missing');

  // updateMyProfileHandler with missing tenant context
  const resUpdateMissing = createMockResponse();
  await updateMyProfileHandler(missingTenantProfileReq, resUpdateMissing as any);
  assertTest(resUpdateMissing.statusCode === 400, 'updateMyProfileHandler returns 400 when tenant context is missing');

  // getPublicProfileHandler with missing tenant context
  const missingTenantPublicReq = {
    params: { id: 'kewat-user-1' },
    tenant: undefined,
    db: undefined,
  } as unknown as AuthenticatedRequest;
  const resPublicMissing = createMockResponse();
  await getPublicProfileHandler(missingTenantPublicReq, resPublicMissing as any);
  assertTest(resPublicMissing.statusCode === 400, 'getPublicProfileHandler returns 400 when tenant context is missing');

  console.log('\n================================================================');
  console.log(`   Phase 15C.2 Pilot Tests: ${passedTests} Passed, ${failedTests} Failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runServiceTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

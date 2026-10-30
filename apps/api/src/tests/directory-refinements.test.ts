import assert from 'node:assert';
import {
  directoryQuerySchema,
  memberIdSchema,
} from '@apnasamaj/validation';
import {
  getDirectoryMembers,
  getPublicMemberProfile,
  UserServiceError,
  UserNotFoundError,
} from '../modules/users/users.service';
import {
  getDirectoryHandler,
  getPublicProfileHandler,
} from '../modules/users/users.controller';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { PrismaClient } from '@apnasamaj/database';

console.log('================================================================');
console.log('  Apna Samaj — Batch 15B.2: Directory Refinements Unit Tests    ');
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
// 1. Query Validation Hardening Tests
// ---------------------------------------------------------------------------
console.log('--- 1. Query Validation Hardening ---');

// 1a. Default values
const defaultParsed = directoryQuerySchema.safeParse({});
assertTest(defaultParsed.success, 'Default query parameters parse successfully');
if (defaultParsed.success) {
  assertTest(defaultParsed.data.page === 1, 'Default page is 1');
  assertTest(defaultParsed.data.limit === 12, 'Default limit is 12');
  assertTest(defaultParsed.data.search === undefined, 'Default search is undefined');
  assertTest(defaultParsed.data.subCaste === undefined, 'Default subCaste is undefined');
}

// 1b. Valid query with subCaste and all filters
const validParsed = directoryQuerySchema.safeParse({
  page: '2',
  limit: '25',
  search: 'Ramesh',
  city: 'Indore',
  state: 'Madhya Pradesh',
  gotra: 'Kashyap',
  subCaste: 'Kewat',
});
assertTest(validParsed.success, 'Valid query with subCaste and all filters parses successfully');
if (validParsed.success) {
  assertTest(validParsed.data.page === 2, 'Coerces page to integer 2');
  assertTest(validParsed.data.limit === 25, 'Coerces limit to integer 25');
  assertTest(validParsed.data.subCaste === 'Kewat', 'Extracts subCaste correctly');
  assertTest(validParsed.data.gotra === 'Kashyap', 'Extracts gotra correctly');
}

// 1c. String length limits (max 100 characters)
const string101Chars = 'a'.repeat(101);
const string100Chars = 'a'.repeat(100);

assertTest(
  directoryQuerySchema.safeParse({ search: string100Chars }).success,
  'Search query with exactly 100 characters is accepted'
);
assertTest(
  !directoryQuerySchema.safeParse({ search: string101Chars }).success,
  'Search query exceeding 100 characters is rejected'
);

assertTest(
  directoryQuerySchema.safeParse({ city: string100Chars }).success,
  'City filter with exactly 100 characters is accepted'
);
assertTest(
  !directoryQuerySchema.safeParse({ city: string101Chars }).success,
  'City filter exceeding 100 characters is rejected'
);

assertTest(
  directoryQuerySchema.safeParse({ state: string100Chars }).success,
  'State filter with exactly 100 characters is accepted'
);
assertTest(
  !directoryQuerySchema.safeParse({ state: string101Chars }).success,
  'State filter exceeding 100 characters is rejected'
);

assertTest(
  directoryQuerySchema.safeParse({ gotra: string100Chars }).success,
  'Gotra filter with exactly 100 characters is accepted'
);
assertTest(
  !directoryQuerySchema.safeParse({ gotra: string101Chars }).success,
  'Gotra filter exceeding 100 characters is rejected'
);

assertTest(
  directoryQuerySchema.safeParse({ subCaste: string100Chars }).success,
  'SubCaste filter with exactly 100 characters is accepted'
);
assertTest(
  !directoryQuerySchema.safeParse({ subCaste: string101Chars }).success,
  'SubCaste filter exceeding 100 characters is rejected'
);

// 1d. Pagination bounds
assertTest(
  directoryQuerySchema.safeParse({ limit: 50 }).success,
  'Limit of 50 is accepted (maximum allowed)'
);
assertTest(
  !directoryQuerySchema.safeParse({ limit: 51 }).success,
  'Limit exceeding 50 is rejected'
);
assertTest(
  !directoryQuerySchema.safeParse({ page: 0 }).success,
  'Page 0 is rejected (must be positive)'
);
assertTest(
  !directoryQuerySchema.safeParse({ page: -5 }).success,
  'Negative page is rejected'
);

// ---------------------------------------------------------------------------
// 2. Member ID (UUID) Validation Tests
// ---------------------------------------------------------------------------
console.log('\n--- 2. Member ID Validation (memberIdSchema) ---');

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const INVALID_UUID_SQL = "'; DROP TABLE users; --";
const INVALID_UUID_SHORT = 'user-1234';
const INVALID_UUID_EMPTY = '';

assertTest(memberIdSchema.safeParse(VALID_UUID).success, 'Valid RFC 4122 UUID is accepted');
assertTest(!memberIdSchema.safeParse(INVALID_UUID_SQL).success, 'SQL injection attempt as ID is rejected');
assertTest(!memberIdSchema.safeParse(INVALID_UUID_SHORT).success, 'Short slug as ID is rejected');
assertTest(!memberIdSchema.safeParse(INVALID_UUID_EMPTY).success, 'Empty string as ID is rejected');
assertTest(!memberIdSchema.safeParse(undefined).success, 'Undefined ID is rejected');

// ---------------------------------------------------------------------------
// 3. Controller Member ID Guard Tests
// ---------------------------------------------------------------------------
console.log('\n--- 3. Controller Member ID Guard ---');

function createMockResponse() {
  const res: {
    statusCode: number;
    body: any;
    status: (code: number) => any;
    json: (data: any) => any;
  } = {
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

async function testControllerGuards() {
  // 3a. Malformed UUID returns HTTP 400
  const malformedReq = {
    params: { id: 'not-a-valid-uuid' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'header' },
    db: {} as unknown as PrismaClient,
  } as unknown as AuthenticatedRequest;
  const malformedRes = createMockResponse();

  await getPublicProfileHandler(malformedReq, malformedRes as any);
  assertTest(malformedRes.statusCode === 400, 'getPublicProfileHandler returns 400 for malformed UUID');
  assertTest(
    malformedRes.body?.error?.includes('UUID'),
    'Error message explains UUID requirement'
  );

  // 3b. Missing ID returns HTTP 400
  const missingIdReq = {
    params: {},
    tenant: { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'header' },
    db: {} as unknown as PrismaClient,
  } as unknown as AuthenticatedRequest;
  const missingIdRes = createMockResponse();

  await getPublicProfileHandler(missingIdReq, missingIdRes as any);
  assertTest(missingIdRes.statusCode === 400, 'getPublicProfileHandler returns 400 for missing ID');

  // 3c. Valid UUID with missing tenant returns HTTP 400
  const missingTenantReq = {
    params: { id: VALID_UUID },
    tenant: undefined,
    db: undefined,
  } as unknown as AuthenticatedRequest;
  const missingTenantRes = createMockResponse();

  await getPublicProfileHandler(missingTenantReq, missingTenantRes as any);
  assertTest(missingTenantRes.statusCode === 400, 'getPublicProfileHandler returns 400 for missing tenant context');
  assertTest(
    missingTenantRes.body?.error?.includes('Community context'),
    'Error message explains tenant requirement'
  );
}

// ---------------------------------------------------------------------------
// 4. Service Filter & SubCaste Construction Tests
// ---------------------------------------------------------------------------
console.log('\n--- 4. Service SubCaste Filter & SQL Query Construction ---');

async function testServiceFiltering() {
  let capturedFindManyArgs: any = null;
  let capturedCountArgs: any = null;

  const mockDb = {
    user: {
      findMany: async (args: any) => {
        capturedFindManyArgs = args;
        return [
          {
            id: VALID_UUID,
            createdAt: new Date('2026-01-01'),
            profile: {
              id: 'prof-1',
              fullName: 'Sunil Kewat',
              gender: 'MALE',
              bio: 'Community Elder',
              avatarUrl: null,
              city: 'Indore',
              state: 'Madhya Pradesh',
              subCaste: 'Kashyap',
              gotra: 'Kashyap',
            },
          },
        ];
      },
      count: async (args: any) => {
        capturedCountArgs = args;
        return 1;
      },
    },
  } as unknown as PrismaClient;

  // 4a. Execute getDirectoryMembers with subCaste
  const result = await getDirectoryMembers(
    {
      page: 1,
      limit: 12,
      subCaste: 'Kashyap',
      city: 'Indore',
      state: 'Madhya Pradesh',
      gotra: 'Kashyap',
    },
    mockDb
  );

  assertTest(result.members.length === 1, 'Directory members returned successfully');
  assertTest(result.members[0].subCaste === 'Kashyap', 'SubCaste mapped to result member');
  assertTest(result.members[0].fullName === 'Sunil Kewat', 'FullName mapped to result member');

  // Verify where clause structure
  assertTest(
    capturedFindManyArgs?.where?.status === 'ACTIVE',
    'where clause strictly enforces status: ACTIVE'
  );

  const andConditions = capturedFindManyArgs?.where?.AND as Array<any>;
  assertTest(Array.isArray(andConditions), 'AND conditions array was constructed');

  const hasSubCasteCondition = andConditions.some(
    (cond) => cond.profile?.subCaste?.contains === 'Kashyap' && cond.profile?.subCaste?.mode === 'insensitive'
  );
  assertTest(hasSubCasteCondition, 'subCaste filter is applied to Prisma where clause with case-insensitive search');

  const hasCityCondition = andConditions.some(
    (cond) => cond.profile?.city?.contains === 'Indore'
  );
  assertTest(hasCityCondition, 'city filter is included in AND conditions');

  // ---------------------------------------------------------------------------
  // 5. Privacy Leakage Invariants
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Privacy & Sensitive Field Exclusion Invariants ---');

  const memberPayload = result.members[0] as any;
  assertTest(!('phone' in memberPayload), 'Privacy: phone is NOT exposed in directory response');
  assertTest(!('passwordHash' in memberPayload), 'Privacy: passwordHash is NOT exposed in directory response');
  assertTest(!('dateOfBirth' in memberPayload), 'Privacy: dateOfBirth is NOT exposed in directory response');
  assertTest(!('refreshTokens' in memberPayload), 'Privacy: refreshTokens are NOT exposed in directory response');
  assertTest(!('passwordResetTokens' in memberPayload), 'Privacy: passwordResetTokens are NOT exposed');
  assertTest(!('status' in memberPayload), 'Privacy: status is NOT exposed in directory response');

  // 5b. Public profile privacy check
  const mockDbForProfile = {
    user: {
      findUnique: async () => ({
        id: VALID_UUID,
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01'),
        profile: {
          id: 'prof-1',
          fullName: 'Sunil Kewat',
          gender: 'MALE',
          bio: 'Community Elder',
          avatarUrl: null,
          city: 'Indore',
          state: 'Madhya Pradesh',
          subCaste: 'Kashyap',
          gotra: 'Kashyap',
        },
      }),
    },
  } as unknown as PrismaClient;

  const publicProfile = await getPublicMemberProfile(VALID_UUID, mockDbForProfile) as any;
  assertTest(!('phone' in publicProfile), 'Privacy: phone is NOT exposed in public member profile');
  assertTest(!('passwordHash' in publicProfile), 'Privacy: passwordHash is NOT exposed in public member profile');
  assertTest(!('dateOfBirth' in publicProfile), 'Privacy: dateOfBirth is NOT exposed in public member profile');
  assertTest(!('status' in publicProfile), 'Privacy: internal status is NOT exposed in public member profile');
  assertTest(publicProfile.role === 'MEMBER', 'Public profile includes community role');
  assertTest(publicProfile.subCaste === 'Kashyap', 'Public profile includes subCaste');
}

async function runAll() {
  await testControllerGuards();
  await testServiceFiltering();

  console.log('\n================================================================');
  console.log(`  Directory Refinements Tests: ${passedTests} Passed, ${failedTests} Failed  `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});


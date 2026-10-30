import dotenv from 'dotenv';
import path from 'path';
import * as argon2 from 'argon2';
import { PrismaClient } from '@apnasamaj/database';
import { UserRole, UserStatus } from '@apnasamaj/shared-types';
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

console.log('================================================================');
console.log('   Apna Samaj — Batch 15B.2: Member Directory Staging E2E Suite  ');
console.log('================================================================\n');

// ---------------------------------------------------------------------------
// 1. Load Staging Environment & Verify Production Safety
// ---------------------------------------------------------------------------
dotenv.config({ path: path.resolve(process.cwd(), '.env.staging'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.staging'), override: true });

const stagingDbUrl = process.env.DATABASE_URL || '';
if (!stagingDbUrl) {
  console.error('❌ FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const parsedUrl = new URL(stagingDbUrl);
const host = parsedUrl.hostname.toLowerCase();
const dbName = parsedUrl.pathname.replace(/^\//, '');

// Preflight Safety Invariants
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

// ---------------------------------------------------------------------------
// 2. Synthetic Test Fixtures Setup & Teardown
// ---------------------------------------------------------------------------
const PHONES = {
  ACTIVE_1: '+919999900081',
  ACTIVE_2: '+919999900082',
  ACTIVE_3: '+919999900083',
  PENDING: '+919999900084',
  SUSPENDED: '+919999900085',
};

const allPhones = Object.values(PHONES);

async function cleanSyntheticData() {
  try {
    await prisma.profile.deleteMany({
      where: { user: { phone: { in: allPhones } } },
    });
    await prisma.user.deleteMany({
      where: { phone: { in: allPhones } },
    });
  } catch (err) {
    console.warn('[Cleanup Warning] Error during synthetic cleanup:', err);
  }
}

async function runStagingDirectoryE2E() {
  let userActive1Id = '';
  let userActive2Id = '';
  let userActive3Id = '';
  let userPendingId = '';
  let userSuspendedId = '';

  try {
    await cleanSyntheticData();

    const dummyHash = await argon2.hash('StagingSyntheticPass123!');

    // 1. Active Member 1 (Indore, Kashyap, Kashyap, bio mentions "teacher")
    const u1 = await prisma.user.create({
      data: {
        phone: PHONES.ACTIVE_1,
        passwordHash: dummyHash,
        status: UserStatus.ACTIVE,
        role: UserRole.MEMBER,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Synthetic Active Member Alpha',
            gender: 'MALE',
            dateOfBirth: new Date('1990-05-15'),
            city: 'Indore',
            state: 'Madhya Pradesh',
            subCaste: 'Kashyap',
            gotra: 'Kashyap',
            bio: 'Community teacher from Indore',
          },
        },
      },
    });
    userActive1Id = u1.id;

    // 2. Active Member 2 (Ujjain, Mallāh, Vashistha, bio mentions "coordinator", Role MODERATOR)
    const u2 = await prisma.user.create({
      data: {
        phone: PHONES.ACTIVE_2,
        passwordHash: dummyHash,
        status: UserStatus.ACTIVE,
        role: UserRole.MODERATOR,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Synthetic Active Member Beta',
            gender: 'FEMALE',
            dateOfBirth: new Date('1988-10-20'),
            city: 'Ujjain',
            state: 'Madhya Pradesh',
            subCaste: 'Mallāh',
            gotra: 'Vashistha',
            bio: 'Cultural coordinator from Ujjain',
          },
        },
      },
    });
    userActive2Id = u2.id;

    // 3. Active Member 3 (Bhopal, Nishad, Bharadwaj, bio mentions "mentor")
    const u3 = await prisma.user.create({
      data: {
        phone: PHONES.ACTIVE_3,
        passwordHash: dummyHash,
        status: UserStatus.ACTIVE,
        role: UserRole.MEMBER,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Synthetic Active Member Gamma',
            gender: 'MALE',
            dateOfBirth: new Date('1995-12-01'),
            city: 'Bhopal',
            state: 'Madhya Pradesh',
            subCaste: 'Nishad',
            gotra: 'Bharadwaj',
            bio: 'Youth sports mentor',
          },
        },
      },
    });
    userActive3Id = u3.id;

    // 4. Pending Member (Indore, Kashyap, PENDING verification)
    const u4 = await prisma.user.create({
      data: {
        phone: PHONES.PENDING,
        passwordHash: dummyHash,
        status: UserStatus.PENDING,
        role: UserRole.MEMBER,
        isPhoneVerified: false,
        profile: {
          create: {
            fullName: 'Synthetic Pending Member Delta',
            city: 'Indore',
            state: 'Madhya Pradesh',
            subCaste: 'Kashyap',
            gotra: 'Kashyap',
            dateOfBirth: new Date('2000-01-01'),
          },
        },
      },
    });
    userPendingId = u4.id;

    // 5. Suspended Member (Indore, Kashyap, SUSPENDED)
    const u5 = await prisma.user.create({
      data: {
        phone: PHONES.SUSPENDED,
        passwordHash: dummyHash,
        status: UserStatus.SUSPENDED,
        role: UserRole.MEMBER,
        isPhoneVerified: true,
        profile: {
          create: {
            fullName: 'Synthetic Suspended Member Epsilon',
            city: 'Indore',
            state: 'Madhya Pradesh',
            subCaste: 'Kashyap',
            gotra: 'Kashyap',
            dateOfBirth: new Date('1985-03-12'),
          },
        },
      },
    });
    userSuspendedId = u5.id;

    console.log(`Created 5 synthetic members: Alpha(${u1.id}), Beta(${u2.id}), Gamma(${u3.id}), Delta(${u4.id}), Epsilon(${u5.id})\n`);

    const tenantInfo = { slug: 'kewat', name: 'Kewat Samaj', isResolved: true, source: 'header' as const };

    // ---------------------------------------------------------------------------
    // TC-01: Query Validation Bounds in Express Controller
    // ---------------------------------------------------------------------------
    console.log('--- TC-01: Query Validation Bounds ---');
    const string101Chars = 'x'.repeat(101);

    const testReqOverLimit = {
      query: { search: string101Chars },
      tenant: tenantInfo,
      db: prisma,
      user: { id: userActive1Id, role: 'MEMBER', status: 'ACTIVE' },
    } as unknown as AuthenticatedRequest;
    const resOverLimit = createMockResponse();
    await getDirectoryHandler(testReqOverLimit, resOverLimit as any);
    assertTest(resOverLimit.statusCode === 400, 'Search query > 100 chars rejected with HTTP 400');
    assertTest(resOverLimit.body?.error?.includes('100'), 'Error message states 100 character limit');

    const testReqOverPageSize = {
      query: { limit: '51' },
      tenant: tenantInfo,
      db: prisma,
      user: { id: userActive1Id, role: 'MEMBER', status: 'ACTIVE' },
    } as unknown as AuthenticatedRequest;
    const resOverPageSize = createMockResponse();
    await getDirectoryHandler(testReqOverPageSize, resOverPageSize as any);
    assertTest(resOverPageSize.statusCode === 400, 'Limit > 50 rejected with HTTP 400');

    // ---------------------------------------------------------------------------
    // TC-02: Member ID Validation in Controller
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-02: Member ID (UUID) Validation ---');
    const testReqMalformedId = {
      params: { id: 'malformed-user-id' },
      tenant: tenantInfo,
      db: prisma,
      user: { id: userActive1Id, role: 'MEMBER', status: 'ACTIVE' },
    } as unknown as AuthenticatedRequest;
    const resMalformedId = createMockResponse();
    await getPublicProfileHandler(testReqMalformedId, resMalformedId as any);
    assertTest(resMalformedId.statusCode === 400, 'Malformed UUID returns HTTP 400');
    assertTest(resMalformedId.body?.error?.includes('UUID'), 'Error message explains UUID requirement');

    const NON_EXISTENT_UUID = '00000000-0000-4000-8000-000000000099';
    const testReqNonExistentId = {
      params: { id: NON_EXISTENT_UUID },
      tenant: tenantInfo,
      db: prisma,
      user: { id: userActive1Id, role: 'MEMBER', status: 'ACTIVE' },
    } as unknown as AuthenticatedRequest;
    const resNonExistent = createMockResponse();
    await getPublicProfileHandler(testReqNonExistentId, resNonExistent as any);
    assertTest(resNonExistent.statusCode === 404, 'Valid non-existent UUID returns HTTP 404');
    assertTest(resNonExistent.body?.error?.includes('not found'), 'Returns generic 404 not found error');

    // ---------------------------------------------------------------------------
    // TC-03: Active Member Directory Retrieval in Real Staging DB
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-03: Active Member Directory Retrieval ---');
    const directoryData = await getDirectoryMembers({ page: 1, limit: 50 }, prisma);
    const directoryIds = directoryData.members.map((m) => m.id);

    assertTest(directoryIds.includes(userActive1Id), 'Directory includes Active Member Alpha');
    assertTest(directoryIds.includes(userActive2Id), 'Directory includes Active Member Beta');
    assertTest(directoryIds.includes(userActive3Id), 'Directory includes Active Member Gamma');
    assertTest(!directoryIds.includes(userPendingId), 'Directory STRICTLY EXCLUDES Pending Member Delta');
    assertTest(!directoryIds.includes(userSuspendedId), 'Directory STRICTLY EXCLUDES Suspended Member Epsilon');

    // ---------------------------------------------------------------------------
    // TC-04: SubCaste Query Filtering
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-04: SubCaste Filtering ---');
    const kashyapResults = await getDirectoryMembers({ page: 1, limit: 50, subCaste: 'Kashyap' }, prisma);
    const kashyapIds = kashyapResults.members.map((m) => m.id);
    assertTest(kashyapIds.includes(userActive1Id), 'SubCaste "Kashyap" returns Member Alpha');
    assertTest(!kashyapIds.includes(userActive2Id), 'SubCaste "Kashyap" excludes Member Beta (Mallāh)');
    assertTest(!kashyapIds.includes(userActive3Id), 'SubCaste "Kashyap" excludes Member Gamma (Nishad)');

    const mallahResults = await getDirectoryMembers({ page: 1, limit: 50, subCaste: 'Mallāh' }, prisma);
    const mallahIds = mallahResults.members.map((m) => m.id);
    assertTest(mallahIds.includes(userActive2Id), 'SubCaste "Mallāh" returns Member Beta');
    assertTest(!mallahIds.includes(userActive1Id), 'SubCaste "Mallāh" excludes Member Alpha');

    // ---------------------------------------------------------------------------
    // TC-05: City & Gotra Filtering
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-05: City & Gotra Filtering ---');
    const ujjainResults = await getDirectoryMembers({ page: 1, limit: 50, city: 'Ujjain' }, prisma);
    assertTest(ujjainResults.members.some((m) => m.id === userActive2Id), 'City "Ujjain" matches Member Beta');
    assertTest(!ujjainResults.members.some((m) => m.id === userActive1Id), 'City "Ujjain" excludes Member Alpha');

    const bharadwajResults = await getDirectoryMembers({ page: 1, limit: 50, gotra: 'Bharadwaj' }, prisma);
    assertTest(bharadwajResults.members.some((m) => m.id === userActive3Id), 'Gotra "Bharadwaj" matches Member Gamma');
    assertTest(!bharadwajResults.members.some((m) => m.id === userActive1Id), 'Gotra "Bharadwaj" excludes Member Alpha');

    // ---------------------------------------------------------------------------
    // TC-06: Free-Text Search Matching
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-06: Free-Text Search Matching ---');
    const bioSearchResults = await getDirectoryMembers({ page: 1, limit: 50, search: 'Alpha' }, prisma);
    assertTest(bioSearchResults.members.some((m) => m.id === userActive1Id), 'Search "Alpha" matches Member Alpha via name');

    const nameSearchResults = await getDirectoryMembers({ page: 1, limit: 50, search: 'Beta' }, prisma);
    assertTest(nameSearchResults.members.some((m) => m.id === userActive2Id), 'Search "Beta" matches Member Beta via name');

    // ---------------------------------------------------------------------------
    // TC-07: Combined Multi-Field Filters
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-07: Combined Multi-Field Filters ---');
    const combinedMatch = await getDirectoryMembers(
      { page: 1, limit: 50, city: 'Indore', subCaste: 'Kashyap', gotra: 'Kashyap' },
      prisma
    );
    assertTest(combinedMatch.members.some((m) => m.id === userActive1Id), 'Combined match returns Member Alpha');

    const combinedMismatch = await getDirectoryMembers(
      { page: 1, limit: 50, city: 'Indore', subCaste: 'Mallāh' },
      prisma
    );
    assertTest(combinedMismatch.members.length === 0, 'No members match city Indore + subCaste Mallāh');

    // ---------------------------------------------------------------------------
    // TC-08: Public Member Profile Retrieval & Role Badges
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-08: Public Member Profile Retrieval & Roles ---');
    const alphaProfile = await getPublicMemberProfile(userActive1Id, prisma);
    assertTest(alphaProfile.id === userActive1Id, 'Alpha profile ID matches');
    assertTest(alphaProfile.fullName === 'Synthetic Active Member Alpha', 'Alpha full name matches');
    assertTest(alphaProfile.city === 'Indore', 'Alpha city matches');
    assertTest(alphaProfile.subCaste === 'Kashyap', 'Alpha subCaste matches');
    assertTest(alphaProfile.gotra === 'Kashyap', 'Alpha gotra matches');
    assertTest(alphaProfile.role === UserRole.MEMBER, 'Alpha role is MEMBER');

    const betaProfile = await getPublicMemberProfile(userActive2Id, prisma);
    assertTest(betaProfile.role === UserRole.MODERATOR, 'Beta role is MODERATOR');
    assertTest(betaProfile.subCaste === 'Mallāh', 'Beta subCaste matches');

    // ---------------------------------------------------------------------------
    // TC-09: Suspended & Pending Account Invisibility
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-09: Suspended & Pending Account Invisibility ---');
    try {
      await getPublicMemberProfile(userPendingId, prisma);
      assertTest(false, 'Pending member lookup should fail with 404');
    } catch (err: any) {
      assertTest(err instanceof UserNotFoundError, 'Pending member lookup throws UserNotFoundError');
      assertTest(err.statusCode === 404, 'Pending member returns HTTP 404');
    }

    try {
      await getPublicMemberProfile(userSuspendedId, prisma);
      assertTest(false, 'Suspended member lookup should fail with 404');
    } catch (err: any) {
      assertTest(err instanceof UserNotFoundError, 'Suspended member lookup throws UserNotFoundError');
      assertTest(err.statusCode === 404, 'Suspended member returns HTTP 404');
    }

    // ---------------------------------------------------------------------------
    // TC-10: Privacy & PII Leakage Assertions in Real DB Payloads
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-10: Privacy & PII Leakage Invariants ---');
    // Directory item payload check
    const dirAlpha = directoryData.members.find((m) => m.id === userActive1Id) as any;
    assertTest(dirAlpha !== undefined, 'Alpha found in directory payload');
    assertTest(!('phone' in dirAlpha), 'Privacy: Phone number NOT exposed in directory');
    assertTest(!('passwordHash' in dirAlpha), 'Privacy: Password hash NOT exposed in directory');
    assertTest(!('dateOfBirth' in dirAlpha), 'Privacy: Date of birth NOT exposed in directory');
    assertTest(!('role' in dirAlpha), 'Privacy: Role NOT exposed in directory listing');
    assertTest(!('status' in dirAlpha), 'Privacy: Internal status NOT exposed in directory');
    assertTest(!('refreshTokens' in dirAlpha), 'Privacy: Refresh tokens NOT exposed');
    assertTest(!('passwordResetTokens' in dirAlpha), 'Privacy: Password reset tokens NOT exposed');

    // Public member profile payload check
    const profileAlphaPayload = alphaProfile as any;
    assertTest(!('phone' in profileAlphaPayload), 'Privacy: Phone number NOT exposed in public profile');
    assertTest(!('passwordHash' in profileAlphaPayload), 'Privacy: Password hash NOT exposed in public profile');
    assertTest(!('dateOfBirth' in profileAlphaPayload), 'Privacy: Date of birth NOT exposed in public profile');
    assertTest(!('status' in profileAlphaPayload), 'Privacy: Status NOT exposed in public profile');

    // ---------------------------------------------------------------------------
    // TC-11: Tenant Isolation & Fail-Closed Guard
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-11: Tenant Isolation & Fail-Closed Guards ---');
    try {
      await getDirectoryMembers({ page: 1, limit: 12 }, undefined);
      assertTest(false, 'getDirectoryMembers without db client should fail');
    } catch (err: any) {
      assertTest(err instanceof UserServiceError && err.statusCode === 400, 'Fails closed with HTTP 400 if db client is missing');
    }

    try {
      await getPublicMemberProfile(userActive1Id, undefined);
      assertTest(false, 'getPublicMemberProfile without db client should fail');
    } catch (err: any) {
      assertTest(err instanceof UserServiceError && err.statusCode === 400, 'Fails closed with HTTP 400 if db client is missing');
    }

    // ---------------------------------------------------------------------------
    // TC-12: Bounded Pagination Stability
    // ---------------------------------------------------------------------------
    console.log('\n--- TC-12: Bounded Pagination Stability ---');
    const p1 = await getDirectoryMembers({ page: 1, limit: 2 }, prisma);
    assertTest(p1.members.length === 2, 'Page 1 returns exactly 2 records with limit 2');
    assertTest(p1.pagination.page === 1, 'Pagination page is 1');
    assertTest(p1.pagination.limit === 2, 'Pagination limit is 2');
    assertTest(p1.pagination.totalPages >= 2, 'Total pages calculated properly');

    const p2 = await getDirectoryMembers({ page: 2, limit: 2 }, prisma);
    assertTest(p2.members.length >= 1, 'Page 2 returns records without overlap');
    assertTest(p2.members[0].id !== p1.members[0].id, 'Page 2 does not duplicate Page 1 first record');

  } finally {
    console.log('\n--- Finalizing Staging Clean-up ---');
    await cleanSyntheticData();
    await prisma.$disconnect();
    console.log('✅ PASS: Cleaned all synthetic members and disconnected staging DB.');
  }

  console.log('\n================================================================');
  console.log(`  Staging Directory E2E Suite Complete: ${passedTests} passed, ${failedTests} failed  `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runStagingDirectoryE2E().catch((err) => {
  console.error('Fatal staging E2E error:', err);
  process.exit(1);
});

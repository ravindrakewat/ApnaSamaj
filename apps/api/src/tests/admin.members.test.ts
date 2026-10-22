import http from 'http';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma, Role, UserStatus } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';

const ADMIN_PHONE = '+919999900010';
const MEMBER_PHONE = '+919999900020';
const COMMUNITY_ADMIN_PHONE = '+919999900030';
const TEST_PASSWORD = 'TestPassword123!';

async function runAdminMemberTests() {
  console.log('[Test] ====================================================');
  console.log('[Test] Running Phase 3A: Admin Member Management Tests');
  console.log('[Test] ====================================================');

  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  // Clean previous test data
  await prisma.user.deleteMany({
    where: {
      phone: { in: [ADMIN_PHONE, MEMBER_PHONE, COMMUNITY_ADMIN_PHONE] },
    },
  });

  // 1. Create Super Admin test user
  const adminUser = await prisma.user.create({
    data: {
      phone: ADMIN_PHONE,
      passwordHash,
      role: Role.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Test Super Admin',
          city: 'Delhi',
          state: 'Delhi',
        },
      },
    },
  });

  // 2. Create standard Member test user
  const memberUser = await prisma.user.create({
    data: {
      phone: MEMBER_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Test Ordinary Member',
          city: 'Bhopal',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  // 3. Create Community Admin test user
  const communityAdminUser = await prisma.user.create({
    data: {
      phone: COMMUNITY_ADMIN_PHONE,
      passwordHash,
      role: Role.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Test Community Admin',
          city: 'Indore',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  // Start ephemeral test server
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test] Server listening on ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  }

  // Generate tokens directly for testing authorization
  function makeToken(user: { id: string; phone: string; role: string; status: string }) {
    return jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role, status: user.status },
      config.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  const adminToken = makeToken({
    id: adminUser.id,
    phone: adminUser.phone,
    role: adminUser.role,
    status: adminUser.status,
  });

  const memberToken = makeToken({
    id: memberUser.id,
    phone: memberUser.phone,
    role: memberUser.role,
    status: memberUser.status,
  });

  const communityAdminToken = makeToken({
    id: communityAdminUser.id,
    phone: communityAdminUser.phone,
    role: communityAdminUser.role,
    status: communityAdminUser.status,
  });

  try {
    // -------------------------------------------------------------
    // 1. Authorization Tests
    // -------------------------------------------------------------
    const noTokenRes = await fetch(`${baseUrl}/api/v1/admin/users`);
    assert(noTokenRes.status === 401, 'Test 1.1: Request without token is rejected with 401');

    const memberForbiddenRes = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert(memberForbiddenRes.status === 403, 'Test 1.2: Regular member is rejected with 403 Forbidden');

    const adminAllowedRes = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminAllowedBody: any = await adminAllowedRes.json();
    assert(adminAllowedRes.status === 200, 'Test 1.3: Super Admin request succeeds with 200 OK');
    assert(adminAllowedBody.success === true, 'Test 1.4: Response has success=true');
    assert(Array.isArray(adminAllowedBody.data?.users), 'Test 1.5: Returns array of users');

    const communityAdminAllowedRes = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${communityAdminToken}` },
    });
    assert(communityAdminAllowedRes.status === 200, 'Test 1.6: Community Admin request succeeds with 200 OK');

    // -------------------------------------------------------------
    // 2. Pagination, Filtering & Batch 4C Optimization Tests
    // -------------------------------------------------------------
    // 2.1: Full first page (limit=1 with total >= 3)
    const paginatedRes = await fetch(`${baseUrl}/api/v1/admin/users?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const paginatedBody: any = await paginatedRes.json();
    assert(paginatedBody.data?.users.length === 1, 'Test 2.1: Pagination limits returned records to 1');
    assert(paginatedBody.data?.pagination?.page === 1, 'Test 2.2: Pagination metadata includes page 1');
    assert(paginatedBody.data?.pagination?.limit === 1, 'Test 2.3: Pagination metadata includes limit 1');
    assert(paginatedBody.data?.pagination?.totalUsers >= 3, 'Test 2.4: Pagination includes total count >= 3');
    assert(paginatedBody.data?.pagination?.totalPages >= 3, 'Test 2.5: Total pages calculated accurately');

    // 2.2: Multiple pages (page=2, limit=1)
    const page2Res = await fetch(`${baseUrl}/api/v1/admin/users?page=2&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const page2Body: any = await page2Res.json();
    assert(page2Body.data?.users.length === 1, 'Test 2.6: Page 2 returns 1 user');
    assert(page2Body.data?.pagination?.page === 2, 'Test 2.7: Page 2 metadata matches');
    assert(page2Body.data?.users[0]?.id !== paginatedBody.data?.users[0]?.id, 'Test 2.8: Page 2 record is distinct from page 1');

    // 2.3: First page with fewer than limit records (Optimization path: skips count query)
    const fewRecordsRes = await fetch(`${baseUrl}/api/v1/admin/users?page=1&limit=50`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const fewRecordsBody: any = await fewRecordsRes.json();
    assert(fewRecordsBody.data?.users.length < 50, 'Test 2.9: Total users in DB is fewer than limit=50');
    assert(
      fewRecordsBody.data?.pagination?.totalUsers === fewRecordsBody.data?.users.length,
      'Test 2.10: TotalUsers mathematically equals users.length without redundant count query'
    );
    assert(fewRecordsBody.data?.pagination?.totalPages === 1, 'Test 2.11: TotalPages is 1 for single page result');

    // 2.4: Filter by role=MEMBER
    const roleFilteredRes = await fetch(`${baseUrl}/api/v1/admin/users?role=MEMBER`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const roleFilteredBody: any = await roleFilteredRes.json();
    const allMembers = roleFilteredBody.data?.users.every((u: any) => u.role === 'MEMBER');
    assert(allMembers, 'Test 2.12: Role filter returns only MEMBER records');

    // 2.5: Search by full name
    const searchRes = await fetch(`${baseUrl}/api/v1/admin/users?search=Ordinary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchBody: any = await searchRes.json();
    assert(
      searchBody.data?.users.some((u: any) => u.phone === MEMBER_PHONE),
      'Test 2.13: Search by full name returns matching user'
    );

    // 2.6: Search by phone number
    const searchPhoneRes = await fetch(`${baseUrl}/api/v1/admin/users?search=0020`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchPhoneBody: any = await searchPhoneRes.json();
    assert(
      searchPhoneBody.data?.users.some((u: any) => u.phone === MEMBER_PHONE),
      'Test 2.14: Search by phone returns matching user'
    );

    // 2.7: Combined role and status filter
    const roleStatusRes = await fetch(`${baseUrl}/api/v1/admin/users?role=MEMBER&status=ACTIVE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const roleStatusBody: any = await roleStatusRes.json();
    const allActiveMembers = roleStatusBody.data?.users.every((u: any) => u.role === 'MEMBER' && u.status === 'ACTIVE');
    assert(allActiveMembers, 'Test 2.15: Combined role and status filter matches accurately');

    // 2.8: Empty result set
    const emptyRes = await fetch(`${baseUrl}/api/v1/admin/users?search=NonExistentMatchXYZ999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const emptyBody: any = await emptyRes.json();
    assert(emptyBody.data?.users.length === 0, 'Test 2.16: Non-matching search returns 0 records');
    assert(emptyBody.data?.pagination?.totalUsers === 0, 'Test 2.17: Empty result set totalUsers is 0');
    assert(emptyBody.data?.pagination?.totalPages === 1, 'Test 2.18: Empty result set totalPages is 1');

    // 2.9: Concurrent requests test
    const [c1, c2, c3] = await Promise.all([
      fetch(`${baseUrl}/api/v1/admin/users?page=1&limit=1`, { headers: { Authorization: `Bearer ${adminToken}` } }),
      fetch(`${baseUrl}/api/v1/admin/users?page=2&limit=1`, { headers: { Authorization: `Bearer ${adminToken}` } }),
      fetch(`${baseUrl}/api/v1/admin/users?role=COMMUNITY_ADMIN`, { headers: { Authorization: `Bearer ${adminToken}` } }),
    ]);
    const b1: any = await c1.json();
    const b2: any = await c2.json();
    const b3: any = await c3.json();
    assert(c1.status === 200 && c2.status === 200 && c3.status === 200, 'Test 2.19: Concurrent requests all return 200 OK');
    assert(b1.data?.pagination?.page === 1 && b2.data?.pagination?.page === 2, 'Test 2.20: Concurrent requests preserve independent pagination');
    assert(b3.data?.users.every((u: any) => u.role === 'COMMUNITY_ADMIN'), 'Test 2.21: Concurrent filtered request returns correct independent results');

    // -------------------------------------------------------------
    // 3. User Details Endpoint Tests
    // -------------------------------------------------------------
    const detailsRes = await fetch(`${baseUrl}/api/v1/admin/users/${memberUser.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const detailsBody: any = await detailsRes.json();
    assert(detailsRes.status === 200, 'Test 3.1: Get user details returns 200 OK');
    assert(detailsBody.data?.id === memberUser.id, 'Test 3.2: Details ID matches member ID');
    assert(detailsBody.data?.passwordHash === undefined, 'Test 3.3: passwordHash is strictly excluded');
    assert(detailsBody.data?.profile?.city === 'Bhopal', 'Test 3.4: Profile details are included');

    const notFoundRes = await fetch(`${baseUrl}/api/v1/admin/users/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(notFoundRes.status === 404, 'Test 3.5: Non-existent user returns 404 Not Found');

    // -------------------------------------------------------------
    // 4. Status Modification & Protection Tests
    // -------------------------------------------------------------
    // Admin cannot suspend self
    const selfSuspendRes = await fetch(`${baseUrl}/api/v1/admin/users/${adminUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'SUSPENDED' }),
    });
    assert(selfSuspendRes.status === 400, 'Test 4.1: Admin self-suspension is blocked with 400 Bad Request');

    // Admin suspends member
    const suspendMemberRes = await fetch(`${baseUrl}/api/v1/admin/users/${memberUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Automated test suspension',
      }),
    });
    const suspendMemberBody: any = await suspendMemberRes.json();
    assert(suspendMemberRes.status === 200, 'Test 4.2: Suspending member returns 200 OK');
    assert(suspendMemberBody.data?.status === 'SUSPENDED', 'Test 4.3: Member status updated to SUSPENDED');

    // Verify audit log entry was written
    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        actorId: adminUser.id,
        targetId: memberUser.id,
        action: 'USER_STATUS_UPDATE',
      },
    });
    assert(Boolean(auditEntry), 'Test 4.4: AuditLog record created for status change');
    assert(
      (auditEntry?.details as any)?.newStatus === 'SUSPENDED',
      'Test 4.5: AuditLog record records newStatus=SUSPENDED'
    );

    // Admin reactivates member
    const reactivateRes = await fetch(`${baseUrl}/api/v1/admin/users/${memberUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        reason: 'Reactivation test',
      }),
    });
    const reactivateBody: any = await reactivateRes.json();
    assert(reactivateRes.status === 200, 'Test 4.6: Reactivating member returns 200 OK');
    assert(reactivateBody.data?.status === 'ACTIVE', 'Test 4.7: Member status restored to ACTIVE');

  } finally {
    // Teardown
    await prisma.user.deleteMany({
      where: {
        phone: { in: [ADMIN_PHONE, MEMBER_PHONE, COMMUNITY_ADMIN_PHONE] },
      },
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log('[Test] ====================================================');
  console.log(`[Test] Total Passed: ${passed}`);
  console.log(`[Test] Total Failed: ${failed}`);
  console.log('[Test] ====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminMemberTests().catch((err) => {
  console.error('[Test] Unhandled error during admin member tests:', err);
  process.exit(1);
});

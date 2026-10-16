import http from 'http';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma, Role, UserStatus } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';

const ADMIN_PHONE = '+919999900010';
const MEMBER_PHONE = '+919999900020';
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
      phone: { in: [ADMIN_PHONE, MEMBER_PHONE] },
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

    // -------------------------------------------------------------
    // 2. Pagination and Filtering Tests
    // -------------------------------------------------------------
    const paginatedRes = await fetch(`${baseUrl}/api/v1/admin/users?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const paginatedBody: any = await paginatedRes.json();
    assert(paginatedBody.data?.users.length === 1, 'Test 2.1: Pagination limits returned records to 1');
    assert(paginatedBody.data?.pagination?.page === 1, 'Test 2.2: Pagination metadata includes page 1');
    assert(paginatedBody.data?.pagination?.limit === 1, 'Test 2.3: Pagination metadata includes limit 1');
    assert(paginatedBody.data?.pagination?.totalUsers >= 2, 'Test 2.4: Pagination includes total count >= 2');

    // Filter by role=MEMBER
    const roleFilteredRes = await fetch(`${baseUrl}/api/v1/admin/users?role=MEMBER`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const roleFilteredBody: any = await roleFilteredRes.json();
    const allMembers = roleFilteredBody.data?.users.every((u: any) => u.role === 'MEMBER');
    assert(allMembers, 'Test 2.5: Role filter returns only MEMBER records');

    // Search by name
    const searchRes = await fetch(`${baseUrl}/api/v1/admin/users?search=Ordinary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchBody: any = await searchRes.json();
    assert(
      searchBody.data?.users.some((u: any) => u.phone === MEMBER_PHONE),
      'Test 2.6: Search by full name returns matching user'
    );

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
        phone: { in: [ADMIN_PHONE, MEMBER_PHONE] },
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

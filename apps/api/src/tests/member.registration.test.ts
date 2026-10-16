import http from 'http';
import * as argon2 from 'argon2';
import { prisma, Role, UserStatus } from '@apnasamaj/database';
import { createApp } from '../app';

const TEST_PHONE_1 = '+919876500001';
const TEST_PHONE_2 = '+919876500002';
const TEST_PHONE_3 = '+919876500003';
const TEST_PASSWORD = 'SecurePassword123!';

async function runMemberRegistrationTests() {
  console.log('[Test] ====================================================');
  console.log('[Test] Running Phase 3B: Member Registration & Profile Tests');
  console.log('[Test] ====================================================');

  // Clean previous test data
  await prisma.user.deleteMany({
    where: {
      phone: { in: [TEST_PHONE_1, TEST_PHONE_2, TEST_PHONE_3] },
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

  try {
    // -------------------------------------------------------------
    // 1. Successful Member Registration
    // -------------------------------------------------------------
    const regPayload = {
      phone: TEST_PHONE_1,
      password: TEST_PASSWORD,
      fullName: 'Sunil Kumar',
      gender: 'MALE',
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      subCaste: 'Kewat',
      gotra: 'Kashyap',
    };

    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(regPayload),
    });

    const regBody: any = await regRes.json();
    assert(regRes.status === 201, 'Test 1.1: Registration succeeds with HTTP 201 Created');
    assert(regBody.success === true, 'Test 1.2: Response body has success=true');
    assert(typeof regBody.data?.accessToken === 'string', 'Test 1.3: Access token returned');
    assert(regBody.data?.user?.fullName === 'Sunil Kumar', 'Test 1.4: Sanitized profile returned in response');
    assert(regBody.data?.user?.passwordHash === undefined, 'Test 1.5: Password hash is NOT exposed in response');
    assert(regBody.data?.user?.role === 'MEMBER', 'Test 1.6: Role in response is MEMBER');
    assert(regBody.data?.user?.status === 'PENDING', 'Test 1.7: Status in response is PENDING');
    assert(regBody.data?.user?.isPhoneVerified === false, 'Test 1.8: Phone verification in response is false');

    // Check Set-Cookie header contains refreshToken
    const setCookie = regRes.headers.get('set-cookie') || '';
    assert(setCookie.includes('refreshToken='), 'Test 1.9: HttpOnly refreshToken cookie set');

    const memberAccessToken = regBody.data.accessToken;

    // -------------------------------------------------------------
    // 2. Database Verification & Safe Defaults
    // -------------------------------------------------------------
    const dbUser = await prisma.user.findUnique({
      where: { phone: TEST_PHONE_1 },
      include: { profile: true },
    });

    assert(!!dbUser, 'Test 2.1: User record created in database');
    assert(dbUser?.role === Role.MEMBER, 'Test 2.2: User role is strictly MEMBER');
    assert(dbUser?.status === UserStatus.PENDING, 'Test 2.3: User status is PENDING');
    assert(dbUser?.isPhoneVerified === false, 'Test 2.4: User phone is unverified');
    assert(!!dbUser?.profile, 'Test 2.5: Profile record created atomically');
    assert(dbUser?.profile?.fullName === 'Sunil Kumar', 'Test 2.6: Profile fullName saved');
    assert(dbUser?.profile?.subCaste === 'Kewat', 'Test 2.7: Profile subCaste saved');
    assert(dbUser?.profile?.gotra === 'Kashyap', 'Test 2.8: Profile gotra saved');

    // -------------------------------------------------------------
    // 3. Password Hashing with Argon2id
    // -------------------------------------------------------------
    assert(
      !!dbUser?.passwordHash && dbUser.passwordHash.startsWith('$argon2id$'),
      'Test 3.1: Password is saved as Argon2id hash'
    );
    const passwordValid = await argon2.verify(dbUser!.passwordHash, TEST_PASSWORD);
    assert(passwordValid === true, 'Test 3.2: Argon2id hash verifies with correct password');
    const wrongPasswordValid = await argon2.verify(dbUser!.passwordHash, 'WrongPassword!');
    assert(wrongPasswordValid === false, 'Test 3.3: Argon2id hash rejects wrong password');

    // -------------------------------------------------------------
    // 4. Duplicate Phone Rejection
    // -------------------------------------------------------------
    const dupRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: TEST_PHONE_1, // Same phone
        password: 'AnotherPassword123!',
        fullName: 'Duplicate User',
      }),
    });

    const dupBody: any = await dupRes.json();
    assert(dupRes.status === 409, 'Test 4.1: Duplicate phone rejected with HTTP 409 Conflict');
    assert(dupBody.success === false, 'Test 4.2: Duplicate response has success=false');
    assert(
      dupBody.error.includes('already exists'),
      'Test 4.3: Safe error message returned for duplicate phone',
      dupBody.error
    );

    // -------------------------------------------------------------
    // 5. Input Validation Tests
    // -------------------------------------------------------------
    // 5a: Invalid phone format
    const badPhoneRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '12345',
        password: TEST_PASSWORD,
        fullName: 'Valid Name',
      }),
    });
    assert(badPhoneRes.status === 400, 'Test 5.1: Malformed phone rejected with 400 Bad Request');

    // 5b: Short password (< 8 chars)
    const shortPassRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: TEST_PHONE_2,
        password: 'short',
        fullName: 'Valid Name',
      }),
    });
    assert(shortPassRes.status === 400, 'Test 5.2: Short password rejected with 400 Bad Request');

    // 5c: Missing full name
    const noNameRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: TEST_PHONE_2,
        password: TEST_PASSWORD,
        fullName: ' ',
      }),
    });
    assert(noNameRes.status === 400, 'Test 5.3: Empty full name rejected with 400 Bad Request');

    // -------------------------------------------------------------
    // 6. Privilege Escalation Prevention on Registration
    // -------------------------------------------------------------
    // Attempting to send role: SUPER_ADMIN, status: ACTIVE, isPhoneVerified: true
    const escalationRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: TEST_PHONE_2,
        password: TEST_PASSWORD,
        fullName: 'Hacker Attempt',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isPhoneVerified: true,
      }),
    });

    const escalationBody: any = await escalationRes.json();
    assert(escalationRes.status === 201, 'Test 6.1: Registration proceeds but strips privileged fields');
    assert(escalationBody.data?.user?.role === 'MEMBER', 'Test 6.2: Assigned role is strictly MEMBER');
    assert(escalationBody.data?.user?.status === 'PENDING', 'Test 6.3: Assigned status is strictly PENDING');
    assert(escalationBody.data?.user?.isPhoneVerified === false, 'Test 6.4: isPhoneVerified remains false');

    const dbHacker = await prisma.user.findUnique({ where: { phone: TEST_PHONE_2 } });
    assert(dbHacker?.role === Role.MEMBER, 'Test 6.5: Database role is MEMBER despite request payload');
    assert(dbHacker?.status === UserStatus.PENDING, 'Test 6.6: Database status is PENDING despite request payload');
    assert(dbHacker?.isPhoneVerified === false, 'Test 6.7: Database isPhoneVerified is false despite request payload');

    // -------------------------------------------------------------
    // 7. Member Profile Ownership & Authorization
    // -------------------------------------------------------------
    // 7a: Unauthenticated GET /api/v1/users/me/profile rejected with 401
    const unauthProfileRes = await fetch(`${baseUrl}/api/v1/users/me/profile`);
    assert(unauthProfileRes.status === 401, 'Test 7.1: Unauthenticated GET /me/profile rejected with 401');

    // 7b: Authenticated GET /api/v1/users/me/profile succeeds
    const myProfileRes = await fetch(`${baseUrl}/api/v1/users/me/profile`, {
      headers: { Authorization: `Bearer ${memberAccessToken}` },
    });
    const myProfileBody: any = await myProfileRes.json();
    assert(myProfileRes.status === 200, 'Test 7.2: Authenticated GET /me/profile succeeds with 200 OK');
    assert(myProfileBody.data?.phone === TEST_PHONE_1, 'Test 7.3: Returns caller own profile phone');
    assert(myProfileBody.data?.profile?.fullName === 'Sunil Kumar', 'Test 7.4: Returns caller profile details');

    // 7c: Update permitted profile fields via PATCH /api/v1/users/me/profile
    const updateRes = await fetch(`${baseUrl}/api/v1/users/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberAccessToken}`,
      },
      body: JSON.stringify({
        fullName: 'Sunil Kumar Kewat',
        bio: 'Community worker from Bhopal',
        city: 'Indore',
      }),
    });
    const updateBody: any = await updateRes.json();
    assert(updateRes.status === 200, 'Test 7.5: PATCH /me/profile succeeds with 200 OK');
    assert(updateBody.data?.profile?.fullName === 'Sunil Kumar Kewat', 'Test 7.6: Full name updated');
    assert(updateBody.data?.profile?.bio === 'Community worker from Bhopal', 'Test 7.7: Bio updated');
    assert(updateBody.data?.profile?.city === 'Indore', 'Test 7.8: City updated');

    // 7d: Privilege escalation attempt during profile update
    // User tries to alter their role, status, phone, or verification status
    const tamperRes = await fetch(`${baseUrl}/api/v1/users/me/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberAccessToken}`,
      },
      body: JSON.stringify({
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isPhoneVerified: true,
        phone: '+919999999999',
      }),
    });
    const tamperBody: any = await tamperRes.json();
    assert(tamperRes.status === 200, 'Test 7.9: Request succeeds but protected fields are ignored');

    const dbUserAfterTamper = await prisma.user.findUnique({ where: { phone: TEST_PHONE_1 } });
    assert(dbUserAfterTamper?.role === Role.MEMBER, 'Test 7.10: Role was NOT changed to SUPER_ADMIN');
    assert(dbUserAfterTamper?.status === UserStatus.PENDING, 'Test 7.11: Status was NOT changed to ACTIVE');
    assert(dbUserAfterTamper?.isPhoneVerified === false, 'Test 7.12: isPhoneVerified was NOT marked true');
    assert(dbUserAfterTamper?.phone === TEST_PHONE_1, 'Test 7.13: Phone number was NOT changed');

    // 7e: Suspended member blocked from profile endpoints
    await prisma.user.update({
      where: { phone: TEST_PHONE_1 },
      data: { status: UserStatus.SUSPENDED },
    });
    const suspendedRes = await fetch(`${baseUrl}/api/v1/users/me/profile`, {
      headers: { Authorization: `Bearer ${memberAccessToken}` },
    });
    assert(suspendedRes.status === 403, 'Test 7.14: Suspended member blocked with 403 Forbidden');

  } finally {
    // Clean up test users
    await prisma.user.deleteMany({
      where: {
        phone: { in: [TEST_PHONE_1, TEST_PHONE_2, TEST_PHONE_3] },
      },
    });

    server.close();
    await prisma.$disconnect();
  }

  console.log('[Test] ====================================================');
  console.log(`[Test] Completed: ${passed} passed, ${failed} failed`);
  console.log('[Test] ====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMemberRegistrationTests().catch((err) => {
  console.error('[Test] Fatal test error:', err);
  process.exit(1);
});

import http from 'http';
import * as argon2 from 'argon2';
import { prisma, Role, UserStatus } from '@apnasamaj/database';
import { createApp } from '../app';

const TEST_PHONE = '+919999900001';
const TEST_PASSWORD = 'SecureTestPassword123!';

async function runStage2Tests() {
  console.log('[Test] ====================================================');
  console.log('[Test] Running Authentication Stage 2 Automated Tests');
  console.log('[Test] ====================================================');

  // 1. Prepare test user in database
  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  // Clean any previous test run
  await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });

  const testUser = await prisma.user.create({
    data: {
      phone: TEST_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Stage 2 Tester',
        },
      },
    },
  });

  console.log('[Test] Created test user:', testUser.id);

  // 2. Start ephemeral test server
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test] Ephemeral test server listening on ${baseUrl}`);

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ' - ' + detail : ''}`);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: POST /api/v1/auth/login returns access token + refresh cookie
    // -------------------------------------------------------------
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
    });

    const loginBody: any = await loginRes.json();
    const setCookieHeader = loginRes.headers.get('set-cookie') || '';

    assert(loginRes.status === 200, 'Test 1.1: Login status is 200 OK');
    assert(loginBody.success === true, 'Test 1.2: Login response has success=true');
    assert(typeof loginBody.data?.accessToken === 'string', 'Test 1.3: Access token is returned');
    assert(typeof loginBody.data?.refreshToken === 'string', 'Test 1.4: Refresh token is returned in payload');
    assert(setCookieHeader.includes('refreshToken='), 'Test 1.5: Set-Cookie header contains refreshToken');
    assert(setCookieHeader.toLowerCase().includes('httponly'), 'Test 1.6: Cookie is HttpOnly');
    assert(setCookieHeader.toLowerCase().includes('samesite=strict'), 'Test 1.7: Cookie has SameSite=Strict');
    assert(setCookieHeader.includes('Path=/api/v1/auth'), 'Test 1.8: Cookie path is /api/v1/auth');

    const firstRefreshToken = loginBody.data.refreshToken;
    const initialCookie = setCookieHeader.split(';')[0]; // refreshToken=...

    // -------------------------------------------------------------
    // Test 2: POST /api/v1/auth/refresh rotates the token
    // -------------------------------------------------------------
    const refreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': initialCookie,
      },
    });

    const refreshBody: any = await refreshRes.json();
    const refreshSetCookie = refreshRes.headers.get('set-cookie') || '';

    assert(refreshRes.status === 200, 'Test 2.1: Refresh status is 200 OK');
    assert(refreshBody.success === true, 'Test 2.2: Refresh response has success=true');
    assert(typeof refreshBody.data?.accessToken === 'string', 'Test 2.3: New access token generated');
    assert(typeof refreshBody.data?.refreshToken === 'string', 'Test 2.4: Rotated refresh token returned');
    assert(refreshBody.data?.refreshToken !== firstRefreshToken, 'Test 2.5: Rotated token is different from first token');

    const secondRefreshToken = refreshBody.data.refreshToken;
    const secondCookie = refreshSetCookie.split(';')[0];

    // -------------------------------------------------------------
    // Test 3: REPLAY ATTACK DETECTION:
    // Presenting the already rotated firstRefreshToken must trigger replay detection
    // and revoke the entire family.
    // -------------------------------------------------------------
    const replayRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': initialCookie, // First token, already rotated
      },
    });

    const replayBody: any = await replayRes.json();
    assert(replayRes.status === 401, 'Test 3.1: Replaying rotated token returns 401 Unauthorized');
    assert(replayBody.success === false, 'Test 3.2: Replay response has success=false');
    assert(
      replayBody.error?.toLowerCase().includes('reuse') || replayBody.error?.toLowerCase().includes('revoked'),
      'Test 3.3: Error message indicates token reuse detected',
      replayBody.error
    );

    // -------------------------------------------------------------
    // Test 4: Consequence of Replay Attack:
    // The second token (which was valid before the replay) must now also be revoked
    // because its entire family was invalidated!
    // -------------------------------------------------------------
    const familyRevokedRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': secondCookie,
      },
    });

    assert(familyRevokedRes.status === 401, 'Test 4.1: Sibling token in compromised family is revoked');

    // -------------------------------------------------------------
    // Test 5: POST /api/v1/auth/logout clears cookie and revokes session
    // -------------------------------------------------------------
    // Log in afresh to get a valid session
    const freshLoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
    });
    const freshLoginCookie = (freshLoginRes.headers.get('set-cookie') || '').split(';')[0];

    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': freshLoginCookie,
      },
    });

    const logoutBody: any = await logoutRes.json();
    const logoutSetCookie = logoutRes.headers.get('set-cookie') || '';

    assert(logoutRes.status === 200, 'Test 5.1: Logout returns 200 OK');
    assert(logoutBody.success === true, 'Test 5.2: Logout success=true');
    assert(
      logoutSetCookie.includes('refreshToken=;') || logoutSetCookie.toLowerCase().includes('max-age=0') || logoutSetCookie.includes('1970'),
      'Test 5.3: Logout clears the refreshToken cookie'
    );

    // Verify logged-out token cannot be refreshed
    const postLogoutRefreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': freshLoginCookie,
      },
    });
    assert(postLogoutRefreshRes.status === 401, 'Test 5.4: Refreshing a logged-out token is rejected with 401');

    // -------------------------------------------------------------
    // Test 6: Rejection of SUSPENDED account during refresh
    // -------------------------------------------------------------
    const userForSuspensionRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: TEST_PHONE, password: TEST_PASSWORD }),
    });
    const suspensionCookie = (userForSuspensionRes.headers.get('set-cookie') || '').split(';')[0];

    // Suspend the user directly in database
    await prisma.user.update({
      where: { id: testUser.id },
      data: { status: UserStatus.SUSPENDED },
    });

    const suspendedRefreshRes = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Cookie': suspensionCookie,
      },
    });

    const suspendedBody: any = await suspendedRefreshRes.json();
    assert(suspendedRefreshRes.status === 403, 'Test 6.1: Suspended user refresh is rejected with 403 Forbidden');
    assert(
      suspendedBody.error?.toLowerCase().includes('suspended'),
      'Test 6.2: Error message indicates account is suspended'
    );

  } finally {
    // Clean up test data and close server
    await prisma.user.deleteMany({ where: { phone: TEST_PHONE } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }

  console.log('[Test] ====================================================');
  console.log(`[Test] Total Passed: ${passedCount}`);
  console.log(`[Test] Total Failed: ${failedCount}`);
  console.log('[Test] ====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStage2Tests().catch((err) => {
  console.error('[Test] Unhandled error during test run:', err);
  process.exit(1);
});

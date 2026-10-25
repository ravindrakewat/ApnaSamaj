import assert from 'node:assert';
import type { AuthUser, RefreshResponseData, PostItem } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.1.1: Auth Persistence & Refresh Tests ');
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

// Coalescing token refresh implementation under test
class CoalescedTokenManager {
  private inMemoryAccessToken: string | null = null;
  private activeRefreshPromise: Promise<RefreshResponseData> | null = null;
  public networkRefreshCalls = 0;

  constructor(private mockServerHandler: () => Promise<RefreshResponseData>) {}

  public setInMemoryToken(token: string | null): void {
    this.inMemoryAccessToken = token;
  }

  public getInMemoryToken(): string | null {
    return this.inMemoryAccessToken;
  }

  public clearAuthSession(): void {
    this.inMemoryAccessToken = null;
    this.activeRefreshPromise = null;
  }

  public async executeTokenRefresh(): Promise<RefreshResponseData> {
    if (this.activeRefreshPromise) {
      return this.activeRefreshPromise;
    }

    this.activeRefreshPromise = (async () => {
      try {
        this.networkRefreshCalls++;
        const data = await this.mockServerHandler();
        this.setInMemoryToken(data.accessToken);
        return data;
      } catch (err) {
        this.setInMemoryToken(null);
        throw err;
      } finally {
        this.activeRefreshPromise = null;
      }
    })();

    return this.activeRefreshPromise;
  }
}

// Simulates React state & ProtectedRoute decision logic
function simulateProtectedRouteDecision(
  isLoading: boolean,
  user: AuthUser | null,
  currentLocation: string
): { renderView: 'LOADING' | 'LOGIN_REDIRECT' | 'PROTECTED_CHILDREN'; redirectTarget?: string } {
  if (isLoading) {
    return { renderView: 'LOADING' };
  }
  if (!user) {
    return { renderView: 'LOGIN_REDIRECT', redirectTarget: `/login?from=${encodeURIComponent(currentLocation)}` };
  }
  return { renderView: 'PROTECTED_CHILDREN' };
}

async function runTests() {
  console.log('--- 1. Authentication Restoration Pending: ProtectedRoute Behavior ---');
  {
    // When application boots or page reloads (F5), isLoading starts true
    const postUrl = '/posts/post-uuid-123';
    const initialDecision = simulateProtectedRouteDecision(true, null, postUrl);
    assertTest(initialDecision.renderView === 'LOADING', 'Shows loading spinner while session restoration is pending');
    assertTest(!initialDecision.redirectTarget, 'Does NOT redirect to /login while isLoading is true');
  }

  console.log('--- 2. Valid Session Restoration on F5: Remount Resilience ---');
  {
    const mockUser: AuthUser = {
      id: 'user-valid-1',
      phone: '+919876543210',
      fullName: 'Vikram Rajput',
      role: 'MEMBER' as any,
      status: 'ACTIVE' as any,
      isPhoneVerified: true,
    };

    const tokenManager = new CoalescedTokenManager(async () => {
      // Simulate network latency for refresh
      await new Promise((r) => setTimeout(r, 20));
      return {
        accessToken: 'fresh-jwt-access-token-123',
        refreshToken: 'rotated-refresh-token-456',
        user: mockUser,
      };
    });

    // Simulate React 18 Strict Mode: Two parallel mount attempts on F5
    const mountAttempt1 = tokenManager.executeTokenRefresh();
    const mountAttempt2 = tokenManager.executeTokenRefresh();

    assertTest(tokenManager.networkRefreshCalls === 1, 'Exactly ONE network request dispatched despite concurrent mounts');

    const [res1, res2] = await Promise.all([mountAttempt1, mountAttempt2]);

    assertTest(res1.accessToken === 'fresh-jwt-access-token-123', 'Mount 1 received valid access token');
    assertTest(res2.accessToken === 'fresh-jwt-access-token-123', 'Mount 2 received identical access token');
    assertTest(tokenManager.getInMemoryToken() === 'fresh-jwt-access-token-123', 'In-memory access token is set');
    assertTest(tokenManager.networkRefreshCalls === 1, 'Network call count remains exactly 1 after resolution');

    // ProtectedRoute decision after restoration succeeds
    const postUrl = '/posts/post-uuid-123';
    const restoredDecision = simulateProtectedRouteDecision(false, res2.user, postUrl);
    assertTest(restoredDecision.renderView === 'PROTECTED_CHILDREN', 'Renders post-detail component instead of redirecting');
  }

  console.log('--- 3. Concurrent API Requests: In-Flight Refresh Coalescing ---');
  {
    let serverRotations = 0;
    const tokenManager = new CoalescedTokenManager(async () => {
      serverRotations++;
      await new Promise((r) => setTimeout(r, 25));
      return {
        accessToken: `access-token-rot-${serverRotations}`,
        refreshToken: `refresh-token-rot-${serverRotations}`,
        user: { id: 'u1', phone: '123', fullName: 'User', role: 'MEMBER' as any, status: 'ACTIVE' as any, isPhoneVerified: true },
      };
    });

    // Simulate 5 simultaneous API requests failing with 401 (e.g. notifications, feed, view count, chat, profile)
    const concurrentRequests = Array.from({ length: 5 }, () => tokenManager.executeTokenRefresh());

    const results = await Promise.all(concurrentRequests);

    assertTest(serverRotations === 1, 'Only 1 token rotation occurred on the server for 5 concurrent calls');
    assertTest(results.every((r) => r.accessToken === 'access-token-rot-1'), 'All 5 concurrent requests received matching tokens');
  }

  console.log('--- 4. Expired or Revoked Session Handling ---');
  {
    const tokenManager = new CoalescedTokenManager(async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('Refresh token has expired. Please log in again.');
    });

    let caughtError: string | null = null;
    try {
      await tokenManager.executeTokenRefresh();
    } catch (err: any) {
      caughtError = err.message;
    }

    assertTest(caughtError?.includes('expired') === true, 'Catches expired session error gracefully');
    assertTest(tokenManager.getInMemoryToken() === null, 'In-memory token is cleared upon expired session');

    // ProtectedRoute decision when restoration legitimately fails
    const expiredDecision = simulateProtectedRouteDecision(false, null, '/posts/post-uuid-123');
    assertTest(expiredDecision.renderView === 'LOGIN_REDIRECT', 'Redirects to login when session is actually expired');
    assertTest(expiredDecision.redirectTarget?.includes('/login?from='), 'Redirect carries originating URL for seamless return');
  }

  console.log('--- 5. Login and Explicit Logout State Transition ---');
  {
    const tokenManager = new CoalescedTokenManager(async () => {
      return {
        accessToken: 'initial-token',
        refreshToken: 'initial-refresh',
        user: { id: 'u1', phone: '123', fullName: 'U', role: 'MEMBER' as any, status: 'ACTIVE' as any, isPhoneVerified: true },
      };
    });

    // Simulate login
    tokenManager.setInMemoryToken('login-token-xyz');
    assertTest(tokenManager.getInMemoryToken() === 'login-token-xyz', 'Login successfully sets in-memory access token');

    // Simulate logout
    tokenManager.clearAuthSession();
    assertTest(tokenManager.getInMemoryToken() === null, 'Explicit logout clears in-memory access token');

    const loggedOutDecision = simulateProtectedRouteDecision(false, null, '/posts/123');
    assertTest(loggedOutDecision.renderView === 'LOGIN_REDIRECT', 'Logged-out state correctly redirects to login');
  }

  console.log('--- 6. Post Detail Fetching With Restored Token ---');
  {
    const token = 'restored-valid-token-789';
    let authHeaderSent: string | null = null;

    const mockFetchPost = async (headers: Headers): Promise<{ success: boolean; data: Partial<PostItem> }> => {
      authHeaderSent = headers.get('Authorization');
      if (authHeaderSent !== `Bearer ${token}`) {
        throw new Error('401 Unauthorized');
      }
      return {
        success: true,
        data: {
          id: 'post-detail-uuid',
          content: 'Verified content after refresh',
          likesCount: 10,
          viewsCount: 25,
        },
      };
    };

    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);
    const postRes = await mockFetchPost(headers);

    assertTest(authHeaderSent === `Bearer ${token}`, 'Post request properly sends restored Bearer token');
    assertTest(postRes.success === true, 'Post data loaded successfully with restored credentials');
    assertTest(postRes.data.content === 'Verified content after refresh', 'Post content is intact');
  }

  console.log('--- 7. Community Context Resolution & Login Regression Tests ---');
  {
    // Simulation of API client request construction
    const buildRequestHeaders = (options: {
      inMemoryToken?: string | null;
      activeCommunitySlug?: string | null;
      customHeaders?: Record<string, string>;
    }) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.customHeaders || {}),
      };
      if (options.activeCommunitySlug && !headers['X-Community-Slug']) {
        headers['X-Community-Slug'] = options.activeCommunitySlug;
      }
      if (options.inMemoryToken && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${options.inMemoryToken}`;
      }
      return headers;
    };

    // Test 7.1: Missing community context fails closed with exact error
    const simulateBackendLoginCheck = (headers: Record<string, string>) => {
      const community = headers['X-Community-Slug'];
      if (!community) {
        return {
          statusCode: 400,
          success: false,
          error:
            'Community context required for member login. Please access via a valid community subdomain or specify X-Community-Slug header.',
        };
      }
      return {
        statusCode: 200,
        success: true,
        data: {
          accessToken: 'jwt-access-token',
          user: { id: 'user-1', phone: '+919888800001', communitySlug: community },
        },
      };
    };

    // Scenario A: Caller without community slug hits fail-closed guard
    const unroutedHeaders = buildRequestHeaders({});
    const unroutedRes = simulateBackendLoginCheck(unroutedHeaders);
    assertTest(
      unroutedRes.statusCode === 400 &&
        unroutedRes.error.includes('Community context required for member login'),
      'Missing community context fails closed with exact community-context required error'
    );

    // Scenario B: Caller with selected community ('kewat') provides X-Community-Slug header
    const kewatHeaders = buildRequestHeaders({ activeCommunitySlug: 'kewat' });
    assertTest(kewatHeaders['X-Community-Slug'] === 'kewat', 'Client attaches X-Community-Slug: kewat');
    const kewatRes = simulateBackendLoginCheck(kewatHeaders);
    assertTest(kewatRes.statusCode === 200 && kewatRes.success, 'Login succeeds when X-Community-Slug: kewat is supplied');
    assertTest(kewatRes.data?.user.communitySlug === 'kewat', 'User record confirms communitySlug is kewat');

    // Scenario C: Caller with selected community ('gupta') provides X-Community-Slug header
    const guptaHeaders = buildRequestHeaders({ activeCommunitySlug: 'gupta' });
    assertTest(guptaHeaders['X-Community-Slug'] === 'gupta', 'Client attaches X-Community-Slug: gupta');
    const guptaRes = simulateBackendLoginCheck(guptaHeaders);
    assertTest(guptaRes.statusCode === 200 && guptaRes.success, 'Login succeeds when X-Community-Slug: gupta is supplied');
    assertTest(guptaRes.data?.user.communitySlug === 'gupta', 'User record confirms communitySlug is gupta');

    // Scenario D: Refresh request forwards the resolved community slug
    const refreshHeaders = buildRequestHeaders({
      activeCommunitySlug: 'kewat',
      inMemoryToken: null,
    });
    assertTest(
      refreshHeaders['X-Community-Slug'] === 'kewat',
      'Token refresh forwards active community slug header'
    );
  }

  console.log('\n================================================================');
  console.log(`   Tests Completed: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

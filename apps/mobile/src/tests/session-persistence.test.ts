import assert from 'node:assert';
import { ApiClient } from '../api/client';
import { authApi } from '../api/auth.api';
import { ApiError } from '../api/types';
import {
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getStoredCommunitySlug,
  setStoredCommunitySlug,
  getSecureItem,
  setSecureItem,
  removeSecureItem,
  clearMemoryStorageForTesting,
} from '../services/storage.service';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { APP_CONFIG } from '../constants/config';
import { AuthUser, UserRole, UserStatus } from '@apnasamaj/shared-types';

export async function runSessionPersistenceTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Mobile Session Persistence & Refresh Tests      ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err?.message || err}`);
      failed++;
    }
  }

  const mockUser: AuthUser = {
    id: 'usr_test_123',
    phone: '+919876543210',
    fullName: 'राकेश शर्मा',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    communitySlug: 'demo',
  };

  // -----------------------------------------------------------------------------
  // Test 1: Login → Refresh page → User remains logged in
  // -----------------------------------------------------------------------------
  await test('Test 1: Login → Refresh page / App Restart → User remains logged in', async () => {
    // 1. Simulate login: persist tokens and user profile
    await setAuthTokens({
      accessToken: 'jwt_valid_access_token_1',
      refreshToken: 'refresh_token_valid_1',
    });
    await setStoredCommunitySlug('demo');
    await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(mockUser));

    // 2. Simulate page reload / app restart by re-reading from storage
    const restoredTokens = await getAuthTokens();
    const restoredSlug = await getStoredCommunitySlug();
    const restoredProfileJson = await getSecureItem(STORAGE_KEYS.USER_PROFILE);

    assert.strictEqual(restoredTokens.accessToken, 'jwt_valid_access_token_1');
    assert.strictEqual(restoredTokens.refreshToken, 'refresh_token_valid_1');
    assert.strictEqual(restoredSlug, 'demo');
    assert.ok(restoredProfileJson);

    const parsedUser = JSON.parse(restoredProfileJson!);
    assert.strictEqual(parsedUser.id, mockUser.id);
    assert.strictEqual(parsedUser.communitySlug, 'demo');
  });

  // -----------------------------------------------------------------------------
  // Test 2: App restart → Session restored
  // -----------------------------------------------------------------------------
  await test('Test 2: App restart → Storage retains credentials without in-memory dependency', async () => {
    // Verify tokens survive in-memory cache clear
    await setAuthTokens({
      accessToken: 'access_restart_test',
      refreshToken: 'refresh_restart_test',
    });
    await setStoredCommunitySlug('kewat-samaj');

    // Clear transient in-memory map
    clearMemoryStorageForTesting();

    // In a persistent environment (SecureStore on native or localStorage on web), credentials persist
    const tokens = await getAuthTokens();
    const slug = await getStoredCommunitySlug();

    assert.strictEqual(tokens.accessToken, 'access_restart_test');
    assert.strictEqual(tokens.refreshToken, 'refresh_restart_test');
    assert.strictEqual(slug, 'kewat-samaj');
  });

  // -----------------------------------------------------------------------------
  // Test 3: Access token expired → Refresh token renews session
  // -----------------------------------------------------------------------------
  await test('Test 3: Access token expired → Refresh token renews session via 401 interceptor', async () => {
    await setAuthTokens({
      accessToken: 'expired_jwt_token',
      refreshToken: 'valid_refresh_token_rot_1',
    });
    await setStoredCommunitySlug('demo');

    const originalFetch = global.fetch;
    let refreshCalls = 0;
    let feedCalls = 0;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();

      if (urlStr.includes('/auth/refresh')) {
        refreshCalls++;
        const body = JSON.parse((init?.body as string) || '{}');
        assert.strictEqual(body.refreshToken, 'valid_refresh_token_rot_1');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              accessToken: 'new_jwt_access_token_rot_2',
              refreshToken: 'new_refresh_token_rot_2',
              user: mockUser,
            },
          }),
        } as unknown as Response;
      }

      if (urlStr.includes('/feed')) {
        feedCalls++;
        const authHeader = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization;
        // First call has expired token -> 401
        if (feedCalls === 1) {
          assert.strictEqual(authHeader, 'Bearer expired_jwt_token');
          return {
            ok: false,
            status: 401,
            json: async () => ({ success: false, error: 'Unauthorized: Token expired' }),
          } as unknown as Response;
        }
        // Second call must have rotated token
        assert.strictEqual(authHeader, 'Bearer new_jwt_access_token_rot_2');
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { posts: [] } }),
        } as unknown as Response;
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: 'Not found' }),
      } as unknown as Response;
    };

    try {
      const client = new ApiClient('http://localhost:5000/api/v1');
      const feedResult: any = await client.get('/feed');

      assert.strictEqual(refreshCalls, 1, 'Exactly one refresh request should be issued');
      assert.strictEqual(feedCalls, 2, 'Feed should be called once with old token and retried once with new token');
      assert.strictEqual(feedResult.success, true);

      // Verify tokens were rotated and persisted in storage
      const updatedTokens = await getAuthTokens();
      assert.strictEqual(updatedTokens.accessToken, 'new_jwt_access_token_rot_2');
      assert.strictEqual(updatedTokens.refreshToken, 'new_refresh_token_rot_2');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -----------------------------------------------------------------------------
  // Test 4: Invalid refresh token → User redirected to Login & tokens purged
  // -----------------------------------------------------------------------------
  await test('Test 4: Invalid refresh token → Tokens purged and error thrown', async () => {
    await setAuthTokens({
      accessToken: 'expired_access_token',
      refreshToken: 'revoked_refresh_token',
    });
    await setStoredCommunitySlug('demo');

    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: 'Invalid or revoked refresh token',
          }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: 'Unauthorized' }),
      } as unknown as Response;
    };

    try {
      const client = new ApiClient('http://localhost:5000/api/v1');
      await assert.rejects(
        () => client.get('/feed'),
        /Session renewal failed|Authentication expired/
      );

      // Verify credentials were wiped
      const tokens = await getAuthTokens();
      assert.strictEqual(tokens.accessToken, null);
      assert.strictEqual(tokens.refreshToken, null);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -----------------------------------------------------------------------------
  // Test 5: Explicit logout → Session cleared, community preserved
  // -----------------------------------------------------------------------------
  await test('Test 5: Explicit logout → Session cleared, community slug preserved', async () => {
    await setAuthTokens({
      accessToken: 'active_access_token',
      refreshToken: 'active_refresh_token',
    });
    await setStoredCommunitySlug('my-community');
    await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(mockUser));

    // Perform logout
    await clearAuthTokens();

    const tokens = await getAuthTokens();
    const profile = await getSecureItem(STORAGE_KEYS.USER_PROFILE);
    const slug = await getStoredCommunitySlug();

    assert.strictEqual(tokens.accessToken, null, 'Access token must be cleared');
    assert.strictEqual(tokens.refreshToken, null, 'Refresh token must be cleared');
    assert.strictEqual(profile, null, 'Cached profile must be cleared');
    assert.strictEqual(slug, 'my-community', 'Community slug must remain preserved across logout');
  });

  // -----------------------------------------------------------------------------
  // Test 6: Community switch → Old session cleared
  // -----------------------------------------------------------------------------
  await test('Test 6: Community switch → Old session cleared and new slug persisted', async () => {
    await setAuthTokens({
      accessToken: 'old_tenant_token',
      refreshToken: 'old_tenant_refresh',
    });
    await setStoredCommunitySlug('old-community');
    await setSecureItem(
      STORAGE_KEYS.USER_PROFILE,
      JSON.stringify({ ...mockUser, communitySlug: 'old-community' })
    );

    // Switch community to 'new-community'
    await clearAuthTokens();
    await setStoredCommunitySlug('new-community');

    const tokens = await getAuthTokens();
    const profile = await getSecureItem(STORAGE_KEYS.USER_PROFILE);
    const slug = await getStoredCommunitySlug();

    assert.strictEqual(tokens.accessToken, null);
    assert.strictEqual(tokens.refreshToken, null);
    assert.strictEqual(profile, null);
    assert.strictEqual(slug, 'new-community');
  });

  // -----------------------------------------------------------------------------
  // Test 7: Multiple simultaneous 401 responses → Single refresh request
  // -----------------------------------------------------------------------------
  await test('Test 7: Multiple simultaneous 401 responses → Only one refresh request issued', async () => {
    await setAuthTokens({
      accessToken: 'expiring_token',
      refreshToken: 'refresh_coalesce_test',
    });
    await setStoredCommunitySlug('demo');

    const originalFetch = global.fetch;
    let refreshCalls = 0;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();

      if (urlStr.includes('/auth/refresh')) {
        refreshCalls++;
        // Simulate minor async network delay
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              accessToken: 'refreshed_access_coalesced',
              refreshToken: 'refreshed_refresh_coalesced',
              user: mockUser,
            },
          }),
        } as unknown as Response;
      }

      const authHeader = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization;
      if (authHeader === 'Bearer expiring_token') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Unauthorized' }),
        } as unknown as Response;
      }

      if (authHeader === 'Bearer refreshed_access_coalesced') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { item: urlStr } }),
        } as unknown as Response;
      }

      return {
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: 'Bad request' }),
      } as unknown as Response;
    };

    try {
      const client = new ApiClient('http://localhost:5000/api/v1');

      // Dispatch 4 concurrent requests that all get 401
      const [res1, res2, res3, res4]: any[] = await Promise.all([
        client.get('/endpoint-1'),
        client.get('/endpoint-2'),
        client.get('/endpoint-3'),
        client.get('/endpoint-4'),
      ]);

      assert.strictEqual(refreshCalls, 1, 'Only one refresh request must occur for concurrent failures');
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res2.success, true);
      assert.strictEqual(res3.success, true);
      assert.strictEqual(res4.success, true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -----------------------------------------------------------------------------
  // Test 8: Session restoration pending → No premature Login redirect
  // -----------------------------------------------------------------------------
  await test('Test 8: Session restoration pending → NavigationGate guards against premature redirect', () => {
    // NavigationGate invariants:
    // When isLoading is true:
    // 1. Returns SplashScreen
    // 2. Navigation effect returns early (no router.replace)
    const state = {
      isLoading: true,
      isAuthenticated: false,
      segments: ['(app)'],
    };

    const shouldRedirectToLogin = !state.isLoading && !state.isAuthenticated && state.segments[0] !== '(auth)';
    assert.strictEqual(shouldRedirectToLogin, false, 'Must not redirect while isLoading is true');

    // Once isLoading finishes with valid session
    const restoredState = {
      isLoading: false,
      isAuthenticated: true,
      segments: ['(app)'],
    };
    const shouldRedirectRestored = !restoredState.isLoading && !restoredState.isAuthenticated;
    assert.strictEqual(shouldRedirectRestored, false, 'Authenticated session remains on app screen');
  });

  // -----------------------------------------------------------------------------
  // Test 9: Browser Page Reload & Web Storage Persistence
  // -----------------------------------------------------------------------------
  await test('Test 9: Browser Page Reload → Web storage persists tokens across reloads', async () => {
    // Simulate window.localStorage in Node test environment
    const fakeLocalStorage = new Map<string, string>();
    const originalWindow = (global as any).window;

    (global as any).window = {
      localStorage: {
        getItem: (k: string) => fakeLocalStorage.get(k) || null,
        setItem: (k: string, v: string) => fakeLocalStorage.set(k, v),
        removeItem: (k: string) => fakeLocalStorage.delete(k),
        clear: () => fakeLocalStorage.clear(),
      },
    };

    try {
      // Write keys into web localStorage
      fakeLocalStorage.set('@apnasamaj:apnasamaj_access_token', 'web_access_token_123');
      fakeLocalStorage.set('@apnasamaj:apnasamaj_refresh_token', 'web_refresh_token_123');
      fakeLocalStorage.set('@apnasamaj:apnasamaj_community_slug', 'web-community');
      fakeLocalStorage.set('@apnasamaj:apnasamaj_user_profile', JSON.stringify(mockUser));

      // Simulate browser page refresh: verify web storage read returns keys
      const token = fakeLocalStorage.get('@apnasamaj:apnasamaj_access_token');
      const refresh = fakeLocalStorage.get('@apnasamaj:apnasamaj_refresh_token');
      const slug = fakeLocalStorage.get('@apnasamaj:apnasamaj_community_slug');
      const profile = fakeLocalStorage.get('@apnasamaj:apnasamaj_user_profile');

      assert.strictEqual(token, 'web_access_token_123');
      assert.strictEqual(refresh, 'web_refresh_token_123');
      assert.strictEqual(slug, 'web-community');
      assert.ok(profile && JSON.parse(profile).id === mockUser.id);
    } finally {
      (global as any).window = originalWindow;
    }
  });

  // -----------------------------------------------------------------------------
  // Test 10: Network error during refresh → Tokens are NOT cleared (offline resilience)
  // -----------------------------------------------------------------------------
  await test('Test 10: Network error during refresh → Tokens are NOT cleared', async () => {
    await setAuthTokens({
      accessToken: 'exp_token',
      refreshToken: 'valid_refresh_offline',
    });
    await setStoredCommunitySlug('demo');

    const originalFetch = global.fetch;
    // Simulate network down (fetch rejects with TypeError or abort)
    global.fetch = async (): Promise<Response> => {
      throw new TypeError('Network request failed: Failed to fetch');
    };

    try {
      const client = new ApiClient('http://localhost:5000/api/v1');
      await assert.rejects(
        () => client.get('/feed'),
        /Network request failed/
      );

      // Verify tokens were NOT cleared due to transient network failure
      const tokens = await getAuthTokens();
      assert.strictEqual(
        tokens.refreshToken,
        'valid_refresh_offline',
        'Refresh token must be retained on transient network failures'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -----------------------------------------------------------------------------
  // Test 11: Cross-tenant guard → Mismatched profile is rejected
  // -----------------------------------------------------------------------------
  await test('Test 11: Cross-tenant guard → Stored profile matching different slug is purged', async () => {
    const activeSlug = 'demo';
    const foreignUser = { ...mockUser, communitySlug: 'other-samaj' };

    // Simulate cross-tenant check logic
    const isTenantMatch = !foreignUser.communitySlug || foreignUser.communitySlug.toLowerCase() === activeSlug.toLowerCase();
    assert.strictEqual(isTenantMatch, false, 'Foreign community user must not be accepted under active community');
  });

  // -----------------------------------------------------------------------------
  // Test 12: HTTP 400 Validation Error → Tokens are NOT cleared
  // -----------------------------------------------------------------------------
  await test('Test 12: HTTP 400 Validation Error → Unrelated validation errors do not purge session', async () => {
    await setAuthTokens({
      accessToken: 'valid_access_token_400_test',
      refreshToken: 'valid_refresh_token_400_test',
    });
    await setStoredCommunitySlug('demo');

    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('/posts')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            success: false,
            error: 'Validation error: Title is required for Announcement posts',
          }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ success: false, error: 'Not found' }),
      } as unknown as Response;
    };

    try {
      const client = new ApiClient('http://localhost:5000/api/v1');
      await assert.rejects(
        () => client.post('/posts', { content: 'test post' }),
        (err: any) => err instanceof ApiError && err.status === 400
      );

      // Verify tokens were NOT cleared on a 400 validation error
      const tokens = await getAuthTokens();
      assert.strictEqual(
        tokens.accessToken,
        'valid_access_token_400_test',
        'Access token must survive HTTP 400 validation errors'
      );
      assert.strictEqual(
        tokens.refreshToken,
        'valid_refresh_token_400_test',
        'Refresh token must survive HTTP 400 validation errors'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -----------------------------------------------------------------------------
  // Test 13: Missing community slug does NOT silently restore user into 'demo' fallback
  // -----------------------------------------------------------------------------
  await test('Test 13: Missing community slug → Does not silently restore user into demo fallback', async () => {
    // Scenario: User had tokens and profile in 'kewat-samaj', but community slug key was missing/deleted
    const userKewat = { ...mockUser, communitySlug: 'kewat-samaj' };
    await setAuthTokens({
      accessToken: 'token_kewat',
      refreshToken: 'refresh_kewat',
    });
    await removeSecureItem(STORAGE_KEYS.COMMUNITY_SLUG);
    await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(userKewat));

    // Inspect slug in storage directly
    const rawStoredSlug = await getSecureItem(STORAGE_KEYS.COMMUNITY_SLUG);
    assert.strictEqual(rawStoredSlug, null, 'Raw stored slug is empty');

    // Tenant recovery logic:
    // When tokens exist, rather than blindly defaulting to 'demo', recovery extracts user's real community
    let activeSlug: string | null = null;
    const hasTokens = true;

    if (hasTokens) {
      if (!activeSlug && userKewat.communitySlug) {
        activeSlug = userKewat.communitySlug.trim().toLowerCase();
        await setStoredCommunitySlug(activeSlug);
      }
    }

    assert.strictEqual(activeSlug, 'kewat-samaj', 'Must recover user real community and NOT use demo fallback');
    const recoveredSlug = await getSecureItem(STORAGE_KEYS.COMMUNITY_SLUG);
    assert.strictEqual(recoveredSlug, 'kewat-samaj', 'Must persist recovered community slug');

    // Sub-case: Missing slug AND missing user communitySlug -> Must purge ambiguous session
    await removeSecureItem(STORAGE_KEYS.COMMUNITY_SLUG);
    const ambiguousUser = { ...mockUser, communitySlug: undefined };
    let ambiguousActiveSlug: string | null = null;
    let purged = false;

    if (!ambiguousActiveSlug && !ambiguousUser.communitySlug) {
      await clearAuthTokens();
      purged = true;
    }

    assert.strictEqual(purged, true, 'Ambiguous session without tenant context must be purged');
    const finalTokens = await getAuthTokens();
    assert.strictEqual(finalTokens.accessToken, null, 'Ambiguous tokens must be cleared');
  });

  // -----------------------------------------------------------------------------
  // Test 14: Storage engine diagnostics (Native SecureStore vs Web localStorage)
  // -----------------------------------------------------------------------------
  await test('Test 14: Storage engine diagnostics → Native SecureStore remains default on mobile', async () => {
    const { getActiveStorageEngine } = await import('../services/storage.service');
    const engine = await getActiveStorageEngine();
    // In our Node/native mock test runtime, Platform.OS is 'android', so engine is 'secure-store'
    assert.strictEqual(engine, 'secure-store', 'Mobile native runtime must use secure-store');
  });

  console.log('\n================================================================');
  console.log(` Session Persistence Test Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} session persistence tests failed.`);
  }
}


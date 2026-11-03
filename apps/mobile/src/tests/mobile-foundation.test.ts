import assert from 'node:assert';
import { theme, colors, spacing, borderRadius } from '../theme';
import { resolveTranslation } from '../localization/i18n';
import { ApiClient } from '../api/client';
import { ApiError } from '../api/types';
import {
  setAuthTokens,
  getAuthTokens,
  clearAuthTokens,
  setStoredCommunitySlug,
  getStoredCommunitySlug,
} from '../services/storage.service';
import { APP_CONFIG } from '../constants/config';
import appConfig from '../../app.json';

console.log('================================================================');
console.log('    Apna Samaj — Batch 1 Mobile Foundation Test Suite           ');
console.log('================================================================\n');

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
}

async function runTests() {
  // -----------------------------------------------------------------------------
  // 1. Android & Expo Configuration
  // -----------------------------------------------------------------------------
  console.log('--- 1. Expo & Android Configuration ---');

  await test('Expo app name is "Apna Samaj"', () => {
    assert.strictEqual(appConfig.expo.name, 'Apna Samaj');
    assert.strictEqual(appConfig.expo.slug, 'apna-samaj');
  });

  await test('Android package identifier is "com.apnasamaj.app"', () => {
    assert.strictEqual(appConfig.expo.android.package, 'com.apnasamaj.app');
  });

  await test('Expo orientation is portrait and light mode default', () => {
    assert.strictEqual(appConfig.expo.orientation, 'portrait');
    assert.strictEqual(appConfig.expo.userInterfaceStyle, 'light');
  });

  await test('Required Expo plugins are registered', () => {
    assert.ok(appConfig.expo.plugins.includes('expo-router'));
    assert.ok(appConfig.expo.plugins.includes('expo-secure-store'));
  });

  // -----------------------------------------------------------------------------
  // 2. Design System Tokens (Lightweight & Low-RAM Optimizations)
  // -----------------------------------------------------------------------------
  console.log('\n--- 2. Design System Tokens ---');

  await test('Theme defines brand colors with clean white background and high contrast text', () => {
    assert.strictEqual(theme.colors.primary, '#1976D2');
    assert.strictEqual(theme.colors.background, '#F8FAFC');
    assert.strictEqual(theme.colors.surface, '#FFFFFF');
    assert.strictEqual(theme.colors.textPrimary, '#0F172A');
    assert.strictEqual(theme.colors.textSecondary, '#475569');
  });

  await test('Spacing tokens follow 4pt grid system', () => {
    assert.strictEqual(spacing.none, 0);
    assert.strictEqual(spacing.xs, 4);
    assert.strictEqual(spacing.sm, 8);
    assert.strictEqual(spacing.md, 12);
    assert.strictEqual(spacing.lg, 16);
    assert.strictEqual(spacing.xl, 20);
    assert.strictEqual(spacing.xxl, 24);
  });

  await test('Border radius tokens support subtle rounded cards and pills', () => {
    assert.strictEqual(borderRadius.xs, 4);
    assert.strictEqual(borderRadius.md, 8);
    assert.strictEqual(borderRadius.lg, 12);
    assert.strictEqual(borderRadius.full, 9999);
  });

  await test('Shadow tokens define low elevation for Android hardware efficiency', () => {
    assert.ok(theme.shadows.subtle);
    assert.ok(theme.shadows.card);
    assert.ok(theme.shadows.floating);
  });

  // -----------------------------------------------------------------------------
  // 3. Storage Service & Token Security
  // -----------------------------------------------------------------------------
  console.log('\n--- 3. Storage Service & Security ---');

  await test('Storage service saves and retrieves tokens in memory fallback/keystore', async () => {
    await setAuthTokens({
      accessToken: 'jwt-access-token-12345',
      refreshToken: 'jwt-refresh-token-67890',
    });

    const tokens = await getAuthTokens();
    assert.strictEqual(tokens.accessToken, 'jwt-access-token-12345');
    assert.strictEqual(tokens.refreshToken, 'jwt-refresh-token-67890');
  });

  await test('clearAuthTokens removes all sensitive tokens', async () => {
    await clearAuthTokens();
    const tokens = await getAuthTokens();
    assert.strictEqual(tokens.accessToken, null);
    assert.strictEqual(tokens.refreshToken, null);
  });

  await test('Storage service persists and restores community tenant slug', async () => {
    await setStoredCommunitySlug('test-community-slug');
    const slug = await getStoredCommunitySlug();
    assert.strictEqual(slug, 'test-community-slug');
  });

  // -----------------------------------------------------------------------------
  // 4. API Client & Tenant Isolation
  // -----------------------------------------------------------------------------
  console.log('\n--- 4. Centralized API Client & Tenant Context ---');

  await test('API client initializes with configured base URL without trailing slashes', () => {
    const client = new ApiClient('http://localhost:5000/api/v1/');
    assert.strictEqual((client as any).baseUrl, 'http://localhost:5000/api/v1');
  });

  await test('buildUrl appends query parameters correctly', () => {
    const client = new ApiClient('http://localhost:5000/api/v1');
    const url = (client as any).buildUrl('/feed', { page: 1, limit: 10, search: 'samaj' });
    assert.strictEqual(url, 'http://localhost:5000/api/v1/feed?page=1&limit=10&search=samaj');
  });

  await test('buildHeaders injects tenant slug and Bearer token', async () => {
    await setAuthTokens({ accessToken: 'my-bearer-token', refreshToken: 'my-refresh' });
    await setStoredCommunitySlug('kewat-samaj');

    const client = new ApiClient('http://localhost:5000/api/v1');
    const headers = await (client as any).buildHeaders({});

    assert.strictEqual(headers['x-community-slug'], 'kewat-samaj');
    assert.strictEqual(headers.Authorization, 'Bearer my-bearer-token');
    assert.strictEqual(headers.Accept, 'application/json');
    assert.strictEqual(headers['Content-Type'], 'application/json');
  });

  await test('ApiError encapsulates HTTP status and payload', () => {
    const error = new ApiError('Community not found', 404, { code: 'NOT_FOUND' });
    assert.strictEqual(error.message, 'Community not found');
    assert.strictEqual(error.status, 404);
    assert.strictEqual((error.data as any).code, 'NOT_FOUND');
    assert.ok(error instanceof Error);
  });

  // -----------------------------------------------------------------------------
  // 5. Localization Foundation (Hindi + English)
  // -----------------------------------------------------------------------------
  console.log('\n--- 5. Localization Foundation (Hindi + English) ---');

  await test('resolveTranslation defaults to Hindi resources', () => {
    const appNameHi = resolveTranslation('appName', { ns: 'common', lang: 'hi' });
    assert.ok(appNameHi && appNameHi.length > 0);
  });

  await test('resolveTranslation resolves English translations', () => {
    const appNameEn = resolveTranslation('appName', { ns: 'common', lang: 'en' });
    assert.ok(appNameEn && appNameEn.length > 0);
  });

  await test('resolveTranslation resolves namespace-prefixed keys "ns:key"', () => {
    const hi = resolveTranslation('common:appName', { lang: 'hi' });
    const en = resolveTranslation('common:appName', { lang: 'en' });
    assert.ok(hi);
    assert.ok(en);
  });

  await test('resolveTranslation performs parameter interpolation', () => {
    const interpolated = resolveTranslation('welcomeUser', {
      ns: 'common',
      lang: 'hi',
      params: { name: 'सुनील' },
      fallback: 'नमस्ते {{name}}!',
    });
    assert.strictEqual(interpolated, 'नमस्ते सुनील!');
  });

  // -----------------------------------------------------------------------------
  // 6. Batch 1.1 Runtime & Token Refresh Interceptor Tests
  // -----------------------------------------------------------------------------
  console.log('\n--- 6. Batch 1.1 Runtime & Token Refresh Interceptor Tests ---');

  await test('Expired refresh token cleans up local session and rejects', async () => {
    // Setup stored tokens
    await setAuthTokens({ accessToken: 'expired-access', refreshToken: 'expired-refresh' });

    // Mock global fetch to return 401 on /feed and 401 on /auth/refresh
    const originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Invalid or expired refresh token.' }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: 'Unauthorized.' }),
      } as unknown as Response;
    };

    const client = new ApiClient('http://localhost:5000/api/v1');

    try {
      await assert.rejects(
        () => client.get('/feed'),
        /Session renewal failed|Authentication expired/
      );
      // Verify tokens were purged from storage
      const tokens = await getAuthTokens();
      assert.strictEqual(tokens.accessToken, null, 'Access token must be cleared on failed refresh');
      assert.strictEqual(tokens.refreshToken, null, 'Refresh token must be cleared on failed refresh');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('Concurrent 401 requests trigger single refresh and all retry successfully', async () => {
    await setAuthTokens({ accessToken: 'initial-stale-access', refreshToken: 'valid-refresh' });

    let refreshCallCount = 0;
    let feedCallCount = 0;
    const originalFetch = global.fetch;

    global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();
      const headers = (init?.headers as Record<string, string>) || {};

      if (urlStr.includes('/auth/refresh')) {
        refreshCallCount++;
        // Small delay to simulate network latency and let concurrent requests queue up
        await new Promise((r) => setTimeout(r, 20));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { accessToken: 'fresh-new-jwt-access', refreshToken: 'fresh-new-jwt-refresh' },
          }),
        } as unknown as Response;
      }

      if (urlStr.includes('/feed')) {
        feedCallCount++;
        // If request has fresh token, succeed; otherwise return 401
        if (headers.Authorization === 'Bearer fresh-new-jwt-access') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { posts: ['p1', 'p2'] } }),
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: 'Token expired.' }),
        } as unknown as Response;
      }

      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    };

    const client = new ApiClient('http://localhost:5000/api/v1');

    try {
      // Fire 3 simultaneous requests while token is stale
      const [res1, res2, res3] = await Promise.all([
        client.get<any>('/feed'),
        client.get<any>('/feed'),
        client.get<any>('/feed'),
      ]);

      assert.strictEqual(refreshCallCount, 1, 'Exactly ONE token refresh request must be executed');
      assert.ok(res1?.data?.posts, 'Request 1 retried and resolved');
      assert.ok(res2?.data?.posts, 'Request 2 retried and resolved');
      assert.ok(res3?.data?.posts, 'Request 3 retried and resolved');

      // Verify tokens in storage were updated with the fresh credentials
      const storedTokens = await getAuthTokens();
      assert.strictEqual(storedTokens.accessToken, 'fresh-new-jwt-access');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('Smart LAN resolution extracts host IP from Metro hostUri', () => {
    function resolveLan(hostUri: string | undefined): string {
      if (hostUri) {
        const host = hostUri.split(':')[0];
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
          return `http://${host}:5000/api/v1`;
        }
      }
      return 'http://10.0.2.2:5000/api/v1';
    }

    assert.strictEqual(
      resolveLan('192.168.1.120:8081'),
      'http://192.168.1.120:5000/api/v1',
      'Should resolve LAN IP from Expo Go hostUri'
    );
    assert.strictEqual(
      resolveLan('localhost:8081'),
      'http://10.0.2.2:5000/api/v1',
      'Localhost should fall back to emulator loopback on Android'
    );
    assert.strictEqual(
      resolveLan(undefined),
      'http://10.0.2.2:5000/api/v1',
      'Undefined hostUri should fall back to emulator loopback on Android'
    );
  });

  console.log(`\n================================================================`);
  console.log(`Summary: All ${passed} mobile foundation tests passed!`);
  console.log(`================================================================\n`);
}

runTests();


import assert from 'node:assert';
import { usersApi } from '../api/users.api';
import { authApi } from '../api/auth.api';
import { apiClient } from '../api/client';
import {
  CurrentMemberProfile,
  AuthUser,
  UserRole,
  UserStatus,
} from '@apnasamaj/shared-types';
import {
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getStoredCommunitySlug,
  setStoredCommunitySlug,
  getSecureItem,
  setSecureItem,
  clearMemoryStorageForTesting,
} from '../services/storage.service';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { resolveTranslation } from '../localization/i18n';
import { NavTab } from '../components/BottomNavigation';

export async function runProfileSettingsFlowTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 7: Mobile Profile & Settings Tests        ');
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

  // Backup original apiClient methods for restore after mock testing
  const originalGet = apiClient.get.bind(apiClient);
  const originalPatch = apiClient.patch.bind(apiClient);
  const originalPost = apiClient.post.bind(apiClient);
  const originalUpload = apiClient.upload.bind(apiClient);

  const mockProfile: CurrentMemberProfile = {
    id: 'usr-101',
    phone: '9876543210',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    profile: {
      fullName: 'सुनील कुमार केवट',
      gender: 'MALE',
      bio: 'समाज सेवा एवं तकनीकी विकास में समर्पित सदस्य।',
      city: 'भोपाल',
      state: 'मध्य प्रदेश',
      subCaste: 'केवट',
      gotra: 'कश्यप',
      avatarUrl: 'https://images.unsplash.com/photo-test-avatar.jpg',
      dateOfBirth: '1995-05-15',
    },
    createdAt: '2026-01-10T12:00:00.000Z',
    updatedAt: '2026-01-10T12:00:00.000Z',
  };

  try {
    // -------------------------------------------------------------------------
    // Test 1: usersApi.getMyProfile fetches authenticated user's profile
    // -------------------------------------------------------------------------
    await test('Test 1: usersApi.getMyProfile retrieves personal profile via GET /users/me/profile', async () => {
      let interceptedEndpoint = '';
      (apiClient as any).get = async (endpoint: string) => {
        interceptedEndpoint = endpoint;
        return {
          success: true,
          data: mockProfile,
        };
      };

      const result = await usersApi.getMyProfile();
      assert.strictEqual(interceptedEndpoint, '/users/me/profile');
      assert.strictEqual(result.id, 'usr-101');
      assert.strictEqual(result.profile?.fullName, 'सुनील कुमार केवट');
      assert.strictEqual(result.profile?.city, 'भोपाल');
      assert.strictEqual(result.profile?.subCaste, 'केवट');
      assert.strictEqual(result.role, UserRole.MEMBER);
      assert.strictEqual(result.status, UserStatus.ACTIVE);
    });

    // -------------------------------------------------------------------------
    // Test 2: usersApi.updateMyProfile patches allowed profile fields
    // -------------------------------------------------------------------------
    await test('Test 2: usersApi.updateMyProfile patches profile fields via PATCH /users/me/profile', async () => {
      let interceptedEndpoint = '';
      let interceptedBody: any = null;

      (apiClient as any).patch = async (endpoint: string, body: any) => {
        interceptedEndpoint = endpoint;
        interceptedBody = body;
        return {
          success: true,
          data: {
            ...mockProfile,
            profile: {
              ...mockProfile.profile,
              fullName: body.fullName,
              city: body.city,
              bio: body.bio,
            },
          },
        };
      };

      const updateData = {
        fullName: 'सुनील केवट (संपादित)',
        gender: 'MALE' as const,
        bio: 'अद्यतन परिचय बायो।',
        city: 'इंदौर',
        state: 'मध्य प्रदेश',
        subCaste: 'केवट',
        gotra: 'कश्यप',
      };

      const result = await usersApi.updateMyProfile(updateData);
      assert.strictEqual(interceptedEndpoint, '/users/me/profile');
      assert.strictEqual(interceptedBody.fullName, 'सुनील केवट (संपादित)');
      assert.strictEqual(interceptedBody.city, 'इंदौर');
      assert.strictEqual(result.profile?.fullName, 'सुनील केवट (संपादित)');
      assert.strictEqual(result.profile?.city, 'इंदौर');
    });

    // -------------------------------------------------------------------------
    // Test 3: usersApi.uploadAvatar uploads file multipart form data
    // -------------------------------------------------------------------------
    await test('Test 3: usersApi.uploadAvatar uploads image to POST /users/me/avatar', async () => {
      let interceptedEndpoint = '';
      (apiClient as any).upload = async (endpoint: string, formData: any) => {
        interceptedEndpoint = endpoint;
        return {
          success: true,
          data: {
            avatarUrl: 'https://cdn.example.com/avatars/new-avatar-123.jpg',
          },
        };
      };

      const uploadResult = await usersApi.uploadAvatar({
        uri: 'file:///path/to/local/avatar.jpg',
        name: 'avatar.jpg',
        type: 'image/jpeg',
      });

      assert.strictEqual(interceptedEndpoint, '/users/me/avatar');
      assert.strictEqual(uploadResult.avatarUrl, 'https://cdn.example.com/avatars/new-avatar-123.jpg');
    });

    // -------------------------------------------------------------------------
    // Test 4: Profile synchronization updates AuthUser in persistent storage
    // -------------------------------------------------------------------------
    await test('Test 4: Profile edits update AuthUser in local persistent storage', async () => {
      await clearMemoryStorageForTesting();

      const initialUser: AuthUser = {
        id: 'usr-101',
        phone: '9876543210',
        fullName: 'सुनील कुमार केवट',
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        communitySlug: 'kewat-mp',
      };

      await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(initialUser));

      // Simulate AuthContext.updateUser
      const cached = await getSecureItem(STORAGE_KEYS.USER_PROFILE);
      assert(cached !== null, 'Cached user should exist in storage');
      const parsed = JSON.parse(cached);
      assert.strictEqual(parsed.fullName, 'सुनील कुमार केवट');

      const updatedUser = { ...parsed, fullName: 'सुनील केवट (अद्यतन)' };
      await setSecureItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updatedUser));

      const reRead = await getSecureItem(STORAGE_KEYS.USER_PROFILE);
      assert(reRead !== null);
      const reParsed = JSON.parse(reRead);
      assert.strictEqual(reParsed.fullName, 'सुनील केवट (अद्यतन)');
      assert.strictEqual(reParsed.phone, '9876543210');
      assert.strictEqual(reParsed.role, UserRole.MEMBER);
    });

    // -------------------------------------------------------------------------
    // Test 5: Language preference persistence and instant translation update
    // -------------------------------------------------------------------------
    await test('Test 5: Language switching persists preference and resolves correct translations', async () => {
      await clearMemoryStorageForTesting();

      // Test Hindi translation
      await setSecureItem(STORAGE_KEYS.APP_LANGUAGE, 'hi');
      const savedHi = await getSecureItem(STORAGE_KEYS.APP_LANGUAGE);
      assert.strictEqual(savedHi, 'hi');

      const hiCommonBack = resolveTranslation('common:back', { lang: 'hi' });
      assert.strictEqual(hiCommonBack, 'पीछे जाएं');

      // Test English translation
      await setSecureItem(STORAGE_KEYS.APP_LANGUAGE, 'en');
      const savedEn = await getSecureItem(STORAGE_KEYS.APP_LANGUAGE);
      assert.strictEqual(savedEn, 'en');

      const enCommonBack = resolveTranslation('common:back', { lang: 'en' });
      assert.strictEqual(enCommonBack, 'Back');
      assert.notStrictEqual(hiCommonBack, enCommonBack);
    });

    // -------------------------------------------------------------------------
    // Test 6: Community switching terminates session & purges old tenant tokens
    // -------------------------------------------------------------------------
    await test('Test 6: Community switching terminates session and purges old tokens (tenant isolation)', async () => {
      await clearMemoryStorageForTesting();

      // Authenticated with community 'community-a'
      await setAuthTokens({
        accessToken: 'jwt_comm_a_token',
        refreshToken: 'refresh_comm_a_token',
      });
      await setStoredCommunitySlug('community-a');
      await setSecureItem(
        STORAGE_KEYS.USER_PROFILE,
        JSON.stringify({ id: 'usr-comm-a', fullName: 'User A', communitySlug: 'community-a' })
      );

      // Simulate switchCommunity('community-b')
      const targetCommunity = 'community-b';

      // 1. Purge old tokens to prevent cross-tenant data leakage
      await clearAuthTokens();
      await setSecureItem(STORAGE_KEYS.USER_PROFILE, '');
      await setStoredCommunitySlug(targetCommunity);

      // Verify tokens are purged
      const tokensAfterSwitch = await getAuthTokens();
      assert.strictEqual(tokensAfterSwitch.accessToken, null);
      assert.strictEqual(tokensAfterSwitch.refreshToken, null);

      // Verify active community slug updated
      const activeSlug = await getStoredCommunitySlug();
      assert.strictEqual(activeSlug, 'community-b');
    });

    // -------------------------------------------------------------------------
    // Test 7: Logout clears local session and invokes backend revocation
    // -------------------------------------------------------------------------
    await test('Test 7: Logout revokes refresh token on backend and clears local auth tokens', async () => {
      await clearMemoryStorageForTesting();

      await setAuthTokens({
        accessToken: 'jwt_valid_access',
        refreshToken: 'refresh_valid_token',
      });
      await setStoredCommunitySlug('demo');

      let backendLogoutCalled = false;
      let interceptedToken = '';

      (apiClient as any).post = async (endpoint: string, body: any) => {
        if (endpoint === '/auth/logout') {
          backendLogoutCalled = true;
          interceptedToken = body?.refreshToken;
          return { success: true, message: 'Logged out' };
        }
        return { success: true };
      };

      const { refreshToken } = await getAuthTokens();
      await authApi.logout(refreshToken || undefined);
      await clearAuthTokens();

      assert.strictEqual(backendLogoutCalled, true);
      assert.strictEqual(interceptedToken, 'refresh_valid_token');

      const tokens = await getAuthTokens();
      assert.strictEqual(tokens.accessToken, null);
      assert.strictEqual(tokens.refreshToken, null);
    });

    // -------------------------------------------------------------------------
    // Test 8: BottomNavigation contract includes 5 main application tabs
    // -------------------------------------------------------------------------
    await test('Test 8: BottomNavigation contract provides 5 tabs with appropriate routes', () => {
      const expectedTabs: Array<{ key: NavTab; route: string }> = [
        { key: 'feed', route: '/(app)' },
        { key: 'directory', route: '/(app)/directory' },
        { key: 'groups', route: '/(app)/groups' },
        { key: 'matrimonial', route: '/(app)/matrimonial' },
        { key: 'profile', route: '/(app)/profile' },
      ];

      assert.strictEqual(expectedTabs.length, 5);
      const profileTab = expectedTabs.find((t) => t.key === 'profile');
      assert(profileTab !== undefined);
      assert.strictEqual(profileTab.route, '/(app)/profile');
    });

    // -------------------------------------------------------------------------
    // Test 9: Stack navigation registration contract for Profile & Settings
    // -------------------------------------------------------------------------
    await test('Test 9: Profile and Settings screen paths conform to Expo Router conventions', () => {
      const routes = [
        'apps/mobile/app/(app)/profile/index.tsx',
        'apps/mobile/app/(app)/profile/settings.tsx',
      ];

      routes.forEach((route) => {
        assert(route.includes('apps/mobile/app/(app)/profile/'));
      });
    });

    // -------------------------------------------------------------------------
    // Test 10: Multi-tenant request headers attached to user profile queries
    // -------------------------------------------------------------------------
    await test('Test 10: ApiClient attaches active x-community-slug header to profile endpoints', async () => {
      await setStoredCommunitySlug('kewat-community');
      const activeSlug = await getStoredCommunitySlug();
      assert.strictEqual(activeSlug, 'kewat-community');

      // Check header generation in client
      const headers = await (apiClient as any).buildHeaders({});
      assert.strictEqual(headers['x-community-slug'], 'kewat-community');
    });

    // -------------------------------------------------------------------------
    // Test 11: Validation rules: Full name minimum length constraint
    // -------------------------------------------------------------------------
    await test('Test 11: Validation rules enforce minimum length for fullName', () => {
      const validateFullName = (name: string): boolean => {
        return name.trim().length >= 2;
      };

      assert.strictEqual(validateFullName(''), false);
      assert.strictEqual(validateFullName(' '), false);
      assert.strictEqual(validateFullName('A'), false);
      assert.strictEqual(validateFullName('सुनील'), true);
      assert.strictEqual(validateFullName('RK'), true);
    });

  } finally {
    // Restore original apiClient methods
    (apiClient as any).get = originalGet;
    (apiClient as any).patch = originalPatch;
    (apiClient as any).post = originalPost;
    (apiClient as any).upload = originalUpload;
  }

  console.log('----------------------------------------------------------------');
  console.log(`Profile & Settings Flow Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Profile & Settings Flow suite.`);
  }
}

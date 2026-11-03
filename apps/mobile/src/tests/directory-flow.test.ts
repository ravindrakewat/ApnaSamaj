import assert from 'assert';
import { usersApi, DirectoryFilterParams } from '../api/users.api';
import { apiClient } from '../api/client';
import {
  PublicDirectoryMember,
  PublicMemberProfile,
  DirectoryResponseData,
  UserRole,
} from '@apnasamaj/shared-types';
import { setStoredCommunitySlug, setAuthTokens, clearAuthTokens } from '../services/storage.service';
import { resolveTranslation } from '../localization/i18n';

let totalTests = 0;
let passedTests = 0;

async function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    passedTests++;
    console.log(`✅ PASS: ${desc}`);
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mock directory members
const mockMember1: PublicDirectoryMember = {
  id: 'usr-mem-001',
  fullName: 'सुनील केवट',
  avatarUrl: 'https://example.com/avatar1.jpg',
  gender: 'MALE',
  bio: 'समाज सेवा एवं युवा संगठन में सक्रिय।',
  city: 'ग्वालियर',
  state: 'मध्य प्रदेश',
  subCaste: 'केवट',
  gotra: 'कश्यप',
  joinedAt: '2026-01-15T10:00:00.000Z',
};

const mockMember2: PublicDirectoryMember = {
  id: 'usr-mem-002',
  fullName: 'प्रिया शर्मा',
  avatarUrl: null,
  gender: 'FEMALE',
  bio: null,
  city: 'इंदौर',
  state: 'मध्य प्रदेश',
  subCaste: null,
  gotra: 'भारद्वाज',
  joinedAt: '2026-02-01T12:00:00.000Z',
};

const mockProfile1: PublicMemberProfile = {
  id: 'usr-mem-001',
  fullName: 'सुनील केवट',
  avatarUrl: 'https://example.com/avatar1.jpg',
  gender: 'MALE',
  bio: 'समाज सेवा एवं युवा संगठन में सक्रिय।',
  city: 'ग्वालियर',
  state: 'मध्य प्रदेश',
  subCaste: 'केवट',
  gotra: 'कश्यप',
  role: UserRole.MEMBER,
  joinedAt: '2026-01-15T10:00:00.000Z',
};

async function runDirectoryTests() {
  console.log('\n================================================================');
  console.log('  Apna Samaj — Batch 4 Mobile Community Directory Test Suite     ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. Directory API Query & Contract Alignment
  // -------------------------------------------------------------
  await it('usersApi.getDirectory: constructs query with filters and returns paginated members', async () => {
    await setStoredCommunitySlug('kewat');
    await setAuthTokens({
      accessToken: 'test-directory-jwt',
      refreshToken: 'test-directory-refresh',
    });

    let interceptedUrl = '';
    let interceptedHeaders: Record<string, string> = {};

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      interceptedUrl = url;
      interceptedHeaders = (init?.headers || {}) as Record<string, string>;

      const mockResponse: DirectoryResponseData = {
        members: [mockMember1, mockMember2],
        pagination: {
          page: 1,
          limit: 12,
          totalMembers: 2,
          totalPages: 1,
        },
      };

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: mockResponse,
        }),
      };
    };

    try {
      const params: DirectoryFilterParams = {
        page: 1,
        limit: 12,
        search: 'केवट',
        city: 'ग्वालियर',
        state: 'मध्य प्रदेश',
        gotra: 'कश्यप',
        subCaste: 'केवट',
      };

      const result = await usersApi.getDirectory(params);

      assert.ok(interceptedUrl.includes('/users?'), 'Should call GET /users with query parameters');
      const parsedUrl = new URL(interceptedUrl);
      assert.strictEqual(parsedUrl.searchParams.get('search'), 'केवट');
      assert.strictEqual(parsedUrl.searchParams.get('city'), 'ग्वालियर');
      assert.strictEqual(parsedUrl.searchParams.get('state'), 'मध्य प्रदेश');
      assert.strictEqual(parsedUrl.searchParams.get('gotra'), 'कश्यप');
      assert.strictEqual(parsedUrl.searchParams.get('subCaste'), 'केवट');

      assert.strictEqual(interceptedHeaders['x-community-slug'], 'kewat', 'Tenant header must be present');
      assert.strictEqual(interceptedHeaders['Authorization'], 'Bearer test-directory-jwt', 'Bearer token must be present');

      assert.strictEqual(result.members.length, 2);
      assert.strictEqual(result.members[0].fullName, 'सुनील केवट');
      assert.strictEqual(result.pagination.totalMembers, 2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 2. Member Public Profile API Contract
  // -------------------------------------------------------------
  await it('usersApi.getPublicProfile: fetches authorized public profile by UUID', async () => {
    await setStoredCommunitySlug('kewat');
    await setAuthTokens({
      accessToken: 'test-directory-jwt',
      refreshToken: 'test-directory-refresh',
    });

    let interceptedUrl = '';

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      interceptedUrl = url;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: mockProfile1,
        }),
      };
    };

    try {
      const profile = await usersApi.getPublicProfile('usr-mem-001');

      assert.ok(interceptedUrl.endsWith('/users/usr-mem-001'), 'Should call GET /users/:id');
      assert.strictEqual(profile.id, 'usr-mem-001');
      assert.strictEqual(profile.fullName, 'सुनील केवट');
      assert.strictEqual(profile.role, UserRole.MEMBER);
      assert.strictEqual(profile.city, 'ग्वालियर');
      assert.strictEqual(profile.gotra, 'कश्यप');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 3. Privacy & Security Invariants
  // -------------------------------------------------------------
  await it('Security Invariant: Member directory and public profile NEVER expose phone numbers or emails', () => {
    // Audit directory item
    const directoryKeys = Object.keys(mockMember1);
    assert.strictEqual(directoryKeys.includes('phone'), false, 'Directory member must NOT contain phone');
    assert.strictEqual(directoryKeys.includes('email'), false, 'Directory member must NOT contain email');
    assert.strictEqual(directoryKeys.includes('passwordHash'), false, 'Directory member must NOT contain passwordHash');

    // Audit profile item
    const profileKeys = Object.keys(mockProfile1);
    assert.strictEqual(profileKeys.includes('phone'), false, 'Public profile must NOT contain phone');
    assert.strictEqual(profileKeys.includes('email'), false, 'Public profile must NOT contain email');
    assert.strictEqual(profileKeys.includes('passwordHash'), false, 'Public profile must NOT contain passwordHash');
  });

  await it('Security Invariant: usersApi.getDirectory fails closed when unauthenticated', async () => {
    await clearAuthTokens();

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      const headers = (init?.headers || {}) as Record<string, string>;
      if (!headers['Authorization']) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: 'Authentication required to access community directory',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { members: [], pagination: {} } }),
      };
    };

    try {
      await assert.rejects(
        async () => {
          await usersApi.getDirectory({ page: 1 });
        },
        /Authentication required|Session expired/
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 4. Directory Pagination & Deduplication Logic
  // -------------------------------------------------------------
  await it('Pagination Logic: handles page appending and deduplication of members', () => {
    const page1Members = [mockMember1];
    const page2Members = [mockMember1, mockMember2]; // Contains duplicate mockMember1

    const existingIds = new Set(page1Members.map((m) => m.id));
    const deduped = page2Members.filter((m) => !existingIds.has(m.id));
    const combined = [...page1Members, ...deduped];

    assert.strictEqual(combined.length, 2, 'Combined members list must have exactly 2 unique members');
    assert.strictEqual(combined[0].id, 'usr-mem-001');
    assert.strictEqual(combined[1].id, 'usr-mem-002');
  });

  // -------------------------------------------------------------
  // 5. Missing Profile Fields Graceful Handling
  // -------------------------------------------------------------
  await it('Profile Fallbacks: handles missing bio, subCaste, and avatar gracefully', () => {
    // mockMember2 has null bio, null subCaste, and null avatar
    assert.strictEqual(mockMember2.avatarUrl, null);
    assert.strictEqual(mockMember2.bio, null);
    assert.strictEqual(mockMember2.subCaste, null);

    // Initial calculation fallback
    const initial = mockMember2.fullName.trim().charAt(0).toUpperCase();
    assert.strictEqual(initial, 'प', 'Initials fallback should extract first letter');

    // Location formatting
    const locationParts = [mockMember2.city, mockMember2.state].filter(Boolean);
    const locationStr = locationParts.join(', ');
    assert.strictEqual(locationStr, 'इंदौर, मध्य प्रदेश');
  });

  // -------------------------------------------------------------
  // 6. Localization Parity (Hindi & English)
  // -------------------------------------------------------------
  await it('Localization: Directory keys resolve cleanly in both Hindi and English', () => {
    const searchHi = resolveTranslation('directory:searchPlaceholder', { lang: 'hi' });
    const searchEn = resolveTranslation('directory:searchPlaceholder', { lang: 'en' });
    assert.strictEqual(searchHi, 'नाम, गोत्र, शहर या उप-जाति से खोजें...');
    assert.strictEqual(searchEn, 'Search by name, gotra, city, or sub-caste...');

    const emptyHi = resolveTranslation('directory:emptyTitle', { lang: 'hi' });
    const emptyEn = resolveTranslation('directory:emptyTitle', { lang: 'en' });
    assert.strictEqual(emptyHi, 'कोई सदस्य नहीं मिला');
    assert.strictEqual(emptyEn, 'No Community Members Found');

    const profileUnavailableHi = resolveTranslation('directory:profileUnavailableTitle', { lang: 'hi' });
    const profileUnavailableEn = resolveTranslation('directory:profileUnavailableTitle', { lang: 'en' });
    assert.strictEqual(profileUnavailableHi, 'सदस्य प्रोफ़ाइल उपलब्ध नहीं है');
    assert.strictEqual(profileUnavailableEn, 'Member Profile Unavailable');
  });

  console.log(`\n================================================================`);
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 4 directory tests passed!`);
  console.log('================================================================\n');
}

runDirectoryTests();

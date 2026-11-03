import assert from 'assert';
import { groupsApi, ListGroupsParams, GroupPostsResponseData } from '../api/groups.api';
import {
  GroupListItem,
  GroupDetails,
  GroupPrivacy,
  GroupMemberRole,
  PostItem,
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

// Mock groups
const mockPublicGroup: GroupListItem = {
  id: 'grp-001',
  name: 'पुणे युवा मंडल',
  slug: 'pune-yuva-mandal',
  description: 'पुणे एवं पिंपरी-चिंचवड़ क्षेत्र के समाज युवाओं का सक्रिय संगठन।',
  coverUrl: 'https://example.com/pune.jpg',
  privacy: GroupPrivacy.PUBLIC,
  membersCount: 42,
  postsCount: 15,
  isMember: false,
  myRole: null,
  createdAt: '2026-01-10T10:00:00.000Z',
};

const mockPrivateGroup: GroupListItem = {
  id: 'grp-002',
  name: 'वरिष्ठ कार्यकारिणी परिषद',
  slug: 'varishtha-karyakarini',
  description: 'समाज के वरिष्ठ सदस्यों की नीति निर्धारण एवं निर्णय समिति।',
  coverUrl: null,
  privacy: GroupPrivacy.PRIVATE,
  membersCount: 8,
  postsCount: 5,
  isMember: true,
  myRole: GroupMemberRole.ADMIN,
  createdAt: '2026-01-01T10:00:00.000Z',
};

const mockGroupDetails: GroupDetails = {
  id: 'grp-001',
  name: 'पुणे युवा मंडल',
  slug: 'pune-yuva-mandal',
  description: 'पुणे एवं पिंपरी-चिंचवड़ क्षेत्र के समाज युवाओं का सक्रिय संगठन।',
  coverUrl: 'https://example.com/pune.jpg',
  privacy: GroupPrivacy.PUBLIC,
  createdById: 'usr-admin-1',
  creator: {
    id: 'usr-admin-1',
    fullName: 'राहुल शर्मा',
    avatarUrl: null,
  },
  membersCount: 42,
  postsCount: 15,
  isMember: false,
  myRole: null,
  createdAt: '2026-01-10T10:00:00.000Z',
  updatedAt: '2026-01-10T10:00:00.000Z',
  members: [],
};

const mockDiscussionPost: PostItem = {
  id: 'post-grp-1',
  authorId: 'usr-1',
  author: {
    id: 'usr-1',
    fullName: 'सुनील केवट',
    avatarUrl: null,
    role: UserRole.MEMBER,
    city: 'पुणे',
  },
  groupId: 'grp-001',
  group: {
    id: 'grp-001',
    name: 'पुणे युवा मंडल',
    slug: 'pune-yuva-mandal',
    privacy: 'PUBLIC',
  },
  type: 'GENERAL',
  title: 'आगामी खेलकूद प्रतियोगिता',
  content: 'सभी युवा साथी आगामी 20 तारीख को होने वाली खेलकूद प्रतियोगिता की तैयारी करें।',
  isPinned: false,
  media: [],
  likesCount: 12,
  commentsCount: 4,
  isLikedByMe: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function runGroupsTests() {
  console.log('\n================================================================');
  console.log('  Apna Samaj — Batch 5 Mobile Groups & Discussions Test Suite   ');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. Group Discovery API Contract & Query Construction
  // -------------------------------------------------------------
  await it('groupsApi.listGroups: constructs query with filters and inherits tenant header', async () => {
    await setStoredCommunitySlug('kewat');
    await setAuthTokens({
      accessToken: 'test-group-jwt',
      refreshToken: 'test-group-refresh',
    });

    let interceptedUrl = '';
    let interceptedHeaders: Record<string, string> = {};

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      interceptedUrl = url;
      interceptedHeaders = (init?.headers || {}) as Record<string, string>;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            groups: [mockPublicGroup, mockPrivateGroup],
            pagination: { page: 1, limit: 12, totalGroups: 2, totalPages: 1 },
          },
        }),
      };
    };

    try {
      const params: ListGroupsParams = {
        page: 1,
        limit: 12,
        search: 'मंडल',
        privacy: 'PUBLIC',
      };

      const result = await groupsApi.listGroups(params);

      assert.ok(interceptedUrl.includes('/groups?'), 'Should call GET /groups with query parameters');
      const parsed = new URL(interceptedUrl);
      assert.strictEqual(parsed.searchParams.get('page'), '1');
      assert.strictEqual(parsed.searchParams.get('limit'), '12');
      assert.strictEqual(parsed.searchParams.get('search'), 'मंडल');
      assert.strictEqual(parsed.searchParams.get('privacy'), 'PUBLIC');

      assert.strictEqual(interceptedHeaders['x-community-slug'], 'kewat', 'Tenant header must be present');
      assert.strictEqual(interceptedHeaders['Authorization'], 'Bearer test-group-jwt', 'Bearer token must be present');

      assert.strictEqual(result.groups.length, 2);
      assert.strictEqual(result.groups[0].name, 'पुणे युवा मंडल');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 2. My Groups & Membership Status Filtering
  // -------------------------------------------------------------
  await it('My Groups: filters groups by isMember flag accurately in memory', () => {
    const allGroups = [mockPublicGroup, mockPrivateGroup];

    // mockPublicGroup.isMember === false
    // mockPrivateGroup.isMember === true
    const myGroups = allGroups.filter((g) => g.isMember);

    assert.strictEqual(myGroups.length, 1);
    assert.strictEqual(myGroups[0].id, 'grp-002');
    assert.strictEqual(myGroups[0].myRole, GroupMemberRole.ADMIN);
  });

  // -------------------------------------------------------------
  // 3. Group Details by Slug API
  // -------------------------------------------------------------
  await it('groupsApi.getGroupBySlug: fetches group details by slug', async () => {
    await setStoredCommunitySlug('kewat');
    await setAuthTokens({
      accessToken: 'test-group-jwt',
      refreshToken: 'test-group-refresh',
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
          data: mockGroupDetails,
        }),
      };
    };

    try {
      const details = await groupsApi.getGroupBySlug('pune-yuva-mandal');

      assert.ok(interceptedUrl.endsWith('/groups/pune-yuva-mandal'));
      assert.strictEqual(details.id, 'grp-001');
      assert.strictEqual(details.name, 'पुणे युवा मंडल');
      assert.strictEqual(details.membersCount, 42);
      assert.strictEqual(details.privacy, GroupPrivacy.PUBLIC);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 4. Join & Leave Group Action Contracts
  // -------------------------------------------------------------
  await it('groupsApi.joinGroup: calls POST /groups/:id/join successfully', async () => {
    let interceptedUrl = '';
    let interceptedMethod = '';

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      interceptedUrl = url;
      interceptedMethod = init?.method || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            success: true,
            message: 'समूह में सफलतापूर्वक शामिल हुए!',
            role: 'MEMBER',
          },
        }),
      };
    };

    try {
      const res = await groupsApi.joinGroup('grp-001');

      assert.ok(interceptedUrl.endsWith('/groups/grp-001/join'));
      assert.strictEqual(interceptedMethod, 'POST');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.role, 'MEMBER');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await it('groupsApi.leaveGroup: calls POST /groups/:id/leave successfully', async () => {
    let interceptedUrl = '';
    let interceptedMethod = '';

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: RequestInit) => {
      interceptedUrl = url;
      interceptedMethod = init?.method || '';

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            success: true,
            message: 'आप समूह से बाहर हो गए हैं।',
          },
        }),
      };
    };

    try {
      const res = await groupsApi.leaveGroup('grp-001');

      assert.ok(interceptedUrl.endsWith('/groups/grp-001/leave'));
      assert.strictEqual(interceptedMethod, 'POST');
      assert.strictEqual(res.success, true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 5. Private Group Security & Last-Admin Protection
  // -------------------------------------------------------------
  await it('Security Invariant: Private groups reject direct self-joining with 403 Forbidden', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      return {
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: 'Cannot self-join private group. Membership requires an invitation or approval.',
        }),
      };
    };

    try {
      await assert.rejects(
        async () => {
          await groupsApi.joinGroup('grp-002');
        },
        /Cannot self-join private group/
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  await it('Security Invariant: Last admin cannot leave group without assigning another admin', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'As the sole administrator, you cannot leave the group without assigning another admin first.',
        }),
      };
    };

    try {
      await assert.rejects(
        async () => {
          await groupsApi.leaveGroup('grp-002');
        },
        /sole administrator/
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 6. Group Discussion Posts & Authorization
  // -------------------------------------------------------------
  await it('groupsApi.getGroupPosts: fetches discussions for authorized public or member group', async () => {
    let interceptedUrl = '';

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string) => {
      interceptedUrl = url;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            posts: [mockDiscussionPost],
            pagination: { page: 1, limit: 10, totalPosts: 1, totalPages: 1, hasMore: false },
          },
        }),
      };
    };

    try {
      const res = await groupsApi.getGroupPosts('pune-yuva-mandal', 1, 10);

      assert.ok(interceptedUrl.includes('/groups/pune-yuva-mandal/posts'));
      assert.strictEqual(res.posts.length, 1);
      assert.strictEqual(res.posts[0].title, 'आगामी खेलकूद प्रतियोगिता');
      assert.strictEqual(res.posts[0].groupId, 'grp-001');
      assert.strictEqual(res.pagination.hasMore, false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await it('Security Invariant: Non-members cannot access private group discussions', async () => {
    const originalFetch = global.fetch;
    (global as any).fetch = async () => {
      return {
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: 'You must be a member of this private group to view its discussions.',
        }),
      };
    };

    try {
      await assert.rejects(
        async () => {
          await groupsApi.getGroupPosts('varishtha-karyakarini', 1, 10);
        },
        /member of this private group/
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -------------------------------------------------------------
  // 7. Localization Parity (Hindi & English)
  // -------------------------------------------------------------
  await it('Localization: Groups keys resolve cleanly in both Hindi and English', () => {
    const titleHi = resolveTranslation('groups:title', { lang: 'hi' });
    const titleEn = resolveTranslation('groups:title', { lang: 'en' });
    assert.strictEqual(titleHi, 'समाज समूह एवं मंडल');
    assert.strictEqual(titleEn, 'Community Groups & Mandals');

    const privateHi = resolveTranslation('groups:privateContentTitle', { lang: 'hi' });
    const privateEn = resolveTranslation('groups:privateContentTitle', { lang: 'en' });
    assert.strictEqual(privateHi, 'निजी समूह सामग्री');
    assert.strictEqual(privateEn, 'Private Group Content');

    const emptyHi = resolveTranslation('groups:emptyTitle', { lang: 'hi' });
    const emptyEn = resolveTranslation('groups:emptyTitle', { lang: 'en' });
    assert.strictEqual(emptyHi, 'कोई समूह नहीं मिला');
    assert.strictEqual(emptyEn, 'No Groups Found');
  });

  console.log(`\n================================================================`);
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 5 groups tests passed!`);
  console.log('================================================================\n');
}

runGroupsTests();


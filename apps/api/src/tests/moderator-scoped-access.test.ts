import assert from 'node:assert';
import { UserRole, PostType } from '@apnasamaj/shared-types';
import {
  reviewReportSchema,
  moderationQueueQuerySchema,
} from '@apnasamaj/validation';
import {
  listModerationReports,
  reviewModerationReport,
  actionDeletePostFromReport,
} from '../modules/admin/moderation/admin.moderation.service';
import {
  loginHandler,
  refreshHandler,
} from '../modules/auth/auth.controller';
import { authorizeAdminCommunitySwitch } from '../middleware/tenant.middleware';
import { requireRoles } from '../middleware/authorize';
import * as argon2 from 'argon2';
import { tenantDbManager } from '@apnasamaj/database';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14J: Moderator Scoped Access Tests       ');
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

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    cookies: {} as Record<string, any>,
    clearedCookies: [] as string[],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    cookie(name: string, value: any, options: any) {
      this.cookies[name] = { value, options };
      return this;
    },
    clearCookie(name: string) {
      this.clearedCookies.push(name);
      return this;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Mock Prisma Client for Auth and Moderation Tests
// ---------------------------------------------------------------------------

function createMockStoreDb() {
  const store = {
    users: [] as any[],
    refreshTokens: [] as any[],
    auditLogs: [] as any[],
    posts: [] as any[],
  };

  const client: any = {
    _store: store,
    user: {
      findUnique: async ({ where }: any) => {
        if (where.phone) {
          return store.users.find((u) => u.phone === where.phone) || null;
        }
        if (where.id) {
          return store.users.find((u) => u.id === where.id) || null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const u = store.users.find((user) => user.id === where.id);
        if (!u) throw new Error('User not found in mock store');
        Object.assign(u, data);
        return u;
      },
    },
    refreshToken: {
      create: async ({ data }: any) => {
        const record = { id: `rf-${Date.now()}-${Math.random()}`, isRevoked: false, ...data };
        store.refreshTokens.push(record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        const record = store.refreshTokens.find((r) => r.tokenHash === where.tokenHash);
        if (!record) return null;
        const u = store.users.find((user) => user.id === record.userId);
        return { ...record, user: u };
      },
      update: async ({ where, data }: any) => {
        const record = store.refreshTokens.find((r) => r.id === where.id);
        if (!record) throw new Error('Refresh token not found');
        Object.assign(record, data);
        return record;
      },
      updateMany: async ({ where, data }: any) => {
        const matches = store.refreshTokens.filter((r) => r.familyId === where.familyId);
        matches.forEach((r) => Object.assign(r, data));
        return { count: matches.length };
      },
    },
    auditLog: {
      findMany: async ({ where, orderBy }: any = {}) => {
        let results = [...store.auditLogs];
        if (where?.action) results = results.filter((l) => l.action === where.action);
        if (where?.targetType) results = results.filter((l) => l.targetType === where.targetType);
        if (where?.targetId?.in) {
          const ids = new Set(where.targetId.in);
          results = results.filter((l) => ids.has(l.targetId));
        }
        if (where?.targetId && typeof where.targetId === 'string') {
          results = results.filter((l) => l.targetId === where.targetId);
        }
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return results.map((l) => {
          const u = store.users.find((user) => user.id === l.actorId);
          return {
            ...l,
            actor: u || {
              id: l.actorId,
              phone: '9876543210',
              role: 'MODERATOR',
              profile: { fullName: 'Moderator Actor' },
            },
          };
        });
      },
      findUnique: async ({ where }: any) => {
        return store.auditLogs.find((l) => l.id === where.id) || null;
      },
      findFirst: async ({ where }: any) => {
        let results = [...store.auditLogs];
        if (where?.action) results = results.filter((l) => l.action === where.action);
        if (where?.targetType) results = results.filter((l) => l.targetType === where.targetType);
        if (where?.targetId) results = results.filter((l) => l.targetId === where.targetId);
        return results[0] || null;
      },
      create: async ({ data }: any) => {
        const entry = {
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...data,
          createdAt: new Date(),
        };
        store.auditLogs.push(entry);
        return entry;
      },
    },
    post: {
      findMany: async ({ where }: any = {}) => {
        let results = [...store.posts];
        if (where?.id?.in) {
          const ids = new Set(where.id.in);
          results = results.filter((p) => ids.has(p.id));
        }
        return results.map((p) => {
          const author = store.users.find((u) => u.id === p.authorId);
          return {
            ...p,
            author: author || { id: p.authorId, profile: { fullName: 'Post Author', avatarUrl: null } },
            group: p.group || null,
          };
        });
      },
      findUnique: async ({ where }: any) => {
        const p = store.posts.find((post) => post.id === where.id);
        if (!p) return null;
        return {
          ...p,
          media: p.media || [],
        };
      },
      delete: async ({ where }: any) => {
        const idx = store.posts.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('Post not found to delete');
        const [deleted] = store.posts.splice(idx, 1);
        return deleted;
      },
    },
    $transaction: async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        return arg(client);
      }
      return arg;
    },
  };

  return client;
}

// Ensure Kewat is registered in tenantDbManager
if (!tenantDbManager.hasCommunity('kewat')) {
  tenantDbManager.registerCommunity({
    slug: 'kewat',
    name: 'Kewat Samaj',
    databaseUrl: 'postgresql://postgres:test@localhost:5432/kewat_test',
  });
}

async function runTests() {
  console.log('--- 1. MODERATOR Authentication to Admin Console ---');

  const authDb = createMockStoreDb();
  const testPassword = 'Password@123!';
  const passwordHash = await argon2.hash(testPassword);

  // Seed users
  authDb._store.users.push(
    {
      id: 'mod-1',
      phone: '+919811111111',
      passwordHash,
      role: 'MODERATOR',
      status: 'ACTIVE',
      isPhoneVerified: true,
      profile: { fullName: 'Kewat Moderator' },
    },
    {
      id: 'admin-1',
      phone: '+919822222222',
      passwordHash,
      role: 'COMMUNITY_ADMIN',
      status: 'ACTIVE',
      isPhoneVerified: true,
      profile: { fullName: 'Kewat Community Admin' },
    },
    {
      id: 'super-1',
      phone: '+919833333333',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      isPhoneVerified: true,
      profile: { fullName: 'Super Administrator' },
    },
    {
      id: 'member-1',
      phone: '+919844444444',
      passwordHash,
      role: 'MEMBER',
      status: 'ACTIVE',
      isPhoneVerified: true,
      profile: { fullName: 'Regular Member' },
    },
    {
      id: 'mod-suspended',
      phone: '+919855555555',
      passwordHash,
      role: 'MODERATOR',
      status: 'SUSPENDED',
      isPhoneVerified: true,
      profile: { fullName: 'Suspended Moderator' },
    }
  );

  // Test 1.1: MODERATOR authentication on Central Admin succeeds
  const modLoginReq: any = {
    body: { phone: '+919811111111', password: testPassword },
    headers: { host: 'admin.samaz.in', 'x-community-slug': 'kewat' },
    isCentralAdmin: true,
    db: authDb,
    tenant: undefined,
  };
  const modLoginRes = createMockResponse();

  await loginHandler(modLoginReq, modLoginRes);
  assertTest(modLoginRes.statusCode === 200, 'MODERATOR authentication succeeds with HTTP 200');
  assertTest(modLoginRes.body?.data?.user?.role === UserRole.MODERATOR, 'User role is MODERATOR');
  assertTest(Boolean(modLoginRes.body?.data?.accessToken), 'Access token issued to MODERATOR');

  // Test 1.2: COMMUNITY_ADMIN authentication on Central Admin succeeds
  const commAdminReq: any = {
    body: { phone: '+919822222222', password: testPassword },
    headers: { host: 'admin.samaz.in', 'x-community-slug': 'kewat' },
    isCentralAdmin: true,
    db: authDb,
    tenant: undefined,
  };
  const commAdminRes = createMockResponse();

  await loginHandler(commAdminReq, commAdminRes);
  assertTest(commAdminRes.statusCode === 200, 'COMMUNITY_ADMIN authentication succeeds with HTTP 200');
  assertTest(commAdminRes.body?.data?.user?.role === UserRole.COMMUNITY_ADMIN, 'User role is COMMUNITY_ADMIN');

  // Test 1.3: SUPER_ADMIN authentication on Central Admin succeeds
  const superAdminReq: any = {
    body: { phone: '+919833333333', password: testPassword },
    headers: { host: 'admin.samaz.in' },
    isCentralAdmin: true,
    db: authDb,
    tenant: undefined,
  };
  const superAdminRes = createMockResponse();

  await loginHandler(superAdminReq, superAdminRes);
  assertTest(superAdminRes.statusCode === 200, 'SUPER_ADMIN authentication succeeds with HTTP 200');
  assertTest(superAdminRes.body?.data?.user?.role === UserRole.SUPER_ADMIN, 'User role is SUPER_ADMIN');

  // Test 1.4: MEMBER authentication on Central Admin is REJECTED with HTTP 403
  const memberAdminReq: any = {
    body: { phone: '+919844444444', password: testPassword },
    headers: { host: 'admin.samaz.in' },
    isCentralAdmin: true,
    db: authDb,
    tenant: undefined,
  };
  const memberAdminRes = createMockResponse();

  await loginHandler(memberAdminReq, memberAdminRes);
  assertTest(memberAdminRes.statusCode === 403, 'MEMBER authentication to admin console rejected with HTTP 403');
  assertTest(
    memberAdminRes.body?.error?.includes('Access to central admin console requires SUPER_ADMIN role'),
    'Preserves security requirement error for unprivileged member'
  );

  // Test 1.5: Suspended MODERATOR is blocked with HTTP 403
  const suspendedModReq: any = {
    body: { phone: '+919855555555', password: testPassword },
    headers: { host: 'admin.samaz.in', 'x-community-slug': 'kewat' },
    isCentralAdmin: true,
    db: authDb,
    tenant: undefined,
  };
  const suspendedModRes = createMockResponse();

  await loginHandler(suspendedModReq, suspendedModRes);
  assertTest(suspendedModRes.statusCode === 403, 'Suspended MODERATOR account rejected with HTTP 403');

  // Test 1.6: Refresh token rotation for MODERATOR
  const modRefreshToken = modLoginRes.cookies?.refreshToken?.value;
  assertTest(Boolean(modRefreshToken), 'HttpOnly refresh token cookie set for MODERATOR');

  const refreshReq: any = {
    body: { refreshToken: modRefreshToken },
    headers: { host: 'admin.samaz.in', 'x-community-slug': 'kewat' },
    isCentralAdmin: true,
    db: authDb,
    tenant: undefined,
  };
  const refreshRes = createMockResponse();

  await refreshHandler(refreshReq, refreshRes);
  assertTest(refreshRes.statusCode === 200, 'Session refresh for MODERATOR succeeds with HTTP 200');
  assertTest(refreshRes.body?.data?.user?.role === UserRole.MODERATOR, 'Refreshed user role is MODERATOR');

  console.log('\n--- 2. Tenant Isolation & Middleware Authorization Boundaries ---');

  // Test 2.1: MODERATOR bound to assigned community "kewat"
  let nextCalled = false;
  const modAuthReq: any = {
    user: { id: 'mod-1', phone: '+919811111111', role: UserRole.MODERATOR, communitySlug: 'kewat' },
    headers: { 'x-community-slug': 'kewat' },
  };
  const modAuthRes = createMockResponse();

  authorizeAdminCommunitySwitch(modAuthReq, modAuthRes, () => {
    nextCalled = true;
  });
  assertTest(nextCalled, 'MODERATOR with matching community slug passes authorizeAdminCommunitySwitch');
  assertTest(modAuthReq.tenant?.slug === 'kewat', 'Tenant slug is bound to "kewat"');

  // Test 2.2: Cross-Tenant manipulation: MODERATOR attempting to switch to "gupta" is FORBIDDEN (403)
  let crossNextCalled = false;
  const crossModReq: any = {
    user: { id: 'mod-1', phone: '+919811111111', role: UserRole.MODERATOR, communitySlug: 'kewat' },
    headers: { 'x-community-slug': 'gupta' },
  };
  const crossModRes = createMockResponse();

  authorizeAdminCommunitySwitch(crossModReq, crossModRes, () => {
    crossNextCalled = true;
  });
  assertTest(!crossNextCalled, 'Cross-tenant switch by MODERATOR does not proceed');
  assertTest(crossModRes.statusCode === 403, 'Cross-tenant switch by MODERATOR returns HTTP 403 Forbidden');
  assertTest(crossModRes.body?.error?.includes('Community Moderator is restricted to their assigned community'), 'Clear boundary restriction message');

  console.log('\n--- 3. Deleted Post Reports & Review Workflow Finality ---');

  const modDb = createMockStoreDb();

  // Seed sample reported posts and reports
  const post1 = {
    id: 'post-live-1',
    content: 'Live reported post text',
    type: 'GENERAL',
    authorId: 'author-1',
    createdAt: new Date(),
    media: [],
  };
  const postDeleted = {
    id: 'post-deleted-already',
    content: 'This post is already deleted',
    type: 'GENERAL',
    authorId: 'author-2',
    createdAt: new Date(),
    media: [],
  };

  modDb._store.posts.push(post1); // postDeleted is NOT in posts (it is deleted)

  const report1 = {
    id: 'rep-live-1',
    action: 'POST_REPORT',
    targetType: 'Post',
    targetId: 'post-live-1',
    actorId: 'reporter-1',
    details: { reason: 'SPAM', details: 'Spam link posted' },
    createdAt: new Date(Date.now() - 3600000),
  };

  const reportDeleted = {
    id: 'rep-deleted-1',
    action: 'POST_REPORT',
    targetType: 'Post',
    targetId: 'post-deleted-already',
    actorId: 'reporter-2',
    details: { reason: 'HARASSMENT', details: 'Harassment occurred here' },
    createdAt: new Date(Date.now() - 7200000),
  };

  modDb._store.auditLogs.push(report1, reportDeleted);

  // Test 3.1: Deleted post report is displayed with placeholder and ACTIONED status if unreviewed
  const initialQueue = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, modDb);
  const deletedItem = initialQueue.reports.find((r) => r.id === 'rep-deleted-1');
  assertTest(Boolean(deletedItem), 'Report for deleted post is retrieved');
  assertTest(deletedItem?.post?.isDeleted === true, 'Deleted post is marked with isDeleted: true');
  assertTest(deletedItem?.post?.content === '[Content removed or unavailable]', 'Missing post content uses safe placeholder');
  assertTest(deletedItem?.status === 'ACTIONED', 'Unreviewed report for deleted post derives status as ACTIONED');

  // Test 3.2: Moderator records ACTIONED review decision for deleted post report
  const reviewResult = await reviewModerationReport(
    'rep-deleted-1',
    'mod-1',
    UserRole.MODERATOR,
    { decision: 'ACTIONED', notes: 'Confirmed post was removed' },
    '127.0.0.1',
    'TestAgent',
    modDb
  );
  assertTest(reviewResult.status === 'ACTIONED', 'Historical ACTIONED review decision recorded successfully');
  assertTest(reviewResult.review.notes === 'Confirmed post was removed', 'Review notes persisted correctly');

  // Test 3.3: Actioned report CANNOT be dismissed (Contradiction Prevention)
  let contradictionThrown = false;
  try {
    await reviewModerationReport(
      'rep-deleted-1',
      'mod-1',
      UserRole.MODERATOR,
      { decision: 'DISMISSED', notes: 'Attempting to contradict action' },
      '127.0.0.1',
      'TestAgent',
      modDb
    );
  } catch (err: any) {
    contradictionThrown = true;
    assertTest(err.statusCode === 400, 'Contradicting actioned report returns HTTP 400 Bad Request');
    assertTest(
      err.message?.includes('Cannot dismiss a report that has already been actioned'),
      'Error message prevents contradiction of moderation action'
    );
  }
  assertTest(contradictionThrown, 'Attempting to dismiss already-actioned report strictly blocked');

  // Test 3.4: Re-evaluating live post report: Moderator dismisses live report
  const dismissResult = await reviewModerationReport(
    'rep-live-1',
    'mod-1',
    UserRole.MODERATOR,
    { decision: 'DISMISSED', notes: 'Content complies with guidelines' },
    '127.0.0.1',
    'TestAgent',
    modDb
  );
  assertTest(dismissResult.status === 'DISMISSED', 'Live report reviewed and dismissed');

  const afterDismissQueue = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, modDb);
  const liveItem = afterDismissQueue.reports.find((r) => r.id === 'rep-live-1');
  assertTest(liveItem?.status === 'DISMISSED', 'Queue reflects DISMISSED status for live post report');

  // Test 3.5: Dismissed report can subsequently be ACTIONED (Re-evaluation takedown)
  const takedownResult = await actionDeletePostFromReport(
    'rep-live-1',
    'mod-1',
    UserRole.MODERATOR,
    'Re-evaluated upon second report: removed',
    '127.0.0.1',
    'TestAgent',
    modDb
  );
  assertTest(takedownResult.status === 'ACTIONED', 'Dismissed report upgraded to ACTIONED upon takedown');
  assertTest(modDb._store.posts.find((p: any) => p.id === 'post-live-1') === undefined, 'Post was deleted from database');

  // Test 3.6: Once taken down, rep-live-1 CANNOT be downgraded back to DISMISSED
  let secondContradiction = false;
  try {
    await reviewModerationReport(
      'rep-live-1',
      'mod-1',
      UserRole.MODERATOR,
      { decision: 'DISMISSED', notes: 'Trying to dismiss after takedown' },
      '127.0.0.1',
      'TestAgent',
      modDb
    );
  } catch (err: any) {
    secondContradiction = true;
    assertTest(err.statusCode === 400, 'Contradiction after takedown returns HTTP 400');
  }
  assertTest(secondContradiction, 'Cannot downgrade report to DISMISSED once post was taken down');

  // Test 3.7: Queue derived status remains ACTIONED
  const finalQueue = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, modDb);
  const finalLiveItem = finalQueue.reports.find((r) => r.id === 'rep-live-1');
  assertTest(finalLiveItem?.status === 'ACTIONED', 'Derived status consistently remains ACTIONED in queue');

  console.log('\n--- 4. Backend Gateway RBAC Enforcement Across Admin Routes ---');

  const adminGuard = requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN);
  const modGuard = requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR);

  const modReq: any = { user: { id: 'mod-1', role: UserRole.MODERATOR } };
  const adminReq: any = { user: { id: 'admin-1', role: UserRole.COMMUNITY_ADMIN } };
  const superReq: any = { user: { id: 'super-1', role: UserRole.SUPER_ADMIN } };
  const memberReq: any = { user: { id: 'mem-1', role: UserRole.MEMBER } };

  // Test 4.1: MODERATOR is denied access to /moderators (admin user role update route)
  let modNextAdmin = false;
  const modResAdmin = createMockResponse();
  adminGuard(modReq, modResAdmin, () => { modNextAdmin = true; });
  assertTest(!modNextAdmin, 'MODERATOR blocked by adminGuard from /moderators');
  assertTest(modResAdmin.statusCode === 403, 'Returns HTTP 403 Forbidden for MODERATOR on adminGuard');

  // Test 4.2: MODERATOR is granted access to /moderation
  let modNextMod = false;
  const modResMod = createMockResponse();
  modGuard(modReq, modResMod, () => { modNextMod = true; });
  assertTest(modNextMod, 'MODERATOR granted access by modGuard to /moderation');

  // Test 4.3: COMMUNITY_ADMIN has access to both adminGuard and modGuard
  let commNextAdmin = false;
  let commNextMod = false;
  adminGuard(adminReq, createMockResponse(), () => { commNextAdmin = true; });
  modGuard(adminReq, createMockResponse(), () => { commNextMod = true; });
  assertTest(commNextAdmin, 'COMMUNITY_ADMIN has access to adminGuard (/moderators, /members, /audit-logs)');
  assertTest(commNextMod, 'COMMUNITY_ADMIN has access to modGuard (/moderation)');

  // Test 4.4: SUPER_ADMIN has access to all admin routes
  let superNextAdmin = false;
  let superNextMod = false;
  adminGuard(superReq, createMockResponse(), () => { superNextAdmin = true; });
  modGuard(superReq, createMockResponse(), () => { superNextMod = true; });
  assertTest(superNextAdmin, 'SUPER_ADMIN has access to adminGuard');
  assertTest(superNextMod, 'SUPER_ADMIN has access to modGuard');

  // Test 4.5: MEMBER is denied from all administrative and moderation routes
  let memberNextAdmin = false;
  let memberNextMod = false;
  const memRes1 = createMockResponse();
  const memRes2 = createMockResponse();
  adminGuard(memberReq, memRes1, () => { memberNextAdmin = true; });
  modGuard(memberReq, memRes2, () => { memberNextMod = true; });
  assertTest(!memberNextAdmin && memRes1.statusCode === 403, 'MEMBER denied from adminGuard with HTTP 403');
  assertTest(!memberNextMod && memRes2.statusCode === 403, 'MEMBER denied from modGuard with HTTP 403');

  console.log('================================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

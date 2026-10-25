import assert from 'node:assert';
import { PrismaClient, tenantDbManager, Role as DbRole, UserStatus as DbUserStatus } from '@apnasamaj/database';
import { UserRole, AuthUser, UserStatus } from '@apnasamaj/shared-types';
import { authorizeAdminCommunitySwitch } from '../middleware/tenant.middleware';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { getAdminMetrics } from '../modules/admin/metrics/admin.metrics.service';
import { getMetricsHandler } from '../modules/admin/metrics/admin.metrics.controller';
import {
  listAdminUsers,
  getAdminUserDetails,
  updateAdminUserStatus,
  AdminServiceError,
} from '../modules/admin/users/admin.users.service';
import {
  getUsersHandler,
  getUserDetailsHandler,
  updateUserStatusHandler,
} from '../modules/admin/users/admin.users.controller';
import {
  listAdminMatrimonialProfiles,
  getAdminMatrimonialProfileDetails,
  moderateMatrimonialProfile,
  moderateMatrimonialPhoto,
} from '../modules/admin/matrimonial/admin.matrimonial.service';
import {
  listProfilesHandler,
  getProfileDetailsHandler,
  moderateProfileHandler,
  moderatePhotoHandler,
} from '../modules/admin/matrimonial/admin.matrimonial.controller';
import { listAuditLogs } from '../modules/admin/audit-logs/admin.audit-logs.service';
import { listAuditLogsHandler } from '../modules/admin/audit-logs/admin.audit-logs.controller';
import {
  MatrimonialNotFoundError,
  MatrimonialServiceError,
} from '../modules/matrimonial/matrimonial.service';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15C.6 Admin Services Tenant Isolation     ');
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

// -------------------------------------------------------------
// Isolated In-Memory Mock Prisma Client Factory for Admin Tests
// -------------------------------------------------------------
interface MockAdminDataStore {
  users: any[];
  posts: any[];
  matrimonialProfiles: any[];
  matrimonialPhotos: any[];
  auditLogs: any[];
  notifications: any[];
  refreshTokens: any[];
}

function createMockAdminPrismaClient(slug: string, initialData: MockAdminDataStore) {
  const queryLog: string[] = [];
  const users = initialData.users.map((u) => ({
    ...u,
    isPhoneVerified: u.isPhoneVerified ?? true,
    createdAt: u.createdAt || new Date('2026-01-01'),
    updatedAt: u.updatedAt || new Date('2026-01-01'),
    profile: u.profile
      ? {
          id: `prof-${u.id}`,
          ...u.profile,
          createdAt: u.profile.createdAt || new Date('2026-01-01'),
          updatedAt: u.profile.updatedAt || new Date('2026-01-01'),
        }
      : null,
    posts: u.posts ? [...u.posts] : [],
    groupsCreated: u.groupsCreated ? [...u.groupsCreated] : [],
    matrimonialProfile: u.matrimonialProfile ? { ...u.matrimonialProfile } : null,
  }));
  const posts = initialData.posts.map((p) => ({ ...p }));
  const matrimonialProfiles = initialData.matrimonialProfiles.map((m) => ({
    ...m,
    photos: m.photos ? m.photos.map((ph: any) => ({ ...ph })) : [],
    partnerPreference: m.partnerPreference ? { ...m.partnerPreference } : null,
  }));
  const matrimonialPhotos = initialData.matrimonialPhotos.map((ph) => ({ ...ph }));
  const auditLogs = initialData.auditLogs.map((a) => ({ ...a }));
  const notifications = initialData.notifications.map((n) => ({ ...n }));
  const refreshTokens = initialData.refreshTokens.map((r) => ({ ...r }));

  const client: any = {
    slug,
    queryLog,
    resetLog: () => {
      queryLog.length = 0;
    },

    user: {
      count: async ({ where }: any = {}) => {
        queryLog.push(`user.count(${slug})`);
        return users.filter((u) => {
          if (where?.status && u.status !== where.status) return false;
          if (where?.role && u.role !== where.role) return false;
          return true;
        }).length;
      },
      findMany: async ({ where, skip = 0, take = 10, select }: any = {}) => {
        queryLog.push(`user.findMany(${slug})`);
        const filtered = users.filter((u) => {
          if (where?.status && u.status !== where.status) return false;
          if (where?.role && u.role !== where.role) return false;
          if (where?.OR) {
            const matches = where.OR.some((clause: any) => {
              if (clause.phone?.contains && u.phone.includes(clause.phone.contains)) return true;
              if (clause.profile?.fullName?.contains && u.profile?.fullName?.toLowerCase().includes(clause.profile.fullName.contains.toLowerCase())) return true;
              return false;
            });
            if (!matches) return false;
          }
          return true;
        });
        return filtered.slice(skip, skip + take).map((u) => ({
          ...u,
          _count: {
            posts: u.posts?.length || 0,
            groupMemberships: 0,
          },
        }));
      },
      findUnique: async ({ where }: any = {}) => {
        queryLog.push(`user.findUnique(${slug}, id=${where.id})`);
        const found = users.find((u) => u.id === where.id);
        if (!found) return null;
        return {
          ...found,
          _count: {
            posts: found.posts?.length || 0,
            groupMemberships: 0,
            comments: 0,
            postLikes: 0,
          },
        };
      },
      update: async ({ where, data }: any = {}) => {
        queryLog.push(`user.update(${slug}, id=${where.id})`);
        const found = users.find((u) => u.id === where.id);
        if (!found) throw new Error(`User not found: ${where.id}`);
        if (data.status) found.status = data.status;
        return found;
      },
    },

    post: {
      count: async () => {
        queryLog.push(`post.count(${slug})`);
        return posts.length;
      },
    },

    matrimonialProfile: {
      count: async ({ where }: any = {}) => {
        queryLog.push(`matrimonialProfile.count(${slug})`);
        return matrimonialProfiles.filter((m) => {
          if (where?.status && m.status !== where.status) return false;
          return true;
        }).length;
      },
      findMany: async ({ where, skip = 0, take = 10 }: any = {}) => {
        queryLog.push(`matrimonialProfile.findMany(${slug})`);
        const filtered = matrimonialProfiles.filter((m) => {
          if (where?.status && m.status !== where.status) return false;
          return true;
        });
        return filtered.slice(skip, skip + take).map((m) => {
          const user = users.find((u) => u.id === m.userId);
          return {
            ...m,
            user: user
              ? {
                  id: user.id,
                  phone: user.phone,
                  status: user.status,
                  profile: user.profile,
                }
              : null,
            photos: matrimonialPhotos.filter((p) => p.profileId === m.id),
          };
        });
      },
      findUnique: async ({ where }: any = {}) => {
        queryLog.push(`matrimonialProfile.findUnique(${slug}, id=${where.id})`);
        const m = matrimonialProfiles.find((item) => item.id === where.id);
        if (!m) return null;
        const user = users.find((u) => u.id === m.userId);
        const approver = m.approvedById ? users.find((u) => u.id === m.approvedById) : null;
        return {
          ...m,
          user: user
            ? {
                id: user.id,
                phone: user.phone,
                status: user.status,
                profile: user.profile,
              }
            : null,
          photos: matrimonialPhotos.filter((p) => p.profileId === m.id),
          partnerPreference: m.partnerPreference || null,
          approvedBy: approver
            ? {
                id: approver.id,
                profile: approver.profile,
              }
            : null,
        };
      },
      update: async ({ where, data }: any = {}) => {
        queryLog.push(`matrimonialProfile.update(${slug}, id=${where.id})`);
        const found = matrimonialProfiles.find((m) => m.id === where.id);
        if (!found) throw new Error(`Matrimonial profile not found: ${where.id}`);
        Object.assign(found, data);
        return found;
      },
    },

    matrimonialPhoto: {
      findUnique: async ({ where }: any = {}) => {
        queryLog.push(`matrimonialPhoto.findUnique(${slug}, id=${where.id})`);
        return matrimonialPhotos.find((p) => p.id === where.id) || null;
      },
      update: async ({ where, data }: any = {}) => {
        queryLog.push(`matrimonialPhoto.update(${slug}, id=${where.id})`);
        const found = matrimonialPhotos.find((p) => p.id === where.id);
        if (!found) throw new Error(`Matrimonial photo not found: ${where.id}`);
        Object.assign(found, data);
        return found;
      },
    },

    auditLog: {
      count: async () => {
        queryLog.push(`auditLog.count(${slug})`);
        return auditLogs.length;
      },
      findMany: async ({ skip = 0, take = 20 }: any = {}) => {
        queryLog.push(`auditLog.findMany(${slug})`);
        return auditLogs.slice(skip, skip + take).map((a) => {
          const actor = users.find((u) => u.id === a.actorId);
          return {
            ...a,
            actor: actor
              ? {
                  id: actor.id,
                  phone: actor.phone,
                  role: actor.role,
                  profile: actor.profile,
                }
              : {
                  id: a.actorId,
                  phone: '+910000000000',
                  role: 'ADMIN',
                  profile: null,
                },
          };
        });
      },
      create: async ({ data }: any = {}) => {
        queryLog.push(`auditLog.create(${slug}, action=${data.action})`);
        const entry = {
          id: `audit-${slug}-${Date.now()}-${Math.random()}`,
          createdAt: new Date(),
          ...data,
        };
        auditLogs.push(entry);
        return entry;
      },
    },

    refreshToken: {
      updateMany: async ({ where, data }: any = {}) => {
        queryLog.push(`refreshToken.updateMany(${slug})`);
        let count = 0;
        for (const token of refreshTokens) {
          if (where?.userId && token.userId !== where.userId) continue;
          if (where?.isRevoked !== undefined && token.isRevoked !== where.isRevoked) continue;
          Object.assign(token, data);
          count++;
        }
        return { count };
      },
    },

    notification: {
      create: async ({ data }: any = {}) => {
        queryLog.push(`notification.create(${slug}, type=${data.type})`);
        const item = {
          id: `notif-${slug}-${Date.now()}-${Math.random()}`,
          createdAt: new Date(),
          isRead: false,
          ...data,
        };
        notifications.push(item);
        return item;
      },
    },

    $transaction: async (cb: any) => {
      queryLog.push(`$transaction.begin(${slug})`);
      const result = await cb(client);
      queryLog.push(`$transaction.commit(${slug})`);
      return result;
    },

    getAuditLogs: () => auditLogs,
    getNotifications: () => notifications,
    getUsers: () => users,
    getMatrimonialProfiles: () => matrimonialProfiles,
  };

  return client;
}

// -------------------------------------------------------------
// Test Fixtures
// -------------------------------------------------------------
const kewatInitialData: MockAdminDataStore = {
  users: [
    {
      id: 'kewat-admin-1',
      phone: '+919876543210',
      role: 'COMMUNITY_ADMIN',
      status: 'ACTIVE',
      profile: { fullName: 'Kewat Community Admin', city: 'Varanasi', state: 'UP' },
      posts: [],
      groupsCreated: [],
    },
    {
      id: 'kewat-user-1',
      phone: '+919876543211',
      role: 'MEMBER',
      status: 'ACTIVE',
      profile: { fullName: 'Ramesh Kewat', city: 'Prayagraj', state: 'UP' },
      posts: [{ id: 'p1' }, { id: 'p2' }],
      groupsCreated: [],
    },
    {
      id: 'kewat-user-2',
      phone: '+919876543212',
      role: 'MEMBER',
      status: 'PENDING',
      profile: { fullName: 'Suresh Kewat', city: 'Lucknow', state: 'UP' },
      posts: [],
      groupsCreated: [],
    },
  ],
  posts: [{ id: 'post-k1' }, { id: 'post-k2' }, { id: 'post-k3' }],
  matrimonialProfiles: [
    {
      id: 'mat-kewat-1',
      userId: 'kewat-user-1',
      status: 'PENDING_APPROVAL',
      maritalStatus: 'NEVER_MARRIED',
      heightCm: 175,
      weightKg: 68,
      motherTongue: 'Hindi',
      religion: 'Hindu',
      caste: 'Kewat',
      subCaste: 'Mallaha',
      gotra: 'Kashyap',
      manglik: 'NO',
      birthTime: '10:30 AM',
      birthCity: 'Varanasi',
      rashi: 'Mesh',
      nakshatra: 'Ashwini',
      highestEducation: 'B.Tech',
      educationDetails: 'Computer Science',
      employedIn: 'PRIVATE_SECTOR',
      occupation: 'Software Engineer',
      companyName: 'Tech Corp',
      annualIncome: '12-15 LPA',
      workCity: 'Bengaluru',
      workState: 'Karnataka',
      workCountry: 'India',
      familyType: 'NUCLEAR',
      familyValues: 'MODERATE',
      fatherName: 'Ram Kewat',
      fatherOccupation: 'Business',
      motherName: 'Sita Kewat',
      motherOccupation: 'Homemaker',
      brothersCount: 1,
      brothersMarried: 0,
      sistersCount: 0,
      sistersMarried: 0,
      familyNativePlace: 'Varanasi',
      aboutFamily: 'Loving nuclear family',
      diet: 'VEGETARIAN',
      smoking: 'NEVER',
      drinking: 'NEVER',
      aboutMe: 'Software professional seeking a kind and educated partner.',
      partnerExpectations: 'Educated and family oriented.',
      approvedAt: null,
      approvedById: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      photos: [],
      partnerPreference: null,
    },
  ],
  matrimonialPhotos: [
    {
      id: 'photo-kewat-1',
      profileId: 'mat-kewat-1',
      url: 'https://example.com/photo1.jpg',
      order: 1,
      isPrimary: true,
      isApproved: false,
      createdAt: new Date('2026-01-01'),
    },
  ],
  auditLogs: [
    {
      id: 'audit-k1',
      actorId: 'kewat-admin-1',
      action: 'INITIAL_SETUP',
      targetType: 'SYSTEM',
      targetId: 'sys-kewat',
      details: { note: 'Kewat admin initialized' },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      createdAt: new Date('2026-01-01'),
    },
  ],
  notifications: [],
  refreshTokens: [
    {
      id: 'token-k1',
      userId: 'kewat-user-2',
      isRevoked: false,
    },
  ],
};

const guptaInitialData: MockAdminDataStore = {
  users: [
    {
      id: 'gupta-admin-1',
      phone: '+919811122233',
      role: 'COMMUNITY_ADMIN',
      status: 'ACTIVE',
      profile: { fullName: 'Gupta Community Admin', city: 'Kanpur', state: 'UP' },
      posts: [],
      groupsCreated: [],
    },
    {
      id: 'gupta-user-1',
      phone: '+919811122234',
      role: 'MEMBER',
      status: 'ACTIVE',
      profile: { fullName: 'Amit Gupta', city: 'Agra', state: 'UP' },
      posts: [{ id: 'p3' }],
      groupsCreated: [],
    },
  ],
  posts: [{ id: 'post-g1' }],
  matrimonialProfiles: [
    {
      id: 'mat-gupta-1',
      userId: 'gupta-user-1',
      status: 'PENDING_APPROVAL',
      maritalStatus: 'NEVER_MARRIED',
      heightCm: 180,
      weightKg: 75,
      motherTongue: 'Hindi',
      religion: 'Hindu',
      caste: 'Gupta',
      subCaste: 'Baniya',
      gotra: 'Garg',
      manglik: 'NO',
      birthTime: '02:15 PM',
      birthCity: 'Agra',
      rashi: 'Vrishabh',
      nakshatra: 'Rohini',
      highestEducation: 'MBA',
      educationDetails: 'Finance',
      employedIn: 'BUSINESS',
      occupation: 'Retail Business Owner',
      companyName: 'Gupta Traders',
      annualIncome: '20-25 LPA',
      workCity: 'Agra',
      workState: 'UP',
      workCountry: 'India',
      familyType: 'JOINT',
      familyValues: 'TRADITIONAL',
      fatherName: 'Shri Gupta',
      fatherOccupation: 'Merchant',
      motherName: 'Shanti Gupta',
      motherOccupation: 'Homemaker',
      brothersCount: 2,
      brothersMarried: 1,
      sistersCount: 1,
      sistersMarried: 1,
      familyNativePlace: 'Agra',
      aboutFamily: 'Traditional business family',
      diet: 'VEGETARIAN',
      smoking: 'NEVER',
      drinking: 'NEVER',
      aboutMe: 'Businessman with traditional values.',
      partnerExpectations: 'Homely and cultured partner.',
      approvedAt: null,
      approvedById: null,
      createdAt: new Date('2026-01-02'),
      updatedAt: new Date('2026-01-02'),
      photos: [],
      partnerPreference: null,
    },
  ],
  matrimonialPhotos: [
    {
      id: 'photo-gupta-1',
      profileId: 'mat-gupta-1',
      url: 'https://example.com/photo-gupta.jpg',
      order: 1,
      isPrimary: true,
      isApproved: false,
      createdAt: new Date('2026-01-02'),
    },
  ],
  auditLogs: [
    {
      id: 'audit-g1',
      actorId: 'gupta-admin-1',
      action: 'INITIAL_SETUP',
      targetType: 'SYSTEM',
      targetId: 'sys-gupta',
      details: { note: 'Gupta admin initialized' },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      createdAt: new Date('2026-01-02'),
    },
  ],
  notifications: [],
  refreshTokens: [],
};

// Instantiate mock clients
const mockKewatClient = createMockAdminPrismaClient('kewat', kewatInitialData);
const mockGuptaClient = createMockAdminPrismaClient('gupta', guptaInitialData);

// Register into tenantDbManager
tenantDbManager.setClient('kewat', mockKewatClient as unknown as PrismaClient, 'Kewat Samaj');
tenantDbManager.setClient('gupta', mockGuptaClient as unknown as PrismaClient, 'Gupta Samaj');

// Mock response creator for Express controllers
function createMockResponse() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
}

// -------------------------------------------------------------
// Test Suite Execution
// -------------------------------------------------------------
async function runTests() {
  console.log('\n--- 1. Admin Authorization & Community Switching Middleware ---');

  // Test 1.1: COMMUNITY_ADMIN is bound to their assigned community
  {
    const req: any = {
      user: {
        id: 'kewat-admin-1',
        role: UserRole.COMMUNITY_ADMIN,
        communitySlug: 'kewat',
      },
      headers: {},
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(Boolean(nextCalled), 'COMMUNITY_ADMIN without switch header succeeds and invokes next()');
    assertTest(req.tenant?.slug === 'kewat', 'COMMUNITY_ADMIN is strictly bound to assigned community "kewat"');
    assertTest(req.db === mockKewatClient, 'COMMUNITY_ADMIN req.db is bound to mockKewatClient');
  }

  // Test 1.2: COMMUNITY_ADMIN passing matching X-Community-Slug succeeds
  {
    const req: any = {
      user: {
        id: 'kewat-admin-1',
        role: UserRole.COMMUNITY_ADMIN,
        communitySlug: 'kewat',
      },
      headers: { 'x-community-slug': 'kewat' },
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(Boolean(nextCalled), 'COMMUNITY_ADMIN passing matching X-Community-Slug succeeds');
    assertTest(req.tenant?.slug === 'kewat', 'Tenant slug remains assigned community "kewat"');
  }

  // Test 1.3: COMMUNITY_ADMIN attempting cross-community switch is strictly rejected with 403 Forbidden
  {
    const req: any = {
      user: {
        id: 'kewat-admin-1',
        role: UserRole.COMMUNITY_ADMIN,
        communitySlug: 'kewat',
      },
      headers: { 'x-community-slug': 'gupta' },
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(!nextCalled, 'Cross-community switch attempt does NOT call next()');
    assertTest(res.statusCode === 403, 'Cross-community switch attempt returns HTTP 403 Forbidden');
    assertTest(
      res.body?.error?.includes('Community Admin is restricted to their assigned community'),
      'Error message clearly communicates community admin boundary restriction'
    );
  }

  // Test 1.4: SUPER_ADMIN without X-Community-Slug retains central database context
  {
    const req: any = {
      user: {
        id: 'super-admin-1',
        role: UserRole.SUPER_ADMIN,
      },
      headers: {},
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(Boolean(nextCalled), 'SUPER_ADMIN without header proceeds to next()');
    assertTest(req.tenant === undefined, 'SUPER_ADMIN has undefined tenant context (central control plane)');
  }

  // Test 1.5: SUPER_ADMIN community switching to kewat
  {
    const req: any = {
      user: {
        id: 'super-admin-1',
        role: UserRole.SUPER_ADMIN,
      },
      headers: { 'x-community-slug': 'kewat' },
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(Boolean(nextCalled), 'SUPER_ADMIN with valid X-Community-Slug proceeds to next()');
    assertTest(req.tenant?.slug === 'kewat', 'SUPER_ADMIN is switched to "kewat" tenant');
    assertTest(req.db === mockKewatClient, 'SUPER_ADMIN req.db is switched to mockKewatClient');
  }

  // Test 1.6: SUPER_ADMIN community switching to gupta
  {
    const req: any = {
      user: {
        id: 'super-admin-1',
        role: UserRole.SUPER_ADMIN,
      },
      headers: { 'x-community-slug': 'gupta' },
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(Boolean(nextCalled), 'SUPER_ADMIN switching to gupta proceeds to next()');
    assertTest(req.tenant?.slug === 'gupta', 'SUPER_ADMIN is switched to "gupta" tenant');
    assertTest(req.db === mockGuptaClient, 'SUPER_ADMIN req.db is switched to mockGuptaClient');
  }

  // Test 1.7: SUPER_ADMIN switching to unknown community returns 404 Not Found
  {
    const req: any = {
      user: {
        id: 'super-admin-1',
        role: UserRole.SUPER_ADMIN,
      },
      headers: { 'x-community-slug': 'non_existent_community' },
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(!nextCalled, 'Unknown community switch does not call next()');
    assertTest(res.statusCode === 404, 'Unknown community switch returns HTTP 404');
    assertTest(res.body?.error.includes('Unknown community tenant'), 'Error states unknown community');
  }

  // Test 1.8: Unauthorized role (MEMBER) is rejected with 403
  {
    const req: any = {
      user: {
        id: 'member-1',
        role: UserRole.MEMBER,
      },
      headers: {},
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(!nextCalled, 'MEMBER does not proceed');
    assertTest(res.statusCode === 403, 'MEMBER receives HTTP 403');
  }

  // Test 1.9: Unauthenticated request is rejected with 401
  {
    const req: any = {
      user: undefined,
      headers: {},
    };
    const res = createMockResponse();
    let nextCalled: boolean = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });

    assertTest(!nextCalled, 'Unauthenticated request does not proceed');
    assertTest(res.statusCode === 401, 'Unauthenticated request receives HTTP 401');
  }

  console.log('\n--- 2. Fail-Closed Behavior on Admin Endpoints ---');

  // Test 2.1: getUsersHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      query: { page: '1', limit: '10' },
    };
    const res = createMockResponse();
    await getUsersHandler(req, res);

    assertTest(res.statusCode === 400, 'getUsersHandler returns 400 when tenant context is missing');
    assertTest(
      res.body?.error === 'Community context required for user administration. Please specify X-Community-Slug header.',
      'getUsersHandler fail-closed error message matches contract'
    );
  }

  // Test 2.2: getUserDetailsHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      params: { id: 'kewat-user-1' },
    };
    const res = createMockResponse();
    await getUserDetailsHandler(req, res);

    assertTest(res.statusCode === 400, 'getUserDetailsHandler returns 400 when tenant context is missing');
  }

  // Test 2.3: updateUserStatusHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      params: { id: 'kewat-user-1' },
      body: { status: 'SUSPENDED', reason: 'Violation of policy' },
      user: { id: 'admin-1', role: UserRole.SUPER_ADMIN },
    };
    const res = createMockResponse();
    await updateUserStatusHandler(req, res);

    assertTest(res.statusCode === 400, 'updateUserStatusHandler returns 400 when tenant context is missing');
  }

  // Test 2.4: listProfilesHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      query: {},
    };
    const res = createMockResponse();
    await listProfilesHandler(req, res);

    assertTest(res.statusCode === 400, 'listProfilesHandler returns 400 when tenant context is missing');
    assertTest(
      res.body?.error === 'Community context required for matrimonial administration. Please specify X-Community-Slug header.',
      'listProfilesHandler fail-closed error message matches contract'
    );
  }

  // Test 2.5: getProfileDetailsHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      params: { id: 'mat-kewat-1' },
    };
    const res = createMockResponse();
    await getProfileDetailsHandler(req, res);

    assertTest(res.statusCode === 400, 'getProfileDetailsHandler returns 400 when tenant context is missing');
  }

  // Test 2.6: moderateProfileHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      params: { id: 'mat-kewat-1' },
      body: { status: 'APPROVED' },
      user: { id: 'admin-1', role: UserRole.SUPER_ADMIN },
    };
    const res = createMockResponse();
    await moderateProfileHandler(req, res);

    assertTest(res.statusCode === 400, 'moderateProfileHandler returns 400 when tenant context is missing');
  }

  // Test 2.7: moderatePhotoHandler fails closed when tenant context is missing
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      params: { id: 'photo-kewat-1' },
      body: { isApproved: true },
      user: { id: 'admin-1', role: UserRole.SUPER_ADMIN },
    };
    const res = createMockResponse();
    await moderatePhotoHandler(req, res);

    assertTest(res.statusCode === 400, 'moderatePhotoHandler returns 400 when tenant context is missing');
  }

  // Test 2.8: getMetricsHandler fails closed for COMMUNITY_ADMIN without resolved context
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      user: { id: 'kewat-admin-1', role: UserRole.COMMUNITY_ADMIN },
    };
    const res = createMockResponse();
    await getMetricsHandler(req, res);

    assertTest(res.statusCode === 400, 'getMetricsHandler returns 400 for COMMUNITY_ADMIN without tenant context');
    assertTest(
      res.body?.error === 'Community context required for community administrative metrics.',
      'COMMUNITY_ADMIN metrics error message matches contract'
    );
  }

  // Test 2.9: listAuditLogsHandler fails closed for COMMUNITY_ADMIN without resolved context
  {
    const req: any = {
      tenant: undefined,
      db: undefined,
      user: { id: 'kewat-admin-1', role: UserRole.COMMUNITY_ADMIN },
      query: {},
    };
    const res = createMockResponse();
    await listAuditLogsHandler(req, res);

    assertTest(res.statusCode === 400, 'listAuditLogsHandler returns 400 for COMMUNITY_ADMIN without tenant context');
  }

  // Test 2.10: listAdminUsers service fails closed when db is missing
  {
    let threw = false;
    try {
      await listAdminUsers({ page: 1, limit: 10 });
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof AdminServiceError, 'listAdminUsers throws AdminServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'listAdminUsers missing db error code is 400');
    }
    assertTest(threw, 'listAdminUsers without db client strictly rejected (No silent fallback)');
  }

  // Test 2.11: getAdminUserDetails service fails closed when db is missing
  {
    let threw = false;
    try {
      await getAdminUserDetails('kewat-user-1');
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof AdminServiceError, 'getAdminUserDetails throws AdminServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'getAdminUserDetails missing db error code is 400');
    }
    assertTest(threw, 'getAdminUserDetails without db client strictly rejected (No silent fallback)');
  }

  // Test 2.12: updateAdminUserStatus service fails closed when db is missing
  {
    let threw = false;
    try {
      const actor: AuthUser = {
        id: 'kewat-admin-1',
        phone: '+919876543210',
        fullName: 'Kewat Community Admin',
        role: UserRole.COMMUNITY_ADMIN,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        communitySlug: 'kewat',
      };
      await updateAdminUserStatus('kewat-user-2', 'ACTIVE', actor);
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof AdminServiceError, 'updateAdminUserStatus throws AdminServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'updateAdminUserStatus missing db error code is 400');
    }
    assertTest(threw, 'updateAdminUserStatus without db client strictly rejected (No silent fallback)');
  }

  // Test 2.13: listAdminMatrimonialProfiles service fails closed when db is missing
  {
    let threw = false;
    try {
      await listAdminMatrimonialProfiles({ status: 'PENDING_APPROVAL', page: 1, limit: 10 });
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof MatrimonialServiceError, 'listAdminMatrimonialProfiles throws MatrimonialServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'listAdminMatrimonialProfiles missing db error code is 400');
    }
    assertTest(threw, 'listAdminMatrimonialProfiles without db client strictly rejected (No silent fallback)');
  }

  // Test 2.14: getAdminMatrimonialProfileDetails service fails closed when db is missing
  {
    let threw = false;
    try {
      await getAdminMatrimonialProfileDetails('mat-kewat-1');
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof MatrimonialServiceError, 'getAdminMatrimonialProfileDetails throws MatrimonialServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'getAdminMatrimonialProfileDetails missing db error code is 400');
    }
    assertTest(threw, 'getAdminMatrimonialProfileDetails without db client strictly rejected (No silent fallback)');
  }

  // Test 2.15: moderateMatrimonialProfile service fails closed when db is missing
  {
    let threw = false;
    try {
      const actor: AuthUser = {
        id: 'kewat-admin-1',
        phone: '+919876543210',
        fullName: 'Kewat Community Admin',
        role: UserRole.COMMUNITY_ADMIN,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        communitySlug: 'kewat',
      };
      await moderateMatrimonialProfile('mat-kewat-1', actor, { status: 'APPROVED' });
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof MatrimonialServiceError, 'moderateMatrimonialProfile throws MatrimonialServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'moderateMatrimonialProfile missing db error code is 400');
    }
    assertTest(threw, 'moderateMatrimonialProfile without db client strictly rejected (No silent fallback)');
  }

  // Test 2.16: moderateMatrimonialPhoto service fails closed when db is missing
  {
    let threw = false;
    try {
      const actor: AuthUser = {
        id: 'kewat-admin-1',
        phone: '+919876543210',
        fullName: 'Kewat Community Admin',
        role: UserRole.COMMUNITY_ADMIN,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        communitySlug: 'kewat',
      };
      await moderateMatrimonialPhoto('photo-kewat-1', actor, { isApproved: true });
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof MatrimonialServiceError, 'moderateMatrimonialPhoto throws MatrimonialServiceError when db is omitted');
      assertTest(err.statusCode === 400, 'moderateMatrimonialPhoto missing db error code is 400');
    }
    assertTest(threw, 'moderateMatrimonialPhoto without db client strictly rejected (No silent fallback)');
  }

  console.log('\n--- 3. Admin Metrics Service Tenant Isolation ---');

  // Test 3.1: getAdminMetrics with Kewat client returns Kewat counts
  {
    mockKewatClient.resetLog();
    const metrics = await getAdminMetrics(mockKewatClient as unknown as PrismaClient);

    assertTest(metrics.totalUsers === 3, 'Kewat totalUsers count is 3');
    assertTest(metrics.pendingUsers === 1, 'Kewat pendingUsers count is 1');
    assertTest(metrics.activeUsers === 2, 'Kewat activeUsers count is 2');
    assertTest(metrics.totalPosts === 3, 'Kewat totalPosts count is 3');
    assertTest(mockKewatClient.queryLog.includes('user.count(kewat)'), 'Queried mockKewatClient.user.count');
    assertTest(mockKewatClient.queryLog.includes('post.count(kewat)'), 'Queried mockKewatClient.post.count');
    assertTest(mockGuptaClient.queryLog.length === 0, 'Gupta client was NOT touched');
  }

  // Test 3.2: getAdminMetrics with Gupta client returns Gupta counts
  {
    mockGuptaClient.resetLog();
    const metrics = await getAdminMetrics(mockGuptaClient as unknown as PrismaClient);

    assertTest(metrics.totalUsers === 2, 'Gupta totalUsers count is 2');
    assertTest(metrics.pendingUsers === 0, 'Gupta pendingUsers count is 0');
    assertTest(metrics.activeUsers === 2, 'Gupta activeUsers count is 2');
    assertTest(metrics.totalPosts === 1, 'Gupta totalPosts count is 1');
    assertTest(mockGuptaClient.queryLog.includes('user.count(gupta)'), 'Queried mockGuptaClient.user.count');
    assertTest(mockGuptaClient.queryLog.includes('post.count(gupta)'), 'Queried mockGuptaClient.post.count');
  }

  console.log('\n--- 4. Admin Users Service Tenant Isolation ---');

  // Test 4.1: listAdminUsers queries only specified tenant
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const kewatUsers = await listAdminUsers(
      { page: 1, limit: 10 },
      mockKewatClient as unknown as PrismaClient
    );
    assertTest(kewatUsers.users.length === 3, 'Kewat user list returns 3 users');
    assertTest(kewatUsers.users.some((u) => u.phone === '+919876543211'), 'Kewat user list contains Ramesh Kewat');
    assertTest(
      !kewatUsers.users.some((u) => u.phone === '+919811122234'),
      'Kewat user list does NOT contain Amit Gupta'
    );
    assertTest(mockKewatClient.queryLog.includes('user.findMany(kewat)'), 'Executed findMany on Kewat client');
    assertTest(mockGuptaClient.queryLog.length === 0, 'Gupta client remained untouched');

    const guptaUsers = await listAdminUsers(
      { page: 1, limit: 10 },
      mockGuptaClient as unknown as PrismaClient
    );
    assertTest(guptaUsers.users.length === 2, 'Gupta user list returns 2 users');
    assertTest(guptaUsers.users.some((u) => u.phone === '+919811122234'), 'Gupta user list contains Amit Gupta');
    assertTest(
      !guptaUsers.users.some((u) => u.phone === '+919876543211'),
      'Gupta user list does NOT contain Ramesh Kewat'
    );
  }

  // Test 4.2: getAdminUserDetails cross-tenant boundary isolation
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const details = await getAdminUserDetails(
      'kewat-user-1',
      mockKewatClient as unknown as PrismaClient
    );
    assertTest(details.id === 'kewat-user-1', 'Retrieved kewat-user-1 details from Kewat client');
    assertTest(details.profile?.fullName === 'Ramesh Kewat', 'Full name is Ramesh Kewat');

    // Querying same kewat ID on Gupta client fails
    let guptaThrew = false;
    try {
      await getAdminUserDetails('kewat-user-1', mockGuptaClient as unknown as PrismaClient);
    } catch (err: any) {
      guptaThrew = true;
      assertTest(err instanceof AdminServiceError, 'Gupta client throws AdminServiceError for Kewat ID');
      assertTest(err.statusCode === 404, 'Status code is 404 Not Found');
    }
    assertTest(guptaThrew, 'Attempting to fetch Kewat user ID from Gupta client threw 404');
  }

  // Test 4.3: updateAdminUserStatus executes in tenant client transaction and creates audit log
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const actor: AuthUser = {
      id: 'kewat-admin-1',
      phone: '+919876543210',
      fullName: 'Kewat Community Admin',
      role: UserRole.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      communitySlug: 'kewat',
    };

    const updated = await updateAdminUserStatus(
      'kewat-user-2',
      'ACTIVE',
      actor,
      'Documents verified',
      '192.168.1.10',
      'TestRunner/1.0',
      mockKewatClient as unknown as PrismaClient
    );

    assertTest(updated.status === 'ACTIVE', 'User status was updated to ACTIVE');
    assertTest(mockKewatClient.queryLog.includes('$transaction.begin(kewat)'), 'Started transaction on Kewat client');
    assertTest(mockKewatClient.queryLog.includes('user.update(kewat, id=kewat-user-2)'), 'Updated user in Kewat client');
    assertTest(mockKewatClient.queryLog.includes('auditLog.create(kewat, action=USER_STATUS_UPDATE)'), 'Created audit log in Kewat client');
    assertTest(mockGuptaClient.queryLog.length === 0, 'Gupta client remained untouched');

    // Verify audit log content in Kewat client
    const kewatLogs = mockKewatClient.getAuditLogs();
    const statusLog = kewatLogs.find((l: any) => l.action === 'USER_STATUS_UPDATE');
    assertTest(!!statusLog, 'Found USER_STATUS_UPDATE audit log entry in Kewat database');
    assertTest(statusLog.targetId === 'kewat-user-2', 'Audit log targetId is kewat-user-2');
    assertTest(statusLog.actorId === 'kewat-admin-1', 'Audit log actorId is kewat-admin-1');

    // Anti-self-modification: Admin cannot modify their own status
    let selfModThrew = false;
    try {
      await updateAdminUserStatus(
        'kewat-admin-1',
        'SUSPENDED',
        actor,
        'Cannot self-modify',
        '127.0.0.1',
        'TestRunner',
        mockKewatClient as unknown as PrismaClient
      );
    } catch (err: any) {
      selfModThrew = true;
      assertTest(err instanceof AdminServiceError, 'Self modification throws AdminServiceError');
      assertTest(err.statusCode === 400, 'Self modification error is HTTP 400 Bad Request');
    }
    assertTest(selfModThrew, 'Self-modification correctly rejected');
  }

  console.log('\n--- 5. Admin Matrimonial Service Tenant Isolation ---');

  // Test 5.1: listAdminMatrimonialProfiles returns profiles only from the specified client
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const kewatProfiles = await listAdminMatrimonialProfiles(
      { status: 'PENDING_APPROVAL', page: 1, limit: 10 },
      mockKewatClient as unknown as PrismaClient
    );
    assertTest(kewatProfiles.profiles.length === 1, 'Kewat matrimonial list has 1 profile');
    assertTest(kewatProfiles.profiles[0].id === 'mat-kewat-1', 'Profile ID is mat-kewat-1');
    assertTest(kewatProfiles.profiles[0].fullName === 'Ramesh Kewat', 'Profile full name is Ramesh Kewat');
    assertTest(kewatProfiles.profiles[0].occupation === 'Software Engineer', 'Profile occupation is Software Engineer');

    const guptaProfiles = await listAdminMatrimonialProfiles(
      { status: 'PENDING_APPROVAL', page: 1, limit: 10 },
      mockGuptaClient as unknown as PrismaClient
    );
    assertTest(guptaProfiles.profiles.length === 1, 'Gupta matrimonial list has 1 profile');
    assertTest(guptaProfiles.profiles[0].id === 'mat-gupta-1', 'Profile ID is mat-gupta-1');
    assertTest(guptaProfiles.profiles[0].fullName === 'Amit Gupta', 'Profile full name is Amit Gupta');
    assertTest(guptaProfiles.profiles[0].occupation === 'Retail Business Owner', 'Profile occupation is Retail Business Owner');
  }

  // Test 5.2: getAdminMatrimonialProfileDetails cross-tenant isolation
  {
    const profile = await getAdminMatrimonialProfileDetails(
      'mat-kewat-1',
      mockKewatClient as unknown as PrismaClient
    );
    assertTest(profile.id === 'mat-kewat-1', 'Retrieved mat-kewat-1 profile details');
    assertTest(profile.occupation === 'Software Engineer', 'Occupation is Software Engineer');

    // Querying mat-kewat-1 on Gupta client throws MatrimonialNotFoundError
    let matCrossThrew = false;
    try {
      await getAdminMatrimonialProfileDetails(
        'mat-kewat-1',
        mockGuptaClient as unknown as PrismaClient
      );
    } catch (err: any) {
      matCrossThrew = true;
      assertTest(err instanceof MatrimonialNotFoundError, 'Cross-tenant profile query throws MatrimonialNotFoundError');
    }
    assertTest(matCrossThrew, 'Cross-tenant profile details access rejected with 404');
  }

  // Test 5.3: moderateMatrimonialProfile updates status, creates audit log, sends notification in tenant client
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const actor: AuthUser = {
      id: 'kewat-admin-1',
      phone: '+919876543210',
      fullName: 'Kewat Community Admin',
      role: UserRole.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      communitySlug: 'kewat',
    };

    const moderated = await moderateMatrimonialProfile(
      'mat-kewat-1',
      actor,
      { status: 'APPROVED' },
      '192.168.1.50',
      'TestRunner/1.0',
      mockKewatClient as unknown as PrismaClient
    );

    assertTest(moderated.status === 'APPROVED', 'Matrimonial profile status was approved');
    assertTest(mockKewatClient.queryLog.includes('$transaction.begin(kewat)'), 'Transaction started on Kewat client');
    assertTest(mockKewatClient.queryLog.includes('matrimonialProfile.update(kewat, id=mat-kewat-1)'), 'Profile updated on Kewat client');
    assertTest(mockKewatClient.queryLog.includes('auditLog.create(kewat, action=MATRIMONIAL_PROFILE_MODERATED)'), 'Audit log created on Kewat client');
    assertTest(mockGuptaClient.queryLog.length === 0, 'Gupta client remained untouched');

    // Verify audit log entry
    const kewatLogs = mockKewatClient.getAuditLogs();
    const modLog = kewatLogs.find((l: any) => l.action === 'MATRIMONIAL_PROFILE_MODERATED');
    assertTest(!!modLog, 'Found MATRIMONIAL_PROFILE_MODERATED audit log entry');
    assertTest(modLog.targetId === 'mat-kewat-1', 'Audit log targetId is mat-kewat-1');

    // Anti-self-approval enforcement
    let selfApproveThrew = false;
    try {
      const selfActor: AuthUser = {
        id: 'kewat-user-1',
        phone: '+919876543211',
        fullName: 'Ramesh Kewat',
        role: UserRole.COMMUNITY_ADMIN,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
        communitySlug: 'kewat',
      };
      await moderateMatrimonialProfile(
        'mat-kewat-1',
        selfActor,
        { status: 'REJECTED', rejectionReason: 'Cannot self-reject' },
        '127.0.0.1',
        'TestRunner',
        mockKewatClient as unknown as PrismaClient
      );
    } catch (err: any) {
      selfApproveThrew = true;
      assertTest(err instanceof MatrimonialServiceError, 'Self-approval throws MatrimonialServiceError');
      assertTest(err.statusCode === 403, 'Self-approval error is HTTP 403 Forbidden');
    }
    assertTest(selfApproveThrew, 'Anti-self-approval rule enforced');
  }

  // Test 5.4: moderateMatrimonialPhoto updates photo in tenant client transaction
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const actor: AuthUser = {
      id: 'kewat-admin-1',
      phone: '+919876543210',
      fullName: 'Kewat Community Admin',
      role: UserRole.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      communitySlug: 'kewat',
    };

    const photoRes = await moderateMatrimonialPhoto(
      'photo-kewat-1',
      actor,
      { isApproved: true },
      '192.168.1.50',
      'TestRunner/1.0',
      mockKewatClient as unknown as PrismaClient
    );

    assertTest(photoRes.isApproved === true, 'Photo isApproved was set to true');
    assertTest(mockKewatClient.queryLog.includes('$transaction.begin(kewat)'), 'Photo moderation transaction started on Kewat client');
    assertTest(mockKewatClient.queryLog.includes('matrimonialPhoto.update(kewat, id=photo-kewat-1)'), 'Photo updated on Kewat client');
    assertTest(mockKewatClient.queryLog.includes('auditLog.create(kewat, action=MATRIMONIAL_PHOTO_MODERATED)'), 'Photo audit log created on Kewat client');
    assertTest(mockGuptaClient.queryLog.length === 0, 'Gupta client remained untouched');
  }

  console.log('\n--- 6. Admin Audit Logs Service Tenant Isolation ---');

  // Test 6.1: listAuditLogs queries only the specified client
  {
    mockKewatClient.resetLog();
    mockGuptaClient.resetLog();

    const kewatAudit = await listAuditLogs(
      { page: 1, limit: 10 },
      mockKewatClient as unknown as PrismaClient
    );
    assertTest(kewatAudit.logs.length > 0, 'Kewat audit logs returned');
    assertTest(
      kewatAudit.logs.some((l) => l.action === 'INITIAL_SETUP' && l.actorId === 'kewat-admin-1'),
      'Contains Kewat initial setup log'
    );
    assertTest(
      !kewatAudit.logs.some((l) => l.actorId === 'gupta-admin-1'),
      'Does NOT contain Gupta admin log entries'
    );

    const guptaAudit = await listAuditLogs(
      { page: 1, limit: 10 },
      mockGuptaClient as unknown as PrismaClient
    );
    assertTest(guptaAudit.logs.length > 0, 'Gupta audit logs returned');
    assertTest(
      guptaAudit.logs.some((l) => l.action === 'INITIAL_SETUP' && l.actorId === 'gupta-admin-1'),
      'Contains Gupta initial setup log'
    );
    assertTest(
      !guptaAudit.logs.some((l) => l.actorId === 'kewat-admin-1'),
      'Does NOT contain Kewat admin log entries'
    );
  }

  console.log('\n--- 7. Controller End-to-End Tenant Propagation ---');

  // Test 7.1: getUsersHandler executes with req.db = mockKewatClient
  {
    const req: any = {
      tenant: { slug: 'kewat', isResolved: true },
      db: mockKewatClient,
      query: { page: '1', limit: '10' },
    };
    const res = createMockResponse();
    await getUsersHandler(req, res);

    assertTest(res.statusCode === 200, 'getUsersHandler succeeds with 200');
    assertTest(res.body?.success === true, 'getUsersHandler returns success true');
    assertTest(res.body?.data?.users?.length === 3, 'Returned 3 users for Kewat');
  }

  // Test 7.2: getUserDetailsHandler executes with req.db = mockKewatClient
  {
    const req: any = {
      tenant: { slug: 'kewat', isResolved: true },
      db: mockKewatClient,
      params: { id: 'kewat-user-1' },
    };
    const res = createMockResponse();
    await getUserDetailsHandler(req, res);

    assertTest(res.statusCode === 200, 'getUserDetailsHandler succeeds with 200');
    assertTest(res.body?.data?.profile?.fullName === 'Ramesh Kewat', 'Correct user details returned');
  }

  // Test 7.3: listProfilesHandler executes with req.db = mockKewatClient
  {
    const req: any = {
      tenant: { slug: 'kewat', isResolved: true },
      db: mockKewatClient,
      query: { status: 'APPROVED' },
    };
    const res = createMockResponse();
    await listProfilesHandler(req, res);

    assertTest(res.statusCode === 200, 'listProfilesHandler succeeds with 200');
    assertTest(res.body?.data?.profiles?.length === 1, 'Returned 1 approved profile');
  }

  // Test 7.4: getMetricsHandler executes with req.db = mockGuptaClient
  {
    const req: any = {
      tenant: { slug: 'gupta', isResolved: true },
      db: mockGuptaClient,
      user: { id: 'gupta-admin-1', role: UserRole.COMMUNITY_ADMIN, communitySlug: 'gupta' },
    };
    const res = createMockResponse();
    await getMetricsHandler(req, res);

    assertTest(res.statusCode === 200, 'getMetricsHandler succeeds with 200');
    assertTest(res.body?.data?.totalUsers === 2, 'Gupta totalUsers is 2');
    assertTest(res.body?.data?.totalPosts === 1, 'Gupta totalPosts is 1');
  }

  // Test 7.5: listAuditLogsHandler executes with req.db = mockKewatClient
  {
    const req: any = {
      tenant: { slug: 'kewat', isResolved: true },
      db: mockKewatClient,
      user: { id: 'kewat-admin-1', role: UserRole.COMMUNITY_ADMIN, communitySlug: 'kewat' },
      query: { page: '1', limit: '10' },
    };
    const res = createMockResponse();
    await listAuditLogsHandler(req, res);

    assertTest(res.statusCode === 200, 'listAuditLogsHandler succeeds with 200');
    assertTest(res.body?.data?.logs?.length > 0, 'Audit logs returned');
  }

  console.log('\n================================================================');
  console.log(`   Phase 15C.6 Tests Completed: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

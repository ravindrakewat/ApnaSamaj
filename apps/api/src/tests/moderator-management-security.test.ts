import assert from 'node:assert';
import { UserRole, UserStatus, AuthUser } from '@apnasamaj/shared-types';
import { updateUserRoleSchema } from '@apnasamaj/validation';
import {
  updateAdminUserRole,
  AdminServiceError,
  UserNotFoundError,
  PrivilegeError,
} from '../modules/admin/users/admin.users.service';
import { authorizeAdminCommunitySwitch } from '../middleware/tenant.middleware';
import { tenantDbManager } from '@apnasamaj/database';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14I: Moderator Management Security Tests   ');
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

// ---------------------------------------------------------------------------
// Isolated Mock Multi-Tenant Database Client Builder
// ---------------------------------------------------------------------------

function createMockPrismaClient(tenantSlug: string) {
  const store: {
    users: any[];
    auditLogs: any[];
    refreshTokens: any[];
  } = {
    users: [],
    auditLogs: [],
    refreshTokens: [],
  };

  let failAuditCreation = false;

  const client: any = {
    _slug: tenantSlug,
    _internal: store,
    setFailAuditCreation: (fail: boolean) => {
      failAuditCreation = fail;
    },
    user: {
      findUnique: async ({ where }: any) => {
        const u = store.users.find((user) => user.id === where.id);
        if (!u) return null;
        return { ...u };
      },
      findMany: async () => {
        return store.users.map((u) => ({ ...u }));
      },
      count: async ({ where }: any = {}) => {
        let list = store.users;
        if (where?.role) {
          list = list.filter((u) => u.role === where.role);
        }
        return list.length;
      },
      update: async ({ where, data }: any) => {
        const index = store.users.findIndex((u) => u.id === where.id);
        if (index === -1) throw new Error(`User ${where.id} not found in mock store`);
        store.users[index] = { ...store.users[index], ...data, updatedAt: new Date() };
        return { ...store.users[index] };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (failAuditCreation) {
          throw new Error('Database audit log disk failure simulation');
        }
        const newLog = {
          id: `audit-${Date.now()}-${Math.random()}`,
          ...data,
          createdAt: new Date(),
        };
        store.auditLogs.push(newLog);
        return newLog;
      },
      findMany: async ({ where }: any = {}) => {
        let list = [...store.auditLogs];
        if (where?.action) list = list.filter((l) => l.action === where.action);
        if (where?.targetId) list = list.filter((l) => l.targetId === where.targetId);
        return list;
      },
    },
    refreshToken: {
      updateMany: async () => ({ count: 0 }),
    },
    notification: {
      create: async () => ({ id: 'notif-1' }),
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => {

      // Snapshot state to support atomic transaction rollback
      const userSnapshot = JSON.parse(JSON.stringify(store.users));
      const auditSnapshot = JSON.parse(JSON.stringify(store.auditLogs));

      const txProxy = {
        user: {
          update: async ({ where, data }: any) => {
            const index = store.users.findIndex((u) => u.id === where.id);
            if (index === -1) throw new Error(`User not found`);
            store.users[index] = { ...store.users[index], ...data, updatedAt: new Date() };
            return { ...store.users[index] };
          },
        },
        auditLog: {
          create: async ({ data }: any) => {
            if (failAuditCreation) {
              throw new Error('Database audit log disk failure simulation');
            }
            const newLog = {
              id: `audit-${Date.now()}-${Math.random()}`,
              ...data,
              createdAt: new Date(),
            };
            store.auditLogs.push(newLog);
            return newLog;
          },
        },
      };

      try {
        return await fn(txProxy);
      } catch (err) {
        // Rollback state on error
        store.users = userSnapshot;
        store.auditLogs = auditSnapshot;
        throw err;
      }
    },
  };

  return client;
}

// Helper to simulate express mock response
function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
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

async function runTests() {
  // Setup isolated tenant test clients
  const kewatDb = createMockPrismaClient('kewat');
  const guptaDb = createMockPrismaClient('gupta');

  // Register in tenantDbManager registry for middleware tests
  tenantDbManager.clearRegistry();
  tenantDbManager.registerCommunity({
    slug: 'kewat',
    name: 'Kewat Samaj',
    databaseUrl: 'postgresql://postgres:pass@localhost:5432/kewat_test',
    connectionLimit: 2,
  });
  tenantDbManager.registerCommunity({
    slug: 'gupta',
    name: 'Gupta Samaj',
    databaseUrl: 'postgresql://postgres:pass@localhost:5432/gupta_test',
    connectionLimit: 2,
  });

  // Seed Kewat DB
  const kewatSuperAdmin: AuthUser = {
    id: 'kewat-super-1',
    phone: '+919800000001',
    fullName: 'Master Super Admin',
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
  };
  kewatDb._internal.users.push({
    ...kewatSuperAdmin,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      id: 'p-super',
      fullName: 'Master Super Admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const kewatAdmin: AuthUser = {
    id: 'kewat-admin-1',
    phone: '+919800000002',
    fullName: 'Kewat Community Admin',
    role: UserRole.COMMUNITY_ADMIN,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    communitySlug: 'kewat',
  };
  kewatDb._internal.users.push({
    ...kewatAdmin,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      id: 'p-admin',
      fullName: 'Kewat Community Admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const kewatMember1 = {
    id: 'kewat-member-1',
    phone: '+919800000003',
    fullName: 'Ramesh Kewat',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      id: 'p-m1',
      fullName: 'Ramesh Kewat',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
  kewatDb._internal.users.push(kewatMember1);

  const kewatExistingMod = {
    id: 'kewat-mod-1',
    phone: '+919800000004',
    fullName: 'Suresh Moderator',
    role: UserRole.MODERATOR,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      id: 'p-mod1',
      fullName: 'Suresh Moderator',
      city: 'Prayagraj',
      state: 'Uttar Pradesh',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
  kewatDb._internal.users.push(kewatExistingMod);

  // Seed Gupta DB with an isolated member
  const guptaMember1 = {
    id: 'gupta-member-1',
    phone: '+919700000001',
    fullName: 'Anil Gupta',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      id: 'p-g1',
      fullName: 'Anil Gupta',
      city: 'Kanpur',
      state: 'Uttar Pradesh',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
  guptaDb._internal.users.push(guptaMember1);

  console.log('--- 1. Validation Schema Enforcement ---');

  // Test 1.1: Valid role payloads
  const val1 = updateUserRoleSchema.safeParse({ role: 'MODERATOR', reason: 'Youth organizer' });
  assertTest(val1.success, 'Validation accepts valid role: MODERATOR with reason');

  const val2 = updateUserRoleSchema.safeParse({ role: 'MEMBER' });
  assertTest(val2.success, 'Validation accepts valid role: MEMBER without reason');

  // Test 1.2: Invalid role payloads rejected
  const val3 = updateUserRoleSchema.safeParse({ role: 'SUPER_ADMIN' });
  assertTest(!val3.success, 'Validation rejects SUPER_ADMIN in user role update schema (prevents escalation)');

  const val4 = updateUserRoleSchema.safeParse({ role: 'INVALID_ROLE' });
  assertTest(!val4.success, 'Validation rejects unrecognized role strings');

  const val5 = updateUserRoleSchema.safeParse({ role: 'MODERATOR', reason: 'a'.repeat(501) });
  assertTest(!val5.success, 'Validation rejects reasons exceeding 500 characters');

  console.log('\n--- 2. Middleware Authorization & Tenant Guards ---');

  // Test 2.1: Unauthenticated request rejected
  {
    const req: any = { headers: {} };
    const res = createMockResponse();
    let nextCalled = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });
    assertTest(res.statusCode === 401, 'Unauthenticated request rejected with HTTP 401');
    assertTest(!nextCalled, 'Next middleware is not called when unauthenticated');
  }

  // Test 2.2: MEMBER role rejected
  {
    const req: any = {
      user: { id: 'm-1', role: UserRole.MEMBER },
      headers: {},
    };
    const res = createMockResponse();
    let nextCalled = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });
    assertTest(res.statusCode === 403, 'MEMBER attempting admin access rejected with HTTP 403');
    assertTest(!nextCalled, 'Next middleware is not called for MEMBER role');
  }

  // Test 2.3: Cross-tenant forged X-Community-Slug rejected for COMMUNITY_ADMIN
  {
    const req: any = {
      user: kewatAdmin,
      headers: { 'x-community-slug': 'gupta' }, // Kewat admin attempting to switch to Gupta
    };
    const res = createMockResponse();
    let nextCalled = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });
    assertTest(res.statusCode === 403, 'Cross-tenant X-Community-Slug manipulation strictly rejected with HTTP 403');
    assertTest(!nextCalled, 'Cross-tenant switch blocked from execution');
  }

  // Test 2.4: Valid COMMUNITY_ADMIN request binds assigned community database
  {
    const req: any = {
      user: kewatAdmin,
      headers: { 'x-community-slug': 'kewat' },
    };
    const res = createMockResponse();
    let nextCalled = false;
    authorizeAdminCommunitySwitch(req, res, () => {
      nextCalled = true;
    });
    assertTest(nextCalled, 'COMMUNITY_ADMIN permitted for assigned community');
    assertTest(req.tenant?.slug === 'kewat', 'Tenant context bound to assigned community "kewat"');
  }

  console.log('\n--- 3. Moderator Promotion & Revocation Business Logic ---');

  // Test 3.1: COMMUNITY_ADMIN promoting an eligible MEMBER to MODERATOR
  {
    const beforeCount = kewatDb._internal.auditLogs.length;
    const result = await updateAdminUserRole(
      kewatMember1.id,
      'MODERATOR',
      kewatAdmin,
      'Appointed community moderator for festival coordination',
      '127.0.0.1',
      'Mozilla/5.0 TestAgent',
      kewatDb
    );

    assertTest(result.role === UserRole.MODERATOR, 'Member promoted to MODERATOR');
    const storedUser = kewatDb._internal.users.find((u: any) => u.id === kewatMember1.id);
    assertTest(storedUser.role === UserRole.MODERATOR, 'Stored user role in Kewat database updated to MODERATOR');

    // Verify audit log
    const afterCount = kewatDb._internal.auditLogs.length;
    assertTest(afterCount === beforeCount + 1, 'AuditLog entry created atomically');
    const latestLog = kewatDb._internal.auditLogs[afterCount - 1];
    assertTest(latestLog.action === 'USER_ROLE_UPDATE', 'AuditLog action is USER_ROLE_UPDATE');
    assertTest(latestLog.actorId === kewatAdmin.id, 'AuditLog actorId recorded correctly');
    assertTest(latestLog.targetId === kewatMember1.id, 'AuditLog targetId recorded correctly');
    assertTest(latestLog.details.previousRole === 'MEMBER', 'AuditLog previousRole recorded');
    assertTest(latestLog.details.newRole === 'MODERATOR', 'AuditLog newRole recorded');
    assertTest(latestLog.ipAddress === '127.0.0.1', 'AuditLog IP address captured');
    assertTest(latestLog.userAgent === 'Mozilla/5.0 TestAgent', 'AuditLog userAgent captured');
  }

  // Test 3.2: COMMUNITY_ADMIN revoking MODERATOR privileges back to MEMBER
  {
    const beforeCount = kewatDb._internal.auditLogs.length;
    const result = await updateAdminUserRole(
      kewatExistingMod.id,
      'MEMBER',
      kewatAdmin,
      'Term expired',
      '192.168.1.100',
      'PostmanRuntime/7.0',
      kewatDb
    );

    assertTest(result.role === UserRole.MEMBER, 'Moderator privileges revoked back to MEMBER');
    const storedUser = kewatDb._internal.users.find((u: any) => u.id === kewatExistingMod.id);
    assertTest(storedUser.role === UserRole.MEMBER, 'Stored user role in Kewat database is now MEMBER');

    const latestLog = kewatDb._internal.auditLogs[kewatDb._internal.auditLogs.length - 1];
    assertTest(latestLog.details.previousRole === 'MODERATOR', 'AuditLog recorded previousRole as MODERATOR');
    assertTest(latestLog.details.newRole === 'MEMBER', 'AuditLog recorded newRole as MEMBER');
    assertTest(latestLog.details.reason === 'Term expired', 'AuditLog recorded reason correctly');
  }

  console.log('\n--- 4. Privilege Escalation & Security Boundary Protections ---');

  // Test 4.1: Administrator cannot modify their own role (Lockout / Self-Escalation prevention)
  {
    let threw = false;
    try {
      await updateAdminUserRole(
        kewatAdmin.id,
        'MODERATOR',
        kewatAdmin,
        'Self demotion attempt',
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof AdminServiceError, 'Self-modification throws AdminServiceError');
      assertTest(err.statusCode === 400, 'Self-modification returns HTTP 400 Bad Request');
    }
    assertTest(threw, 'Admin modifying own role is strictly prohibited');
  }

  // Test 4.2: COMMUNITY_ADMIN cannot promote anyone to SUPER_ADMIN
  {
    let threw = false;
    try {
      await updateAdminUserRole(
        kewatMember1.id,
        'SUPER_ADMIN' as any,
        kewatAdmin,
        'Escalation attempt',
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof PrivilegeError, 'Promoting to SUPER_ADMIN throws PrivilegeError');
      assertTest(err.statusCode === 403, 'Privilege escalation attempt returns HTTP 403');
    }
    assertTest(threw, 'COMMUNITY_ADMIN cannot promote users to SUPER_ADMIN');
  }

  // Test 4.3: COMMUNITY_ADMIN cannot promote anyone to COMMUNITY_ADMIN
  {
    let threw = false;
    try {
      await updateAdminUserRole(
        kewatMember1.id,
        'COMMUNITY_ADMIN',
        kewatAdmin,
        'Admin creation attempt',
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof PrivilegeError, 'Promoting to COMMUNITY_ADMIN throws PrivilegeError');
      assertTest(err.statusCode === 403, 'COMMUNITY_ADMIN creation by community admin returns HTTP 403');
    }
    assertTest(threw, 'COMMUNITY_ADMIN cannot promote users to COMMUNITY_ADMIN');
  }

  // Test 4.4: COMMUNITY_ADMIN cannot alter a SUPER_ADMIN account
  {
    let threw = false;
    try {
      await updateAdminUserRole(
        kewatSuperAdmin.id,
        'MEMBER',
        kewatAdmin,
        'Attempting to demote Super Admin',
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof PrivilegeError, 'Altering Super Admin account throws PrivilegeError');
      assertTest(err.statusCode === 403, 'Altering Super Admin returns HTTP 403');
    }
    assertTest(threw, 'COMMUNITY_ADMIN cannot alter SUPER_ADMIN accounts');
  }

  // Test 4.5: Non-existent target user ID rejected with 404
  {
    let threw = false;
    try {
      await updateAdminUserRole(
        'non-existent-user-id',
        'MODERATOR',
        kewatAdmin,
        undefined,
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof UserNotFoundError, 'Missing user throws UserNotFoundError');
      assertTest(err.statusCode === 404, 'Missing user returns HTTP 404');
    }
    assertTest(threw, 'Non-existent user rejected safely');
  }

  // Test 4.6: Cross-tenant isolation — target user in Gupta DB cannot be altered by Kewat DB client
  {
    let threw = false;
    try {
      await updateAdminUserRole(
        guptaMember1.id, // User only exists in Gupta DB
        'MODERATOR',
        kewatAdmin,
        undefined,
        undefined,
        undefined,
        kewatDb // Executed against Kewat DB
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof UserNotFoundError, 'User in another community DB not found in current tenant DB');
      assertTest(err.statusCode === 404, 'Cross-tenant user access returns 404');
    }
    assertTest(threw, 'Cross-tenant user modification prevented by tenant isolation');
    assertTest(guptaDb._internal.users[0].role === UserRole.MEMBER, 'Gupta user role remained unaffected');
  }

  // Test 4.7: Idempotent role update (no unnecessary writes or duplicate audit logs)
  {
    const beforeLogs = kewatDb._internal.auditLogs.length;
    // kewatMember1 is already MODERATOR from Test 3.1
    const result = await updateAdminUserRole(
      kewatMember1.id,
      'MODERATOR',
      kewatAdmin,
      'Redundant promotion',
      undefined,
      undefined,
      kewatDb
    );
    const afterLogs = kewatDb._internal.auditLogs.length;
    assertTest(result.role === UserRole.MODERATOR, 'Idempotent request returns current role');
    assertTest(afterLogs === beforeLogs, 'No redundant audit log created for no-op role update');
  }

  console.log('\n--- 5. Atomic Audit Logging & Transaction Rollback ---');

  // Test 5.1: If auditLog creation fails, the user role update MUST rollback
  {
    // Make auditLog creation throw
    kewatDb.setFailAuditCreation(true);

    let threw = false;
    const initialRole = kewatDb._internal.users.find((u: any) => u.id === kewatMember1.id).role;

    try {
      await updateAdminUserRole(
        kewatMember1.id,
        'MEMBER', // Attempt demotion
        kewatAdmin,
        'This should roll back',
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err.message.includes('audit log disk failure'), 'Expected simulated failure thrown');
    }

    assertTest(threw, 'Role update threw when audit log creation failed');

    // Verify atomic rollback
    const userAfterRollback = kewatDb._internal.users.find((u: any) => u.id === kewatMember1.id);
    assertTest(
      userAfterRollback.role === initialRole,
      'Transaction rollback preserved user role when audit log failed (No inconsistent state)'
    );

    // Reset failure flag
    kewatDb.setFailAuditCreation(false);
  }

  console.log('\n--- 6. Super Admin Demotion Safety ---');

  // Test 6.1: Cannot demote the last remaining Super Admin
  {
    let threw = false;
    try {
      // Create a second acting super admin so it's not a self-demotion check
      const superAdminActor: AuthUser = {
        id: 'super-admin-actor-2',
        phone: '+919800000099',
        fullName: 'Second Super Admin',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        isPhoneVerified: true,
      };

      await updateAdminUserRole(
        kewatSuperAdmin.id,
        'MEMBER',
        superAdminActor,
        'Demoting sole super admin',
        undefined,
        undefined,
        kewatDb
      );
    } catch (err: any) {
      threw = true;
      assertTest(err instanceof AdminServiceError, 'Demoting last super admin throws AdminServiceError');
      assertTest(err.statusCode === 400, 'Returns HTTP 400');
      assertTest(err.message.includes('last remaining Super Admin'), 'Error message specifically identifies last super admin');
    }
    assertTest(threw, 'Sole Super Admin cannot be demoted');
  }

  console.log('\n================================================================');
  console.log(`Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed with unhandled error:', err);
  process.exit(1);
});

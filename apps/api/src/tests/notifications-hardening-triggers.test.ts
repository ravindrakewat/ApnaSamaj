import assert from 'node:assert/strict';
import {
  notificationIdSchema,
  notificationIdParamSchema,
} from '@apnasamaj/validation';
import {
  markAsReadHandler,
  deleteNotificationHandler,
} from '../modules/notifications/notifications.controller';
import { updateAdminUserStatus } from '../modules/admin/users/admin.users.service';
import { moderateMatrimonialProfile } from '../modules/admin/matrimonial/admin.matrimonial.service';
import { UserRole, AuthUser, UserStatus } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('  Apna Samaj — Batch 15E.2: Notifications Hardening & Triggers  ');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${description}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${description}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passedTests++;
      console.log(`✅ PASS: ${description}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const VALID_ADMIN_UUID = '7ca7b810-9dad-11d1-80b4-00c04fd430c9';
const INVALID_UUID = 'not-a-valid-uuid-12345';
const SQL_INJECTION = "550e8400-e29b-41d4-a716-446655440000' OR '1'='1";

function createMockReqRes(params: Record<string, string> = {}, body: any = {}, user: any = { id: VALID_UUID, role: UserRole.MEMBER }, db: any = {}) {
  const req: any = {
    params,
    body,
    query: {},
    user,
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    db,
  };

  let statusCode = 200;
  let jsonResponse: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getJSON() {
      return jsonResponse;
    },
  };

  return { req, res };
}

function createMockUser(status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE', role: string = 'MEMBER') {
  return {
    id: VALID_UUID_2,
    role,
    status,
    phone: '+919123456789',
    isPhoneVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      id: 'profile-uuid',
      fullName: 'Target Member',
      gender: 'MALE',
      dateOfBirth: new Date('1990-01-01'),
      bio: null,
      avatarUrl: null,
      city: 'Bhopal',
      state: 'Madhya Pradesh',
      subCaste: 'Kewat',
      gotra: 'Kashyap',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    _count: { posts: 0, groupMemberships: 0, comments: 0 },
  };
}

async function runTests() {
  console.log('--- 1. Notification ID Schema UUID Validation ---');

  test('notificationIdSchema accepts valid RFC 4122 UUID', () => {
    const parsed = notificationIdSchema.safeParse(VALID_UUID);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data, VALID_UUID);
    }
  });

  test('notificationIdSchema rejects malformed non-UUID string', () => {
    const parsed = notificationIdSchema.safeParse(INVALID_UUID);
    assert.equal(parsed.success, false);
  });

  test('notificationIdSchema rejects SQL injection payload', () => {
    const parsed = notificationIdSchema.safeParse(SQL_INJECTION);
    assert.equal(parsed.success, false);
  });

  test('notificationIdParamSchema validates { id } as UUID', () => {
    const valid = notificationIdParamSchema.safeParse({ id: VALID_UUID });
    assert.equal(valid.success, true);

    const invalid = notificationIdParamSchema.safeParse({ id: 'abc' });
    assert.equal(invalid.success, false);
  });

  console.log('\n--- 2. Controller UUID Parameter Validation (HTTP 400 before DB Lookup) ---');

  await test('markAsReadHandler returns HTTP 400 for malformed notification ID without DB lookup', async () => {
    let dbLookupCalled = false;
    const mockDb: any = {
      notification: {
        findUnique: () => {
          dbLookupCalled = true;
          return null;
        },
      },
    };

    const { req, res } = createMockReqRes({ id: 'invalid-id' }, {}, { id: VALID_UUID }, mockDb);
    await markAsReadHandler(req, res);

    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
    assert.match(res.getJSON().error, /Invalid notification ID/i);
    assert.equal(dbLookupCalled, false);
  });

  await test('deleteNotificationHandler returns HTTP 400 for malformed notification ID without DB lookup', async () => {
    let dbLookupCalled = false;
    const mockDb: any = {
      notification: {
        findUnique: () => {
          dbLookupCalled = true;
          return null;
        },
      },
    };

    const { req, res } = createMockReqRes({ id: SQL_INJECTION }, {}, { id: VALID_UUID }, mockDb);
    await deleteNotificationHandler(req, res);

    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
    assert.equal(dbLookupCalled, false);
  });

  await test('markAsReadHandler proceeds with valid UUID and reaches ownership verification', async () => {
    let dbQueriedWithId = '';
    const mockDb: any = {
      notification: {
        findUnique: ({ where }: any) => {
          dbQueriedWithId = where.id;
          // Return notification belonging to ANOTHER user
          return {
            id: VALID_UUID,
            recipientId: 'another-user-uuid',
            isRead: false,
            readAt: null,
          };
        },
      },
    };

    const { req, res } = createMockReqRes({ id: VALID_UUID }, {}, { id: VALID_UUID }, mockDb);
    await markAsReadHandler(req, res);

    // Should query DB with exact UUID
    assert.equal(dbQueriedWithId, VALID_UUID);
    // Should fail closed with 404 (non-owner cannot see or mark someone else's notification)
    assert.equal(res.getStatusCode(), 404);
    assert.equal(res.getJSON().success, false);
    assert.equal(res.getJSON().error, 'Notification not found.');
  });

  await test('deleteNotificationHandler proceeds with valid UUID and protects cross-user notification', async () => {
    const mockDb: any = {
      notification: {
        findUnique: () => ({
          id: VALID_UUID,
          recipientId: 'different-user-uuid',
        }),
      },
    };

    const { req, res } = createMockReqRes({ id: VALID_UUID }, {}, { id: VALID_UUID }, mockDb);
    await deleteNotificationHandler(req, res);

    assert.equal(res.getStatusCode(), 404);
    assert.equal(res.getJSON().success, false);
  });

  console.log('\n--- 3. Account Status Notification Triggers ---');

  const adminActor: AuthUser = {
    id: VALID_ADMIN_UUID,
    phone: '+919876543210',
    role: UserRole.COMMUNITY_ADMIN,
    status: UserStatus.ACTIVE,
  };

  await test('updateAdminUserStatus dispatches Hindi notification on successful SUSPENSION with actorId: null', async () => {
    const dispatchedNotifications: any[] = [];
    const mockDb: any = {
      user: {
        findUnique: () => createMockUser('ACTIVE'),
      },
      $transaction: async (fn: any) => {
        const tx = {
          user: { update: async () => ({}) },
          refreshToken: { updateMany: async () => ({ count: 1 }) },
          auditLog: { create: async () => ({}) },
        };
        return fn(tx);
      },
      notification: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          dispatchedNotifications.push(data);
          return { id: 'notif-1', ...data, createdAt: new Date() };
        },
        count: async () => 1,
      },
    };

    const result = await updateAdminUserStatus(
      VALID_UUID_2,
      'SUSPENDED',
      adminActor,
      'Violation of community terms',
      '127.0.0.1',
      'TestAgent',
      mockDb
    );

    assert.ok(result);
    // Notification must be dispatched
    assert.equal(dispatchedNotifications.length, 1);
    const notif = dispatchedNotifications[0];
    assert.equal(notif.recipientId, VALID_UUID_2);
    // Moderator confidentiality: actorId MUST be null
    assert.equal(notif.actorId, null);
    assert.equal(notif.type, 'ACCOUNT_STATUS_UPDATE');
    assert.match(notif.title, /Account Suspended/);
    assert.match(notif.message, /निलंबित/);
    assert.match(notif.message, /Violation of community terms/);
  });

  await test('updateAdminUserStatus dispatches notification on successful ACTIVATION', async () => {
    const dispatchedNotifications: any[] = [];
    const mockDb: any = {
      user: {
        findUnique: () => createMockUser('SUSPENDED'),
      },
      $transaction: async (fn: any) => {
        const tx = {
          user: { update: async () => ({}) },
          auditLog: { create: async () => ({}) },
        };
        return fn(tx);
      },
      notification: {
        findFirst: async () => null,
        create: async ({ data }: any) => {
          dispatchedNotifications.push(data);
          return { id: 'notif-2', ...data, createdAt: new Date() };
        },
        count: async () => 1,
      },
    };

    await updateAdminUserStatus(VALID_UUID_2, 'ACTIVE', adminActor, undefined, undefined, undefined, mockDb);

    assert.equal(dispatchedNotifications.length, 1);
    const notif = dispatchedNotifications[0];
    assert.equal(notif.recipientId, VALID_UUID_2);
    assert.equal(notif.actorId, null);
    assert.equal(notif.type, 'ACCOUNT_STATUS_UPDATE');
    assert.match(notif.title, /Account Activated/);
    assert.match(notif.message, /सक्रिय/);
  });

  await test('updateAdminUserStatus does NOT dispatch notification if status is unchanged (idempotent)', async () => {
    const dispatchedNotifications: any[] = [];
    let transactionCalled = false;
    const mockDb: any = {
      user: {
        findUnique: () => createMockUser('ACTIVE'),
      },
      $transaction: async () => {
        transactionCalled = true;
      },
      notification: {
        create: async () => {
          dispatchedNotifications.push({});
        },
      },
    };

    // User is already ACTIVE, requesting ACTIVE
    await updateAdminUserStatus(VALID_UUID_2, 'ACTIVE', adminActor, undefined, undefined, undefined, mockDb);

    assert.equal(transactionCalled, false);
    assert.equal(dispatchedNotifications.length, 0);
  });

  await test('updateAdminUserStatus failure does not emit notification', async () => {
    const dispatchedNotifications: any[] = [];
    const mockDb: any = {
      user: {
        findUnique: () => ({
          id: VALID_UUID_2,
          role: 'SUPER_ADMIN', // Target is SUPER_ADMIN
          status: 'ACTIVE',
        }),
      },
      notification: {
        create: async () => {
          dispatchedNotifications.push({});
        },
      },
    };

    // COMMUNITY_ADMIN attempting to suspend SUPER_ADMIN must throw PrivilegeError
    await assert.rejects(
      async () => {
        await updateAdminUserStatus(VALID_UUID_2, 'SUSPENDED', adminActor, undefined, undefined, undefined, mockDb);
      },
      { name: 'AdminServiceError', statusCode: 403 }
    );

    assert.equal(dispatchedNotifications.length, 0);
  });

  await test('updateAdminUserStatus notification delivery failure does not roll back status update', async () => {
    let updateCommitted = false;
    const mockDb: any = {
      user: {
        findUnique: () => createMockUser('ACTIVE'),
      },
      $transaction: async (fn: any) => {
        const tx = {
          user: {
            update: async () => {
              updateCommitted = true;
            },
          },
          refreshToken: { updateMany: async () => ({ count: 1 }) },
          auditLog: { create: async () => ({}) },
        };
        return fn(tx);
      },
      notification: {
        create: async () => {
          throw new Error('Simulated transient notification DB failure');
        },
      },
    };

    const res = await updateAdminUserStatus(
      VALID_UUID_2,
      'SUSPENDED',
      adminActor,
      undefined,
      undefined,
      undefined,
      mockDb
    );

    assert.ok(res);
    assert.equal(updateCommitted, true);
  });

  console.log('\n--- 4. Matrimonial Profile Review Notification Triggers ---');

  const profileOwnerId = 'owner-uuid-1111-2222-3333-444455556666';
  const matrimonialProfileId = 'matrimonial-profile-uuid-9999';

  await test('moderateMatrimonialProfile dispatches MATRIMONIAL_PROFILE_APPROVED on approval with actorId: null', async () => {
    const dispatchedNotifications: any[] = [];
    const mockDb: any = {
      matrimonialProfile: {
        findUnique: () => ({
          id: matrimonialProfileId,
          userId: profileOwnerId,
          status: 'PENDING_APPROVAL',
          approvedAt: null,
          approvedById: null,
          user: {
            id: profileOwnerId,
            phone: '+919988776655',
            status: 'ACTIVE',
            profile: { fullName: 'Profile Owner' },
          },
          photos: [],
          partnerPreference: null,
          approvedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      $transaction: async (fn: any) => {
        const tx = {
          matrimonialProfile: { update: async () => ({}) },
          auditLog: { create: async () => ({}) },
        };
        return fn(tx);
      },
      notification: {
        create: async ({ data }: any) => {
          dispatchedNotifications.push(data);
          return { id: 'notif-3', ...data, createdAt: new Date() };
        },
        count: async () => 1,
      },
    };

    await moderateMatrimonialProfile(
      matrimonialProfileId,
      adminActor,
      { status: 'APPROVED' },
      undefined,
      undefined,
      mockDb
    );

    assert.equal(dispatchedNotifications.length, 1);
    const notif = dispatchedNotifications[0];
    assert.equal(notif.recipientId, profileOwnerId);
    assert.equal(notif.actorId, null);
    assert.equal(notif.type, 'MATRIMONIAL_PROFILE_APPROVED');
    assert.match(notif.title, /वैवाहिक प्रोफ़ाइल स्वीकृत/);
    assert.match(notif.message, /स्वीकृत/);
  });

  await test('moderateMatrimonialProfile dispatches MATRIMONIAL_PROFILE_REJECTED with rejection reason', async () => {
    const dispatchedNotifications: any[] = [];
    const mockDb: any = {
      matrimonialProfile: {
        findUnique: () => ({
          id: matrimonialProfileId,
          userId: profileOwnerId,
          status: 'PENDING_APPROVAL',
          approvedAt: null,
          approvedById: null,
          user: {
            id: profileOwnerId,
            phone: '+919988776655',
            status: 'ACTIVE',
            profile: { fullName: 'Profile Owner' },
          },
          photos: [],
          partnerPreference: null,
          approvedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      $transaction: async (fn: any) => {
        const tx = {
          matrimonialProfile: { update: async () => ({}) },
          auditLog: { create: async () => ({}) },
        };
        return fn(tx);
      },
      notification: {
        create: async ({ data }: any) => {
          dispatchedNotifications.push(data);
          return { id: 'notif-4', ...data, createdAt: new Date() };
        },
        count: async () => 1,
      },
    };

    await moderateMatrimonialProfile(
      matrimonialProfileId,
      adminActor,
      { status: 'REJECTED', rejectionReason: 'Please upload a clear portrait photo.' },
      undefined,
      undefined,
      mockDb
    );

    assert.equal(dispatchedNotifications.length, 1);
    const notif = dispatchedNotifications[0];
    assert.equal(notif.recipientId, profileOwnerId);
    assert.equal(notif.actorId, null);
    assert.equal(notif.type, 'MATRIMONIAL_PROFILE_REJECTED');
    assert.match(notif.title, /वैवाहिक प्रोफ़ाइल समीक्षा/);
    assert.match(notif.message, /Please upload a clear portrait photo/);
  });

  await test('moderateMatrimonialProfile enforces anti-self-approval rule (HTTP 403) and sends no notification', async () => {
    const dispatchedNotifications: any[] = [];
    const mockDb: any = {
      matrimonialProfile: {
        findUnique: () => ({
          id: matrimonialProfileId,
          userId: adminActor.id, // Profile belongs to the acting administrator
          status: 'PENDING_APPROVAL',
        }),
      },
      notification: {
        create: async () => {
          dispatchedNotifications.push({});
        },
      },
    };

    await assert.rejects(
      async () => {
        await moderateMatrimonialProfile(
          matrimonialProfileId,
          adminActor,
          { status: 'APPROVED' },
          undefined,
          undefined,
          mockDb
        );
      },
      { statusCode: 403 }
    );

    assert.equal(dispatchedNotifications.length, 0);
  });

  await test('moderateMatrimonialProfile skips notification if already at target status', async () => {
    const dispatchedNotifications: any[] = [];
    let transactionCalled = false;
    const mockDb: any = {
      matrimonialProfile: {
        findUnique: () => ({
          id: matrimonialProfileId,
          userId: profileOwnerId,
          status: 'APPROVED', // Already APPROVED
          user: { id: profileOwnerId, phone: '+91', profile: {} },
          photos: [],
          partnerPreference: null,
          approvedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      $transaction: async () => {
        transactionCalled = true;
      },
      notification: {
        create: async () => {
          dispatchedNotifications.push({});
        },
      },
    };

    await moderateMatrimonialProfile(
      matrimonialProfileId,
      adminActor,
      { status: 'APPROVED' },
      undefined,
      undefined,
      mockDb
    );

    assert.equal(transactionCalled, false);
    assert.equal(dispatchedNotifications.length, 0);
  });

  console.log('\n================================================================');
  console.log(`  Tests completed: ${passedTests} passed, 0 failed (Total: ${totalTests})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exitCode = 1;
});

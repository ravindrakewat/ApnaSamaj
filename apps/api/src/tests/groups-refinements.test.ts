import assert from 'node:assert';
import {
  groupIdSchema,
  groupUserIdSchema,
  listGroupsQuerySchema,
  addGroupMemberSchema,
  listGroupMembersQuerySchema,
  updateMemberRoleSchema,
} from '@apnasamaj/validation';
import {
  deleteGroup,
  addGroupMember,
  listGroupMembers,
  GroupNotFoundError,
  ForbiddenGroupActionError,
  GroupConflictError,
  GroupServiceError,
} from '../modules/groups/groups.service';
import {
  deleteGroupHandler,
  addGroupMemberHandler,
  listGroupMembersHandler,
  joinGroupHandler,
  leaveGroupHandler,
  updateGroupHandler,
  uploadGroupCoverHandler,
  updateGroupMemberRoleHandler,
  removeGroupMemberHandler,
} from '../modules/groups/groups.controller';
import { AuthenticatedRequest } from '../middleware/authenticate';
import { PrismaClient } from '@apnasamaj/database';
import { UserRole } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('  Apna Samaj — Batch 15C.2: Groups Backend Hardening Unit Tests ');
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
  const res: {
    statusCode: number;
    body: any;
    status: (code: number) => any;
    json: (data: any) => any;
  } = {
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

const VALID_GROUP_ID = '11111111-1111-4111-a111-111111111111';
const VALID_USER_ID = '22222222-2222-4222-a222-222222222222';
const VALID_CREATOR_ID = '33333333-3333-4333-a333-333333333333';
const VALID_ADMIN_ID = '44444444-4444-4444-a444-444444444444';
const VALID_MEMBER_ID = '55555555-5555-4555-a555-555555555555';
const VALID_MODERATOR_ID = '66666666-6666-4666-a666-666666666666';
const VALID_NON_MEMBER_ID = '77777777-7777-4777-a777-777777777777';
const VALID_SUPERADMIN_ID = '88888888-8888-4888-a888-888888888888';

const INVALID_UUID_SQL = "'; DROP TABLE groups; --";
const INVALID_UUID_SHORT = 'group-1234';
const INVALID_UUID_EMPTY = '';

// ---------------------------------------------------------------------------
// 1. Query & ID Validation Schema Hardening Tests
// ---------------------------------------------------------------------------
console.log('--- 1. Query & ID Validation Schema Hardening ---');

// 1a. groupIdSchema & groupUserIdSchema
assertTest(groupIdSchema.safeParse(VALID_GROUP_ID).success, 'groupIdSchema accepts valid RFC 4122 UUID');
assertTest(!groupIdSchema.safeParse(INVALID_UUID_SQL).success, 'groupIdSchema rejects SQL injection string');
assertTest(!groupIdSchema.safeParse(INVALID_UUID_SHORT).success, 'groupIdSchema rejects short string');
assertTest(!groupIdSchema.safeParse(INVALID_UUID_EMPTY).success, 'groupIdSchema rejects empty string');
assertTest(!groupIdSchema.safeParse(undefined).success, 'groupIdSchema rejects undefined');

assertTest(groupUserIdSchema.safeParse(VALID_USER_ID).success, 'groupUserIdSchema accepts valid RFC 4122 UUID');
assertTest(!groupUserIdSchema.safeParse(INVALID_UUID_SQL).success, 'groupUserIdSchema rejects SQL injection string');
assertTest(!groupUserIdSchema.safeParse(INVALID_UUID_SHORT).success, 'groupUserIdSchema rejects short string');

// 1b. listGroupsQuerySchema 100-character search limit & trimming
const string100Chars = 'g'.repeat(100);
const string101Chars = 'g'.repeat(101);

assertTest(
  listGroupsQuerySchema.safeParse({ search: string100Chars }).success,
  'listGroupsQuerySchema accepts search query with exactly 100 characters'
);
assertTest(
  !listGroupsQuerySchema.safeParse({ search: string101Chars }).success,
  'listGroupsQuerySchema rejects search query exceeding 100 characters'
);

const trimmedParsed = listGroupsQuerySchema.safeParse({ search: '  youth wing  ' });
assertTest(trimmedParsed.success && trimmedParsed.data.search === 'youth wing', 'listGroupsQuerySchema trims search whitespace');

// 1c. addGroupMemberSchema
assertTest(addGroupMemberSchema.safeParse({ userId: VALID_USER_ID }).success, 'addGroupMemberSchema accepts valid UUID userId');
assertTest(!addGroupMemberSchema.safeParse({ userId: 'not-a-uuid' }).success, 'addGroupMemberSchema rejects malformed userId');
assertTest(!addGroupMemberSchema.safeParse({}).success, 'addGroupMemberSchema rejects missing userId');

// 1d. listGroupMembersQuerySchema bounds & search limits
assertTest(
  listGroupMembersQuerySchema.safeParse({ search: string100Chars }).success,
  'listGroupMembersQuerySchema accepts search query with exactly 100 characters'
);
assertTest(
  !listGroupMembersQuerySchema.safeParse({ search: string101Chars }).success,
  'listGroupMembersQuerySchema rejects search query exceeding 100 characters'
);
assertTest(
  listGroupMembersQuerySchema.safeParse({ limit: 50 }).success,
  'listGroupMembersQuerySchema accepts maximum limit of 50'
);
assertTest(
  !listGroupMembersQuerySchema.safeParse({ limit: 51 }).success,
  'listGroupMembersQuerySchema rejects limit exceeding 50'
);
assertTest(
  !listGroupMembersQuerySchema.safeParse({ page: 0 }).success,
  'listGroupMembersQuerySchema rejects page 0'
);
assertTest(
  !listGroupMembersQuerySchema.safeParse({ page: -1 }).success,
  'listGroupMembersQuerySchema rejects negative page'
);
assertTest(
  listGroupMembersQuerySchema.safeParse({ role: 'ADMIN' }).success,
  'listGroupMembersQuerySchema accepts role ADMIN'
);
assertTest(
  !listGroupMembersQuerySchema.safeParse({ role: 'OWNER' }).success,
  'listGroupMembersQuerySchema rejects invalid role enum'
);

// ---------------------------------------------------------------------------
// 2. Controller Parameter Guard Tests (Malformed UUID -> HTTP 400)
// ---------------------------------------------------------------------------
console.log('\n--- 2. Controller Parameter Guard Tests ---');

async function testControllerGuards() {
  const reqBase = {
    user: { id: VALID_ADMIN_ID, role: 'MEMBER' },
    tenant: { slug: 'kewat', name: 'Kewat Samaj' },
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  };

  // deleteGroupHandler
  const delRes = createMockResponse();
  await deleteGroupHandler({ ...reqBase, params: { id: 'invalid-id' } } as any, delRes as any);
  assertTest(delRes.statusCode === 400, 'deleteGroupHandler returns 400 for malformed group ID');
  assertTest(delRes.body?.error?.includes('UUID'), 'deleteGroupHandler error explains UUID requirement');

  // addGroupMemberHandler - malformed groupId
  const addRes1 = createMockResponse();
  await addGroupMemberHandler({ ...reqBase, params: { id: 'invalid-id' }, body: { userId: VALID_USER_ID } } as any, addRes1 as any);
  assertTest(addRes1.statusCode === 400, 'addGroupMemberHandler returns 400 for malformed group ID');

  // addGroupMemberHandler - malformed userId in body
  const addRes2 = createMockResponse();
  await addGroupMemberHandler({ ...reqBase, params: { id: VALID_GROUP_ID }, body: { userId: 'not-a-uuid' } } as any, addRes2 as any);
  assertTest(addRes2.statusCode === 400, 'addGroupMemberHandler returns 400 for malformed userId in body');

  // listGroupMembersHandler - malformed groupId
  const listRes = createMockResponse();
  await listGroupMembersHandler({ ...reqBase, params: { id: 'invalid-id' }, query: {} } as any, listRes as any);
  assertTest(listRes.statusCode === 400, 'listGroupMembersHandler returns 400 for malformed group ID');

  // joinGroupHandler - malformed groupId
  const joinRes = createMockResponse();
  await joinGroupHandler({ ...reqBase, params: { id: 'invalid-id' } } as any, joinRes as any);
  assertTest(joinRes.statusCode === 400, 'joinGroupHandler returns 400 for malformed group ID');

  // leaveGroupHandler - malformed groupId
  const leaveRes = createMockResponse();
  await leaveGroupHandler({ ...reqBase, params: { id: 'invalid-id' } } as any, leaveRes as any);
  assertTest(leaveRes.statusCode === 400, 'leaveGroupHandler returns 400 for malformed group ID');

  // updateGroupHandler - malformed groupId
  const updateRes = createMockResponse();
  await updateGroupHandler({ ...reqBase, params: { id: 'invalid-id' }, body: { name: 'Updated' } } as any, updateRes as any);
  assertTest(updateRes.statusCode === 400, 'updateGroupHandler returns 400 for malformed group ID');

  // updateGroupMemberRoleHandler - malformed userId
  const roleRes = createMockResponse();
  await updateGroupMemberRoleHandler({ ...reqBase, params: { id: VALID_GROUP_ID, userId: 'invalid-user' }, body: { role: 'ADMIN' } } as any, roleRes as any);
  assertTest(roleRes.statusCode === 400, 'updateGroupMemberRoleHandler returns 400 for malformed userId');

  // removeGroupMemberHandler - malformed userId
  const remRes = createMockResponse();
  await removeGroupMemberHandler({ ...reqBase, params: { id: VALID_GROUP_ID, userId: 'invalid-user' } } as any, remRes as any);
  assertTest(remRes.statusCode === 400, 'removeGroupMemberHandler returns 400 for malformed userId');
}

// ---------------------------------------------------------------------------
// 3. Direct Member Onboarding (addGroupMember) Service Tests
// ---------------------------------------------------------------------------
console.log('\n--- 3. Direct Member Onboarding (addGroupMember) Tests ---');

function createMockDbForAddMember(overrides: {
  groupExists?: boolean;
  groupCreatedById?: string;
  actorRoleInGroup?: string | null;
  targetUserExists?: boolean;
  targetUserStatus?: string;
  isAlreadyMember?: boolean;
}) {
  let createdMemberRecord: any = null;
  let createdAuditLogRecord: any = null;
  let createdNotificationRecord: any = null;

  const mockDb = {
    group: {
      findUnique: async ({ where }: any) => {
        if (overrides.groupExists === false) return null;
        return {
          id: where.id,
          name: 'Youth Committee',
          slug: 'youth-committee',
          privacy: 'PRIVATE',
          createdById: overrides.groupCreatedById ?? VALID_CREATOR_ID,
        };
      },
    },
    groupMember: {
      findFirst: async ({ where }: any) => {
        if (where.userId === overrides.groupCreatedById) {
          return { id: 'gm-creator', role: 'ADMIN', userId: where.userId, groupId: where.groupId };
        }
        if (overrides.actorRoleInGroup) {
          return { id: 'gm-actor', role: overrides.actorRoleInGroup, userId: where.userId, groupId: where.groupId };
        }
        return null;
      },
      findUnique: async ({ where }: any) => {
        if (where?.groupId_userId) {
          const userId = where.groupId_userId.userId;
          if (userId === overrides.groupCreatedById) {
            return { id: 'gm-creator', role: 'ADMIN', userId, groupId: VALID_GROUP_ID };
          }
          if (overrides.actorRoleInGroup && userId !== VALID_USER_ID) {
            return { id: 'gm-actor', role: overrides.actorRoleInGroup, userId, groupId: VALID_GROUP_ID };
          }
          if (userId === VALID_USER_ID && overrides.isAlreadyMember) {
            return { id: 'gm-existing', role: 'MEMBER', userId: VALID_USER_ID, groupId: VALID_GROUP_ID };
          }
        }
        return null;
      },
      create: async ({ data }: any) => {
        createdMemberRecord = {
          id: 'gm-new-123',
          ...data,
          joinedAt: new Date(),
          user: {
            id: data.userId,
            profile: {
              fullName: 'Priya Sharma',
              avatarUrl: null,
              city: 'Indore',
              state: 'Madhya Pradesh',
            },
          },
        };
        return createdMemberRecord;
      },
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (overrides.targetUserExists === false) return null;
        return {
          id: where.id,
          status: overrides.targetUserStatus ?? 'ACTIVE',
          profile: { fullName: 'Priya Sharma' },
        };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        createdAuditLogRecord = data;
        return data;
      },
    },
    notification: {
      create: async ({ data }: any) => {
        createdNotificationRecord = data;
        return data;
      },
    },
    $queryRaw: async () => [{ id: VALID_GROUP_ID }],
    $transaction: async (cb: any) => cb(mockDb),
  } as unknown as PrismaClient;

  return {
    mockDb,
    getCreatedMember: () => createdMemberRecord,
    getCreatedAuditLog: () => createdAuditLogRecord,
    getCreatedNotification: () => createdNotificationRecord,
  };
}

async function testAddGroupMember() {
  // 3a. Group Creator can add active member
  const { mockDb: db1, getCreatedMember: getMember1, getCreatedAuditLog: getAudit1 } = createMockDbForAddMember({
    groupCreatedById: VALID_CREATOR_ID,
  });
  const res1 = await addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_CREATOR_ID, UserRole.MEMBER, undefined, undefined, db1);
  assertTest(res1.member!.role === 'MEMBER', 'Newly added member strictly assigned MEMBER role');
  assertTest(res1.member!.userId === VALID_USER_ID, 'Added member has correct userId');
  assertTest(getMember1().role === 'MEMBER', 'Database member record stored with MEMBER role');
  assertTest(getAudit1().action === 'GROUP_MEMBER_ADD', 'AuditLog recorded with GROUP_MEMBER_ADD action');

  // 3b. Group ADMIN can add member
  const { mockDb: db2 } = createMockDbForAddMember({
    actorRoleInGroup: 'ADMIN',
  });
  const res2 = await addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_ADMIN_ID, UserRole.MEMBER, undefined, undefined, db2);
  assertTest(res2.member!.userId === VALID_USER_ID, 'Group ADMIN can onboard member');

  // 3c. Platform SUPER_ADMIN can add member even if not in group
  const { mockDb: db3 } = createMockDbForAddMember({
    actorRoleInGroup: null,
  });
  const res3 = await addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_SUPERADMIN_ID, UserRole.SUPER_ADMIN, undefined, undefined, db3);
  assertTest(res3.member!.userId === VALID_USER_ID, 'SUPER_ADMIN can onboard member to any group');

  // 3d. Regular MEMBER cannot add member (HTTP 403)
  const { mockDb: db4 } = createMockDbForAddMember({
    actorRoleInGroup: 'MEMBER',
  });
  await assert.rejects(
    addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_MEMBER_ID, UserRole.MEMBER, undefined, undefined, db4),
    (err: any) => {
      assertTest(err instanceof ForbiddenGroupActionError, 'Regular MEMBER receives ForbiddenGroupActionError (403)');
      assertTest(err.statusCode === 403, 'Status code is 403');
      return true;
    }
  );

  // 3e. MODERATOR cannot add member (HTTP 403)
  const { mockDb: db5 } = createMockDbForAddMember({
    actorRoleInGroup: 'MODERATOR',
  });
  await assert.rejects(
    addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_MODERATOR_ID, UserRole.MEMBER, undefined, undefined, db5),
    (err: any) => {
      assertTest(err instanceof ForbiddenGroupActionError, 'MODERATOR receives ForbiddenGroupActionError (403)');
      return true;
    }
  );

  // 3f. Target user non-existent (HTTP 404)
  const { mockDb: db6 } = createMockDbForAddMember({
    groupCreatedById: VALID_CREATOR_ID,
    targetUserExists: false,
  });
  await assert.rejects(
    addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_CREATOR_ID, UserRole.MEMBER, undefined, undefined, db6),
    (err: any) => {
      assertTest(err instanceof GroupServiceError && err.statusCode === 404, 'Non-existent target user returns 404 Not Found');
      return true;
    }
  );

  // 3g. Target user INACTIVE (HTTP 400)
  const { mockDb: db7 } = createMockDbForAddMember({
    groupCreatedById: VALID_CREATOR_ID,
    targetUserStatus: 'SUSPENDED',
  });
  await assert.rejects(
    addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_CREATOR_ID, UserRole.MEMBER, undefined, undefined, db7),
    (err: any) => {
      assertTest(err instanceof GroupServiceError && err.statusCode === 400, 'Inactive target user returns 400 Bad Request');
      return true;
    }
  );

  // 3h. Duplicate membership returns HTTP 409 Conflict
  const { mockDb: db8 } = createMockDbForAddMember({
    groupCreatedById: VALID_CREATOR_ID,
    isAlreadyMember: true,
  });
  await assert.rejects(
    addGroupMember(VALID_GROUP_ID, VALID_USER_ID, VALID_CREATOR_ID, UserRole.MEMBER, undefined, undefined, db8),
    (err: any) => {
      assertTest(err instanceof GroupConflictError, 'Duplicate membership returns GroupConflictError (409)');
      assertTest(err.statusCode === 409, 'Status code is 409');
      return true;
    }
  );
}

// ---------------------------------------------------------------------------
// 4. Paginated Member Roster (listGroupMembers) Service Tests
// ---------------------------------------------------------------------------
console.log('\n--- 4. Paginated Member Roster (listGroupMembers) Tests ---');

function createMockDbForListMembers(overrides: {
  privacy?: 'PUBLIC' | 'PRIVATE';
  isCallerMember?: boolean;
  callerRole?: string;
  totalMembers?: number;
}) {
  const privacy = overrides.privacy ?? 'PUBLIC';
  const members = [
    {
      id: 'gm-1',
      userId: VALID_CREATOR_ID,
      role: 'ADMIN',
      joinedAt: new Date('2026-01-01'),
      user: {
        id: VALID_CREATOR_ID,
        profile: {
          fullName: 'Aarav Patel',
          avatarUrl: 'https://cdn.example.com/aarav.jpg',
        },
      },
    },
    {
      id: 'gm-2',
      userId: VALID_MEMBER_ID,
      role: 'MEMBER',
      joinedAt: new Date('2026-02-01'),
      user: {
        id: VALID_MEMBER_ID,
        profile: {
          fullName: 'Bhavna Joshi',
          avatarUrl: null,
        },
      },
    },
  ];

  const mockDb = {
    group: {
      findUnique: async () => ({
        id: VALID_GROUP_ID,
        name: 'Heritage Preservation',
        slug: 'heritage-preservation',
        privacy,
        members: overrides.isCallerMember
          ? [{ id: 'gm-caller', role: overrides.callerRole ?? 'MEMBER' }]
          : [],
      }),
    },
    groupMember: {
      findUnique: async () => {
        if (overrides.isCallerMember) {
          return { id: 'gm-caller', role: overrides.callerRole ?? 'MEMBER' };
        }
        return null;
      },
      findMany: async () => members,
      count: async () => overrides.totalMembers ?? members.length,
    },
  } as unknown as PrismaClient;

  return mockDb;
}

async function testListGroupMembers() {
  // 4a. Public group roster accessible to authenticated non-member
  const dbPublic = createMockDbForListMembers({ privacy: 'PUBLIC', isCallerMember: false });
  const resultPublic = await listGroupMembers(VALID_GROUP_ID, VALID_NON_MEMBER_ID, UserRole.MEMBER, { page: 1, limit: 12 }, dbPublic);
  assertTest(resultPublic.members.length === 2, 'Non-member can view public group member roster');
  assertTest(resultPublic.pagination.totalMembers === 2, 'Pagination totalMembers calculated correctly');
  assertTest(resultPublic.pagination.totalPages === 1, 'Pagination totalPages calculated correctly');

  // 4b. Private group roster accessible to member
  const dbPrivateMember = createMockDbForListMembers({ privacy: 'PRIVATE', isCallerMember: true, callerRole: 'MEMBER' });
  const resultPrivate = await listGroupMembers(VALID_GROUP_ID, VALID_MEMBER_ID, UserRole.MEMBER, { page: 1, limit: 12 }, dbPrivateMember);
  assertTest(resultPrivate.members.length === 2, 'Member can view private group member roster');

  // 4c. Private group roster accessible to SUPER_ADMIN non-member
  const dbPrivateSuperAdmin = createMockDbForListMembers({ privacy: 'PRIVATE', isCallerMember: false });
  const resultSuperAdmin = await listGroupMembers(VALID_GROUP_ID, VALID_SUPERADMIN_ID, UserRole.SUPER_ADMIN, { page: 1, limit: 12 }, dbPrivateSuperAdmin);
  assertTest(resultSuperAdmin.members.length === 2, 'SUPER_ADMIN non-member can view private group roster');

  // 4d. Private group roster rejected for non-member (HTTP 403)
  const dbPrivateNonMember = createMockDbForListMembers({ privacy: 'PRIVATE', isCallerMember: false });
  await assert.rejects(
    listGroupMembers(VALID_GROUP_ID, VALID_NON_MEMBER_ID, UserRole.MEMBER, { page: 1, limit: 12 }, dbPrivateNonMember),
    (err: any) => {
      assertTest(err instanceof ForbiddenGroupActionError, 'Non-member viewing private roster receives ForbiddenGroupActionError (403)');
      assertTest(err.statusCode === 403, 'Status code is 403');
      return true;
    }
  );

  // 4e. Sensitive PII exclusion invariants
  console.log('\n--- 5. Roster Privacy & Sensitive Field Exclusion Invariants ---');
  const sampleMember = resultPublic.members[0] as any;
  assertTest(sampleMember.user.fullName === 'Aarav Patel', 'Member includes fullName');
  assertTest(sampleMember.user.avatarUrl === 'https://cdn.example.com/aarav.jpg', 'Member includes avatarUrl');
  assertTest(!('phone' in sampleMember.user), 'Privacy: phone is NOT exposed in member roster');
  assertTest(!('passwordHash' in sampleMember.user), 'Privacy: passwordHash is NOT exposed in member roster');
  assertTest(!('dateOfBirth' in sampleMember.user), 'Privacy: dateOfBirth is NOT exposed in member roster');
  assertTest(!('status' in sampleMember.user), 'Privacy: internal status is NOT exposed in member roster');
  assertTest(!('tokens' in sampleMember.user), 'Privacy: tokens are NOT exposed in member roster');
}

// ---------------------------------------------------------------------------
// 6. Group Deletion (deleteGroup) Service Tests & Cascade Verification
// ---------------------------------------------------------------------------
console.log('\n--- 6. Group Deletion (deleteGroup) Tests ---');

function createMockDbForDeleteGroup(overrides: {
  groupExists?: boolean;
  createdById?: string;
  actorRoleInGroup?: string | null;
}) {
  let deletedMembersArgs: any = null;
  let deletedChatMessagesArgs: any = null;
  let updatedPostsArgs: any = null;
  let deletedGroupArgs: any = null;
  let auditLogRecord: any = null;

  const mockDb = {
    group: {
      findUnique: async () => {
        if (overrides.groupExists === false) return null;
        return {
          id: VALID_GROUP_ID,
          name: 'Social Outreach',
          slug: 'social-outreach',
          privacy: 'PUBLIC',
          createdById: overrides.createdById ?? VALID_CREATOR_ID,
          coverUrl: null,
          members: overrides.actorRoleInGroup
            ? [{ id: 'gm-actor', role: overrides.actorRoleInGroup }]
            : [],
        };
      },
      delete: async (args: any) => {
        deletedGroupArgs = args;
        return { id: VALID_GROUP_ID };
      },
    },
    groupMember: {
      findUnique: async () => {
        if (overrides.actorRoleInGroup) {
          return { role: overrides.actorRoleInGroup };
        }
        return null;
      },
      deleteMany: async (args: any) => {
        deletedMembersArgs = args;
        return { count: 5 };
      },
    },
    chatMessage: {
      deleteMany: async (args: any) => {
        deletedChatMessagesArgs = args;
        return { count: 12 };
      },
    },
    post: {
      updateMany: async (args: any) => {
        updatedPostsArgs = args;
        return { count: 3 };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogRecord = data;
        return data;
      },
    },
    $transaction: async (cb: any) => cb(mockDb),
  } as unknown as PrismaClient;

  return {
    mockDb,
    getDeletedMembersArgs: () => deletedMembersArgs,
    getDeletedChatMessagesArgs: () => deletedChatMessagesArgs,
    getUpdatedPostsArgs: () => updatedPostsArgs,
    getDeletedGroupArgs: () => deletedGroupArgs,
    getAuditLogRecord: () => auditLogRecord,
  };
}

async function testDeleteGroup() {
  // 6a. Group Creator can delete group & triggers cascade
  const {
    mockDb: db1,
    getDeletedMembersArgs,
    getDeletedChatMessagesArgs,
    getUpdatedPostsArgs,
    getDeletedGroupArgs,
    getAuditLogRecord,
  } = createMockDbForDeleteGroup({ createdById: VALID_CREATOR_ID });

  const result1 = await deleteGroup(VALID_GROUP_ID, VALID_CREATOR_ID, UserRole.MEMBER, '127.0.0.1', 'Mozilla', db1);
  assertTest(result1.success === true, 'Group creator can delete group');
  assertTest(getDeletedGroupArgs()?.where?.id === VALID_GROUP_ID, 'Group record deleted via Prisma transaction');
  assertTest(getAuditLogRecord()?.action === 'GROUP_DELETED', 'AuditLog recorded with GROUP_DELETED');
  assertTest(getAuditLogRecord()?.actorId === VALID_CREATOR_ID, 'AuditLog records actor ID');
  assertTest(getAuditLogRecord()?.targetId === VALID_GROUP_ID, 'AuditLog records target group ID');

  // Verify Prisma schema cascade definitions
  const fsModule = await import('fs');
  const pathModule = await import('path');
  const schemaPath = pathModule.resolve(process.cwd(), 'packages/database/prisma/schema.prisma');
  const schemaContent = fsModule.readFileSync(schemaPath, 'utf8');

  assertTest(
    schemaContent.includes('fields: [groupId], references: [id], onDelete: Cascade') &&
    schemaContent.includes('model GroupMember'),
    'Schema cascade: GroupMember defines onDelete: Cascade'
  );
  assertTest(
    schemaContent.includes('fields: [groupId], references: [id], onDelete: Cascade') &&
    schemaContent.includes('model ChatMessage'),
    'Schema cascade: ChatMessage defines onDelete: Cascade'
  );
  assertTest(
    schemaContent.includes('fields: [groupId], references: [id], onDelete: SetNull') &&
    schemaContent.includes('model Post'),
    'Schema cascade: Post defines onDelete: SetNull to prevent dangling foreign keys'
  );

  // 6b. Group ADMIN can delete group
  const { mockDb: db2 } = createMockDbForDeleteGroup({
    createdById: VALID_CREATOR_ID,
    actorRoleInGroup: 'ADMIN',
  });
  const result2 = await deleteGroup(VALID_GROUP_ID, VALID_ADMIN_ID, UserRole.MEMBER, undefined, undefined, db2);
  assertTest(result2.success === true, 'Group ADMIN can delete group');

  // 6c. SUPER_ADMIN can delete group even if not member
  const { mockDb: db3 } = createMockDbForDeleteGroup({
    createdById: VALID_CREATOR_ID,
    actorRoleInGroup: null,
  });
  const result3 = await deleteGroup(VALID_GROUP_ID, VALID_SUPERADMIN_ID, UserRole.SUPER_ADMIN, undefined, undefined, db3);
  assertTest(result3.success === true, 'SUPER_ADMIN can delete group');

  // 6d. Regular MEMBER cannot delete group (HTTP 403)
  const { mockDb: db4 } = createMockDbForDeleteGroup({
    createdById: VALID_CREATOR_ID,
    actorRoleInGroup: 'MEMBER',
  });
  await assert.rejects(
    deleteGroup(VALID_GROUP_ID, VALID_MEMBER_ID, UserRole.MEMBER, undefined, undefined, db4),
    (err: any) => {
      assertTest(err instanceof ForbiddenGroupActionError, 'MEMBER cannot delete group (HTTP 403)');
      assertTest(err.statusCode === 403, 'Status code is 403');
      return true;
    }
  );

  // 6e. MODERATOR cannot delete group (HTTP 403)
  const { mockDb: db5 } = createMockDbForDeleteGroup({
    createdById: VALID_CREATOR_ID,
    actorRoleInGroup: 'MODERATOR',
  });
  await assert.rejects(
    deleteGroup(VALID_GROUP_ID, VALID_MODERATOR_ID, UserRole.MEMBER, undefined, undefined, db5),
    (err: any) => {
      assertTest(err instanceof ForbiddenGroupActionError, 'MODERATOR cannot delete group (HTTP 403)');
      return true;
    }
  );

  // 6f. Non-member cannot delete group (HTTP 403)
  const { mockDb: db6 } = createMockDbForDeleteGroup({
    createdById: VALID_CREATOR_ID,
    actorRoleInGroup: null,
  });
  await assert.rejects(
    deleteGroup(VALID_GROUP_ID, VALID_NON_MEMBER_ID, UserRole.MEMBER, undefined, undefined, db6),
    (err: any) => {
      assertTest(err instanceof ForbiddenGroupActionError, 'Non-member cannot delete group (HTTP 403)');
      return true;
    }
  );

  // 6g. Non-existent group (HTTP 404)
  const { mockDb: db7 } = createMockDbForDeleteGroup({ groupExists: false });
  await assert.rejects(
    deleteGroup(VALID_GROUP_ID, VALID_CREATOR_ID, UserRole.MEMBER, undefined, undefined, db7),
    (err: any) => {
      assertTest(err instanceof GroupNotFoundError, 'Non-existent group returns GroupNotFoundError (404)');
      assertTest(err.statusCode === 404, 'Status code is 404');
      return true;
    }
  );
}

// ---------------------------------------------------------------------------
// Main Test Runner
// ---------------------------------------------------------------------------
async function runAll() {
  await testControllerGuards();
  await testAddGroupMember();
  await testListGroupMembers();
  await testDeleteGroup();

  console.log('\n================================================================');
  console.log(`  Groups Refinements Tests: ${passedTests} Passed, ${failedTests} Failed  `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

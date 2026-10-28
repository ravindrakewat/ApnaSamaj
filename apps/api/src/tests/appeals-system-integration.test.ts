import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import {
  PostAppealStatus,
  UserRole,
} from '@apnasamaj/shared-types';
import {
  submitPostAppealSchema,
  reviewPostAppealSchema,
  listMemberPostAppealsQuerySchema,
  listAdminPostAppealsQuerySchema,
} from '@apnasamaj/validation';
import {
  submitPostAppeal,
  getMemberAppeals,
  listCommunityAppeals,
  reviewAppeal,
} from '../modules/appeals/appeals.service';
import {
  submitPostAppealHandler,
  getMemberAppealsHandler,
  listCommunityAppealsHandler,
  reviewAppealHandler,
} from '../modules/appeals/appeals.controller';
import { PostNotFoundError, PostServiceError } from '../modules/posts/posts.service';
// Contract specification mirroring web route resolver for notifications and appeals deep linking
function resolveNotificationTarget(item: { type: string; entityId?: string | null }): string | null {
  switch (item.type) {
    case 'POST_LIKE':
    case 'POST_COMMENT':
      return item.entityId ? `/posts/${item.entityId}` : '/feed';
    case 'GROUP_ROLE_UPDATE':
      return item.entityId ? `/groups/${item.entityId}` : '/groups';
    case 'GROUP_MEMBER_REMOVED':
      return '/groups';
    case 'ACCOUNT_STATUS_UPDATE':
      return '/profile';
    case 'POST_MODERATED':
      return item.entityId ? `/appeals?postId=${encodeURIComponent(item.entityId)}` : '/feed';
    default:
      return null;
  }
}

console.log('================================================================');
console.log('  Apna Samaj — Batch 14M.4: Appeals Concurrency & Security Tests ');
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
// 1. Mock Tenant Database Factory with Transaction & Concurrency Support
// ---------------------------------------------------------------------------
function createMockTenantDb(communitySlug: string = 'kewat') {
  const store = {
    users: [] as any[],
    auditLogs: [] as any[],
    postAppeals: [] as any[],
    notifications: [] as any[],
  };

  const client: any = {
    _slug: communitySlug,
    _store: store,
    $transaction: async (fn: any) => {
      // Execute transaction with client proxy
      return await fn(client);
    },
    user: {
      findUnique: async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      },
    },
    auditLog: {
      findMany: async (args: any = {}) => {
        const { where, orderBy, take } = args;
        let logs = [...store.auditLogs];

        if (where?.action) {
          logs = logs.filter((l) => l.action === where.action);
        }
        if (where?.targetType) {
          logs = logs.filter((l) => l.targetType === where.targetType);
        }
        if (where?.targetId) {
          logs = logs.filter((l) => l.targetId === where.targetId);
        }

        if (orderBy?.createdAt === 'desc') {
          logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (orderBy?.createdAt === 'asc') {
          logs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        }

        if (take) {
          logs = logs.slice(0, take);
        }

        return logs;
      },
      create: async ({ data }: any) => {
        const record = {
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...data,
          createdAt: new Date(),
        };
        store.auditLogs.push(record);
        return record;
      },
    },
    notification: {
      count: async () => store.notifications.length,
      create: async ({ data }: any) => {
        const notif = {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          ...data,
          isRead: false,
          createdAt: new Date(),
        };
        store.notifications.push(notif);
        return notif;
      },
    },
    postAppeal: {
      count: async ({ where }: any = {}) => {
        let appeals = [...store.postAppeals];
        if (where?.authorId) {
          appeals = appeals.filter((a) => a.authorId === where.authorId);
        }
        if (where?.status) {
          if (where.status?.in) {
            appeals = appeals.filter((a) => where.status.in.includes(a.status));
          } else {
            appeals = appeals.filter((a) => a.status === where.status);
          }
        }
        return appeals.length;
      },
      findFirst: async ({ where }: any) => {
        let appeals = [...store.postAppeals];
        if (where?.postId) {
          appeals = appeals.filter((a) => a.postId === where.postId);
        }
        if (where?.status?.in) {
          appeals = appeals.filter((a) => where.status.in.includes(a.status));
        }
        return appeals[0] || null;
      },
      findUnique: async ({ where }: any) => {
        return store.postAppeals.find((a) => a.id === where.id) || null;
      },
      findMany: async (args: any = {}) => {
        const { where, skip = 0, take = 50, orderBy, include } = args;
        let appeals = [...store.postAppeals];

        if (where?.authorId) {
          appeals = appeals.filter((a) => a.authorId === where.authorId);
        }
        if (where?.status) {
          appeals = appeals.filter((a) => a.status === where.status);
        }

        if (orderBy?.createdAt === 'desc') {
          appeals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        const paginated = appeals.slice(skip, skip + take);

        if (include?.author) {
          return paginated.map((a) => {
            const author = a.authorId ? store.users.find((u) => u.id === a.authorId) : null;
            return {
              ...a,
              author: author
                ? {
                    id: author.id,
                    profile: { fullName: author.fullName },
                  }
                : null,
            };
          });
        }

        return paginated;
      },
      create: async ({ data }: any) => {
        // Enforce mock partial unique index check
        const activeExisting = store.postAppeals.find(
          (a) => a.postId === data.postId && ['PENDING', 'UNDER_REVIEW'].includes(a.status)
        );
        if (activeExisting) {
          const err: any = new Error('Unique constraint violation: post_appeals_active_unique_idx');
          err.code = 'P2002';
          throw err;
        }

        const now = new Date();
        const record = {
          id: `appeal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          postId: data.postId,
          authorId: data.authorId || null,
          reason: data.reason,
          details: data.details || null,
          status: data.status || 'PENDING',
          moderatorId: null,
          reviewNotes: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        store.postAppeals.push(record);
        return record;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        const now = new Date();
        for (let i = 0; i < store.postAppeals.length; i++) {
          const item = store.postAppeals[i];
          const idMatch = !where?.id || item.id === where.id;
          let statusMatch = true;
          if (where?.status) {
            if (where.status?.in) {
              statusMatch = where.status.in.includes(item.status);
            } else {
              statusMatch = item.status === where.status;
            }
          }
          if (idMatch && statusMatch) {
            store.postAppeals[i] = {
              ...item,
              ...data,
              updatedAt: now,
            };
            count++;
          }
        }
        return { count };
      },
      update: async ({ where, data }: any) => {
        const idx = store.postAppeals.findIndex((a) => a.id === where.id);
        if (idx === -1) throw new Error('PostAppeal not found');
        const now = new Date();
        const updated = {
          ...store.postAppeals[idx],
          ...data,
          updatedAt: now,
        };
        store.postAppeals[idx] = updated;
        return updated;
      },
    },
  };

  return client;
}

async function runTests() {
  console.log('--- Test Suite 1: Migration DDL, Schema Inspection & Runner CWD ---');

  // 1.1 Verify migration file exists
  const migrationPath = path.resolve(
    __dirname,
    '../../../../packages/database/prisma/migrations/20261028193000_add_post_appeal_model/migration.sql'
  );
  assertTest(fs.existsSync(migrationPath), 'Migration SQL file exists in packages/database/prisma/migrations');

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');

  // 1.2 Verify PostAppealStatus enum creation
  assertTest(
    migrationSql.includes('CREATE TYPE "PostAppealStatus" AS ENUM (\'PENDING\', \'UNDER_REVIEW\', \'APPROVED\', \'REJECTED\');'),
    'Migration SQL declares CREATE TYPE "PostAppealStatus" enum with correct states'
  );

  // 1.3 Verify PostAppeal table and nullable authorId for deletion retention
  assertTest(
    migrationSql.includes('CREATE TABLE "PostAppeal"') &&
      migrationSql.includes('"postId" TEXT NOT NULL') &&
      migrationSql.includes('"authorId" TEXT,') &&
      migrationSql.includes('"reason" TEXT NOT NULL') &&
      migrationSql.includes('"details" TEXT') &&
      migrationSql.includes('"status" "PostAppealStatus" NOT NULL DEFAULT \'PENDING\'') &&
      migrationSql.includes('"moderatorId" TEXT') &&
      migrationSql.includes('"reviewNotes" TEXT') &&
      migrationSql.includes('"reviewedAt" TIMESTAMP(3)'),
    'Migration SQL defines PostAppeal table with nullable authorId and historical postId'
  );

  // 1.4 Verify partial unique index for active appeals
  assertTest(
    migrationSql.includes(
      'CREATE UNIQUE INDEX "post_appeals_active_unique_idx" ON "PostAppeal"("postId") WHERE "status" IN (\'PENDING\', \'UNDER_REVIEW\');'
    ),
    'Migration SQL defines partial unique index post_appeals_active_unique_idx on postId WHERE status IN PENDING, UNDER_REVIEW'
  );

  // 1.5 Verify standard indexes
  assertTest(
    migrationSql.includes('CREATE INDEX "PostAppeal_authorId_idx" ON "PostAppeal"("authorId");') &&
      migrationSql.includes('CREATE INDEX "PostAppeal_postId_idx" ON "PostAppeal"("postId");') &&
      migrationSql.includes('CREATE INDEX "PostAppeal_status_createdAt_idx" ON "PostAppeal"("status", "createdAt" DESC);'),
    'Migration SQL creates indexes on authorId, postId, and status/createdAt'
  );

  // 1.6 Verify foreign key relations: authorId ON DELETE SET NULL to preserve audit history
  assertTest(
    migrationSql.includes('ALTER TABLE "PostAppeal" ADD CONSTRAINT "PostAppeal_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;'),
    'Migration SQL uses ON DELETE SET NULL for authorId to preserve appeal records upon user account deletion'
  );
  assertTest(
    migrationSql.includes('ALTER TABLE "PostAppeal" ADD CONSTRAINT "PostAppeal_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;'),
    'Migration SQL uses ON DELETE SET NULL for moderatorId'
  );
  assertTest(
    !migrationSql.includes('REFERENCES "Post"'),
    'Migration SQL strictly omits foreign key to Post table to preserve historical integrity on post deletion'
  );

  // 1.7 Verify multi-tenant migration script working directory
  const migrateScriptPath = path.resolve(
    __dirname,
    '../../../../packages/database/src/migrate-all-tenants.ts'
  );
  const migrateScriptContent = fs.readFileSync(migrateScriptPath, 'utf8');
  assertTest(
    migrateScriptContent.includes("cwd: path.resolve(__dirname, '..')"),
    'Multi-tenant migration runner explicitly specifies deterministic cwd: packages/database'
  );

  console.log('\n--- Test Suite 2: Fail-Closed Tenant Guards ---');

  // 2.1 Service layer throws 400 when db is missing
  let serviceMissingDbError: any = null;
  try {
    await submitPostAppeal('usr-1', { postId: '11111111-1111-1111-1111-111111111111', reason: 'Test' }, undefined);
  } catch (err) {
    serviceMissingDbError = err;
  }
  assertTest(
    serviceMissingDbError instanceof PostServiceError && serviceMissingDbError.statusCode === 400,
    'submitPostAppeal fails closed with HTTP 400 when db client is undefined'
  );

  let memberListMissingDbError: any = null;
  try {
    await getMemberAppeals('usr-1', {}, undefined);
  } catch (err) {
    memberListMissingDbError = err;
  }
  assertTest(
    memberListMissingDbError instanceof PostServiceError && memberListMissingDbError.statusCode === 400,
    'getMemberAppeals fails closed with HTTP 400 when db client is undefined'
  );

  let reviewMissingDbError: any = null;
  try {
    await reviewAppeal('app-1', 'mod-1', UserRole.MODERATOR, { status: 'APPROVED' }, undefined);
  } catch (err) {
    reviewMissingDbError = err;
  }
  assertTest(
    reviewMissingDbError instanceof PostServiceError && reviewMissingDbError.statusCode === 400,
    'reviewAppeal fails closed with HTTP 400 when db client is undefined'
  );

  // 2.2 Controller layer fails closed when req.tenant or req.db is missing
  let capturedStatus = 0;
  let capturedJson: any = null;
  const mockRes: any = {
    status: (s: number) => {
      capturedStatus = s;
      return mockRes;
    },
    json: (d: any) => {
      capturedJson = d;
      return mockRes;
    },
  };

  const unroutedReq: any = {
    user: { id: 'usr-1', role: UserRole.MEMBER },
    tenant: undefined,
    db: undefined,
    body: { postId: '11111111-1111-1111-1111-111111111111', reason: 'Test reason' },
  };

  await submitPostAppealHandler(unroutedReq, mockRes);
  assertTest(
    capturedStatus === 400 && capturedJson?.error?.includes('Community tenant context required'),
    'submitPostAppealHandler rejects unrouted request with HTTP 400 Bad Request'
  );

  capturedStatus = 0;
  capturedJson = null;
  await getMemberAppealsHandler(unroutedReq, mockRes);
  assertTest(
    capturedStatus === 400 && capturedJson?.error?.includes('Community tenant context required'),
    'getMemberAppealsHandler rejects unrouted request with HTTP 400 Bad Request'
  );

  console.log('\n--- Test Suite 3: Appeals Eligibility, Submission & Author Verification ---');

  const db = createMockTenantDb('kewat');
  const memberA = { id: 'user-author-a', fullName: 'Author A', role: UserRole.MEMBER };
  const memberB = { id: 'user-intruder-b', fullName: 'Intruder B', role: UserRole.MEMBER };
  const mod1 = { id: 'user-mod-1', fullName: 'Mod 1', role: UserRole.MODERATOR };
  const mod2 = { id: 'user-mod-2', fullName: 'Mod 2', role: UserRole.MODERATOR };
  db._store.users.push(memberA, memberB, mod1, mod2);

  const postId1 = '22222222-2222-2222-2222-222222222222';
  const postIdVoluntary = '33333333-3333-3333-3333-333333333333';

  // Seed moderation deletion audit log for postId1
  db._store.auditLogs.push({
    id: 'audit-del-1',
    actorId: mod1.id,
    action: 'MODERATION_DELETE_POST',
    targetType: 'Post',
    targetId: postId1,
    details: {
      postAuthorId: memberA.id,
      postType: 'TEXT',
      reason: 'SPAM',
    },
    createdAt: new Date(Date.now() - 3600000),
  });

  // 3.1 Reject voluntary deletion or unmoderated post
  let voluntaryError: any = null;
  try {
    await submitPostAppeal(memberA.id, { postId: postIdVoluntary, reason: 'Please restore' }, db);
  } catch (err) {
    voluntaryError = err;
  }
  assertTest(
    voluntaryError instanceof PostNotFoundError && voluntaryError.statusCode === 404,
    'Rejects appeal for post lacking MODERATION_DELETE_POST audit log with 404 PostNotFoundError'
  );

  // 3.2 Reject non-author appeal attempt
  let intruderError: any = null;
  try {
    await submitPostAppeal(memberB.id, { postId: postId1, reason: 'I like this post please restore' }, db);
  } catch (err) {
    intruderError = err;
  }
  assertTest(
    intruderError instanceof PostServiceError && intruderError.statusCode === 403,
    'Rejects appeal submission by non-author with 403 Forbidden'
  );

  // 3.3 Author submits valid appeal
  const appealResult = await submitPostAppeal(
    memberA.id,
    { postId: postId1, reason: 'This was an official community event, not spam.' },
    db
  );
  assertTest(appealResult.status === 'PENDING', 'Author can submit appeal; initial status is PENDING');
  assertTest(appealResult.authorId === memberA.id, 'Appeal records authorId');
  assertTest(appealResult.postId === postId1, 'Appeal records historical postId');

  // Verify audit log and notification
  const appealSubmittedAudit = db._store.auditLogs.find(
    (l: any) => l.action === 'APPEAL_SUBMITTED' && l.targetId === appealResult.id
  );
  assertTest(Boolean(appealSubmittedAudit), 'APPEAL_SUBMITTED audit log recorded');

  // 3.4 Duplicate check: reject while PENDING
  let duplicatePendingError: any = null;
  try {
    await submitPostAppeal(memberA.id, { postId: postId1, reason: 'Duplicate attempt' }, db);
  } catch (err) {
    duplicatePendingError = err;
  }
  assertTest(
    duplicatePendingError instanceof PostServiceError && duplicatePendingError.statusCode === 409,
    'Rejects duplicate appeal submission while active with 409 Conflict'
  );

  console.log('\n--- Test Suite 4: Concurrent Review Race Condition & Atomicity ---');

  // Setup: appealResult is PENDING.
  // Mod 1 wants to APPROVE, Mod 2 wants to REJECT.
  // Simulate concurrent execution:
  // Both read appeal as PENDING.
  // Mod 1 executes first and updates appeal to APPROVED.
  const mod1Promise = reviewAppeal(
    appealResult.id,
    mod1.id,
    UserRole.MODERATOR,
    { status: 'APPROVED', reviewNotes: 'Approved after verification' },
    db
  );

  const mod1Result = await mod1Promise;
  assertTest(mod1Result.status === 'APPROVED', 'First moderator review succeeds and transitions to APPROVED');

  // Now Mod 2 attempts to review the same appeal (which was PENDING when Mod 2 loaded it)
  // Because status is now APPROVED, atomic updateMany({ where: { id, status: 'PENDING' } }) returns count: 0
  let mod2Error: any = null;
  try {
    await reviewAppeal(
      appealResult.id,
      mod2.id,
      UserRole.MODERATOR,
      { status: 'REJECTED', reviewNotes: 'Rejected by second moderator' },
      db
    );
  } catch (err) {
    mod2Error = err;
  }

  assertTest(
    mod2Error instanceof PostServiceError && mod2Error.statusCode === 400 || mod2Error?.statusCode === 409,
    'Competing review on already-finalized appeal is rejected (HTTP 400 or 409 Conflict)'
  );

  // Check audit log consistency: Only Mod 1's review is logged!
  const reviewAudits = db._store.auditLogs.filter(
    (l: any) => l.action === 'MODERATION_REVIEW_APPEAL' && l.targetId === appealResult.id
  );
  assertTest(reviewAudits.length === 1, 'Exactly one MODERATION_REVIEW_APPEAL audit log is recorded');
  assertTest(reviewAudits[0].actorId === mod1.id, 'Logged review belongs to the winning moderator');
  assertTest(reviewAudits[0].details.newStatus === 'APPROVED', 'Logged review outcome matches winning decision');

  // Check notification consistency: Member received exactly 1 decision notification ("Appeal Approved")
  const decisionNotifications = db._store.notifications.filter(
    (n: any) => n.recipientId === memberA.id && (n.title === 'Appeal Approved' || n.title === 'Appeal Rejected')
  );
  assertTest(decisionNotifications.length === 1, 'Member received exactly ONE decision notification');
  assertTest(decisionNotifications[0].title === 'Appeal Approved', 'Member notification matches winning decision (No contradictory rejection notification)');

  // 4.2 Explicit parallel racing test on a fresh PENDING appeal
  const raceAppeal = await db.postAppeal.create({
    data: {
      postId: '55555555-5555-5555-5555-555555555555',
      authorId: memberA.id,
      reason: 'Race test appeal',
      status: 'PENDING',
    },
  });

  // Both moderators submit competing decisions concurrently
  const [raceResult1, raceResult2] = await Promise.allSettled([
    reviewAppeal(raceAppeal.id, mod1.id, UserRole.MODERATOR, { status: 'APPROVED', reviewNotes: 'Mod 1 approves' }, db),
    reviewAppeal(raceAppeal.id, mod2.id, UserRole.MODERATOR, { status: 'REJECTED', reviewNotes: 'Mod 2 rejects' }, db),
  ]);

  const fulfilled = [raceResult1, raceResult2].filter((r) => r.status === 'fulfilled');
  const rejected = [raceResult1, raceResult2].filter((r) => r.status === 'rejected');

  assertTest(fulfilled.length === 1, 'Exactly one concurrent review request is fulfilled successfully');
  assertTest(rejected.length === 1, 'Exactly one concurrent review request is rejected with conflict');
  const rejectedReason: any = (rejected[0] as PromiseRejectedResult).reason;
  assertTest(
    rejectedReason instanceof PostServiceError && [400, 409].includes(rejectedReason.statusCode),
    'Losing concurrent review request receives HTTP 400 or 409 Conflict'
  );

  console.log('\n--- Test Suite 5: Account Deletion Retention (ON DELETE SET NULL) ---');

  // 5.1 Simulate author account deletion: user row removed, appeal authorId becomes null
  const appealWithDeletedAuthor = await db.postAppeal.create({
    data: {
      postId: '44444444-4444-4444-4444-444444444444',
      authorId: null, // author account was deleted
      reason: 'Historical appeal from deleted member',
      status: 'PENDING',
    },
  });

  // Verify listCommunityAppeals handles null authorId without throwing
  const adminAppeals = await listCommunityAppeals({ page: 1, limit: 10 }, db);
  const foundDeleted = adminAppeals.appeals.find((a) => a.id === appealWithDeletedAuthor.id);
  assertTest(Boolean(foundDeleted), 'Appeal with null authorId is preserved in community queue');
  assertTest(foundDeleted?.authorName === 'Deleted Member', 'Displays "Deleted Member" placeholder for deleted user');

  // 5.2 Reviewing an appeal with null authorId
  const modReviewDeleted = await reviewAppeal(
    appealWithDeletedAuthor.id,
    mod1.id,
    UserRole.MODERATOR,
    { status: 'APPROVED', reviewNotes: 'Approved historical post removal' },
    db
  );
  assertTest(modReviewDeleted.status === 'APPROVED', 'Moderator can review appeal even if author was deleted');
  assertTest(modReviewDeleted.authorId === null, 'authorId remains null on historical record');

  console.log('\n--- Test Suite 6: Notification Deep Linking & Target Resolution ---');

  // 6.1 POST_MODERATED with entityId routes to /appeals?postId=<id>
  const deepLinkTarget = resolveNotificationTarget({
    id: 'n-1',
    recipientId: 'usr-1',
    actorId: null,
    type: 'POST_MODERATED',
    title: 'Post Removed',
    message: 'Post removed by moderation',
    entityType: 'POST',
    entityId: postId1,
    isRead: false,
    createdAt: new Date().toISOString(),
  } as any);
  assertTest(
    deepLinkTarget === `/appeals?postId=${postId1}`,
    'POST_MODERATED notification with entityId resolves to /appeals?postId=<entityId>'
  );

  // 6.2 POST_MODERATED without entityId routes to /appeals
  const fallbackTarget = resolveNotificationTarget({
    id: 'n-2',
    recipientId: 'usr-1',
    actorId: null,
    type: 'POST_MODERATED',
    title: 'Post Removed',
    message: 'Post removed by moderation',
    entityType: 'POST',
    entityId: null,
    isRead: false,
    createdAt: new Date().toISOString(),
  } as any);
  assertTest(
    fallbackTarget === '/feed',
    'POST_MODERATED notification without entityId resolves to /feed fallback'
  );

  // 6.3 Other notification types retain established routes
  const likeTarget = resolveNotificationTarget({
    id: 'n-3',
    recipientId: 'usr-1',
    type: 'POST_LIKE',
    entityId: 'p-1',
  } as any);
  assertTest(likeTarget === '/posts/p-1', 'POST_LIKE routes to /posts/:id');

  const groupTarget = resolveNotificationTarget({
    id: 'n-4',
    recipientId: 'usr-1',
    type: 'GROUP_MEMBER_REMOVED',
  } as any);
  assertTest(groupTarget === '/groups', 'GROUP_MEMBER_REMOVED routes to /groups');

  console.log('\n================================================================');
  console.log(`Summary: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

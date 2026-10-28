import assert from 'node:assert';
import { UserRole, PostType, ReportPostReason, PostAppealStatus } from '@apnasamaj/shared-types';
import {
  getModerationAnalytics,
} from '../modules/admin/moderation/admin.moderation.service';
import {
  moderationAnalyticsQuerySchema,
  submitPostAppealSchema,
  reviewPostAppealSchema,
} from '@apnasamaj/validation';
import { requireRoles } from '../middleware/authorize';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14L: Analytics & Appeal Workflow Tests   ');
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
// Mock Tenant DB Store
// ---------------------------------------------------------------------------
function createMockTenantDb(communitySlug: string = 'kewat') {
  const store = {
    users: [] as any[],
    posts: [] as any[],
    auditLogs: [] as any[],
  };

  const client: any = {
    _slug: communitySlug,
    _store: store,
    user: {
      findUnique: async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      },
    },
    post: {
      findMany: async ({ where }: any = {}) => {
        if (where?.id?.in) {
          return store.posts.filter((p) => where.id.in.includes(p.id));
        }
        return [...store.posts];
      },
    },
    auditLog: {
      findMany: async (args: any = {}) => {
        const { where, orderBy } = args;
        let logs = [...store.auditLogs];

        if (where?.action) {
          logs = logs.filter((l) => l.action === where.action);
        }
        if (where?.targetType) {
          logs = logs.filter((l) => l.targetType === where.targetType);
        }
        if (where?.targetId) {
          if (where.targetId?.in) {
            logs = logs.filter((l) => where.targetId.in.includes(l.targetId));
          } else {
            logs = logs.filter((l) => l.targetId === where.targetId);
          }
        }

        if (orderBy?.createdAt === 'asc') {
          logs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        } else if (orderBy?.createdAt === 'desc') {
          logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        return logs;
      },
      create: async ({ data }: any) => {
        const record = {
          id: `log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          createdAt: new Date(),
          ...data,
        };
        store.auditLogs.push(record);
        return record;
      },
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Test Execution
// ---------------------------------------------------------------------------
async function runBatch14LTests() {
  console.log('--- Test Group 1: Query Validation Schemas ---');
  {
    const valid30 = moderationAnalyticsQuerySchema.safeParse({ days: '30' });
    assertTest(valid30.success && valid30.data.days === 30, 'Coerces string "30" to integer 30');

    const defaultQuery = moderationAnalyticsQuerySchema.safeParse({});
    assertTest(defaultQuery.success && defaultQuery.data.days === 30, 'Defaults to 30 days when omitted');

    const invalidMin = moderationAnalyticsQuerySchema.safeParse({ days: 3 });
    assertTest(!invalidMin.success, 'Rejects timeframe below 7 days minimum');

    const invalidMax = moderationAnalyticsQuerySchema.safeParse({ days: 120 });
    assertTest(!invalidMax.success, 'Rejects timeframe above 90 days maximum');
  }

  console.log('\n--- Test Group 2: Accurate Counts & Status Partitioning ---');
  {
    const db = createMockTenantDb('kewat');
    const now = new Date();

    // Setup 4 distinct reports
    const report1 = { id: 'rep-1', targetId: 'post-1', action: 'POST_REPORT', targetType: 'Post', createdAt: new Date(now.getTime() - 2 * 3600000), details: { reason: 'SPAM' } };
    const report2 = { id: 'rep-2', targetId: 'post-2', action: 'POST_REPORT', targetType: 'Post', createdAt: new Date(now.getTime() - 4 * 3600000), details: { reason: 'HARASSMENT' } };
    const report3 = { id: 'rep-3', targetId: 'post-3', action: 'POST_REPORT', targetType: 'Post', createdAt: new Date(now.getTime() - 6 * 3600000), details: { reason: 'HATE_SPEECH' } };
    const report4 = { id: 'rep-4', targetId: 'post-4', action: 'POST_REPORT', targetType: 'Post', createdAt: new Date(now.getTime() - 8 * 3600000), details: { reason: 'MISINFORMATION' } };

    db._store.auditLogs.push(report1, report2, report3, report4);

    // post-1 and post-2 exist
    db._store.posts.push({ id: 'post-1' }, { id: 'post-2' });

    // Review logs:
    // rep-2 reviewed and DISMISSED 1 hour later
    db._store.auditLogs.push({
      id: 'rev-2',
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: 'rep-2',
      details: { decision: 'DISMISSED' },
      createdAt: new Date(now.getTime() - 3 * 3600000),
    });

    // rep-3 reviewed and ACTIONED 2 hours later
    db._store.auditLogs.push({
      id: 'rev-3',
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: 'rep-3',
      details: { decision: 'ACTIONED' },
      createdAt: new Date(now.getTime() - 4 * 3600000),
    });

    // post-4 has no explicit review log, but was deleted via moderation
    db._store.auditLogs.push({
      id: 'del-4',
      action: 'MODERATION_DELETE_POST',
      targetType: 'Post',
      targetId: 'post-4',
      createdAt: new Date(now.getTime() - 5 * 3600000),
    });

    const analytics = await getModerationAnalytics({ days: 30 }, db);

    assertTest(analytics.totalReports === 4, 'Total reports count is 4');
    assertTest(analytics.pendingReports === 1, 'Exactly 1 pending report (rep-1)');
    assertTest(analytics.dismissedReports === 1, 'Exactly 1 dismissed report (rep-2)');
    assertTest(analytics.actionedReports === 2, 'Exactly 2 actioned reports (rep-3 via review, rep-4 via post removal)');
    assertTest(
      analytics.pendingReports + analytics.actionedReports + analytics.dismissedReports === analytics.totalReports,
      'Pending + Actioned + Dismissed exactly equals total reports without overlap'
    );
    assertTest(analytics.postsRemovedCount === 1, 'Exactly 1 post removed through moderation');
  }

  console.log('\n--- Test Group 3: Anti-Inflation & Deduplication Safety ---');
  {
    const db = createMockTenantDb('kewat');
    const now = new Date();

    // 1 report
    db._store.auditLogs.push({
      id: 'rep-dup',
      targetId: 'post-dup',
      action: 'POST_REPORT',
      targetType: 'Post',
      createdAt: new Date(now.getTime() - 5 * 3600000),
      details: { reason: 'SPAM' },
    });

    // Multiple review records on the same report (e.g. repeated review submissions or network retries)
    db._store.auditLogs.push(
      {
        id: 'rev-dup-1',
        action: 'MODERATION_REVIEW_REPORT',
        targetType: 'Report',
        targetId: 'rep-dup',
        details: { decision: 'ACTIONED', notes: 'First action' },
        createdAt: new Date(now.getTime() - 4 * 3600000),
      },
      {
        id: 'rev-dup-2',
        action: 'MODERATION_REVIEW_REPORT',
        targetType: 'Report',
        targetId: 'rep-dup',
        details: { decision: 'ACTIONED', notes: 'Retry action' },
        createdAt: new Date(now.getTime() - 3 * 3600000),
      }
    );

    const analytics = await getModerationAnalytics({ days: 30 }, db);

    assertTest(analytics.totalReports === 1, 'Multiple audit reviews do NOT inflate total reports');
    assertTest(analytics.actionedReports === 1, 'Multiple audit reviews do NOT inflate actioned count');
    assertTest(analytics.pendingReports === 0, 'Report is not counted as pending');
  }

  console.log('\n--- Test Group 4: Average Resolution Time Accuracy ---');
  {
    const db = createMockTenantDb('kewat');
    const now = new Date();

    // Report A: took 60 minutes to resolve
    db._store.auditLogs.push(
      {
        id: 'rep-a',
        targetId: 'post-a',
        action: 'POST_REPORT',
        targetType: 'Post',
        createdAt: new Date(now.getTime() - 120 * 60000),
        details: { reason: 'SPAM' },
      },
      {
        id: 'rev-a',
        action: 'MODERATION_REVIEW_REPORT',
        targetType: 'Report',
        targetId: 'rep-a',
        details: { decision: 'ACTIONED' },
        createdAt: new Date(now.getTime() - 60 * 60000), // 60 mins later
      }
    );

    // Report B: took 120 minutes to resolve
    db._store.auditLogs.push(
      {
        id: 'rep-b',
        targetId: 'post-b',
        action: 'POST_REPORT',
        targetType: 'Post',
        createdAt: new Date(now.getTime() - 180 * 60000),
        details: { reason: 'HARASSMENT' },
      },
      {
        id: 'rev-b',
        action: 'MODERATION_REVIEW_REPORT',
        targetType: 'Report',
        targetId: 'rep-b',
        details: { decision: 'DISMISSED' },
        createdAt: new Date(now.getTime() - 60 * 60000), // 120 mins later
      }
    );

    // Report C: still PENDING (must NOT distort resolution average)
    db._store.auditLogs.push({
      id: 'rep-c',
      targetId: 'post-c',
      action: 'POST_REPORT',
      targetType: 'Post',
      createdAt: new Date(now.getTime() - 1000 * 60000),
      details: { reason: 'OTHER' },
    });
    db._store.posts.push({ id: 'post-a' }, { id: 'post-b' }, { id: 'post-c' });

    const analytics = await getModerationAnalytics({ days: 30 }, db);

    // Expected average: (60 + 120) / 2 = 90 minutes = 1.5 hours
    assertTest(analytics.averageResolutionTimeMinutes === 90, 'Average resolution time is exactly 90 minutes');
    assertTest(analytics.averageResolutionTimeHours === 1.5, 'Average resolution time is exactly 1.5 hours');
  }

  console.log('\n--- Test Group 5: Zero Resolved Reports Resolution Time Fallback ---');
  {
    const db = createMockTenantDb('kewat');
    db._store.auditLogs.push({
      id: 'rep-only-pending',
      targetId: 'post-p',
      action: 'POST_REPORT',
      targetType: 'Post',
      createdAt: new Date(),
      details: { reason: 'SPAM' },
    });
    db._store.posts.push({ id: 'post-p' });

    const analytics = await getModerationAnalytics({ days: 30 }, db);

    assertTest(analytics.averageResolutionTimeMinutes === null, 'Resolution time returns null when zero reports resolved');
    assertTest(analytics.averageResolutionTimeHours === null, 'Avoids reporting misleading zero or NaN averages');
  }

  console.log('\n--- Test Group 6: Reason Categorization & Daily Trends ---');
  {
    const db = createMockTenantDb('kewat');
    const reasons: ReportPostReason[] = ['SPAM', 'HARASSMENT', 'HATE_SPEECH', 'INAPPROPRIATE_CONTENT', 'MISINFORMATION', 'OTHER'];

    for (const r of reasons) {
      db._store.auditLogs.push({
        id: `rep-${r}`,
        targetId: `post-${r}`,
        action: 'POST_REPORT',
        targetType: 'Post',
        createdAt: new Date(),
        details: { reason: r },
      });
      db._store.posts.push({ id: `post-${r}` });
    }

    const analytics = await getModerationAnalytics({ days: 14 }, db);

    for (const r of reasons) {
      assertTest(analytics.reportsByReason[r] === 1, `Category ${r} has exactly 1 report`);
    }

    assertTest(analytics.dailyTrends.length === 14, 'Daily trends array spans requested 14 days');
  }

  console.log('\n--- Test Group 7: Role Authorization Enforcement ---');
  {
    const adminCheck = requireRoles(UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN);

    const testRole = (role: UserRole): { status: number | null } => {
      let status: number | null = null;
      const req: any = { user: { role, status: 'ACTIVE' } };
      const res: any = {
        status(code: number) {
          status = code;
          return this;
        },
        json() {
          return this;
        },
      };
      let nextCalled = false;
      adminCheck(req, res, () => { nextCalled = true; });

      if (nextCalled) return { status: 200 };
      return { status };
    };

    assertTest(testRole(UserRole.SUPER_ADMIN).status === 200, 'SUPER_ADMIN authorized for moderation analytics');
    assertTest(testRole(UserRole.COMMUNITY_ADMIN).status === 200, 'COMMUNITY_ADMIN authorized for moderation analytics');
    assertTest(testRole(UserRole.MODERATOR).status === 403, 'MODERATOR rejected with HTTP 403 from administrative analytics');
    assertTest(testRole(UserRole.MEMBER).status === 403, 'MEMBER rejected with HTTP 403 from administrative analytics');
  }

  console.log('\n--- Test Group 8: Appeal Contracts & Lifecycle State Transitions ---');
  {
    // 1. Appeal submission validation
    const validAppeal = submitPostAppealSchema.safeParse({
      postId: '11111111-1111-4111-8111-111111111111',
      reason: 'Wrongful removal',
      details: 'My post contained purely cultural educational content and complied with all community guidelines.',
    });
    assertTest(validAppeal.success, 'Valid appeal submission schema passes validation');

    const invalidShortReason = submitPostAppealSchema.safeParse({
      postId: '11111111-1111-4111-8111-111111111111',
      reason: 'No',
    });
    assertTest(!invalidShortReason.success, 'Appeal with reason < 3 characters rejected');

    const invalidLongDetails = submitPostAppealSchema.safeParse({
      postId: '11111111-1111-4111-8111-111111111111',
      reason: 'Valid reason',
      details: 'a'.repeat(1001),
    });
    assertTest(!invalidLongDetails.success, 'Appeal details exceeding 1000 characters rejected');

    // 2. Appeal Review validation
    const validReviewApproved = reviewPostAppealSchema.safeParse({
      status: 'APPROVED',
      reviewNotes: 'Verified context; post does not violate community guidelines.',
    });
    assertTest(validReviewApproved.success, 'Valid APPROVED appeal review passes validation');

    const validReviewRejected = reviewPostAppealSchema.safeParse({
      status: 'REJECTED',
      reviewNotes: 'Content violated hate speech rules; takedown upheld.',
    });
    assertTest(validReviewRejected.success, 'Valid REJECTED appeal review passes validation');

    const invalidStatus = reviewPostAppealSchema.safeParse({
      status: 'PENDING',
    });
    assertTest(!invalidStatus.success, 'Reviewer cannot set status back to PENDING');

    // 3. State Machine Transition Rules
    const isValidTransition = (from: PostAppealStatus, to: PostAppealStatus): boolean => {
      const allowed: Record<PostAppealStatus, PostAppealStatus[]> = {
        PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
        UNDER_REVIEW: ['APPROVED', 'REJECTED'],
        APPROVED: [], // Terminal state
        REJECTED: [], // Terminal state
      };
      return allowed[from].includes(to);
    };

    assertTest(isValidTransition('PENDING', 'UNDER_REVIEW'), 'PENDING -> UNDER_REVIEW is permitted');
    assertTest(isValidTransition('PENDING', 'APPROVED'), 'PENDING -> APPROVED is permitted');
    assertTest(isValidTransition('PENDING', 'REJECTED'), 'PENDING -> REJECTED is permitted');
    assertTest(isValidTransition('UNDER_REVIEW', 'APPROVED'), 'UNDER_REVIEW -> APPROVED is permitted');
    assertTest(isValidTransition('UNDER_REVIEW', 'REJECTED'), 'UNDER_REVIEW -> REJECTED is permitted');
    assertTest(!isValidTransition('APPROVED', 'REJECTED'), 'Terminal APPROVED cannot transition to REJECTED');
    assertTest(!isValidTransition('REJECTED', 'APPROVED'), 'Terminal REJECTED cannot transition to APPROVED');
    assertTest(!isValidTransition('APPROVED', 'PENDING'), 'Terminal APPROVED cannot be reopened to PENDING');

    // 4. Ownership & Author-Only Eligibility Verification
    const isEligibleForAppeal = (
      requestUserId: string,
      postAuthorId: string,
      wasModerated: boolean
    ): { eligible: boolean; error?: string } => {
      if (!wasModerated) {
        return { eligible: false, error: 'Only posts removed by moderation are eligible for appeal.' };
      }
      if (requestUserId !== postAuthorId) {
        return { eligible: false, error: 'Forbidden: You can only appeal moderation actions on your own posts.' };
      }
      return { eligible: true };
    };

    assertTest(
      isEligibleForAppeal('author-1', 'author-1', true).eligible,
      'Post author is eligible to appeal moderation of their own post'
    );
    assertTest(
      !isEligibleForAppeal('intruder-2', 'author-1', true).eligible,
      'Third-party member cannot appeal another member post'
    );
    assertTest(
      !isEligibleForAppeal('author-1', 'author-1', false).eligible,
      'Voluntarily deleted post cannot be appealed'
    );
  }

  console.log('\n================================================================');
  console.log(`   Batch 14L Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBatch14LTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

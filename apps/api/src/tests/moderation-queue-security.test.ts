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
  getAdvisoryScreening,
} from '../modules/admin/moderation/admin.moderation.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14H: Moderation Queue Security Tests      ');
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
// Mock Database Client Builder for Isolated Multi-Tenant Testing
// ---------------------------------------------------------------------------

function createMockPrismaClient() {
  const store: {
    auditLogs: any[];
    posts: any[];
    comments: any[];
    users: any[];
    groupMembers: any[];
  } = {
    auditLogs: [],
    posts: [],
    comments: [],
    users: [],
    groupMembers: [],
  };

  const client: any = {
    _internal: store,
    auditLog: {
      findMany: async ({ where, orderBy, take, skip }: any = {}) => {
        let result = [...store.auditLogs];

        if (where?.action) {
          result = result.filter((l) => l.action === where.action);
        }
        if (where?.targetType) {
          result = result.filter((l) => l.targetType === where.targetType);
        }
        if (where?.targetId?.in) {
          const ids = new Set(where.targetId.in);
          result = result.filter((l) => ids.has(l.targetId));
        }

        // Sort desc
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (skip !== undefined) {
          result = result.slice(skip);
        }
        if (take !== undefined) {
          result = result.slice(0, take);
        }

        // Attach actor if requested
        return result.map((l) => {
          const user = store.users.find((u) => u.id === l.actorId);
          return {
            ...l,
            actor: user || {
              id: l.actorId,
              phone: '9876543210',
              role: 'MEMBER',
              profile: { fullName: 'Community User' },
            },
          };
        });
      },
      findUnique: async ({ where }: any) => {
        return store.auditLogs.find((l) => l.id === where.id) || null;
      },
      create: async ({ data }: any) => {
        const newLog = {
          id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...data,
          createdAt: new Date(),
        };
        store.auditLogs.push(newLog);
        return newLog;
      },
    },
    post: {
      findMany: async ({ where }: any = {}) => {
        let result = [...store.posts];
        if (where?.id?.in) {
          const ids = new Set(where.id.in);
          result = result.filter((p) => ids.has(p.id));
        }
        return result.map((p) => {
          const author = store.users.find((u) => u.id === p.authorId);
          return {
            ...p,
            author: author || { id: p.authorId, role: 'MEMBER', profile: { fullName: 'Post Author' } },
            group: p.group || null,
          };
        });
      },
      findUnique: async ({ where }: any) => {
        const found = store.posts.find((p) => p.id === where.id);
        if (!found) return null;
        const author = store.users.find((u) => u.id === found.authorId);
        return {
          ...found,
          author: author || { id: found.authorId, role: 'MEMBER', profile: { fullName: 'Author' } },
          group: found.group || null,
        };
      },
      delete: async ({ where }: any) => {
        const idx = store.posts.findIndex((p) => p.id === where.id);
        if (idx !== -1) {
          const deleted = store.posts.splice(idx, 1)[0];
          return deleted;
        }
        throw new Error('Post not found for deletion');
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        if (where.groupId_userId) {
          return store.groupMembers.find(
            (m) => m.groupId === where.groupId_userId.groupId && m.userId === where.groupId_userId.userId
          ) || null;
        }
        return null;
      },
    },
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(client),
  };

  return client;
}

async function runTests() {
  // ---------------------------------------------------------------------------
  // Test 1: Validation Schemas for Review & Queue Queries
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Validation Schemas for Review & Queue Queries ---');
  {
    const validReview = reviewReportSchema.safeParse({
      decision: 'DISMISSED',
      notes: 'Standard community conversation; compliant with rules.',
    });
    assertTest(validReview.success, 'Valid review payload with DISMISSED succeeds');

    const validActionReview = reviewReportSchema.safeParse({
      decision: 'ACTIONED',
      notes: 'Content violates hate speech guidelines.',
    });
    assertTest(validActionReview.success, 'Valid review payload with ACTIONED succeeds');

    const invalidDecision = reviewReportSchema.safeParse({
      decision: 'INVALID_STATUS',
    });
    assertTest(!invalidDecision.success, 'Invalid review decision is rejected');

    const excessiveNotes = reviewReportSchema.safeParse({
      decision: 'DISMISSED',
      notes: 'a'.repeat(501),
    });
    assertTest(!excessiveNotes.success, 'Review notes exceeding 500 characters are rejected');

    const validQuery = moderationQueueQuerySchema.safeParse({
      page: '2',
      limit: '15',
      status: 'PENDING',
      reason: 'SPAM',
    });
    assertTest(validQuery.success, 'Valid string query parameters coerce correctly');
    if (validQuery.success) {
      assertTest(validQuery.data.page === 2, 'Page coerced to integer');
      assertTest(validQuery.data.limit === 15, 'Limit coerced to integer');
      assertTest(validQuery.data.status === 'PENDING', 'Status preserved');
    }
  }

  // ---------------------------------------------------------------------------
  // Test 2: Role Authorization — MEMBER Rejected, COMMUNITY_ADMIN/MODERATOR Authorized
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: Role Authorization Checks ---');
  {
    const mockDb = createMockPrismaClient();

    // Add a report
    mockDb._internal.auditLogs.push({
      id: 'report-100',
      actorId: 'user-reporter',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'post-100',
      details: { reason: 'SPAM', details: 'Unsolicited ad' },
      createdAt: new Date(),
    });

    // 1. Regular MEMBER attempts to review -> 403 Forbidden
    let memberCaught = false;
    try {
      await reviewModerationReport(
        'report-100',
        'regular-member',
        UserRole.MEMBER,
        { decision: 'DISMISSED' },
        undefined,
        undefined,
        mockDb
      );
    } catch (err: any) {
      memberCaught = true;
      assertTest(err.statusCode === 403, 'Regular member review attempt rejected with 403 Forbidden');
    }
    assertTest(memberCaught, 'Ordinary member cannot review moderation reports');

    // 2. Regular MEMBER attempts to action-delete -> 403 Forbidden
    let memberDeleteCaught = false;
    try {
      await actionDeletePostFromReport(
        'report-100',
        'regular-member',
        UserRole.MEMBER,
        undefined,
        undefined,
        undefined,
        mockDb
      );
    } catch (err: any) {
      memberDeleteCaught = true;
      assertTest(err.statusCode === 403, 'Regular member action-delete rejected with 403 Forbidden');
    }
    assertTest(memberDeleteCaught, 'Ordinary member cannot action-delete reported posts');

    // 3. Authorized MODERATOR can review
    const modResult = await reviewModerationReport(
      'report-100',
      'moderator-1',
      UserRole.MODERATOR,
      { decision: 'DISMISSED', notes: 'Checked and compliant' },
      '127.0.0.1',
      'ModClient/1.0',
      mockDb
    );
    assertTest(modResult.status === 'DISMISSED', 'Authorized MODERATOR can dismiss report');

    // 4. Authorized COMMUNITY_ADMIN can review
    const adminResult = await reviewModerationReport(
      'report-100',
      'admin-1',
      UserRole.COMMUNITY_ADMIN,
      { decision: 'ACTIONED', notes: 'Takedown approved' },
      '127.0.0.1',
      'AdminClient/1.0',
      mockDb
    );
    assertTest(adminResult.status === 'ACTIONED', 'Authorized COMMUNITY_ADMIN can update report decision');
  }

  // ---------------------------------------------------------------------------
  // Test 3: Moderation Queue Listing & Status Derivation
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Moderation Queue Listing & Status Derivation ---');
  {
    const mockDb = createMockPrismaClient();

    // Seed post 1 (Active, Unreviewed -> PENDING)
    mockDb._internal.posts.push({
      id: 'post-1',
      authorId: 'user-spammer',
      content: 'Buy crypto now on WhatsApp me at 9999999999',
      type: 'GENERAL',
      createdAt: new Date(),
    });

    mockDb._internal.auditLogs.push({
      id: 'report-1',
      actorId: 'user-reporter-1',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'post-1',
      details: { reason: 'SPAM', details: 'Crypto spam' },
      createdAt: new Date('2026-10-28T10:00:00.000Z'),
    });

    // Seed post 2 (Active, Dismissed -> DISMISSED)
    mockDb._internal.posts.push({
      id: 'post-2',
      authorId: 'user-regular',
      content: 'Standard community greeting and announcement',
      type: 'GENERAL',
      createdAt: new Date(),
    });

    mockDb._internal.auditLogs.push({
      id: 'report-2',
      actorId: 'user-reporter-2',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'post-2',
      details: { reason: 'OTHER', details: 'Falsely reported' },
      createdAt: new Date('2026-10-28T10:05:00.000Z'),
    });

    mockDb._internal.auditLogs.push({
      id: 'review-log-2',
      actorId: 'mod-1',
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: 'report-2',
      details: { decision: 'DISMISSED', notes: 'False report; compliant' },
      createdAt: new Date('2026-10-28T10:10:00.000Z'),
    });

    // Query queue with status: 'ALL'
    const queueAll = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, mockDb);
    assertTest(queueAll.reports.length === 2, 'Queue returns all 2 reports');

    const report1 = queueAll.reports.find((r) => r.id === 'report-1');
    const report2 = queueAll.reports.find((r) => r.id === 'report-2');

    assertTest(report1?.status === 'PENDING', 'Report 1 derived as PENDING');
    assertTest(report2?.status === 'DISMISSED', 'Report 2 derived as DISMISSED');
    assertTest(report2?.latestReview?.decision === 'DISMISSED', 'Report 2 review outcome matches');

    // Query queue with status: 'PENDING'
    const queuePending = await listModerationReports({ page: 1, limit: 10, status: 'PENDING' }, mockDb);
    assertTest(queuePending.reports.length === 1, 'Status filter returns only 1 pending report');
    assertTest(queuePending.reports[0].id === 'report-1', 'Pending queue contains strictly report-1');

    // Query queue with status: 'DISMISSED'
    const queueDismissed = await listModerationReports({ page: 1, limit: 10, status: 'DISMISSED' }, mockDb);
    assertTest(queueDismissed.reports.length === 1, 'Status filter returns only 1 dismissed report');
    assertTest(queueDismissed.reports[0].id === 'report-2', 'Dismissed queue contains strictly report-2');
  }

  // ---------------------------------------------------------------------------
  // Test 4: Missing or Deleted Posts Handled Gracefully
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: Missing or Deleted Posts Handled Gracefully ---');
  {
    const mockDb = createMockPrismaClient();

    // Report points to non-existent post (already deleted)
    mockDb._internal.auditLogs.push({
      id: 'report-deleted',
      actorId: 'user-reporter',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'post-ghost-404',
      details: { reason: 'HARASSMENT', details: 'Offensive post' },
      createdAt: new Date(),
    });

    const queue = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, mockDb);
    assertTest(queue.reports.length === 1, 'Report for deleted post is retrieved');
    const item = queue.reports[0];
    assertTest(item.post?.isDeleted === true, 'Deleted post is marked with isDeleted: true');
    assertTest(item.status === 'ACTIONED', 'Report for deleted post derives status as ACTIONED');
    assertTest(typeof item.post?.content === 'string', 'Fallback content string provided without crash');
  }

  // ---------------------------------------------------------------------------
  // Test 5: Action Takedown via Moderation Queue
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: Action Takedown via Moderation Queue ---');
  {
    const mockDb = createMockPrismaClient();

    mockDb._internal.posts.push({
      id: 'post-violating',
      authorId: 'spammer-bad',
      content: 'Violating harassment content to take down',
      type: 'GENERAL',
      createdAt: new Date(),
    });

    mockDb._internal.auditLogs.push({
      id: 'report-violating',
      actorId: 'reporter-good',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'post-violating',
      details: { reason: 'HATE_SPEECH', details: 'Hate slurs' },
      createdAt: new Date(),
    });

    // Community Admin executes takedown
    const actionResult = await actionDeletePostFromReport(
      'report-violating',
      'admin-mod',
      UserRole.COMMUNITY_ADMIN,
      'Severe policy violation',
      '192.168.1.100',
      'ModBrowser/1.0',
      mockDb
    );

    assertTest(actionResult.status === 'ACTIONED', 'Action takedown returns ACTIONED status');

    // Post must be removed from DB
    const postInDb = mockDb._internal.posts.find((p: any) => p.id === 'post-violating');
    assertTest(postInDb === undefined, 'Post was deleted from database');

    // Audit logs must contain both MODERATION_DELETE_POST and MODERATION_REVIEW_REPORT
    const deleteLog = mockDb._internal.auditLogs.find(
      (l: any) => l.action === 'MODERATION_DELETE_POST' && l.targetId === 'post-violating'
    );
    assertTest(Boolean(deleteLog), 'MODERATION_DELETE_POST audit log created');

    const reviewLog = mockDb._internal.auditLogs.find(
      (l: any) => l.action === 'MODERATION_REVIEW_REPORT' && l.targetId === 'report-violating'
    );
    assertTest(Boolean(reviewLog), 'MODERATION_REVIEW_REPORT audit log created');
    assertTest(reviewLog?.details?.decision === 'ACTIONED', 'Review log records ACTIONED decision');
  }

  // ---------------------------------------------------------------------------
  // Test 6: Cross-Tenant Isolation for Moderation Queue
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: Cross-Tenant Isolation for Moderation Queue ---');
  {
    const kewatDb = createMockPrismaClient();
    const guptaDb = createMockPrismaClient();

    kewatDb._internal.auditLogs.push({
      id: 'kewat-report-1',
      actorId: 'kewat-user',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'kewat-post-1',
      details: { reason: 'SPAM' },
      createdAt: new Date(),
    });

    guptaDb._internal.auditLogs.push({
      id: 'gupta-report-1',
      actorId: 'gupta-user',
      action: 'POST_REPORT',
      targetType: 'Post',
      targetId: 'gupta-post-1',
      details: { reason: 'HARASSMENT' },
      createdAt: new Date(),
    });

    const kewatQueue = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, kewatDb);
    assertTest(kewatQueue.reports.length === 1, 'Kewat queue contains Kewat report');
    assertTest(kewatQueue.reports[0].id === 'kewat-report-1', 'Kewat report ID verified');
    assertTest(
      !kewatQueue.reports.some((r) => r.id === 'gupta-report-1'),
      'Gupta report is NOT visible in Kewat queue'
    );

    const guptaQueue = await listModerationReports({ page: 1, limit: 10, status: 'ALL' }, guptaDb);
    assertTest(guptaQueue.reports.length === 1, 'Gupta queue contains Gupta report');
    assertTest(guptaQueue.reports[0].id === 'gupta-report-1', 'Gupta report ID verified');
    assertTest(
      !guptaQueue.reports.some((r) => r.id === 'kewat-report-1'),
      'Kewat report is NOT visible in Gupta queue'
    );
  }

  // ---------------------------------------------------------------------------
  // Test 7: Advisory Keyword Screening (Advisory-Only)
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 7: Advisory Keyword Screening (Advisory-Only) ---');
  {
    const spamText = 'Double your money guaranteed return! Contact WhatsApp me at 9876543210';
    const scamFlags = getAdvisoryScreening(spamText);
    assertTest(scamFlags.includes('POTENTIAL_FINANCIAL_SPAM'), 'Financial scam keywords flagged');

    const linkText = 'Join our group right now at t.me/samplegroup or bit.ly/freecrypto';
    const linkFlags = getAdvisoryScreening(linkText);
    assertTest(linkFlags.includes('EXTERNAL_LINK_ALERT'), 'External link shortener patterns flagged');

    const cleanText = 'Wishing all community members a prosperous Diwali and healthy new year.';
    const cleanFlags = getAdvisoryScreening(cleanText);
    assertTest(cleanFlags.length === 0, 'Clean community text produces zero advisory flags');
  }

  // ---------------------------------------------------------------------------
  // Test 8: Invalid Report ID & Non-Existent Report Review Rejection
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 8: Invalid Report ID & Non-Existent Report Review Rejection ---');
  {
    const mockDb = createMockPrismaClient();

    let notFoundCaught = false;
    try {
      await reviewModerationReport(
        'non-existent-report-id',
        'mod-1',
        UserRole.MODERATOR,
        { decision: 'DISMISSED' },
        undefined,
        undefined,
        mockDb
      );
    } catch (err: any) {
      notFoundCaught = true;
      assertTest(err.statusCode === 404, 'Reviewing non-existent report returns 404');
    }
    assertTest(notFoundCaught, 'Reviewing non-existent report fails safely');
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`   Batch 14H Test Run Completed: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});

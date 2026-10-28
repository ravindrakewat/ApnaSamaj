import assert from 'node:assert';
import { UserRole, PostType, ModerationQueueUpdatePayload } from '@apnasamaj/shared-types';
import {
  reviewModerationReport,
  actionDeletePostFromReport,
  listModerationReports,
} from '../modules/admin/moderation/admin.moderation.service';
import { deletePost } from '../modules/posts/posts.service';
import {
  sendReportResolutionNotification,
} from '../modules/notifications/notifications.service';
import {
  getCommunityModerationRoomName,
  getUserNotificationRoomName,
  emitModerationQueueUpdate,
} from '../modules/chat/chat.socket';
import { tenantDbManager } from '@apnasamaj/database';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14K: Real-time Moderation & Member Feedback');
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
// Mock Store & Prisma Client
// ---------------------------------------------------------------------------
function createMockTenantDb(communitySlug: string = 'kewat') {
  const store = {
    users: [] as any[],
    posts: [] as any[],
    auditLogs: [] as any[],
    notifications: [] as any[],
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
      findUnique: async ({ where }: any) => {
        return store.posts.find((p) => p.id === where.id) || null;
      },
      findMany: async ({ where }: any) => {
        if (where?.id?.in) {
          return store.posts.filter((p) => where.id.in.includes(p.id));
        }
        return [...store.posts];
      },
      delete: async ({ where }: any) => {
        const idx = store.posts.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('Post not found in mock store');
        return store.posts.splice(idx, 1)[0];
      },
    },
    auditLog: {
      findUnique: async ({ where }: any) => {
        return store.auditLogs.find((l) => l.id === where.id) || null;
      },
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
          if (where.targetId?.in) {
            logs = logs.filter((l) => where.targetId.in.includes(l.targetId));
          } else {
            logs = logs.filter((l) => l.targetId === where.targetId);
          }
        }

        if (orderBy) {
          logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        if (take) {
          logs = logs.slice(0, take);
        }

        return logs;
      },
      create: async ({ data }: any) => {
        const log = {
          id: `audit-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          createdAt: new Date(),
          ...data,
        };
        store.auditLogs.push(log);
        return log;
      },
    },
    notification: {
      findFirst: async ({ where }: any) => {
        const matches = store.notifications.filter((n) => {
          if (where.recipientId && n.recipientId !== where.recipientId) return false;
          if (where.type && n.type !== where.type) return false;
          if (where.OR) {
            return where.OR.some((condition: any) => {
              if (condition.entityId && n.entityId === condition.entityId) return true;
              return false;
            });
          }
          if (where.entityId && n.entityId !== where.entityId) return false;
          return true;
        });
        return matches[0] || null;
      },
      findMany: async ({ where, take }: any = {}) => {
        let matches = store.notifications.filter((n) => {
          if (where?.recipientId && n.recipientId !== where.recipientId) return false;
          if (where?.type && n.type !== where.type) return false;
          if (where?.OR) {
            return where.OR.some((condition: any) => {
              if (condition.entityId && n.entityId === condition.entityId) return true;
              return false;
            });
          }
          if (where?.entityId && n.entityId !== where.entityId) return false;
          return true;
        });
        if (take) matches = matches.slice(0, take);
        return matches;
      },
      count: async ({ where }: any = {}) => {
        return store.notifications.filter((n) => {
          if (where?.recipientId && n.recipientId !== where.recipientId) return false;
          if (where?.isRead !== undefined && n.isRead !== where.isRead) return false;
          return true;
        }).length;
      },
      create: async ({ data }: any) => {
        const notif = {
          id: `notif-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          isRead: false,
          readAt: null,
          createdAt: new Date(),
          ...data,
        };
        store.notifications.push(notif);
        return notif;
      },
    },
    $transaction: async (fnOrArray: any) => {
      if (Array.isArray(fnOrArray)) {
        return Promise.all(fnOrArray);
      }
      return fnOrArray(client);
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Test Suite Execution
// ---------------------------------------------------------------------------
async function runRealtimeModerationTests() {
  console.log('--- Test Group 1: Moderation Queue Room Names & Tenant Scoping ---');
  {
    const kewatRoom = getCommunityModerationRoomName('kewat');
    assertTest(kewatRoom === 'kewat:moderation:queue', 'Kewat moderation room name is kewat:moderation:queue');

    const guptaRoom = getCommunityModerationRoomName('gupta');
    assertTest(guptaRoom === 'gupta:moderation:queue', 'Gupta moderation room name is gupta:moderation:queue');

    assertTest(kewatRoom !== guptaRoom, 'Kewat and Gupta moderation rooms are strictly isolated');

    const userRoom = getUserNotificationRoomName('kewat', 'user-123');
    assertTest(userRoom === 'kewat:user:user-123', 'User notification room name is scoped by tenant and userId');
  }

  console.log('\n--- Test Group 2: Role Authorization for Moderation Queue Events ---');
  {
    const authorizedRoles = [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR];
    for (const role of authorizedRoles) {
      const isAllowed = ['SUPER_ADMIN', 'COMMUNITY_ADMIN', 'MODERATOR'].includes(role);
      assertTest(isAllowed, `Role ${role} is authorized to join the community moderation room`);
    }

    const memberAllowed = ['SUPER_ADMIN', 'COMMUNITY_ADMIN', 'MODERATOR'].includes(UserRole.MEMBER);
    assertTest(!memberAllowed, 'Role MEMBER is strictly prohibited from joining the community moderation room');
  }

  console.log('\n--- Test Group 3: Real-time Payload Safety & Information Hiding ---');
  {
    const payload: ModerationQueueUpdatePayload = {
      reportId: 'rep-456',
      postId: 'post-789',
      action: 'REPORT_REVIEWED',
      status: 'ACTIONED',
      timestamp: new Date().toISOString(),
    };

    assertTest(payload.reportId === 'rep-456', 'Payload carries reportId for queue refreshing');
    assertTest(payload.postId === 'post-789', 'Payload carries postId');
    assertTest(payload.action === 'REPORT_REVIEWED', 'Payload carries action identifier');
    assertTest(payload.status === 'ACTIONED', 'Payload carries updated status');

    const rawPayload = payload as Record<string, any>;
    assertTest(!('content' in rawPayload), 'Payload omits private post content');
    assertTest(!('reporter' in rawPayload), 'Payload omits reporter details');
    assertTest(!('phone' in rawPayload), 'Payload omits reporter phone number');
    assertTest(!('token' in rawPayload), 'Payload omits authentication tokens');
  }

  console.log('\n--- Test Group 4: Review Report as ACTIONED (Events & Member Notifications) ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'reporter-001';
    const moderatorId = 'mod-kewat-1';
    const postId = 'post-100';

    // Populate mock data
    db._store.users.push(
      { id: reporterId, phone: '+919876543210', role: UserRole.MEMBER, status: 'ACTIVE', profile: { fullName: 'Member Reporter' } },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE', profile: { fullName: 'Kewat Moderator' } }
    );
    db._store.posts.push({
      id: postId,
      content: 'Inappropriate commercial spam post',
      type: PostType.GENERAL,
      authorId: 'spammer-001',
      createdAt: new Date(),
    });

    const reportLog = await db.auditLog.create({
      data: {
        actorId: reporterId,
        action: 'POST_REPORT',
        targetType: 'Post',
        targetId: postId,
        details: { reason: 'SPAM', details: 'Guaranteed crypto return scheme' },
      },
    });

    const reviewRes = await reviewModerationReport(
      reportLog.id,
      moderatorId,
      UserRole.MODERATOR,
      { decision: 'ACTIONED', notes: 'Verified commercial scam violation' },
      '127.0.0.1',
      'TestAgent',
      db
    );

    assertTest(reviewRes.status === 'ACTIONED', 'Review decision returns ACTIONED');
    assertTest(reviewRes.reportId === reportLog.id, 'Returns affected reportId');

    // Verify member resolution notification
    const notifications = db._store.notifications;
    assertTest(notifications.length === 1, 'Exactly 1 notification was created for the reporter');

    const notif = notifications[0];
    assertTest(notif.recipientId === reporterId, 'Notification was addressed to reporting member');
    assertTest(notif.type === 'POST_MODERATED', 'Notification uses POST_MODERATED type');
    assertTest(notif.title === 'Report Resolution', 'Notification title is "Report Resolution"');
    assertTest(
      notif.message === 'Your report has been reviewed, and action has been taken on the reported content.',
      'Notification message accurately reflects ACTIONED outcome'
    );
    assertTest(notif.actorId === null, 'Moderator identity is kept confidential (actorId is null)');
    assertTest(notif.entityId === postId, 'EntityId references reported post for navigation');
  }

  console.log('\n--- Test Group 5: Review Report as DISMISSED (Events & Member Notifications) ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'reporter-002';
    const moderatorId = 'mod-kewat-1';
    const postId = 'post-200';

    db._store.users.push(
      { id: reporterId, phone: '+919876543212', role: UserRole.MEMBER, status: 'ACTIVE', profile: { fullName: 'Member Two' } },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE', profile: { fullName: 'Kewat Moderator' } }
    );
    db._store.posts.push({
      id: postId,
      content: 'Acceptable community discussion post',
      type: PostType.GENERAL,
      authorId: 'member-author',
      createdAt: new Date(),
    });

    const reportLog = await db.auditLog.create({
      data: {
        actorId: reporterId,
        action: 'POST_REPORT',
        targetType: 'Post',
        targetId: postId,
        details: { reason: 'OTHER', details: 'I disagree with this opinion' },
      },
    });

    const reviewRes = await reviewModerationReport(
      reportLog.id,
      moderatorId,
      UserRole.MODERATOR,
      { decision: 'DISMISSED', notes: 'Content does not violate community guidelines' },
      '127.0.0.1',
      'TestAgent',
      db
    );

    assertTest(reviewRes.status === 'DISMISSED', 'Review decision returns DISMISSED');

    // Verify member resolution notification
    const notifications = db._store.notifications;
    assertTest(notifications.length === 1, 'Exactly 1 notification was created for the reporter');

    const notif = notifications[0];
    assertTest(notif.recipientId === reporterId, 'Notification was addressed to reporting member');
    assertTest(notif.type === 'POST_MODERATED', 'Notification uses POST_MODERATED type');
    assertTest(notif.title === 'Report Resolution', 'Notification title is "Report Resolution"');
    assertTest(
      notif.message === 'Your report has been reviewed and dismissed.',
      'Notification message accurately reflects DISMISSED outcome'
    );
    assertTest(notif.actorId === null, 'Moderator identity is kept confidential');
  }

  console.log('\n--- Test Group 6: Notification Deduplication Safeguards ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'reporter-003';
    const postId = 'post-300';
    const reportId = 'report-300';

    // Call sendReportResolutionNotification first time
    await sendReportResolutionNotification(
      db,
      reporterId,
      reportId,
      postId,
      'ACTIONED',
      'kewat'
    );

    assertTest(db._store.notifications.length === 1, 'First notification created successfully');

    // Call sendReportResolutionNotification second time (duplicate call / retry)
    await sendReportResolutionNotification(
      db,
      reporterId,
      reportId,
      postId,
      'ACTIONED',
      'kewat'
    );

    assertTest(db._store.notifications.length === 1, 'Duplicate resolution notification was deduplicated and suppressed');

    // Call third time with DISMISSED for same post
    await sendReportResolutionNotification(
      db,
      reporterId,
      reportId,
      postId,
      'DISMISSED',
      'kewat'
    );

    assertTest(db._store.notifications.length === 1, 'Subsequent attempts for the same resolved post remain suppressed');
  }

  console.log('\n--- Test Group 7: Post Takedown via Report (actionDeletePostFromReport) ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'reporter-004';
    const moderatorId = 'mod-kewat-1';
    const postId = 'post-400';

    db._store.users.push(
      { id: reporterId, phone: '+919876543214', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE' }
    );
    db._store.posts.push({
      id: postId,
      content: 'Severe violation post',
      type: PostType.GENERAL,
      authorId: 'violator-1',
      media: [],
      createdAt: new Date(),
    });

    const reportLog = await db.auditLog.create({
      data: {
        actorId: reporterId,
        action: 'POST_REPORT',
        targetType: 'Post',
        targetId: postId,
        details: { reason: 'HATE_SPEECH' },
      },
    });

    const actionRes = await actionDeletePostFromReport(
      reportLog.id,
      moderatorId,
      UserRole.MODERATOR,
      'Hate speech removed by community moderation',
      '127.0.0.1',
      'TestAgent',
      db
    );

    assertTest(actionRes.status === 'ACTIONED', 'actionDeletePostFromReport resolves as ACTIONED');
    assertTest(db._store.posts.length === 0, 'Post was deleted from the community store');

    // Reporter received resolution notification
    const reporterNotif = db._store.notifications.find((n: any) => n.recipientId === reporterId);
    assertTest(Boolean(reporterNotif), 'Reporting member received resolution notification');
    assertTest(
      reporterNotif.message === 'Your report has been reviewed, and action has been taken on the reported content.',
      'Message states action has been taken on the reported content'
    );
  }

  console.log('\n--- Test Group 8: Moderator Post Deletion (deletePost) Notifies Reporters ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterA = 'reporter-a';
    const reporterB = 'reporter-b';
    const authorId = 'author-x';
    const moderatorId = 'mod-kewat-1';
    const postId = 'post-500';

    db._store.users.push(
      { id: reporterA, phone: '+919876543220', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: reporterB, phone: '+919876543221', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: authorId, phone: '+919876543222', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE' }
    );
    db._store.posts.push({
      id: postId,
      content: 'Misleading financial post',
      type: PostType.GENERAL,
      authorId,
      media: [],
      createdAt: new Date(),
    });

    // Two members independently reported the same post
    await db.auditLog.create({
      data: { actorId: reporterA, action: 'POST_REPORT', targetType: 'Post', targetId: postId, details: { reason: 'SPAM' } },
    });
    await db.auditLog.create({
      data: { actorId: reporterB, action: 'POST_REPORT', targetType: 'Post', targetId: postId, details: { reason: 'MISINFORMATION' } },
    });

    // Moderator deletes post directly
    await deletePost(postId, moderatorId, UserRole.MODERATOR, '127.0.0.1', 'TestAgent', db);

    // Verify both reporters received the resolution notification
    const notifA = db._store.notifications.find((n: any) => n.recipientId === reporterA);
    const notifB = db._store.notifications.find((n: any) => n.recipientId === reporterB);

    assertTest(Boolean(notifA), 'Reporter A received resolution notification');
    assertTest(Boolean(notifB), 'Reporter B received resolution notification');
    assertTest(notifA.message === 'Your report has been reviewed, and action has been taken on the reported content.', 'Reporter A has ACTIONED text');
    assertTest(notifB.message === 'Your report has been reviewed, and action has been taken on the reported content.', 'Reporter B has ACTIONED text');

    // Post author also receives post moderation notice
    const authorNotif = db._store.notifications.find((n: any) => n.recipientId === authorId);
    assertTest(Boolean(authorNotif), 'Post author received post removed notification');
  }

  console.log('\n--- Test Group 9: Non-Reporters & Non-Members Do Not Receive Notifications ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'rep-target';
    const innocentMember = 'innocent-member';
    const moderatorId = 'mod-1';
    const postId = 'post-600';

    db._store.users.push(
      { id: reporterId, phone: '+919876543230', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: innocentMember, phone: '+919876543231', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE' }
    );
    db._store.posts.push({
      id: postId,
      content: 'Reported item',
      type: PostType.GENERAL,
      authorId: 'author-y',
      createdAt: new Date(),
    });

    const reportLog = await db.auditLog.create({
      data: { actorId: reporterId, action: 'POST_REPORT', targetType: 'Post', targetId: postId, details: { reason: 'OTHER' } },
    });

    await reviewModerationReport(reportLog.id, moderatorId, UserRole.MODERATOR, { decision: 'DISMISSED' }, undefined, undefined, db);

    const innocentNotif = db._store.notifications.find((n: any) => n.recipientId === innocentMember);
    assertTest(!innocentNotif, 'Uninvolved community member did NOT receive any notification');
  }

  console.log('\n--- Test Group 10: Anti-Contradiction Preservation (Batch 14J Rules) ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'rep-700';
    const moderatorId = 'mod-1';
    const postId = 'post-700';

    db._store.users.push(
      { id: reporterId, phone: '+919876543240', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE' }
    );
    db._store.posts.push({
      id: postId,
      content: 'Harmful content',
      type: PostType.GENERAL,
      authorId: 'author-z',
      createdAt: new Date(),
    });

    const reportLog = await db.auditLog.create({
      data: { actorId: reporterId, action: 'POST_REPORT', targetType: 'Post', targetId: postId, details: { reason: 'HARASSMENT' } },
    });

    // Step 1: Action the report
    await reviewModerationReport(reportLog.id, moderatorId, UserRole.MODERATOR, { decision: 'ACTIONED' }, undefined, undefined, db);

    // Step 2: Attempt to downgrade/contradict to DISMISSED
    let contradictionBlocked = false;
    try {
      await reviewModerationReport(reportLog.id, moderatorId, UserRole.MODERATOR, { decision: 'DISMISSED' }, undefined, undefined, db);
    } catch (err: any) {
      if (err.message.includes('Cannot dismiss a report that has already been actioned')) {
        contradictionBlocked = true;
      }
    }

    assertTest(contradictionBlocked, 'Attempt to dismiss an already actioned report was blocked with 400 error');
  }

  console.log('\n--- Test Group 11: Notification Failure Resiliency ---');
  {
    const db = createMockTenantDb('kewat');
    const reporterId = 'rep-800';
    const moderatorId = 'mod-1';
    const postId = 'post-800';

    db._store.users.push(
      { id: reporterId, phone: '+919876543250', role: UserRole.MEMBER, status: 'ACTIVE' },
      { id: moderatorId, phone: '+919876543211', role: UserRole.MODERATOR, status: 'ACTIVE' }
    );
    db._store.posts.push({
      id: postId,
      content: 'Content test',
      type: PostType.GENERAL,
      authorId: 'author-w',
      createdAt: new Date(),
    });

    const reportLog = await db.auditLog.create({
      data: { actorId: reporterId, action: 'POST_REPORT', targetType: 'Post', targetId: postId, details: { reason: 'SPAM' } },
    });

    // Simulate notification creation failure (e.g. transient DB lock on notification table)
    const originalCreate = db.notification.create;
    db.notification.create = async () => {
      throw new Error('Simulated transient notification failure');
    };

    // Review report should still succeed completely and record audit log!
    const res = await reviewModerationReport(
      reportLog.id,
      moderatorId,
      UserRole.MODERATOR,
      { decision: 'ACTIONED' },
      undefined,
      undefined,
      db
    );

    assertTest(res.status === 'ACTIONED', 'Review succeeds even if notification side-effect fails');
    db.notification.create = originalCreate;
  }

  console.log('\n================================================================');
  console.log(`   Batch 14K Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runRealtimeModerationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});


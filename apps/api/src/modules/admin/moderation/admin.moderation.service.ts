import { prisma, PrismaClient, tenantDbManager } from '@apnasamaj/database';
import { emitModerationQueueUpdate } from '../../chat/chat.socket';
import { sendReportResolutionNotification } from '../../notifications/notifications.service';
import {
  ModerationQueueItem,
  ModerationQueueResponseData,
  ReportReviewStatus,
  ReportReviewOutcome,
  ReviewReportRequest,
  ReviewReportResponseData,
  UserRole,
  PostType,
  ReportPostReason,
  ModerationAnalyticsResponseData,
  DailyModerationTrend,
} from '@apnasamaj/shared-types';
import {
  ModerationQueueQueryInput,
  ReviewReportInput,
  ModerationAnalyticsQuery,
} from '@apnasamaj/validation';
import { deletePost, PostNotFoundError, PostServiceError } from '../../posts/posts.service';

/**
 * Advisory-only keyword screening helper.
 * Flags suspicious patterns for human moderator review.
 * Does NOT classify guilt or automatically remove content.
 */
export function getAdvisoryScreening(content?: string | null): string[] {
  if (!content || typeof content !== 'string') return [];
  const flags: string[] = [];
  const text = content.toLowerCase();

  // Pattern 1: Potential spam / financial scam solicitation
  const scamKeywords = ['guaranteed return', 'double your money', 'crypto profit', 'free gift card', 'whatsapp me at', 'telegram:'];
  if (scamKeywords.some((k) => text.includes(k))) {
    flags.push('POTENTIAL_FINANCIAL_SPAM');
  }

  // Pattern 2: Suspicious shorteners / phishing patterns
  const phishingPatterns = [/bit\.ly\//i, /tinyurl\.com\//i, /t\.me\//i, /wa\.me\//i];
  if (phishingPatterns.some((pattern) => pattern.test(text))) {
    flags.push('EXTERNAL_LINK_ALERT');
  }

  // Pattern 3: Excessive repeated characters / junk text
  if (/(.)\1{9,}/.test(text)) {
    flags.push('REPEATED_CHARACTER_FLOOD');
  }

  return flags;
}

/**
 * Lists reported posts in the moderation queue for the active community tenant.
 * Derives the review status reliably from persisted AuditLog review events and post existence.
 */
export async function listModerationReports(
  query: ModerationQueueQueryInput,
  db?: PrismaClient
): Promise<ModerationQueueResponseData> {
  const client = db || prisma;
  const { page = 1, limit = 20, status = 'ALL', reason } = query;

  // 1. Fetch raw POST_REPORT audit logs in the tenant database
  const reports = await client.auditLog.findMany({
    where: {
      action: 'POST_REPORT',
      targetType: 'Post',
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      actor: {
        select: {
          id: true,
          phone: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  if (reports.length === 0) {
    return {
      reports: [],
      pagination: {
        page,
        limit,
        totalReports: 0,
        totalPages: 1,
      },
    };
  }

  // 2. Fetch associated posts in bulk to check availability and content
  const targetPostIds = Array.from(new Set(reports.map((r) => r.targetId).filter(Boolean)));
  const existingPosts = await client.post.findMany({
    where: {
      id: { in: targetPostIds },
    },
    select: {
      id: true,
      content: true,
      type: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          profile: {
            select: {
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      },
      group: {
        select: {
          id: true,
          name: true,
          privacy: true,
        },
      },
    },
  });

  const postMap = new Map(existingPosts.map((p) => [p.id, p]));

  // 3. Fetch review outcome logs for these reports
  const reportIds = reports.map((r) => r.id);
  const reviewLogs = await client.auditLog.findMany({
    where: {
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: { in: reportIds },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      actor: {
        select: {
          id: true,
          role: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  // Pick the latest review per reportId
  const latestReviewMap = new Map<string, typeof reviewLogs[0]>();
  for (const rLog of reviewLogs) {
    if (!latestReviewMap.has(rLog.targetId)) {
      latestReviewMap.set(rLog.targetId, rLog);
    }
  }

  // 4. Map and derive status for each report
  const queueItems: ModerationQueueItem[] = [];

  for (const report of reports) {
    const details = (report.details as Record<string, any>) || {};
    const reportReason = (details.reason as ReportPostReason) || 'OTHER';
    const reportNote = typeof details.details === 'string' ? details.details : null;

    // Reason filter if requested
    if (reason && reportReason !== reason) {
      continue;
    }

    const postEntity = postMap.get(report.targetId) || null;
    const isDeleted = postEntity === null;

    const latestReviewLog = latestReviewMap.get(report.id) || null;
    let reviewOutcome: ReportReviewOutcome | null = null;
    let derivedStatus: ReportReviewStatus = 'PENDING';

    if (latestReviewLog) {
      const reviewDetails = (latestReviewLog.details as Record<string, any>) || {};
      const hasActionedHistory = reviewLogs.some(
        (r) => r.targetId === report.id && (r.details as Record<string, any>)?.decision === 'ACTIONED'
      );
      const decision = hasActionedHistory
        ? 'ACTIONED'
        : reviewDetails.decision === 'DISMISSED'
          ? 'DISMISSED'
          : 'ACTIONED';
      derivedStatus = decision;
      reviewOutcome = {
        id: latestReviewLog.id,
        decision,
        notes: typeof reviewDetails.notes === 'string' ? reviewDetails.notes : null,
        moderatorId: latestReviewLog.actorId,
        moderatorRole: (latestReviewLog.actor?.role as unknown as UserRole) || UserRole.MODERATOR,
        reviewedAt: latestReviewLog.createdAt.toISOString(),
      };
    } else if (isDeleted) {
      // If the post was deleted/removed and has not been explicitly marked dismissed,
      // it has effectively been actioned/moderated.
      derivedStatus = 'ACTIONED';
    }

    // Status filter if requested
    if (status !== 'ALL' && derivedStatus !== status) {
      continue;
    }

    const advisoryFlags = getAdvisoryScreening(postEntity?.content || reportNote);

    queueItems.push({
      id: report.id,
      postId: report.targetId,
      reason: reportReason,
      details: reportNote,
      createdAt: report.createdAt.toISOString(),
      status: derivedStatus,
      advisoryFlags,
      reporter: {
        id: report.actorId,
        phone: report.actor?.phone || '',
        fullName: report.actor?.profile?.fullName || 'Community Member',
      },
      post: postEntity
        ? {
          id: postEntity.id,
          content: postEntity.content,
          type: postEntity.type as unknown as PostType,
          createdAt: postEntity.createdAt.toISOString(),
          isDeleted: false,
          author: postEntity.author
            ? {
              id: postEntity.author.id,
              fullName: postEntity.author.profile?.fullName || 'Community Member',
              avatarUrl: postEntity.author.profile?.avatarUrl || null,
            }
            : null,
          group: postEntity.group
            ? {
              id: postEntity.group.id,
              name: postEntity.group.name,
              privacy: postEntity.group.privacy as 'PUBLIC' | 'PRIVATE',
            }
            : null,
        }
        : {
          id: report.targetId,
          content: '[Content removed or unavailable]',
          type: 'GENERAL' as PostType,
          createdAt: report.createdAt.toISOString(),
          isDeleted: true,
          author: null,
          group: null,
        },
      latestReview: reviewOutcome,
    });
  }

  // 5. Pagination
  const totalReports = queueItems.length;
  const totalPages = Math.ceil(totalReports / limit) || 1;
  const skip = (page - 1) * limit;
  const paginatedReports = queueItems.slice(skip, skip + limit);

  return {
    reports: paginatedReports,
    pagination: {
      page,
      limit,
      totalReports,
      totalPages,
    },
  };
}

/**
 * Reviews a report and records the outcome durably in AuditLog (action: 'MODERATION_REVIEW_REPORT').
 * Idempotent: repeated identical decisions update review notes without state corruption.
 */
export async function reviewModerationReport(
  reportId: string,
  moderatorId: string,
  moderatorRole: UserRole,
  input: ReviewReportInput,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<ReviewReportResponseData> {
  const client = db || prisma;

  const isModerator = [
    UserRole.SUPER_ADMIN,
    UserRole.COMMUNITY_ADMIN,
    UserRole.MODERATOR,
  ].includes(moderatorRole);

  if (!isModerator) {
    throw new PostServiceError('Forbidden: Only authorized moderators can review reports.', 403);
  }

  // 1. Locate the report audit log in the tenant database
  const report = await client.auditLog.findUnique({
    where: { id: reportId },
  });

  if (!report || report.action !== 'POST_REPORT') {
    throw new PostNotFoundError('Report not found in community records.');
  }

  // 2. Prevent contradiction of historical moderation actions:
  // If the report was already actioned (post taken down or decision marked ACTIONED),
  // it cannot be downgraded or dismissed.
  const existingReviews = await client.auditLog.findMany({
    where: {
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: reportId,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  const hasBeenActioned = existingReviews.some((r) => {
    const d = (r.details as Record<string, any>) || {};
    return d.decision === 'ACTIONED';
  });

  const postDeletionLogs = await client.auditLog.findMany({
    where: {
      action: 'MODERATION_DELETE_POST',
      targetType: 'Post',
      targetId: report.targetId,
    },
    take: 1,
  });
  const postDeletionLog = postDeletionLogs[0] || null;

  if ((hasBeenActioned || Boolean(postDeletionLog)) && input.decision === 'DISMISSED') {
    throw new PostServiceError(
      'Cannot dismiss a report that has already been actioned by community moderation.',
      400
    );
  }

  // 3. Persist the review decision in AuditLog atomically
  const reviewLog = await client.auditLog.create({
    data: {
      actorId: moderatorId,
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: reportId,
      details: {
        decision: input.decision,
        notes: input.notes ? input.notes.trim() : null,
        postId: report.targetId,
        moderatorRole,
      },
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });

  // 4. Real-time broadcast to authorized community moderators
  try {
    const tenantSlug = tenantDbManager.getCommunitySlugForClient(client);
    if (tenantSlug) {
      emitModerationQueueUpdate(tenantSlug, {
        reportId,
        postId: report.targetId,
        action: 'REPORT_REVIEWED',
        status: input.decision,
        timestamp: reviewLog.createdAt.toISOString(),
      });
    }
  } catch (emitErr) {
    console.warn('[Moderation Service] Real-time queue update emission failed:', emitErr);
  }

  // 5. Send member-facing report resolution notification to the reporter
  if (report.actorId) {
    try {
      const tenantSlug = tenantDbManager.getCommunitySlugForClient(client);
      await sendReportResolutionNotification(
        client,
        report.actorId,
        report.id,
        report.targetId,
        input.decision,
        tenantSlug || undefined
      );
    } catch (notifyErr) {
      console.warn('[Moderation Service] Report resolution notification failed:', notifyErr);
    }
  }

  const status: ReportReviewStatus = input.decision;

  return {
    message: `Report has been successfully ${input.decision.toLowerCase()}.`,
    reportId,
    status,
    review: {
      id: reviewLog.id,
      decision: input.decision,
      notes: input.notes ? input.notes.trim() : null,
      moderatorId,
      moderatorRole,
      reviewedAt: reviewLog.createdAt.toISOString(),
    },
  };
}

/**
 * Executes a moderation takedown on a reported post:
 * 1. Safely deletes the post and records MODERATION_DELETE_POST.
 * 2. Records MODERATION_REVIEW_REPORT with decision 'ACTIONED'.
 */
export async function actionDeletePostFromReport(
  reportId: string,
  moderatorId: string,
  moderatorRole: UserRole,
  notes?: string,
  ipAddress?: string,
  userAgent?: string,
  db?: PrismaClient
): Promise<ReviewReportResponseData> {
  const client = db || prisma;

  const isModerator = [
    UserRole.SUPER_ADMIN,
    UserRole.COMMUNITY_ADMIN,
    UserRole.MODERATOR,
  ].includes(moderatorRole);

  if (!isModerator) {
    throw new PostServiceError('Forbidden: Only authorized moderators can take moderation actions.', 403);
  }

  const report = await client.auditLog.findUnique({
    where: { id: reportId },
  });

  if (!report || report.action !== 'POST_REPORT') {
    throw new PostNotFoundError('Report not found in community records.');
  }

  const postId = report.targetId;

  // Attempt to delete post if it still exists
  try {
    await deletePost(postId, moderatorId, moderatorRole, ipAddress, userAgent, client);
  } catch (err: unknown) {
    // If already deleted by author or another moderator, do not fail - record actioned review
    if (!(err instanceof PostNotFoundError)) {
      throw err;
    }
  }

  // Record review outcome as ACTIONED
  const reviewLog = await client.auditLog.create({
    data: {
      actorId: moderatorId,
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: reportId,
      details: {
        decision: 'ACTIONED',
        notes: notes ? notes.trim() : 'Post removed by community moderation.',
        postId,
        moderatorRole,
      },
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
    },
  });

  // Real-time broadcast to authorized community moderators
  try {
    const tenantSlug = tenantDbManager.getCommunitySlugForClient(client);
    if (tenantSlug) {
      emitModerationQueueUpdate(tenantSlug, {
        reportId,
        postId,
        action: 'REPORT_REVIEWED',
        status: 'ACTIONED',
        timestamp: reviewLog.createdAt.toISOString(),
      });
    }
  } catch (emitErr) {
    console.warn('[Moderation Service] Real-time queue update emission failed:', emitErr);
  }

  // Send member-facing report resolution notification to the reporter
  if (report.actorId) {
    try {
      const tenantSlug = tenantDbManager.getCommunitySlugForClient(client);
      await sendReportResolutionNotification(
        client,
        report.actorId,
        report.id,
        postId,
        'ACTIONED',
        tenantSlug || undefined
      );
    } catch (notifyErr) {
      console.warn('[Moderation Service] Report resolution notification failed:', notifyErr);
    }
  }

  return {
    message: 'Reported post has been successfully removed and report marked as actioned.',
    reportId,
    status: 'ACTIONED',
    review: {
      id: reviewLog.id,
      decision: 'ACTIONED',
      notes: notes ? notes.trim() : 'Post removed by community moderation.',
      moderatorId,
      moderatorRole,
      reviewedAt: reviewLog.createdAt.toISOString(),
    },
  };
}

/**
 * Computes community-scoped moderation analytics and daily trends.
 * Accurately derives report statuses without double-counting and excludes unresolved reports from duration averages.
 */
export async function getModerationAnalytics(
  query: ModerationAnalyticsQuery = { days: 30 },
  db?: PrismaClient
): Promise<ModerationAnalyticsResponseData> {
  const client = db || prisma;
  const days = Math.min(Math.max(query.days || 30, 7), 90);

  // 1. Fetch all raw POST_REPORT audit logs in the tenant database
  const reports = await client.auditLog.findMany({
    where: {
      action: 'POST_REPORT',
      targetType: 'Post',
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalReports = reports.length;

  // 2. Fetch associated posts in bulk to check existence
  const targetPostIds = Array.from(new Set(reports.map((r) => r.targetId).filter(Boolean)));
  const existingPosts = await client.post.findMany({
    where: { id: { in: targetPostIds } },
    select: { id: true },
  });
  const existingPostSet = new Set(existingPosts.map((p) => p.id));

  // 3. Fetch review outcome logs for these reports
  const reportIds = reports.map((r) => r.id);
  const reviewLogs = await client.auditLog.findMany({
    where: {
      action: 'MODERATION_REVIEW_REPORT',
      targetType: 'Report',
      targetId: { in: reportIds },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group reviews by reportId
  const reviewsByReport = new Map<string, typeof reviewLogs>();
  for (const rLog of reviewLogs) {
    const list = reviewsByReport.get(rLog.targetId) || [];
    list.push(rLog);
    reviewsByReport.set(rLog.targetId, list);
  }

  // 4. Fetch post deletion logs
  const postDeletionLogs = await client.auditLog.findMany({
    where: {
      action: 'MODERATION_DELETE_POST',
      targetType: 'Post',
    },
    select: {
      targetId: true,
      createdAt: true,
    },
  });

  const deletionLogMap = new Map<string, Date>();
  for (const del of postDeletionLogs) {
    if (!deletionLogMap.has(del.targetId)) {
      deletionLogMap.set(del.targetId, del.createdAt);
    }
  }

  // 5. Initialize counters and metrics
  let pendingReports = 0;
  let actionedReports = 0;
  let dismissedReports = 0;

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  let reportsLast7Days = 0;
  let reportsLast30Days = 0;

  const reportsByReason: Record<ReportPostReason, number> = {
    SPAM: 0,
    HARASSMENT: 0,
    HATE_SPEECH: 0,
    INAPPROPRIATE_CONTENT: 0,
    MISINFORMATION: 0,
    OTHER: 0,
  };

  const resolutionTimesMs: number[] = [];

  // Daily trend buckets
  const dailyTrendMap = new Map<string, { received: number; resolved: number; actioned: number; dismissed: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateKey = d.toISOString().split('T')[0];
    dailyTrendMap.set(dateKey, { received: 0, resolved: 0, actioned: 0, dismissed: 0 });
  }

  // 6. Process each report deterministically without double counting
  for (const report of reports) {
    const reportCreatedAt = new Date(report.createdAt);
    const reportDateKey = reportCreatedAt.toISOString().split('T')[0];

    // Date range counters
    if (reportCreatedAt >= sevenDaysAgo) reportsLast7Days++;
    if (reportCreatedAt >= thirtyDaysAgo) reportsLast30Days++;

    // Daily received bucket
    if (dailyTrendMap.has(reportDateKey)) {
      dailyTrendMap.get(reportDateKey)!.received++;
    }

    // Reason tally
    const details = (report.details as Record<string, any>) || {};
    const reasonKey = (details.reason as ReportPostReason) || 'OTHER';
    if (reasonKey in reportsByReason) {
      reportsByReason[reasonKey]++;
    } else {
      reportsByReason.OTHER++;
    }

    // Status & Resolution Time
    const rReviews = reviewsByReport.get(report.id) || [];
    const isDeleted = !existingPostSet.has(report.targetId);
    const hasActioned = rReviews.some((r) => (r.details as Record<string, any>)?.decision === 'ACTIONED') ||
      deletionLogMap.has(report.targetId) ||
      isDeleted;

    let derivedStatus: 'PENDING' | 'ACTIONED' | 'DISMISSED' = 'PENDING';
    let resolvedAt: Date | null = null;

    if (hasActioned) {
      derivedStatus = 'ACTIONED';
      actionedReports++;
      const actionReview = rReviews.find((r) => (r.details as Record<string, any>)?.decision === 'ACTIONED');
      if (actionReview) {
        resolvedAt = new Date(actionReview.createdAt);
      } else if (deletionLogMap.has(report.targetId)) {
        resolvedAt = deletionLogMap.get(report.targetId)!;
      } else {
        resolvedAt = reportCreatedAt;
      }
    } else if (rReviews.length > 0 && (rReviews[rReviews.length - 1].details as Record<string, any>)?.decision === 'DISMISSED') {
      derivedStatus = 'DISMISSED';
      dismissedReports++;
      resolvedAt = new Date(rReviews[rReviews.length - 1].createdAt);
    } else {
      pendingReports++;
    }

    // Calculate resolution duration for resolved reports
    if (derivedStatus !== 'PENDING' && resolvedAt) {
      const diffMs = Math.max(0, resolvedAt.getTime() - reportCreatedAt.getTime());
      resolutionTimesMs.push(diffMs);

      const resolvedDateKey = resolvedAt.toISOString().split('T')[0];
      if (dailyTrendMap.has(resolvedDateKey)) {
        const bucket = dailyTrendMap.get(resolvedDateKey)!;
        bucket.resolved++;
        if (derivedStatus === 'ACTIONED') {
          bucket.actioned++;
        } else {
          bucket.dismissed++;
        }
      }
    }
  }

  // 7. Average resolution time calculation (excluding unresolved reports)
  let averageResolutionTimeMinutes: number | null = null;
  let averageResolutionTimeHours: number | null = null;
  if (resolutionTimesMs.length > 0) {
    const totalMs = resolutionTimesMs.reduce((acc, curr) => acc + curr, 0);
    const avgMs = totalMs / resolutionTimesMs.length;
    averageResolutionTimeMinutes = Math.round((avgMs / (1000 * 60)) * 10) / 10;
    averageResolutionTimeHours = Math.round((avgMs / (1000 * 60 * 60)) * 10) / 10;
  }

  // 8. Convert daily trends map to ordered array
  const dailyTrends: DailyModerationTrend[] = Array.from(dailyTrendMap.entries()).map(([date, data]) => ({
    date,
    received: data.received,
    resolved: data.resolved,
    actioned: data.actioned,
    dismissed: data.dismissed,
  }));

  const postsRemovedCount = postDeletionLogs.length;

  return {
    totalReports,
    pendingReports,
    actionedReports,
    dismissedReports,
    reportsLast7Days,
    reportsLast30Days,
    averageResolutionTimeMinutes,
    averageResolutionTimeHours,
    reportsByReason,
    dailyTrends,
    postsRemovedCount,
  };
}

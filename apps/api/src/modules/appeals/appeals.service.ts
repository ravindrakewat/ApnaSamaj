import { PrismaClient, tenantDbManager } from '@apnasamaj/database';
import {
  PostAppealItem,
  PostAppealsListResponseData,
  PostAppealStatus,
  UserRole,
} from '@apnasamaj/shared-types';
import {
  SubmitPostAppealInput,
  ReviewPostAppealInput,
} from '@apnasamaj/validation';
import { PostNotFoundError, PostServiceError } from '../posts/posts.service';
import { sendNotificationSafely } from '../notifications/notifications.service';

/**
 * Submits an appeal for a post that was taken down by community moderation.
 * 
 * Strict Verification:
 * 1. Requires explicit tenant database client (fails closed if missing).
 * 2. Checks that an audit record of type MODERATION_DELETE_POST exists for this postId.
 * 3. Asserts that the original postAuthorId matches the authenticated member.
 * 4. Prevents duplicate active appeals (PENDING or UNDER_REVIEW) for the same post.
 * 5. Dispatches a confirmation notification to the member without exposing internal notes.
 */
export async function submitPostAppeal(
  userId: string,
  input: SubmitPostAppealInput,
  db?: PrismaClient
): Promise<PostAppealItem> {
  if (!db) {
    throw new PostServiceError('Community database context is required for appeals.', 400);
  }
  const client = db;

  // 1. Verify eligibility: Locate the moderation deletion audit log for this post
  const deletionLogs = await client.auditLog.findMany({
    where: {
      action: 'MODERATION_DELETE_POST',
      targetType: 'Post',
      targetId: input.postId,
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  const deletionLog = deletionLogs[0];
  if (!deletionLog) {
    throw new PostNotFoundError(
      'No record of moderation removal found for this post. Only posts removed by community moderation can be appealed.'
    );
  }

  // 2. Author verification: Only the original post author can appeal
  const postAuthorId = (deletionLog.details as Record<string, any>)?.postAuthorId;
  if (!postAuthorId || postAuthorId !== userId) {
    throw new PostServiceError(
      'Forbidden: You can only appeal moderation actions on your own posts.',
      403
    );
  }

  // 3. Duplicate check: Reject if an active appeal already exists for this post
  const activeAppeal = await client.postAppeal.findFirst({
    where: {
      postId: input.postId,
      status: { in: ['PENDING', 'UNDER_REVIEW'] },
    },
  });

  if (activeAppeal) {
    throw new PostServiceError(
      'An active appeal for this post is already pending review.',
      409
    );
  }

  // 4. Create appeal record in tenant database
  let appeal: any;
  try {
    appeal = await client.postAppeal.create({
      data: {
        postId: input.postId,
        authorId: userId,
        reason: input.reason.trim(),
        details: input.details ? input.details.trim() : null,
        status: 'PENDING',
      },
    });
  } catch (err: any) {
    // Catch PostgreSQL partial unique violation (23505) or Prisma P2002
    if (err.code === 'P2002' || err.message?.includes('post_appeals_active_unique_idx') || err.code === '23505') {
      throw new PostServiceError(
        'An active appeal for this post is already pending review.',
        409
      );
    }
    throw err;
  }

  // 5. Record appeal submission in AuditLog
  try {
    await client.auditLog.create({
      data: {
        actorId: userId,
        action: 'APPEAL_SUBMITTED',
        targetType: 'PostAppeal',
        targetId: appeal.id,
        details: {
          postId: input.postId,
          reason: input.reason.trim(),
        },
      },
    });
  } catch (auditErr) {
    console.warn('[Appeals Service] Non-blocking audit log creation failed:', auditErr);
  }

  // 6. Safe confirmation notification to author
  try {
    const tenantSlug = tenantDbManager.getCommunitySlugForClient(client);
    await sendNotificationSafely(
      {
        recipientId: userId,
        actorId: null, // Keep system/moderation notification impersonal
        type: 'POST_MODERATED',
        title: 'Appeal Submitted',
        message: 'Your appeal for the removed post has been submitted and is pending review by community moderation.',
        entityType: 'POST',
        entityId: input.postId,
        tenantSlug: tenantSlug || undefined,
      },
      client
    );
  } catch (notifErr) {
    console.warn('[Appeals Service] Confirmation notification dispatch failed:', notifErr);
  }

  // Return member-safe response (omits reviewNotes & moderatorId)
  return {
    id: appeal.id,
    postId: appeal.postId,
    authorId: appeal.authorId,
    reason: appeal.reason,
    details: appeal.details,
    status: appeal.status as PostAppealStatus,
    createdAt: appeal.createdAt instanceof Date ? appeal.createdAt.toISOString() : appeal.createdAt,
    updatedAt: appeal.updatedAt instanceof Date ? appeal.updatedAt.toISOString() : appeal.updatedAt,
    reviewedAt: null,
  };
}

/**
 * Lists appeals belonging strictly to the authenticated member.
 * Omits internal reviewNotes and moderator identities.
 */
export async function getMemberAppeals(
  userId: string,
  query: { page?: number; limit?: number } = {},
  db?: PrismaClient
): Promise<PostAppealsListResponseData> {
  if (!db) {
    throw new PostServiceError('Community database context is required for appeals.', 400);
  }
  const client = db;
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 10));
  const skip = (page - 1) * limit;

  const where = { authorId: userId };

  const [total, rawAppeals] = await Promise.all([
    client.postAppeal.count({ where }),
    client.postAppeal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const appeals: PostAppealItem[] = rawAppeals.map((a: any) => ({
    id: a.id,
    postId: a.postId,
    authorId: a.authorId,
    reason: a.reason,
    details: a.details,
    status: a.status as PostAppealStatus,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
    reviewedAt: a.reviewedAt ? (a.reviewedAt instanceof Date ? a.reviewedAt.toISOString() : a.reviewedAt) : null,
  }));

  return { appeals, total };
}

/**
 * Lists appeals across the community for authorized administrators and moderators.
 * Includes author profile and reviewNotes for administrative context.
 */
export async function listCommunityAppeals(
  query: { page?: number; limit?: number; status?: PostAppealStatus | 'ALL' } = {},
  db?: PrismaClient
): Promise<PostAppealsListResponseData> {
  if (!db) {
    throw new PostServiceError('Community database context is required for appeals.', 400);
  }
  const client = db;
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(50, Math.max(1, query.limit || 10));
  const skip = (page - 1) * limit;

  const where = query.status && query.status !== 'ALL'
    ? { status: query.status as any }
    : {};

  const [total, rawAppeals] = await Promise.all([
    client.postAppeal.count({ where }),
    client.postAppeal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: {
            id: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const appeals: PostAppealItem[] = rawAppeals.map((a: any) => ({
    id: a.id,
    postId: a.postId,
    authorId: a.authorId,
    authorName: a.author?.profile?.fullName || (a.authorId ? 'Community Member' : 'Deleted Member'),
    reason: a.reason,
    details: a.details,
    status: a.status as PostAppealStatus,
    moderatorId: a.moderatorId,
    reviewNotes: a.reviewNotes,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    updatedAt: a.updatedAt instanceof Date ? a.updatedAt.toISOString() : a.updatedAt,
    reviewedAt: a.reviewedAt ? (a.reviewedAt instanceof Date ? a.reviewedAt.toISOString() : a.reviewedAt) : null,
  }));

  return { appeals, total };
}

/**
 * Reviews a member's appeal with atomic conditional concurrency protection,
 * state machine validation, self-review prohibition, and confidential member notification.
 */
export async function reviewAppeal(
  appealId: string,
  reviewerId: string,
  reviewerRole: UserRole,
  input: ReviewPostAppealInput,
  db?: PrismaClient
): Promise<PostAppealItem> {
  if (!db) {
    throw new PostServiceError('Community database context is required for appeals.', 400);
  }
  const client = db;

  const isFinalDecision = input.status === 'APPROVED' || input.status === 'REJECTED';
  const now = new Date();

  const allowedTransitions: Record<string, string[]> = {
    PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  };

  let targetAuthorId: string | null = null;
  let targetPostId: string = '';
  let updatedRecord: any = null;

  // Transaction block ensuring atomic verification and update
  const executeReviewTransaction = async (tx: any) => {
    // 1. Fetch current appeal state
    const appeal = await tx.postAppeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal) {
      throw new PostNotFoundError('Appeal record not found in community database.');
    }

    targetAuthorId = appeal.authorId;
    targetPostId = appeal.postId;

    // 2. Prohibit self-review: A moderator cannot review their own appeal
    if (appeal.authorId && appeal.authorId === reviewerId) {
      throw new PostServiceError(
        'Forbidden: Reviewers cannot review their own appeals.',
        403
      );
    }

    // 3. Finality guard: Cannot review an already finalized appeal
    if (appeal.status === 'APPROVED' || appeal.status === 'REJECTED') {
      throw new PostServiceError(
        'Cannot review an appeal that has already been finalized.',
        400
      );
    }

    // 4. State machine validation
    if (!allowedTransitions[appeal.status]?.includes(input.status)) {
      throw new PostServiceError(
        `Invalid appeal status transition from ${appeal.status} to ${input.status}.`,
        400
      );
    }

    // 5. ATOMIC CONDITIONAL UPDATE:
    // Guarantees that only ONE competing concurrent request succeeds by matching expected status
    const updateResult = await tx.postAppeal.updateMany({
      where: {
        id: appealId,
        status: appeal.status, // Must strictly match the state we verified
      },
      data: {
        status: input.status as any,
        moderatorId: reviewerId,
        reviewNotes: input.reviewNotes ? input.reviewNotes.trim() : null,
        reviewedAt: isFinalDecision ? now : null,
      },
    });

    if (updateResult.count === 0) {
      // Another competing reviewer modified or finalized the appeal between read and update
      throw new PostServiceError(
        'Conflict: This appeal has already been modified or finalized by another reviewer.',
        409
      );
    }

    // 6. Record review action in AuditLog within the same atomic transaction
    await tx.auditLog.create({
      data: {
        actorId: reviewerId,
        action: 'MODERATION_REVIEW_APPEAL',
        targetType: 'PostAppeal',
        targetId: appeal.id,
        details: {
          previousStatus: appeal.status,
          newStatus: input.status,
          postId: appeal.postId,
          moderatorRole: reviewerRole,
          notes: input.reviewNotes ? input.reviewNotes.trim() : null,
        },
      },
    });

    // 7. Load or construct updated appeal record
    const reloaded = await tx.postAppeal.findUnique({
      where: { id: appealId },
    });

    return reloaded || {
      ...appeal,
      status: input.status,
      moderatorId: reviewerId,
      reviewNotes: input.reviewNotes ? input.reviewNotes.trim() : null,
      reviewedAt: isFinalDecision ? now : null,
      updatedAt: now,
    };
  };

  // Run in client.$transaction when available, or directly on mock client
  if (typeof client.$transaction === 'function') {
    updatedRecord = await client.$transaction(executeReviewTransaction);
  } else {
    updatedRecord = await executeReviewTransaction(client);
  }

  // 8. AFTER TRANSACTION SUCCEEDS: Member notification on final decision (strictly concealing reviewNotes)
  if (isFinalDecision && targetAuthorId) {
    try {
      const tenantSlug = tenantDbManager.getCommunitySlugForClient(client);
      const isApproved = input.status === 'APPROVED';
      const title = isApproved ? 'Appeal Approved' : 'Appeal Rejected';
      const message = isApproved
        ? 'Your appeal for the removed post has been approved by community moderation.'
        : 'Your appeal for the removed post has been reviewed and rejected by community moderation.';

      await sendNotificationSafely(
        {
          recipientId: targetAuthorId,
          actorId: null, // Keep reviewing administrator identity confidential
          type: 'POST_MODERATED',
          title,
          message,
          entityType: 'POST',
          entityId: targetPostId,
          tenantSlug: tenantSlug || undefined,
        },
        client
      );
    } catch (notifErr) {
      console.warn('[Appeals Service] Decision notification delivery failed:', notifErr);
    }
  }

  return {
    id: updatedRecord.id,
    postId: updatedRecord.postId,
    authorId: updatedRecord.authorId,
    reason: updatedRecord.reason,
    details: updatedRecord.details,
    status: updatedRecord.status as PostAppealStatus,
    moderatorId: updatedRecord.moderatorId,
    reviewNotes: updatedRecord.reviewNotes,
    createdAt: updatedRecord.createdAt instanceof Date ? updatedRecord.createdAt.toISOString() : updatedRecord.createdAt,
    updatedAt: updatedRecord.updatedAt instanceof Date ? updatedRecord.updatedAt.toISOString() : updatedRecord.updatedAt,
    reviewedAt: updatedRecord.reviewedAt ? (updatedRecord.reviewedAt instanceof Date ? updatedRecord.reviewedAt.toISOString() : updatedRecord.reviewedAt) : null,
  };
}

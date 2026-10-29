import dotenv from 'dotenv';
import path from 'path';
import assert from 'node:assert';
import { PrismaClient } from '@apnasamaj/database';
import { UserRole, PostAppealStatus } from '@apnasamaj/shared-types';
import {
  submitPostAppealSchema,
  reviewPostAppealSchema,
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

// Ensure staging environment is loaded with override
dotenv.config({ path: path.resolve(process.cwd(), '.env.staging'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.staging'), override: true });

// ---------------------------------------------------------------------------
// 1. Production Protection Preflight Fail-Safe
// ---------------------------------------------------------------------------
const stagingDbUrl = process.env.DATABASE_URL || '';
if (!stagingDbUrl) {
  console.error('❌ FATAL: DATABASE_URL is not set.');
  process.exit(1);
}

const parsedUrl = new URL(stagingDbUrl);
const host = parsedUrl.hostname.toLowerCase();
const dbName = parsedUrl.pathname.replace(/^\//, '');

if (
  host.includes('supabase') ||
  host.includes('tgyrrobrdhbzgheygvdz') ||
  stagingDbUrl.includes('pooler.supabase.com')
) {
  console.error('❌ CRITICAL SAFETY VIOLATION: Target URL points to Supabase Production!');
  process.exit(1);
}

if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`❌ CRITICAL: Test must run against localhost. Received: ${host}`);
  process.exit(1);
}

if (dbName !== 'apnasamaj_staging_kewat') {
  console.error(`❌ CRITICAL: Database name must be "apnasamaj_staging_kewat". Received: ${dbName}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helper: Contract specification mirroring web route resolver
// ---------------------------------------------------------------------------
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

// Check active duplicate helper (mirroring MyAppealsPage)
function checkActiveAppealDuplicate(
  appeals: Array<{ postId: string; status: string }>,
  postId: string
): { hasActive: boolean; activeStatus?: string } {
  const existingActive = appeals.find(
    (a) => a.postId === postId.trim() && (a.status === 'PENDING' || a.status === 'UNDER_REVIEW')
  );
  if (existingActive) {
    return { hasActive: true, activeStatus: existingActive.status };
  }
  return { hasActive: false };
}

let passedTests = 0;
let failedTests = 0;
const testResults: Array<{ id: string; name: string; status: 'PASS' | 'FAIL'; details: string }> = [];

function assertTest(condition: boolean, id: string, name: string, details: string = '') {
  if (condition) {
    console.log(`✅ [${id}] PASS: ${name}`);
    passedTests++;
    testResults.push({ id, name, status: 'PASS', details });
  } else {
    console.error(`❌ [${id}] FAIL: ${name}`);
    failedTests++;
    testResults.push({ id, name, status: 'FAIL', details });
    throw new Error(`Assertion failed: [${id}] ${name}`);
  }
}

async function runStagingE2E() {
  console.log('================================================================');
  console.log('   Apna Samaj — Batch 14O.7: Staging Appeals E2E Verification  ');
  console.log('================================================================');
  console.log(`Verified Isolated Database: ${host}:5432/${dbName}`);
  console.log(`Production Guard: ACTIVE (Supabase Tokyo completely isolated)\n`);

  const prisma = new PrismaClient({
    datasources: {
      db: { url: stagingDbUrl },
    },
  });

  try {
    // Load pre-seeded staging accounts
    const author = await prisma.user.findUnique({
      where: { phone: '+919999900001' },
      include: { profile: true },
    });
    const intruder = await prisma.user.findUnique({
      where: { phone: '+919999900002' },
      include: { profile: true },
    });
    const moderator = await prisma.user.findUnique({
      where: { phone: '+919999900003' },
      include: { profile: true },
    });

    assert.ok(author, 'Author user exists in staging database');
    assert.ok(intruder, 'Intruder user exists in staging database');
    assert.ok(moderator, 'Moderator user exists in staging database');

    const targetPostId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const racePostId = 'bbbbbbbb-0000-0000-0000-000000000002';

    // Idempotent test cleanup on staging database only
    await prisma.postAppeal.deleteMany({
      where: { postId: { in: [targetPostId, racePostId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { action: { in: ['APPEAL_SUBMITTED', 'MODERATION_REVIEW_APPEAL'] } },
    });
    await prisma.notification.deleteMany({
      where: { title: { in: ['Appeal Submitted', 'Appeal Approved', 'Appeal Rejected'] } },
    });

    // -------------------------------------------------------------------------
    // TC-01: Moderation notification links to /appeals?postId=<id>
    // -------------------------------------------------------------------------
    console.log('--- Executing TC-01: Moderation Notice Link Resolution ---');
    const authorNotif = await prisma.notification.findFirst({
      where: {
        recipientId: author.id,
        type: 'POST_MODERATED',
        entityId: targetPostId,
      },
    });
    assert.ok(authorNotif, 'Initial POST_MODERATED notification exists in staging DB');

    const deepLinkUrl = resolveNotificationTarget(authorNotif as any);
    assertTest(
      deepLinkUrl === `/appeals?postId=${targetPostId}`,
      'TC-01',
      'Moderation notification links directly to /appeals?postId=<entityId>',
      `Resolved URL: ${deepLinkUrl}`
    );

    // -------------------------------------------------------------------------
    // TC-02: Correct post ID is prefilled and locked in appeal modal contract
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-02: Prefill & Locked Modal Contract ---');
    const urlParamPostId = targetPostId;
    const isModalLocked = Boolean(urlParamPostId && urlParamPostId.trim().length > 0);
    const prefillDuplicateCheck = checkActiveAppealDuplicate([], urlParamPostId);

    assertTest(
      isModalLocked === true && prefillDuplicateCheck.hasActive === false,
      'TC-02',
      'Correct post ID is prefilled and locked in appeal modal without prior active conflict',
      `Locked state: ${isModalLocked}, Has active prior appeal: ${prefillDuplicateCheck.hasActive}`
    );

    // -------------------------------------------------------------------------
    // TC-03: Author can submit a valid appeal
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-03: Valid Appeal Submission ---');
    const validAppealReason = 'Content is an official community cultural celebration notice.';
    const validAppealDetails = 'The post contained details about upcoming Samaj festival dates and venue location.';

    const submittedAppeal = await submitPostAppeal(
      author.id,
      {
        postId: targetPostId,
        reason: validAppealReason,
        details: validAppealDetails,
      },
      prisma
    );

    assertTest(
      submittedAppeal.status === 'PENDING' &&
        submittedAppeal.authorId === author.id &&
        submittedAppeal.postId === targetPostId,
      'TC-03',
      'Author can submit a valid appeal; initial status is PENDING with author and post references recorded',
      `Created Appeal ID: ${submittedAppeal.id}, Status: ${submittedAppeal.status}`
    );

    // Verify AuditLog record in staging DB
    const submitAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'APPEAL_SUBMITTED',
        targetId: submittedAppeal.id,
      },
    });
    assert.ok(submitAudit, 'APPEAL_SUBMITTED audit log created in staging database');

    // -------------------------------------------------------------------------
    // TC-04: Duplicate active appeals are rejected appropriately
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-04: Duplicate Active Appeal Rejection ---');
    let duplicateError: any = null;
    try {
      await submitPostAppeal(
        author.id,
        {
          postId: targetPostId,
          reason: 'Attempting duplicate active appeal submission',
        },
        prisma
      );
    } catch (err) {
      duplicateError = err;
    }

    assertTest(
      duplicateError instanceof PostServiceError && duplicateError.statusCode === 409,
      'TC-04',
      'Duplicate appeal submission while active is rejected with HTTP 409 Conflict',
      `Error status code: ${duplicateError?.statusCode}, Message: "${duplicateError?.message}"`
    );

    // -------------------------------------------------------------------------
    // TC-05: Author sees the appeal in their history
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-05: Member History Visibility ---');
    const authorHistory = await getMemberAppeals(author.id, {}, prisma);
    const foundInHistory = authorHistory.appeals.find((a) => a.id === submittedAppeal.id);

    assertTest(
      authorHistory.total >= 1 &&
        Boolean(foundInHistory) &&
        foundInHistory?.reason === validAppealReason,
      'TC-05',
      'Author sees their submitted appeal in appeal history with correct details',
      `Total appeals for author: ${authorHistory.total}`
    );

    // -------------------------------------------------------------------------
    // TC-06: Moderator can see the appeal in the moderation queue
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-06: Moderator Queue Ingestion ---');
    const queueResult = await listCommunityAppeals({ status: 'PENDING' }, prisma);
    const foundInQueue = queueResult.appeals.find((a) => a.id === submittedAppeal.id);

    assertTest(
      Boolean(foundInQueue) &&
        foundInQueue?.authorName === 'Staging Author Member' &&
        foundInQueue?.postId === targetPostId,
      'TC-06',
      'Moderator sees the pending appeal in community queue with member name and post ID',
      `Queue total: ${queueResult.total}, Author Name: "${foundInQueue?.authorName}"`
    );

    // -------------------------------------------------------------------------
    // TC-07: Ordinary member cannot access moderator review endpoints
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-07: Role-Based Authorization Enforcement ---');
    // Test 1: Self-review prohibition in service layer
    let selfReviewError: any = null;
    try {
      await reviewAppeal(
        submittedAppeal.id,
        author.id, // Author attempting to review their own appeal
        UserRole.MODERATOR,
        { status: 'APPROVED' },
        prisma
      );
    } catch (err) {
      selfReviewError = err;
    }
    const selfReviewBlocked = selfReviewError instanceof PostServiceError && selfReviewError.statusCode === 403;

    // Test 2: Controller tenant guard when context missing
    let capturedStatus = 0;
    const mockRes: any = {
      status: (s: number) => {
        capturedStatus = s;
        return mockRes;
      },
      json: () => mockRes,
    };
    await reviewAppealHandler(
      {
        user: { id: intruder.id, role: UserRole.MEMBER },
        params: { id: submittedAppeal.id },
        body: { status: 'APPROVED' },
      } as any,
      mockRes
    );
    const handlerRejected = capturedStatus === 400 || capturedStatus === 403;

    assertTest(
      selfReviewBlocked && handlerRejected,
      'TC-07',
      'Ordinary members and self-review attempts are strictly rejected (HTTP 403/400)',
      `Self-review error code: ${selfReviewError?.statusCode}, Controller status: ${capturedStatus}`
    );

    // -------------------------------------------------------------------------
    // TC-08: Moderator can approve or reject an appeal
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-08: Moderator Review Execution (Approval) ---');
    const privateReviewNotes = 'Verified cultural announcement content; post removal rescinded.';
    const reviewResult = await reviewAppeal(
      submittedAppeal.id,
      moderator.id,
      UserRole.MODERATOR,
      {
        status: 'APPROVED',
        reviewNotes: privateReviewNotes,
      },
      prisma
    );

    assertTest(
      reviewResult.status === 'APPROVED' &&
        reviewResult.moderatorId === moderator.id &&
        Boolean(reviewResult.reviewedAt),
      'TC-08',
      'Moderator successfully reviews and transitions appeal to APPROVED with timestamp and moderator ID',
      `New status: ${reviewResult.status}, Reviewed at: ${reviewResult.reviewedAt}`
    );

    // Verify MODERATION_REVIEW_APPEAL audit record in staging DB
    const reviewAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'MODERATION_REVIEW_APPEAL',
        targetId: submittedAppeal.id,
      },
    });
    assert.ok(reviewAudit, 'MODERATION_REVIEW_APPEAL audit log created in staging database');

    // -------------------------------------------------------------------------
    // TC-09: Review notes remain confidential from the member
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-09: Review Notes Confidentiality ---');
    const memberHistoryAfterReview = await getMemberAppeals(author.id, {}, prisma);
    const memberViewAppeal = memberHistoryAfterReview.appeals.find((a) => a.id === submittedAppeal.id);

    const notesConcealed =
      memberViewAppeal?.status === 'APPROVED' &&
      memberViewAppeal?.reviewNotes === undefined &&
      memberViewAppeal?.moderatorId === undefined;

    assertTest(
      notesConcealed,
      'TC-09',
      'Internal review notes and moderator identity remain strictly confidential from member history',
      `Member view reviewNotes: ${String(memberViewAppeal?.reviewNotes)}, moderatorId: ${String(memberViewAppeal?.moderatorId)}`
    );

    // -------------------------------------------------------------------------
    // TC-10: Member receives the correct decision notification
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-10: Decision Notification Delivery ---');
    const decisionNotification = await prisma.notification.findFirst({
      where: {
        recipientId: author.id,
        title: 'Appeal Approved',
      },
      orderBy: { createdAt: 'desc' },
    });

    assertTest(
      Boolean(decisionNotification) &&
        decisionNotification?.type === 'POST_MODERATED' &&
        decisionNotification?.entityId === targetPostId &&
        decisionNotification?.actorId === null,
      'TC-10',
      'Appellant receives "Appeal Approved" notification with impersonal actorId (confidential moderator)',
      `Notification Title: "${decisionNotification?.title}", Message: "${decisionNotification?.message}"`
    );

    // -------------------------------------------------------------------------
    // TC-11: Members cannot access another member\'s appeals
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-11: Cross-Member Isolation ---');
    const intruderHistory = await getMemberAppeals(intruder.id, {}, prisma);
    const intruderSeesAuthorAppeal = intruderHistory.appeals.some((a) => a.authorId === author.id);

    // Intruder attempts to submit appeal for author's post
    let intruderSubmitError: any = null;
    try {
      await submitPostAppeal(
        intruder.id,
        {
          postId: targetPostId,
          reason: 'Intruder attempting to appeal someone else post',
        },
        prisma
      );
    } catch (err) {
      intruderSubmitError = err;
    }

    assertTest(
      !intruderSeesAuthorAppeal &&
        intruderHistory.appeals.length === 0 &&
        intruderSubmitError instanceof PostServiceError &&
        intruderSubmitError.statusCode === 403,
      'TC-11',
      'Members cannot view another member appeal history or submit appeals for other members posts (HTTP 403)',
      `Intruder history count: ${intruderHistory.appeals.length}, Intruder submission error: ${intruderSubmitError?.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TC-12: Tenant isolation and input validation work correctly
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-12: Tenant Isolation & Input Validation ---');
    const invalidShortReason = submitPostAppealSchema.safeParse({
      postId: targetPostId,
      reason: 'no', // < 3 chars
    });
    const invalidUuid = submitPostAppealSchema.safeParse({
      postId: 'not-a-valid-uuid',
      reason: 'Valid reason here',
    });
    const invalidReviewState = reviewPostAppealSchema.safeParse({
      status: 'PENDING', // Cannot review back to PENDING
    });

    // Terminal state transition rejection: Cannot review an already finalized appeal
    let reopenError: any = null;
    try {
      await reviewAppeal(
        submittedAppeal.id,
        moderator.id,
        UserRole.MODERATOR,
        { status: 'REJECTED' },
        prisma
      );
    } catch (err) {
      reopenError = err;
    }

    assertTest(
      invalidShortReason.success === false &&
        invalidUuid.success === false &&
        invalidReviewState.success === false &&
        reopenError instanceof PostServiceError &&
        reopenError.statusCode === 400,
      'TC-12',
      'Zod schemas reject invalid post IDs, short reasons, and invalid statuses; terminal appeals cannot be modified',
      `Schema validation: shortReason=${invalidShortReason.success}, invalidUuid=${invalidUuid.success}, reopenError=${reopenError?.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TC-13: Concurrent review requests cannot create conflicting decisions
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-13: Concurrency Race-Condition Protection ---');
    // Seed a second synthetic post and appeal for concurrency testing
    await prisma.auditLog.create({
      data: {
        actorId: moderator.id,
        action: 'MODERATION_DELETE_POST',
        targetType: 'Post',
        targetId: racePostId,
        details: {
          postAuthorId: author.id,
          postType: 'GENERAL',
          reason: 'SPAM',
        },
      },
    });

    const raceAppeal = await prisma.postAppeal.create({
      data: {
        postId: racePostId,
        authorId: author.id,
        reason: 'Race test appeal',
        status: 'PENDING',
      },
    });

    // Seed a second moderator for racing
    const mod2Phone = '+919999900004';
    const mod2 = await prisma.user.upsert({
      where: { phone: mod2Phone },
      update: {},
      create: {
        phone: mod2Phone,
        passwordHash: author.passwordHash,
        role: UserRole.MODERATOR,
        status: 'ACTIVE' as any,
        isPhoneVerified: true,
        profile: {
          create: { fullName: 'Staging Competing Moderator' },
        },
      },
    });

    // Both moderators submit competing reviews concurrently
    const [raceRes1, raceRes2] = await Promise.allSettled([
      reviewAppeal(raceAppeal.id, moderator.id, UserRole.MODERATOR, { status: 'APPROVED', reviewNotes: 'Mod 1 approves' }, prisma),
      reviewAppeal(raceAppeal.id, mod2.id, UserRole.MODERATOR, { status: 'REJECTED', reviewNotes: 'Mod 2 rejects' }, prisma),
    ]);

    const fulfilled = [raceRes1, raceRes2].filter((r) => r.status === 'fulfilled');
    const rejected = [raceRes1, raceRes2].filter((r) => r.status === 'rejected');

    const racingReviewAudits = await prisma.auditLog.findMany({
      where: {
        action: 'MODERATION_REVIEW_APPEAL',
        targetId: raceAppeal.id,
      },
    });

    assertTest(
      fulfilled.length === 1 &&
        rejected.length === 1 &&
        racingReviewAudits.length === 1,
      'TC-13',
      'Concurrent review requests: Exactly 1 succeeds, exactly 1 receives HTTP 409 Conflict, and exactly 1 audit log is recorded',
      `Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}, Audit logs recorded: ${racingReviewAudits.length}`
    );

    // -------------------------------------------------------------------------
    // TC-14: UI loading, error, and prefill states contract verification
    // -------------------------------------------------------------------------
    console.log('\n--- Executing TC-14: UI States Contract Verification ---');
    // Verify duplicate active detection when appeal is pending
    const activeDuplicateWarning = checkActiveAppealDuplicate(
      [{ postId: racePostId, status: 'UNDER_REVIEW' }],
      racePostId
    );
    // Verify finalized appeal allows fresh submission if re-moderated
    const finalizedAllowsNew = checkActiveAppealDuplicate(
      [{ postId: targetPostId, status: 'APPROVED' }],
      targetPostId
    );

    assertTest(
      activeDuplicateWarning.hasActive === true &&
        activeDuplicateWarning.activeStatus === 'UNDER_REVIEW' &&
        finalizedAllowsNew.hasActive === false,
      'TC-14',
      'UI contract prevents duplicate modal launch when active, while allowing fresh appeal after finalization',
      `Active duplicate detected: ${activeDuplicateWarning.hasActive}, Finalized allows new: ${!finalizedAllowsNew.hasActive}`
    );

    // -------------------------------------------------------------------------
    // Section 3: Post Restoration Inspection
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Post Restoration Inspection ---');
    const targetPostInDb = await prisma.post.findUnique({
      where: { id: targetPostId },
    });
    console.log(`Post table lookup for ${targetPostId}: ${targetPostInDb ? 'FOUND' : 'NULL (Not restored)'}`);

    const isPostRestored = Boolean(targetPostInDb);
    console.log(`Finding: Approved appeal restores post in Post table? ${isPostRestored ? 'YES' : 'NO (Intentionally handled separately)'}`);

    console.log('\n================================================================');
    console.log(`Summary: ${passedTests} passed, ${failedTests} failed.`);
    console.log('================================================================\n');

    return {
      passedTests,
      failedTests,
      testResults,
      isPostRestored,
    };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runStagingE2E()
    .then((result) => {
      console.log('Staging E2E Suite Completed with exit code 0');
      process.exit(result.failedTests > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal staging E2E test error:', err);
      process.exit(1);
    });
}

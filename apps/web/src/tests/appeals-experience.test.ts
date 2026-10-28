import assert from 'node:assert';
import { NotificationItem, PostAppealItem, PostAppealStatus } from '@apnasamaj/shared-types';
import {
  resolveNotificationTarget,
  getNotificationTypeMeta,
} from '../utils/notifications';
import { submitPostAppealSchema } from '../../../../packages/validation/src/post';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14M.4: Web Member Appeals UX Tests        ');
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

// Logic mirroring MyAppealsPage deep link parameter handler
function checkActiveAppealDuplicate(
  appeals: PostAppealItem[],
  postId: string
): { hasActive: boolean; activeStatus?: PostAppealStatus } {
  const existingActive = appeals.find(
    (a) => a.postId === postId.trim() && (a.status === 'PENDING' || a.status === 'UNDER_REVIEW')
  );
  if (existingActive) {
    return { hasActive: true, activeStatus: existingActive.status };
  }
  return { hasActive: false };
}

async function runTests() {
  console.log('--- Test Suite 1: Notification Deep Linking ---');

  const testPostId = '123e4567-e89b-12d3-a456-426614174000';

  // 1.1 POST_MODERATED with entityId routes to /appeals?postId=<id>
  const notifWithPostId: NotificationItem = {
    id: 'n-mod-1',
    recipientId: 'user-1',
    actorId: null,
    type: 'POST_MODERATED',
    title: 'Post Removed',
    message: 'Your post was removed by community moderation for violating guidelines.',
    entityType: 'POST',
    entityId: testPostId,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const targetUrl = resolveNotificationTarget(notifWithPostId);
  assertTest(
    targetUrl === `/appeals?postId=${encodeURIComponent(testPostId)}`,
    'POST_MODERATED notification with entityId routes directly to /appeals?postId=<id>'
  );

  // 1.2 POST_MODERATED without entityId routes safely to /feed fallback
  const notifWithoutPostId: NotificationItem = {
    id: 'n-mod-2',
    recipientId: 'user-1',
    actorId: null,
    type: 'POST_MODERATED',
    title: 'Post Removed',
    message: 'Your post was removed.',
    entityType: 'POST',
    entityId: null,
    isRead: false,
    createdAt: new Date().toISOString(),
  };

  const fallbackUrl = resolveNotificationTarget(notifWithoutPostId);
  assertTest(
    fallbackUrl === '/feed',
    'POST_MODERATED notification without entityId routes gracefully to /feed fallback'
  );

  // 1.3 Other notification types maintain their established routes
  const likeNotif: NotificationItem = {
    id: 'n-like',
    recipientId: 'user-1',
    type: 'POST_LIKE',
    entityId: 'post-999',
  } as any;
  assertTest(resolveNotificationTarget(likeNotif) === '/posts/post-999', 'POST_LIKE routes to /posts/:id');

  const statusNotif: NotificationItem = {
    id: 'n-status',
    recipientId: 'user-1',
    type: 'ACCOUNT_STATUS_UPDATE',
  } as any;
  assertTest(resolveNotificationTarget(statusNotif) === '/profile', 'ACCOUNT_STATUS_UPDATE routes to /profile');

  console.log('\n--- Test Suite 2: Active Appeal Duplicate Detection in Member UI ---');

  const existingAppeals: PostAppealItem[] = [
    {
      id: 'appeal-1',
      postId: testPostId,
      authorId: 'user-1',
      reason: 'Fair use educational content',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'appeal-2',
      postId: '987e6543-e89b-12d3-a456-426614174000',
      authorId: 'user-1',
      reason: 'Misunderstood context',
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
    },
  ];

  // 2.1 Deep-linking to an already pending post detects active duplicate
  const duplicateCheck1 = checkActiveAppealDuplicate(existingAppeals, testPostId);
  assertTest(
    duplicateCheck1.hasActive === true && duplicateCheck1.activeStatus === 'PENDING',
    'Detects existing active PENDING appeal for deep-linked post ID'
  );

  // 2.2 Deep-linking to a finalized (APPROVED) post permits new appeal submission
  const duplicateCheck2 = checkActiveAppealDuplicate(existingAppeals, '987e6543-e89b-12d3-a456-426614174000');
  assertTest(
    duplicateCheck2.hasActive === false,
    'Allows new appeal submission when prior appeal is finalized (APPROVED)'
  );

  // 2.3 Deep-linking to a new moderated post permits appeal submission
  const duplicateCheck3 = checkActiveAppealDuplicate(existingAppeals, '555e6543-e89b-12d3-a456-426614174000');
  assertTest(
    duplicateCheck3.hasActive === false,
    'Allows appeal submission for a previously un-appealed post'
  );

  console.log('\n--- Test Suite 3: Client & Server Input Validation Sync ---');

  // 3.1 Valid appeal passes validation
  const valid = submitPostAppealSchema.safeParse({
    postId: testPostId,
    reason: 'Content complies with community guidelines',
    details: 'The post was an official announcement regarding cultural celebrations.',
  });
  assertTest(valid.success === true, 'submitPostAppealSchema accepts valid input');

  // 3.2 Reason too short (< 3 chars) is rejected
  const shortReason = submitPostAppealSchema.safeParse({
    postId: testPostId,
    reason: 'no',
  });
  assertTest(shortReason.success === false, 'Rejects reason shorter than 3 characters');

  // 3.3 Reason too long (> 100 chars) is rejected
  const longReason = submitPostAppealSchema.safeParse({
    postId: testPostId,
    reason: 'A'.repeat(101),
  });
  assertTest(longReason.success === false, 'Rejects reason longer than 100 characters');

  // 3.4 Invalid UUID postId is rejected
  const invalidUuid = submitPostAppealSchema.safeParse({
    postId: 'not-a-valid-uuid',
    reason: 'Legitimate reason here',
  });
  assertTest(invalidUuid.success === false, 'Rejects non-UUID postId format');

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

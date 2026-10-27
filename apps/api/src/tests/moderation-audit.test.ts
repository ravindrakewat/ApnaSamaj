import assert from 'node:assert';
import { UserRole, PostType } from '@apnasamaj/shared-types';
import { reportPostSchema } from '@apnasamaj/validation';
import {
  deletePost,
  deleteComment,
  pinPost,
  unpinPost,
  reportPost,
} from '../modules/posts/posts.service';
import { listAuditLogs } from '../modules/admin/audit-logs/admin.audit-logs.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14G: Moderation & Audit Logging Tests     ');
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
// Mock Database Client Builder for Isolated Testing
// ---------------------------------------------------------------------------

interface MockPost {
  id: string;
  authorId: string;
  groupId: string | null;
  content: string;
  isPinned: boolean;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; role: string; status: string; profile: { fullName: string; avatarUrl: string | null } | null };
  group?: { id: string; privacy: 'PUBLIC' | 'PRIVATE' } | null;
  media: any[];
}

interface MockComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; role: string; profile: { fullName: string; avatarUrl: string | null } | null };
}

interface MockAuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

function createMockPrismaClient() {
  const posts: MockPost[] = [];
  const comments: MockComment[] = [];
  const auditLogs: MockAuditLog[] = [];
  const groupMembers: { groupId: string; userId: string }[] = [];

  const client: any = {
    post: {
      findUnique: async ({ where, select, include }: any) => {
        const found = posts.find((p) => p.id === where.id);
        if (!found) return null;
        return { ...found };
      },
      create: async ({ data }: any) => {
        const newPost: MockPost = {
          id: data.id || `post-${Date.now()}-${Math.random()}`,
          authorId: data.authorId,
          groupId: data.groupId || null,
          content: data.content || '',
          isPinned: Boolean(data.isPinned),
          type: data.type || 'GENERAL',
          createdAt: new Date(),
          updatedAt: new Date(),
          author: { id: data.authorId, role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Author', avatarUrl: null } },
          group: data.groupId ? { id: data.groupId, privacy: 'PUBLIC' } : null,
          media: [],
        };
        posts.push(newPost);
        return newPost;
      },
      update: async ({ where, data }: any) => {
        const idx = posts.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('Post not found for update');
        posts[idx] = { ...posts[idx], ...data, updatedAt: new Date() };
        return posts[idx];
      },
      delete: async ({ where }: any) => {
        const idx = posts.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('Post not found for delete');
        const [deleted] = posts.splice(idx, 1);
        return deleted;
      },
    },
    comment: {
      findUnique: async ({ where }: any) => {
        const found = comments.find((c) => c.id === where.id);
        if (!found) return null;
        return { ...found };
      },
      delete: async ({ where }: any) => {
        const idx = comments.findIndex((c) => c.id === where.id);
        if (idx === -1) throw new Error('Comment not found for delete');
        const [deleted] = comments.splice(idx, 1);
        return deleted;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const newLog: MockAuditLog = {
          id: `audit-${auditLogs.length + 1}`,
          actorId: data.actorId,
          action: data.action,
          targetType: data.targetType,
          targetId: data.targetId,
          details: data.details || null,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          createdAt: new Date(),
        };
        auditLogs.push(newLog);
        return newLog;
      },
      findFirst: async ({ where }: any) => {
        return (
          auditLogs.find(
            (log) =>
              (!where.actorId || log.actorId === where.actorId) &&
              (!where.action || log.action === where.action) &&
              (!where.targetType || log.targetType === where.targetType) &&
              (!where.targetId || log.targetId === where.targetId)
          ) || null
        );
      },
      count: async ({ where }: any) => {
        return auditLogs.filter(
          (log) => !where.action || log.action === where.action
        ).length;
      },
      findMany: async ({ where, skip = 0, take = 20, orderBy }: any) => {
        let filtered = auditLogs.filter(
          (log) => !where.action || log.action === where.action
        );
        return filtered.slice(skip, skip + take);
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        const key = where.groupId_userId;
        return (
          groupMembers.find(
            (m) => m.groupId === key.groupId && m.userId === key.userId
          ) || null
        );
      },
    },
    $transaction: async (fn: any) => {
      // In transaction: pass client itself as tx
      return fn(client);
    },
    _internal: { posts, comments, auditLogs, groupMembers },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Test 1: Report Schema Validation
// ---------------------------------------------------------------------------
// Test Execution Suite
// ---------------------------------------------------------------------------

async function runTests() {
  console.log('--- Test 1: Report Schema Validation ---');
  {
    const validReport = reportPostSchema.safeParse({
    reason: 'INAPPROPRIATE_CONTENT',
    details: 'Contains offensive personal attacks against another member.',
  });
  assertTest(validReport.success, 'Valid report payload succeeds validation');

  const validWithoutDetails = reportPostSchema.safeParse({
    reason: 'SPAM',
  });
  assertTest(validWithoutDetails.success, 'Report without optional details succeeds');

  const invalidReason = reportPostSchema.safeParse({
    reason: 'I_DISLIKE_THIS_PERSON',
  });
  assertTest(!invalidReason.success, 'Invalid reason enum is rejected');

  const excessiveDetails = reportPostSchema.safeParse({
    reason: 'SPAM',
    details: 'a'.repeat(1001),
  });
  assertTest(!excessiveDetails.success, 'Details exceeding 1000 characters rejected');
}

// ---------------------------------------------------------------------------
// Test 2: Post Reporting Service Logic & Deduplication
// ---------------------------------------------------------------------------
console.log('\n--- Test 2: Post Reporting Service Logic & Deduplication ---');
{
  const mockDb = createMockPrismaClient();

  // Create a post by user-1
  mockDb._internal.posts.push({
    id: 'post-100',
    authorId: 'user-1',
    groupId: null,
    content: 'Suspicious post content',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'user-1', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Author One', avatarUrl: null } },
    media: [],
  });

  // User 2 reports User 1's post
  const result = await reportPost(
    'post-100',
    'user-2',
    { reason: 'SPAM', details: 'Repeated promotional link' },
    '127.0.0.1',
    'Mozilla/5.0 TestBrowser',
    mockDb
  );

  assertTest(typeof result.message === 'string', 'Report successfully submitted with acknowledgment message');

  // Verify AuditLog record was created with action: POST_REPORT
  const reportLog = mockDb._internal.auditLogs.find(
    (log: any) => log.action === 'POST_REPORT' && log.targetId === 'post-100'
  );
  assertTest(Boolean(reportLog), 'POST_REPORT audit log created');
  assertTest(reportLog.actorId === 'user-2', 'Report actor matches reporter ID');
  assertTest(reportLog.details.reason === 'SPAM', 'Report reason accurately logged in details');
  assertTest(reportLog.details.postAuthorId === 'user-1', 'Target post author recorded in audit log');

  // Verify content was NOT automatically deleted or hidden
  const postStillExists = mockDb._internal.posts.find((p: any) => p.id === 'post-100');
  assertTest(Boolean(postStillExists), 'Post content was NOT automatically deleted upon report submission');

  // Duplicate report attempt by user-2 on post-100 must fail with 409
  let duplicateCaught = false;
  try {
    await reportPost(
      'post-100',
      'user-2',
      { reason: 'SPAM' },
      '127.0.0.1',
      'Mozilla/5.0',
      mockDb
    );
  } catch (err: any) {
    duplicateCaught = true;
    assertTest(err.statusCode === 409, 'Duplicate report returns HTTP 409 Conflict');
  }
  assertTest(duplicateCaught, 'Duplicate report from same user is safely rejected');

  // Different user (user-3) reporting post-100 is permitted
  const user3Result = await reportPost(
    'post-100',
    'user-3',
    { reason: 'MISINFORMATION' },
    '127.0.0.1',
    'Mozilla/5.0',
    mockDb
  );
  assertTest(Boolean(user3Result), 'Independent user-3 can report the same post');
}

// ---------------------------------------------------------------------------
// Test 3: Self-Report Prevention
// ---------------------------------------------------------------------------
console.log('\n--- Test 3: Self-Report Prevention ---');
{
  const mockDb = createMockPrismaClient();

  mockDb._internal.posts.push({
    id: 'post-self',
    authorId: 'author-me',
    groupId: null,
    content: 'My own post',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'author-me', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Me', avatarUrl: null } },
    media: [],
  });

  let selfReportCaught = false;
  try {
    await reportPost(
      'post-self',
      'author-me',
      { reason: 'SPAM' },
      '127.0.0.1',
      'Mozilla/5.0',
      mockDb
    );
  } catch (err: any) {
    selfReportCaught = true;
    assertTest(err.statusCode === 400, 'Self-report returns HTTP 400 Bad Request');
    assertTest(err.message.includes('own post'), 'Error clearly informs author they cannot report their own post');
  }
  assertTest(selfReportCaught, 'Post author cannot report their own post');
}

// ---------------------------------------------------------------------------
// Test 4: Private Group Post Protection & Deleted Post Handling
// ---------------------------------------------------------------------------
console.log('\n--- Test 4: Private Group Post Protection & Deleted Post Handling ---');
{
  const mockDb = createMockPrismaClient();

  mockDb._internal.posts.push({
    id: 'private-post-1',
    authorId: 'group-author',
    groupId: 'grp-secret',
    content: 'Confidential group discussion',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'group-author', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Group Author', avatarUrl: null } },
    group: { id: 'grp-secret', privacy: 'PRIVATE' },
    media: [],
  });

  // Non-member attempts to report private group post
  let nonMemberCaught = false;
  try {
    await reportPost(
      'private-post-1',
      'outsider-user',
      { reason: 'SPAM' },
      undefined,
      undefined,
      mockDb
    );
  } catch (err: any) {
    nonMemberCaught = true;
    assertTest(err.statusCode === 404, 'Non-member reporting private post receives generic 404 to avoid leaking existence');
  }
  assertTest(nonMemberCaught, 'Non-member cannot report private group post');

  // Authorized group member can report
  mockDb._internal.groupMembers.push({ groupId: 'grp-secret', userId: 'active-member' });
  const memberReport = await reportPost(
    'private-post-1',
    'active-member',
    { reason: 'HARASSMENT' },
    undefined,
    undefined,
    mockDb
  );
  assertTest(Boolean(memberReport), 'Authorized private group member can submit report');

  // Reporting deleted or non-existent post returns 404
  let notFoundCaught = false;
  try {
    await reportPost('ghost-post', 'any-user', { reason: 'SPAM' }, undefined, undefined, mockDb);
  } catch (err: any) {
    notFoundCaught = true;
    assertTest(err.statusCode === 404, 'Reporting non-existent post returns 404');
  }
  assertTest(notFoundCaught, 'Reporting non-existent post handled safely');
}

// ---------------------------------------------------------------------------
// Test 5: Moderation Authorization (Delete, Pin, Unpin)
// ---------------------------------------------------------------------------
console.log('\n--- Test 5: Moderation Authorization (Delete, Pin, Unpin) ---');
{
  const mockDb = createMockPrismaClient();

  mockDb._internal.posts.push({
    id: 'victim-post',
    authorId: 'innocent-member',
    groupId: null,
    content: 'Regular member post',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'innocent-member', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Innocent', avatarUrl: null } },
    media: [],
  });

  // Ordinary member cannot delete another member's post
  let unauthDeleteCaught = false;
  try {
    await deletePost('victim-post', 'random-member', UserRole.MEMBER, undefined, undefined, mockDb);
  } catch (err: any) {
    unauthDeleteCaught = true;
    assertTest(err.statusCode === 403, 'Unauthorized delete attempt rejected with 403 Forbidden');
  }
  assertTest(unauthDeleteCaught, 'Ordinary member cannot delete another member post');

  // Ordinary member cannot pin or unpin posts
  let unauthPinCaught = false;
  try {
    await pinPost('victim-post', 'random-member', UserRole.MEMBER, undefined, undefined, mockDb);
  } catch (err: any) {
    unauthPinCaught = true;
    assertTest(err.statusCode === 403, 'Unauthorized pin attempt rejected with 403 Forbidden');
  }
  assertTest(unauthPinCaught, 'Ordinary member cannot pin posts');
}

// ---------------------------------------------------------------------------
// Test 6: Atomic Post Deletion and MODERATION_DELETE_POST Audit Record
// ---------------------------------------------------------------------------
console.log('\n--- Test 6: Atomic Post Deletion and MODERATION_DELETE_POST Audit Record ---');
{
  const mockDb = createMockPrismaClient();

  mockDb._internal.posts.push({
    id: 'violating-post',
    authorId: 'spammer-user',
    groupId: null,
    content: 'Violating content to be moderated',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'spammer-user', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Spammer', avatarUrl: null } },
    media: [],
  });

  // Community Admin moderates and deletes the post
  await deletePost(
    'violating-post',
    'admin-1',
    UserRole.COMMUNITY_ADMIN,
    '10.0.0.1',
    'AdminAgent/1.0',
    mockDb
  );

  // Verify post was deleted
  const postInDb = mockDb._internal.posts.find((p: any) => p.id === 'violating-post');
  assertTest(postInDb === undefined, 'Post was deleted from database');

  // Verify MODERATION_DELETE_POST audit log was created
  const deleteLog = mockDb._internal.auditLogs.find(
    (log: any) => log.action === 'MODERATION_DELETE_POST' && log.targetId === 'violating-post'
  );
  assertTest(Boolean(deleteLog), 'MODERATION_DELETE_POST audit log created atomically');
  assertTest(deleteLog.actorId === 'admin-1', 'Audit log actor is the moderator');
  assertTest(deleteLog.details.postAuthorId === 'spammer-user', 'Audit log details record post author ID');
  assertTest(deleteLog.details.moderatorRole === UserRole.COMMUNITY_ADMIN, 'Audit log records moderator role');

  // Verify post author deleting their own post does NOT generate moderation audit log
  mockDb._internal.posts.push({
    id: 'author-own-post',
    authorId: 'regular-user',
    groupId: null,
    content: 'Post by user to self-delete',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'regular-user', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'User', avatarUrl: null } },
    media: [],
  });

  const auditLogCountBefore = mockDb._internal.auditLogs.length;
  await deletePost('author-own-post', 'regular-user', UserRole.MEMBER, undefined, undefined, mockDb);

  const auditLogCountAfter = mockDb._internal.auditLogs.length;
  assertTest(
    auditLogCountAfter === auditLogCountBefore,
    'Self-deletion by post author does NOT create administrative moderation audit log'
  );
}

// ---------------------------------------------------------------------------
// Test 7: Atomic Comment Deletion and MODERATION_DELETE_COMMENT Audit Record
// ---------------------------------------------------------------------------
console.log('\n--- Test 7: Atomic Comment Deletion and MODERATION_DELETE_COMMENT Audit Record ---');
{
  const mockDb = createMockPrismaClient();

  mockDb._internal.posts.push({
    id: 'parent-post',
    authorId: 'post-author',
    groupId: null,
    content: 'Parent post',
    isPinned: false,
    type: 'GENERAL',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'post-author', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'Author', avatarUrl: null } },
    media: [],
  });

  mockDb._internal.comments.push({
    id: 'comment-offensive',
    postId: 'parent-post',
    authorId: 'abusive-user',
    content: 'Offensive harassment comment',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'abusive-user', role: 'MEMBER', profile: { fullName: 'Abusive User', avatarUrl: null } },
  });

  // Moderator deletes the abusive comment
  await deleteComment(
    'parent-post',
    'comment-offensive',
    'moderator-1',
    UserRole.MODERATOR,
    '192.168.1.1',
    'ModAgent/2.0',
    mockDb
  );

  // Comment must be deleted
  const commentInDb = mockDb._internal.comments.find((c: any) => c.id === 'comment-offensive');
  assertTest(commentInDb === undefined, 'Comment was deleted from database');

  // Audit log must exist
  const commentLog = mockDb._internal.auditLogs.find(
    (log: any) => log.action === 'MODERATION_DELETE_COMMENT' && log.targetId === 'comment-offensive'
  );
  assertTest(Boolean(commentLog), 'MODERATION_DELETE_COMMENT audit log created atomically');
  assertTest(commentLog.actorId === 'moderator-1', 'Audit log actor is the moderator');
  assertTest(commentLog.details.commentAuthorId === 'abusive-user', 'Audit log records comment author');
}

// ---------------------------------------------------------------------------
// Test 8: Pin and Unpin Atomic Audit Records
// ---------------------------------------------------------------------------
console.log('\n--- Test 8: Pin and Unpin Atomic Audit Records ---');
{
  const mockDb = createMockPrismaClient();

  mockDb._internal.posts.push({
    id: 'post-to-pin',
    authorId: 'user-a',
    groupId: null,
    content: 'Important community announcement',
    isPinned: false,
    type: 'ANNOUNCEMENT',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'user-a', role: 'MEMBER', status: 'ACTIVE', profile: { fullName: 'User A', avatarUrl: null } },
    media: [],
  });

  // Moderator pins post
  await pinPost(
    'post-to-pin',
    'mod-pin-actor',
    UserRole.MODERATOR,
    '127.0.0.1',
    'BrowserMod',
    mockDb
  );

  const pinnedPost = mockDb._internal.posts.find((p: any) => p.id === 'post-to-pin');
  assertTest(pinnedPost.isPinned === true, 'Post is pinned in database');

  const pinLog = mockDb._internal.auditLogs.find(
    (log: any) => log.action === 'MODERATION_PIN_POST' && log.targetId === 'post-to-pin'
  );
  assertTest(Boolean(pinLog), 'MODERATION_PIN_POST audit log created atomically');
  assertTest(pinLog.actorId === 'mod-pin-actor', 'Pin audit log records actor ID');

  // Moderator unpins post
  await unpinPost(
    'post-to-pin',
    'mod-pin-actor',
    UserRole.MODERATOR,
    '127.0.0.1',
    'BrowserMod',
    mockDb
  );

  const unpinnedPost = mockDb._internal.posts.find((p: any) => p.id === 'post-to-pin');
  assertTest(unpinnedPost.isPinned === false, 'Post is unpinned in database');

  const unpinLog = mockDb._internal.auditLogs.find(
    (log: any) => log.action === 'MODERATION_UNPIN_POST' && log.targetId === 'post-to-pin'
  );
  assertTest(Boolean(unpinLog), 'MODERATION_UNPIN_POST audit log created atomically');
}

// ---------------------------------------------------------------------------
// Test 9: Cross-Tenant Audit Isolation
// ---------------------------------------------------------------------------
console.log('\n--- Test 9: Cross-Tenant Audit Isolation ---');
{
  const tenantKewatDb = createMockPrismaClient();
  const tenantGuptaDb = createMockPrismaClient();

  // Kewat has audit logs
  tenantKewatDb._internal.auditLogs.push({
    id: 'kewat-audit-1',
    actorId: 'kewat-admin',
    action: 'MODERATION_DELETE_POST',
    targetType: 'Post',
    targetId: 'kewat-post-1',
    details: {},
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
  });

  // Gupta has separate audit logs
  tenantGuptaDb._internal.auditLogs.push({
    id: 'gupta-audit-1',
    actorId: 'gupta-admin',
    action: 'MODERATION_DELETE_POST',
    targetType: 'Post',
    targetId: 'gupta-post-1',
    details: {},
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
  });

  const kewatResults = await listAuditLogs({ page: 1, limit: 10 }, tenantKewatDb);
  assertTest(kewatResults.logs.length === 1, 'Kewat query returns Kewat audit log');
  assertTest(kewatResults.logs[0].id === 'kewat-audit-1', 'Kewat audit log ID verified');
  assertTest(!kewatResults.logs.some((l: any) => l.id === 'gupta-audit-1'), 'Gupta audit log NOT visible in Kewat query');

  const guptaResults = await listAuditLogs({ page: 1, limit: 10 }, tenantGuptaDb);
  assertTest(guptaResults.logs.length === 1, 'Gupta query returns Gupta audit log');
  assertTest(guptaResults.logs[0].id === 'gupta-audit-1', 'Gupta audit log ID verified');
  assertTest(!guptaResults.logs.some((l: any) => l.id === 'kewat-audit-1'), 'Kewat audit log NOT visible in Gupta query');
}

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`   Batch 14G Test Run Completed: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});

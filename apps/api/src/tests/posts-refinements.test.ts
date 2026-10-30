import assert from 'node:assert/strict';
import {
  postIdSchema,
  commentIdSchema,
  postCommentIdSchema,
  feedQuerySchema,
  createPostSchema,
  updatePostSchema,
  createCommentSchema,
  updateCommentSchema,
} from '@apnasamaj/validation';
import {
  getPostHandler,
  updatePostHandler,
  deletePostHandler,
  pinPostHandler,
  unpinPostHandler,
  reportPostHandler,
  likePostHandler,
  unlikePostHandler,
  getPostLikesHandler,
  recordPostViewHandler,
  getPostViewsHandler,
  getCommentsHandler,
  createCommentHandler,
  updateCommentHandler,
  deleteCommentHandler,
} from '../modules/posts/posts.controller';
import {
  getCommunityFeed,
  PostServiceError,
  PostNotFoundError,
} from '../modules/posts/posts.service';
import { UserRole, PostType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('  Apna Samaj — Batch 15D.2: Social Feed Backend Hardening Tests');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(description: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${description}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${description}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passedTests++;
      console.log(`✅ PASS: ${description}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${description}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const INVALID_UUID = 'not-a-valid-uuid-12345';
const SQL_INJECTION = "550e8400-e29b-41d4-a716-446655440000' OR '1'='1";

function createMockReqRes(params: Record<string, string> = {}, body: any = {}, query: any = {}, user: any = { id: VALID_UUID, role: UserRole.MEMBER }) {
  const req: any = {
    params,
    body,
    query,
    user,
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    db: {} as any,
  };

  let statusCode = 200;
  let jsonResponse: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getJSON() {
      return jsonResponse;
    },
  };

  return { req, res };
}

async function runTests() {
  console.log('--- 1. Route Parameter UUID Schema Validation ---');

  test('postIdSchema accepts valid RFC 4122 UUID', () => {
    const parsed = postIdSchema.safeParse(VALID_UUID);
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data, VALID_UUID);
    }
  });

  test('postIdSchema rejects malformed non-UUID string', () => {
    const parsed = postIdSchema.safeParse(INVALID_UUID);
    assert.equal(parsed.success, false);
  });

  test('postIdSchema rejects SQL injection payload', () => {
    const parsed = postIdSchema.safeParse(SQL_INJECTION);
    assert.equal(parsed.success, false);
  });

  test('postIdSchema rejects short string', () => {
    const parsed = postIdSchema.safeParse('123');
    assert.equal(parsed.success, false);
  });

  test('postIdSchema rejects empty string', () => {
    const parsed = postIdSchema.safeParse('');
    assert.equal(parsed.success, false);
  });

  test('commentIdSchema accepts valid RFC 4122 UUID', () => {
    const parsed = commentIdSchema.safeParse(VALID_UUID);
    assert.equal(parsed.success, true);
  });

  test('commentIdSchema rejects malformed non-UUID string', () => {
    const parsed = commentIdSchema.safeParse(INVALID_UUID);
    assert.equal(parsed.success, false);
  });

  test('postCommentIdSchema accepts valid post and comment UUIDs', () => {
    const parsed = postCommentIdSchema.safeParse({ id: VALID_UUID, commentId: VALID_UUID_2 });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.id, VALID_UUID);
      assert.equal(parsed.data.commentId, VALID_UUID_2);
    }
  });

  test('postCommentIdSchema rejects malformed postId', () => {
    const parsed = postCommentIdSchema.safeParse({ id: INVALID_UUID, commentId: VALID_UUID_2 });
    assert.equal(parsed.success, false);
  });

  test('postCommentIdSchema rejects malformed commentId', () => {
    const parsed = postCommentIdSchema.safeParse({ id: VALID_UUID, commentId: INVALID_UUID });
    assert.equal(parsed.success, false);
  });

  console.log('\n--- 2. Feed Query Schema Validation & Keyword Search Bounds ---');

  test('feedQuerySchema accepts empty query with default pagination', () => {
    const parsed = feedQuerySchema.safeParse({});
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.page, 1);
      assert.equal(parsed.data.limit, 10);
      assert.equal(parsed.data.search, undefined);
    }
  });

  test('feedQuerySchema accepts valid search term within 100 characters', () => {
    const parsed = feedQuerySchema.safeParse({ search: 'Indore Community Sammelan' });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.search, 'Indore Community Sammelan');
    }
  });

  test('feedQuerySchema trims leading and trailing whitespace on search', () => {
    const parsed = feedQuerySchema.safeParse({ search: '   youth leadership   ' });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.search, 'youth leadership');
    }
  });

  test('feedQuerySchema accepts exactly 100 characters search query', () => {
    const exactly100 = 'a'.repeat(100);
    const parsed = feedQuerySchema.safeParse({ search: exactly100 });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.search?.length, 100);
    }
  });

  test('feedQuerySchema rejects search query exceeding 100 characters', () => {
    const exceeding100 = 'b'.repeat(101);
    const parsed = feedQuerySchema.safeParse({ search: exceeding100 });
    assert.equal(parsed.success, false);
  });

  test('feedQuerySchema enforces maximum limit of 50', () => {
    const parsed = feedQuerySchema.safeParse({ limit: 50 });
    assert.equal(parsed.success, true);
    const rejected = feedQuerySchema.safeParse({ limit: 51 });
    assert.equal(rejected.success, false);
  });

  test('feedQuerySchema accepts valid authorId UUID', () => {
    const parsed = feedQuerySchema.safeParse({ authorId: VALID_UUID });
    assert.equal(parsed.success, true);
  });

  test('feedQuerySchema rejects non-UUID authorId', () => {
    const parsed = feedQuerySchema.safeParse({ authorId: 'bad-author-id' });
    assert.equal(parsed.success, false);
  });

  test('feedQuerySchema accepts valid PostType enum', () => {
    const parsed = feedQuerySchema.safeParse({ type: 'EVENT' });
    assert.equal(parsed.success, true);
  });

  console.log('\n--- 3. Controller Parameter Guard Tests (Malformed UUID -> HTTP 400) ---');

  await test('getPostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await getPostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
    assert.match(res.getJSON().error, /Invalid post ID format/);
  });

  await test('updatePostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID }, { content: 'updated' });
    await updatePostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('deletePostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await deletePostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('pinPostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID }, {}, {}, { id: VALID_UUID, role: UserRole.COMMUNITY_ADMIN });
    await pinPostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('unpinPostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID }, {}, {}, { id: VALID_UUID, role: UserRole.COMMUNITY_ADMIN });
    await unpinPostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('reportPostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID }, { reason: 'SPAM' });
    await reportPostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('likePostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await likePostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('unlikePostHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await unlikePostHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('getPostLikesHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await getPostLikesHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('recordPostViewHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await recordPostViewHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('getPostViewsHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await getPostViewsHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('getCommentsHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID });
    await getCommentsHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('createCommentHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID }, { content: 'test comment' });
    await createCommentHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('updateCommentHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID, commentId: VALID_UUID_2 }, { content: 'updated' });
    await updateCommentHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('updateCommentHandler returns 400 for malformed comment ID', async () => {
    const { req, res } = createMockReqRes({ id: VALID_UUID, commentId: INVALID_UUID }, { content: 'updated' });
    await updateCommentHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('deleteCommentHandler returns 400 for malformed post ID', async () => {
    const { req, res } = createMockReqRes({ id: INVALID_UUID, commentId: VALID_UUID_2 });
    await deleteCommentHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  await test('deleteCommentHandler returns 400 for malformed comment ID', async () => {
    const { req, res } = createMockReqRes({ id: VALID_UUID, commentId: INVALID_UUID });
    await deleteCommentHandler(req, res);
    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getJSON().success, false);
  });

  console.log('\n--- 4. Feed Keyword Search Service & Query Construction ---');

  await test('getCommunityFeed constructs AND filter for search and privacy', async () => {
    let capturedWhere: any = null;
    const mockDb: any = {
      post: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          return [];
        },
        count: async () => 0,
      },
    };

    await getCommunityFeed({ page: 1, limit: 10, search: 'Kewat Milan' }, VALID_UUID, mockDb);

    assert(capturedWhere !== null, 'where was captured');
    assert(Array.isArray(capturedWhere.AND), 'where.AND is an array');
    assert.equal(capturedWhere.AND.length, 2);

    // Filter 0 is privacy filter
    const privacyPart = capturedWhere.AND[0];
    assert(Array.isArray(privacyPart.OR), 'Privacy filter is an OR clause');
    assert.deepEqual(privacyPart.OR[0], { groupId: null });
    assert.deepEqual(privacyPart.OR[1], { group: { privacy: 'PUBLIC' } });

    // Filter 1 is search filter
    const searchPart = capturedWhere.AND[1];
    assert(Array.isArray(searchPart.OR), 'Search filter is an OR clause');
    assert.deepEqual(searchPart.OR[0], { content: { contains: 'Kewat Milan', mode: 'insensitive' } });
    assert.deepEqual(searchPart.OR[1], { author: { profile: { fullName: { contains: 'Kewat Milan', mode: 'insensitive' } } } });
  });

  await test('getCommunityFeed ignores empty whitespace-only search string', async () => {
    let capturedWhere: any = null;
    const mockDb: any = {
      post: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          return [];
        },
        count: async () => 0,
      },
    };

    await getCommunityFeed({ page: 1, limit: 10, search: '     ' }, VALID_UUID, mockDb);

    assert(capturedWhere !== null);
    assert.equal(capturedWhere.AND, undefined, 'AND is omitted when search is whitespace only');
    assert(Array.isArray(capturedWhere.OR), 'where.OR contains top-level privacy clauses');
  });

  await test('getCommunityFeed without search preserves standard where.OR structure', async () => {
    let capturedWhere: any = null;
    const mockDb: any = {
      post: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          return [];
        },
        count: async () => 0,
      },
    };

    await getCommunityFeed({ page: 1, limit: 10 }, VALID_UUID, mockDb);

    assert(capturedWhere !== null);
    assert.equal(capturedWhere.AND, undefined);
    assert(Array.isArray(capturedWhere.OR));
    assert.equal(capturedWhere.author.status, 'ACTIVE');
  });

  console.log('\n--- 5. Tenant Database Security & Failsafe Invariants ---');

  await test('Missing tenant database client in getCommunityFeed fails closed with 400', async () => {
    try {
      await getCommunityFeed({ page: 1, limit: 10 }, VALID_UUID, undefined);
      assert.fail('Should have thrown PostServiceError');
    } catch (err: any) {
      assert(err instanceof PostServiceError);
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Tenant database client is required/);
    }
  });

  console.log('\n================================================================');
  console.log(`  Posts Refinements Tests: ${passedTests} Passed, ${totalTests - passedTests} Failed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests();


import http from 'http';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma, Role, UserStatus, PostType } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';

const ACTIVE_MEMBER_1_PHONE = '+919888800001';
const ACTIVE_MEMBER_2_PHONE = '+919888800002';
const PENDING_MEMBER_PHONE = '+919888800003';
const SUSPENDED_MEMBER_PHONE = '+919888800004';
const ADMIN_PHONE = '+919888800005';
const TEST_PASSWORD = 'TestPassword123!';

async function runCommunityPostsTests() {
  console.log('[Test] ====================================================');
  console.log('[Test] Running Phase 4A: Community Posts & Feed Tests');
  console.log('[Test] ====================================================');

  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });

  const allPhones = [
    ACTIVE_MEMBER_1_PHONE,
    ACTIVE_MEMBER_2_PHONE,
    PENDING_MEMBER_PHONE,
    SUSPENDED_MEMBER_PHONE,
    ADMIN_PHONE,
  ];

  // Clean previous test data
  await prisma.user.deleteMany({
    where: { phone: { in: allPhones } },
  });

  // Seed test users
  const activeMember1 = await prisma.user.create({
    data: {
      phone: ACTIVE_MEMBER_1_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Active Member One',
          city: 'Bhopal',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  const activeMember2 = await prisma.user.create({
    data: {
      phone: ACTIVE_MEMBER_2_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Active Member Two',
          city: 'Indore',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  const pendingMember = await prisma.user.create({
    data: {
      phone: PENDING_MEMBER_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.PENDING,
      isPhoneVerified: false,
      profile: {
        create: {
          fullName: 'Pending Verification Member',
        },
      },
    },
  });

  const suspendedMember = await prisma.user.create({
    data: {
      phone: SUSPENDED_MEMBER_PHONE,
      passwordHash,
      role: Role.MEMBER,
      status: UserStatus.SUSPENDED,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Suspended Member',
        },
      },
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      phone: ADMIN_PHONE,
      passwordHash,
      role: Role.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Community Admin',
          city: 'Bhopal',
        },
      },
    },
  });

  // Start ephemeral test server
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test] Server listening on ${baseUrl}`);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${title}`);
      passed++;
    } else {
      console.error(`[FAIL] ${title}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  }

  function makeToken(user: { id: string; phone: string; role: string; status: string }) {
    return jwt.sign(
      { sub: user.id, phone: user.phone, role: user.role, status: user.status },
      config.jwtAccessSecret,
      { expiresIn: '15m' }
    );
  }

  const tokenMember1 = makeToken({
    id: activeMember1.id,
    phone: activeMember1.phone,
    role: activeMember1.role,
    status: activeMember1.status,
  });

  const tokenMember2 = makeToken({
    id: activeMember2.id,
    phone: activeMember2.phone,
    role: activeMember2.role,
    status: activeMember2.status,
  });

  const tokenPending = makeToken({
    id: pendingMember.id,
    phone: pendingMember.phone,
    role: pendingMember.role,
    status: pendingMember.status,
  });

  const tokenSuspended = makeToken({
    id: suspendedMember.id,
    phone: suspendedMember.phone,
    role: suspendedMember.role,
    status: suspendedMember.status,
  });

  const tokenAdmin = makeToken({
    id: adminUser.id,
    phone: adminUser.phone,
    role: adminUser.role,
    status: adminUser.status,
  });

  let createdPost1Id = '';
  let createdPost2Id = '';

  try {
    // -------------------------------------------------------------
    // 1. Authentication & Status Enforcement Tests
    // -------------------------------------------------------------
    const noTokenRes = await fetch(`${baseUrl}/api/v1/posts`);
    assert(noTokenRes.status === 401, 'Test 1.1: Request without Bearer token is rejected with 401');

    const pendingRes = await fetch(`${baseUrl}/api/v1/posts`, {
      headers: { Authorization: `Bearer ${tokenPending}` },
    });
    const pendingBody: any = await pendingRes.json();
    assert(pendingRes.status === 403, 'Test 1.2: PENDING account is blocked with 403 Forbidden');
    assert(
      pendingBody.error.includes('pending verification'),
      'Test 1.3: PENDING account receives helpful verification restriction message'
    );

    const pendingCreateRes = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPending}`,
      },
      body: JSON.stringify({ content: 'Post by pending account' }),
    });
    assert(pendingCreateRes.status === 403, 'Test 1.4: PENDING account cannot create posts (403)');

    const suspendedRes = await fetch(`${baseUrl}/api/v1/posts`, {
      headers: { Authorization: `Bearer ${tokenSuspended}` },
    });
    assert(suspendedRes.status === 403, 'Test 1.5: SUSPENDED account is blocked with 403 Forbidden');

    // -------------------------------------------------------------
    // 2. Post Creation & Input Validation Tests
    // -------------------------------------------------------------
    // 2a: Empty content rejected
    const emptyPostRes = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({ content: '    ' }),
    });
    assert(emptyPostRes.status === 400, 'Test 2.1: Whitespace-only post content is rejected with 400');

    // 2b: Invalid post type rejected
    const badTypeRes = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({ content: 'Valid content', type: 'INVALID_TYPE' }),
    });
    assert(badTypeRes.status === 400, 'Test 2.2: Invalid post type is rejected with 400');

    // 2c: Valid General post creation by Active Member 1
    const create1Res = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({
        content: 'Namaste everyone! Welcome to our Apna Samaj community platform.',
        type: 'GENERAL',
      }),
    });
    const create1Body: any = await create1Res.json();
    assert(create1Res.status === 201, 'Test 2.3: Valid post creation succeeds with 201 Created');
    assert(create1Body.success === true, 'Test 2.4: Create response has success=true');
    assert(typeof create1Body.data?.id === 'string', 'Test 2.5: Created post ID returned');
    assert(create1Body.data?.author?.fullName === 'Active Member One', 'Test 2.6: Author profile included in response');
    assert(create1Body.data?.author?.city === 'Bhopal', 'Test 2.7: Author city included');
    assert(create1Body.data?.author?.phone === undefined, 'Test 2.8: Sensitive author phone is NOT exposed');
    assert(create1Body.data?.author?.passwordHash === undefined, 'Test 2.9: Password hash is NOT exposed');

    createdPost1Id = create1Body.data.id;

    // 2d: Valid Event post creation by Active Member 2
    const create2Res = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember2}`,
      },
      body: JSON.stringify({
        content: 'Community Milan Samaroh this Sunday at 10 AM in Indore!',
        type: 'EVENT',
      }),
    });
    const create2Body: any = await create2Res.json();
    assert(create2Res.status === 201, 'Test 2.10: Event post creation succeeds with 201');
    assert(create2Body.data?.type === 'EVENT', 'Test 2.11: Post type is correctly saved as EVENT');

    createdPost2Id = create2Body.data.id;

    // -------------------------------------------------------------
    // 3. Feed Retrieval & Pagination Tests
    // -------------------------------------------------------------
    const feedRes = await fetch(`${baseUrl}/api/v1/posts?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const feedBody: any = await feedRes.json();
    assert(feedRes.status === 200, 'Test 3.1: GET /api/v1/posts succeeds with 200 OK');
    assert(Array.isArray(feedBody.data?.posts), 'Test 3.2: Feed returns array of posts');
    assert(feedBody.data?.posts.length >= 2, 'Test 3.3: Returns at least 2 seeded posts');
    assert(feedBody.data?.pagination?.page === 1, 'Test 3.4: Pagination reflects current page');
    assert(feedBody.data?.pagination?.totalPosts >= 2, 'Test 3.5: Total count accurate');

    // Test reverse chronological ordering: newest (Post 2) comes first
    const firstPost = feedBody.data.posts[0];
    assert(firstPost.id === createdPost2Id, 'Test 3.6: Newest post appears first in feed');

    // Test filter by type=EVENT
    const eventFeedRes = await fetch(`${baseUrl}/api/v1/posts?type=EVENT`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const eventFeedBody: any = await eventFeedRes.json();
    assert(
      eventFeedBody.data.posts.every((p: any) => p.type === 'EVENT'),
      'Test 3.7: Feed filtered by type=EVENT returns only event posts'
    );

    // 3a. Batch 5B: First page with fewer posts than limit (skip count optimization)
    const authorFeedRes = await fetch(
      `${baseUrl}/api/v1/posts?page=1&limit=10&authorId=${activeMember1.id}`,
      { headers: { Authorization: `Bearer ${tokenMember1}` } }
    );
    const authorFeedBody: any = await authorFeedRes.json();
    assert(authorFeedRes.status === 200, 'Test 3.8: Feed filtered by authorId succeeds with 200 OK');
    assert(authorFeedBody.data.posts.length === 1, 'Test 3.9: First page returns 1 post (< limit of 10)');
    assert(authorFeedBody.data.pagination.page === 1, 'Test 3.10: Page is 1');
    assert(authorFeedBody.data.pagination.limit === 10, 'Test 3.11: Limit is 10');
    assert(authorFeedBody.data.pagination.totalPosts === 1, 'Test 3.12: totalPosts matches returned posts count exactly without full count');
    assert(authorFeedBody.data.pagination.totalPages === 1, 'Test 3.13: totalPages is 1');
    assert(authorFeedBody.data.pagination.hasMore === false, 'Test 3.14: hasMore is false');
    assert(authorFeedBody.data.posts[0].authorId === activeMember1.id, 'Test 3.15: Returned post matches requested author filter');

    // 3b. Batch 5B: First page with exactly limit posts (executes count query for exact totals)
    const exactLimitFeedRes = await fetch(`${baseUrl}/api/v1/posts?page=1&limit=1`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const exactLimitFeedBody: any = await exactLimitFeedRes.json();
    assert(exactLimitFeedRes.status === 200, 'Test 3.16: First page with limit=1 succeeds');
    assert(exactLimitFeedBody.data.posts.length === 1, 'Test 3.17: Returns exactly 1 post (= limit)');
    assert(exactLimitFeedBody.data.pagination.page === 1, 'Test 3.18: Page is 1');
    assert(exactLimitFeedBody.data.pagination.totalPosts >= 2, 'Test 3.19: Exact totalPosts executed via count query');
    assert(exactLimitFeedBody.data.pagination.totalPages >= 2, 'Test 3.20: totalPages reflects exact count');
    assert(exactLimitFeedBody.data.pagination.hasMore === true, 'Test 3.21: hasMore is true when more posts exist');

    // 3c. Batch 5B: Subsequent page (page > 1) preserves exact totals and pagination
    const page2FeedRes = await fetch(`${baseUrl}/api/v1/posts?page=2&limit=1`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const page2FeedBody: any = await page2FeedRes.json();
    assert(page2FeedRes.status === 200, 'Test 3.22: GET page 2 succeeds');
    assert(page2FeedBody.data.posts.length === 1, 'Test 3.23: Page 2 returns 1 post');
    assert(page2FeedBody.data.pagination.page === 2, 'Test 3.24: Pagination page is 2');
    assert(page2FeedBody.data.pagination.totalPosts === exactLimitFeedBody.data.pagination.totalPosts, 'Test 3.25: Exact totalPosts preserved on page 2');
    assert(page2FeedBody.data.posts[0].id !== exactLimitFeedBody.data.posts[0].id, 'Test 3.26: Page 2 returns different post than page 1');

    // 3d. Batch 5B: Empty feed query
    const emptyFeedRes = await fetch(
      `${baseUrl}/api/v1/posts?page=1&limit=10&authorId=${adminUser.id}`,
      { headers: { Authorization: `Bearer ${tokenMember1}` } }
    );
    const emptyFeedBody: any = await emptyFeedRes.json();
    assert(emptyFeedRes.status === 200, 'Test 3.27: Empty feed returns 200 OK');
    assert(emptyFeedBody.data.posts.length === 0, 'Test 3.28: Empty feed returns 0 posts');
    assert(emptyFeedBody.data.pagination.totalPosts === 0, 'Test 3.29: Empty feed totalPosts is 0');
    assert(emptyFeedBody.data.pagination.totalPages === 1, 'Test 3.30: Empty feed totalPages is 1');
    assert(emptyFeedBody.data.pagination.hasMore === false, 'Test 3.31: Empty feed hasMore is false');

    // 3e. Batch 5B: Likes, comments counts, and isLikedByMe resolution
    const likePost2Res = await fetch(`${baseUrl}/api/v1/posts/${createdPost2Id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    assert(likePost2Res.status === 200, 'Test 3.32: Member 1 likes Post 2');

    const commentPost2Res = await fetch(`${baseUrl}/api/v1/posts/${createdPost2Id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({ content: 'Looking forward to the event!' }),
    });
    assert(commentPost2Res.status === 201, 'Test 3.33: Member 1 comments on Post 2');

    // Fetch feed as Member 1 (should see isLikedByMe = true, likesCount = 1, commentsCount = 1)
    const feedMember1Res = await fetch(`${baseUrl}/api/v1/posts?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const feedMember1Body: any = await feedMember1Res.json();
    const post2ForM1 = feedMember1Body.data.posts.find((p: any) => p.id === createdPost2Id);
    assert(post2ForM1 !== undefined, 'Test 3.34: Post 2 found in feed for Member 1');
    assert(post2ForM1.likesCount === 1, 'Test 3.35: Post 2 likesCount is 1 for Member 1');
    assert(post2ForM1.commentsCount === 1, 'Test 3.36: Post 2 commentsCount is 1 for Member 1');
    assert(post2ForM1.isLikedByMe === true, 'Test 3.37: Post 2 isLikedByMe is true for Member 1');

    // Fetch feed as Member 2 (should see isLikedByMe = false, likesCount = 1, commentsCount = 1)
    const feedMember2Res = await fetch(`${baseUrl}/api/v1/posts?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    const feedMember2Body: any = await feedMember2Res.json();
    const post2ForM2 = feedMember2Body.data.posts.find((p: any) => p.id === createdPost2Id);
    assert(post2ForM2 !== undefined, 'Test 3.38: Post 2 found in feed for Member 2');
    assert(post2ForM2.likesCount === 1, 'Test 3.39: Post 2 likesCount is 1 for Member 2');
    assert(post2ForM2.commentsCount === 1, 'Test 3.40: Post 2 commentsCount is 1 for Member 2');
    assert(post2ForM2.isLikedByMe === false, 'Test 3.41: Post 2 isLikedByMe is false for Member 2');


    // -------------------------------------------------------------
    // 4. Retrieve Single Post Tests
    // -------------------------------------------------------------
    const getSingleRes = await fetch(`${baseUrl}/api/v1/posts/${createdPost1Id}`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const getSingleBody: any = await getSingleRes.json();
    assert(getSingleRes.status === 200, 'Test 4.1: Retrieve post by ID succeeds with 200 OK');
    assert(getSingleBody.data?.id === createdPost1Id, 'Test 4.2: Correct post ID returned');
    assert(getSingleBody.data?.content.includes('Namaste everyone'), 'Test 4.3: Correct content returned');

    const notFoundRes = await fetch(`${baseUrl}/api/v1/posts/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    assert(notFoundRes.status === 404, 'Test 4.4: Non-existent post returns 404 Not Found');

    // -------------------------------------------------------------
    // 5. Post Editing & Ownership Tests
    // -------------------------------------------------------------
    // 5a: Non-owner member trying to edit Post 1 (author: Member 1) with Member 2's token
    const nonOwnerEditRes = await fetch(`${baseUrl}/api/v1/posts/${createdPost1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember2}`,
      },
      body: JSON.stringify({ content: 'Tampered content by non-owner' }),
    });
    assert(nonOwnerEditRes.status === 403, 'Test 5.1: Non-owner member cannot edit post (403 Forbidden)');

    // 5b: Post owner editing their own post
    const ownerEditRes = await fetch(`${baseUrl}/api/v1/posts/${createdPost1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({
        content: 'Namaste everyone! Welcome to our updated Apna Samaj community platform.',
      }),
    });
    const ownerEditBody: any = await ownerEditRes.json();
    assert(ownerEditRes.status === 200, 'Test 5.2: Owner can edit their own post (200 OK)');
    assert(
      ownerEditBody.data?.content.includes('updated Apna Samaj'),
      'Test 5.3: Updated content persisted and returned'
    );

    // -------------------------------------------------------------
    // 6. Post Deletion & Ownership / Moderation Tests
    // -------------------------------------------------------------
    // 6a: Non-owner member trying to delete Post 2 (author: Member 2) with Member 1's token
    const nonOwnerDeleteRes = await fetch(`${baseUrl}/api/v1/posts/${createdPost2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    assert(nonOwnerDeleteRes.status === 403, 'Test 6.1: Non-owner member cannot delete post (403 Forbidden)');

    // 6b: Administrative moderation deletion by Admin on Post 2
    const adminDeleteRes = await fetch(`${baseUrl}/api/v1/posts/${createdPost2Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert(adminDeleteRes.status === 200, 'Test 6.2: Admin moderator can delete any member post (200 OK)');

    // Verify Post 2 was actually deleted from database
    const post2InDb = await prisma.post.findUnique({ where: { id: createdPost2Id } });
    assert(post2InDb === null, 'Test 6.3: Post 2 removed from database');

    // Verify AuditLog record was created for administrative moderation deletion
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        targetType: 'Post',
        targetId: createdPost2Id,
        action: 'MODERATION_DELETE_POST',
      },
    });
    assert(auditRecord !== null, 'Test 6.4: AuditLog record created for moderator deletion');
    assert(auditRecord?.actorId === adminUser.id, 'Test 6.5: AuditLog records correct moderator ID');

    // 6c: Post owner deleting their own post (Post 1 by Member 1)
    const ownerDeleteRes = await fetch(`${baseUrl}/api/v1/posts/${createdPost1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    assert(ownerDeleteRes.status === 200, 'Test 6.6: Owner can delete their own post (200 OK)');

    const post1InDb = await prisma.post.findUnique({ where: { id: createdPost1Id } });
    assert(post1InDb === null, 'Test 6.7: Post 1 removed from database');
  } finally {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { phone: { in: allPhones } },
    });

    server.close();
    await prisma.$disconnect();
  }

  console.log('[Test] ====================================================');
  console.log(`[Test] Completed: ${passed} passed, ${failed} failed`);
  console.log('[Test] ====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runCommunityPostsTests().catch((err) => {
  console.error('[Test] Fatal error running community posts tests:', err);
  process.exit(1);
});

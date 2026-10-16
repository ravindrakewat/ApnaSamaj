import http from 'http';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { prisma, Role, UserStatus, PostType } from '@apnasamaj/database';
import { createApp } from '../app';
import { config } from '../config/env';

const ACTIVE_MEMBER_1_PHONE = '+919666600001';
const ACTIVE_MEMBER_2_PHONE = '+919666600002';
const PENDING_MEMBER_PHONE = '+919666600003';
const SUSPENDED_MEMBER_PHONE = '+919666600004';
const ADMIN_PHONE = '+919666600005';
const TEST_PASSWORD = 'TestPassword123!';

async function runLikesAndCommentsTests() {
  console.log('[Test] ====================================================');
  console.log('[Test] Running Phase 4C: Post Likes and Comments Tests');
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

  // Clean previous test users
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
          fullName: 'Likes Tester One',
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
          fullName: 'Likes Tester Two',
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
          fullName: 'Pending Tester',
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
          fullName: 'Suspended Tester',
        },
      },
    },
  });

  const adminMember = await prisma.user.create({
    data: {
      phone: ADMIN_PHONE,
      passwordHash,
      role: Role.COMMUNITY_ADMIN,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
      profile: {
        create: {
          fullName: 'Admin Moderator',
          city: 'Bhopal',
          state: 'Madhya Pradesh',
        },
      },
    },
  });

  // Create an initial post by activeMember1
  const testPost = await prisma.post.create({
    data: {
      authorId: activeMember1.id,
      content: 'Community discussion post for likes & comments test.',
      type: PostType.GENERAL,
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
    id: adminMember.id,
    phone: adminMember.phone,
    role: adminMember.role,
    status: adminMember.status,
  });

  try {
    // ---------------------------------------------------------------
    // 1. Authorization: Likes & Comments requires ACTIVE status
    // ---------------------------------------------------------------
    console.log('\n--- 1. Authorization Checks for Likes & Comments ---');

    // Unauthenticated like
    const resUnauthLike = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
    });
    assert(resUnauthLike.status === 401, 'Unauthenticated like returns 401 Unauthorized');

    // Pending member like
    const resPendingLike = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenPending}` },
    });
    assert(resPendingLike.status === 403, 'Pending member like returns 403 Forbidden');

    // Suspended member like
    const resSuspendedLike = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSuspended}` },
    });
    assert(resSuspendedLike.status === 403, 'Suspended member like returns 403 Forbidden');

    // Unauthenticated comment
    const resUnauthComment = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello' }),
    });
    assert(resUnauthComment.status === 401, 'Unauthenticated comment returns 401 Unauthorized');

    // Pending member comment
    const resPendingComment = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenPending}`,
      },
      body: JSON.stringify({ content: 'Hello' }),
    });
    assert(resPendingComment.status === 403, 'Pending member comment returns 403 Forbidden');

    // Suspended member comment
    const resSuspendedComment = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSuspended}`,
      },
      body: JSON.stringify({ content: 'Hello' }),
    });
    assert(resSuspendedComment.status === 403, 'Suspended member comment returns 403 Forbidden');

    // ---------------------------------------------------------------
    // 2. Post Likes: Lifecycle, Idempotency, and Concurrency
    // ---------------------------------------------------------------
    console.log('\n--- 2. Post Likes Lifecycle, Idempotency, and Concurrency ---');

    // Active Member 1 likes post
    const resLike1 = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataLike1 = ((await resLike1.json()) as any);
    assert(resLike1.status === 200, 'Active Member 1 likes post (200 OK)');
    assert(
      dataLike1.data.likesCount === 1 && dataLike1.data.isLikedByMe === true,
      'Like response returns likesCount: 1 and isLikedByMe: true'
    );

    // Duplicate like by Member 1 (idempotency check)
    const resLikeDup = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataLikeDup = ((await resLikeDup.json()) as any);
    assert(
      resLikeDup.status === 200 && dataLikeDup.data.likesCount === 1,
      'Duplicate like is idempotent; likesCount remains 1'
    );

    // Member 2 also likes post
    const resLike2 = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    const dataLike2 = ((await resLike2.json()) as any);
    assert(
      resLike2.status === 200 && dataLike2.data.likesCount === 2,
      'Active Member 2 likes post; likesCount increments to 2'
    );

    // GET /posts/:id/likes check for Member 1 vs Member 2
    const resGetLikesM1 = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/likes`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataGetLikesM1 = ((await resGetLikesM1.json()) as any);
    assert(
      dataGetLikesM1.data.likesCount === 2 && dataGetLikesM1.data.isLikedByMe === true,
      'GET /posts/:id/likes returns correct likesCount and isLikedByMe for Member 1'
    );

    // Unlike post by Member 1
    const resUnlike1 = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataUnlike1 = ((await resUnlike1.json()) as any);
    assert(
      resUnlike1.status === 200 &&
        dataUnlike1.data.likesCount === 1 &&
        dataUnlike1.data.isLikedByMe === false,
      'Active Member 1 unlikes post; likesCount decrements to 1 and isLikedByMe: false'
    );

    // Duplicate unlike by Member 1 (idempotency check)
    const resUnlikeDup = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataUnlikeDup = ((await resUnlikeDup.json()) as any);
    assert(
      resUnlikeDup.status === 200 && dataUnlikeDup.data.likesCount === 1,
      'Duplicate unlike is idempotent; likesCount remains 1'
    );

    // Community Feed query checks isLikedByMe per user
    const resFeedM1 = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataFeedM1 = ((await resFeedM1.json()) as any);
    const postInFeedM1 = dataFeedM1.data.posts.find((p: any) => p.id === testPost.id);
    assert(
      postInFeedM1 && postInFeedM1.likesCount === 1 && postInFeedM1.isLikedByMe === false,
      'Feed returns correct likesCount and isLikedByMe: false for Member 1'
    );

    const resFeedM2 = await fetch(`${baseUrl}/api/v1/posts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    const dataFeedM2 = ((await resFeedM2.json()) as any);
    const postInFeedM2 = dataFeedM2.data.posts.find((p: any) => p.id === testPost.id);
    assert(
      postInFeedM2 && postInFeedM2.likesCount === 1 && postInFeedM2.isLikedByMe === true,
      'Feed returns correct likesCount and isLikedByMe: true for Member 2'
    );

    // ---------------------------------------------------------------
    // 3. Comment Validation
    // ---------------------------------------------------------------
    console.log('\n--- 3. Comment Content Validation ---');

    // Empty comment
    const resEmptyComment = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({ content: '    ' }),
    });
    assert(resEmptyComment.status === 400, 'Empty comment is rejected with 400 Bad Request');

    // Oversized comment (> 1000 chars)
    const longContent = 'A'.repeat(1005);
    const resLongComment = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({ content: longContent }),
    });
    assert(
      resLongComment.status === 400,
      'Comment exceeding 1000 characters is rejected with 400 Bad Request'
    );

    // ---------------------------------------------------------------
    // 4. Create Comments & Pagination
    // ---------------------------------------------------------------
    console.log('\n--- 4. Create Comments & Pagination ---');

    // Member 1 creates comment 1
    const resCreateC1 = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember1}`,
      },
      body: JSON.stringify({ content: 'First insightful comment by Member 1!' }),
    });
    const dataCreateC1 = ((await resCreateC1.json()) as any);
    assert(resCreateC1.status === 201, 'Member 1 posts comment (201 Created)');
    assert(
      dataCreateC1.data.content === 'First insightful comment by Member 1!' &&
        dataCreateC1.data.author.fullName === 'Likes Tester One' &&
        !('passwordHash' in dataCreateC1.data.author),
      'Created comment returns sanitized author details without secrets'
    );

    const comment1Id = dataCreateC1.data.id;

    // Member 2 creates comment 2
    const resCreateC2 = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenMember2}`,
      },
      body: JSON.stringify({ content: 'Second thoughtful comment by Member 2!' }),
    });
    const dataCreateC2 = ((await resCreateC2.json()) as any);
    assert(resCreateC2.status === 201, 'Member 2 posts comment (201 Created)');
    const comment2Id = dataCreateC2.data.id;

    // Verify post commentsCount in single post endpoint
    const resSinglePost = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenMember1}` },
    });
    const dataSinglePost = ((await resSinglePost.json()) as any);
    assert(
      dataSinglePost.data.commentsCount === 2,
      'Single post endpoint reflects updated commentsCount: 2'
    );

    // Paginated comments: Page 1 with limit 1
    const resCommentsP1 = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments?page=1&limit=1`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenMember1}` },
      }
    );
    const dataCommentsP1 = ((await resCommentsP1.json()) as any);
    assert(resCommentsP1.status === 200, 'GET /posts/:id/comments returns 200 OK');
    assert(
      dataCommentsP1.data.comments.length === 1 &&
        dataCommentsP1.data.comments[0].id === comment1Id &&
        dataCommentsP1.data.pagination.hasMore === true &&
        dataCommentsP1.data.pagination.totalComments === 2,
      'Page 1 returns first chronological comment with hasMore: true'
    );

    // Page 2 with limit 1
    const resCommentsP2 = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments?page=2&limit=1`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenMember1}` },
      }
    );
    const dataCommentsP2 = ((await resCommentsP2.json()) as any);
    assert(
      dataCommentsP2.data.comments.length === 1 &&
        dataCommentsP2.data.comments[0].id === comment2Id &&
        dataCommentsP2.data.pagination.hasMore === false,
      'Page 2 returns second comment with hasMore: false'
    );

    // ---------------------------------------------------------------
    // 5. Comment Edit & Ownership
    // ---------------------------------------------------------------
    console.log('\n--- 5. Comment Edit & Ownership ---');

    // Member 2 attempts to edit Member 1's comment
    const resForbiddenEditC = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments/${comment1Id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenMember2}`,
        },
        body: JSON.stringify({ content: 'Unauthorized edit attempt' }),
      }
    );
    assert(
      resForbiddenEditC.status === 403,
      'Non-owner cannot edit another member comment (403 Forbidden)'
    );

    // Member 1 edits their own comment
    const resEditC1 = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments/${comment1Id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenMember1}`,
        },
        body: JSON.stringify({ content: 'Edited first comment content!' }),
      }
    );
    const dataEditC1 = ((await resEditC1.json()) as any);
    assert(resEditC1.status === 200, 'Comment author successfully edits comment (200 OK)');
    assert(
      dataEditC1.data.content === 'Edited first comment content!',
      'Updated comment content persisted and returned'
    );

    // ---------------------------------------------------------------
    // 6. Comment Deletion & Admin Moderation
    // ---------------------------------------------------------------
    console.log('\n--- 6. Comment Deletion & Admin Moderation ---');

    // Member 2 attempts to delete Member 1's comment
    const resForbiddenDeleteC = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments/${comment1Id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenMember2}` },
      }
    );
    assert(
      resForbiddenDeleteC.status === 403,
      'Non-owner member cannot delete comment (403 Forbidden)'
    );

    // Admin Moderator deletes Member 1's comment
    const resAdminDeleteC = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments/${comment1Id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      }
    );
    assert(
      resAdminDeleteC.status === 200,
      'Community Admin moderator successfully deletes comment (200 OK)'
    );

    // Verify AuditLog was recorded for moderation delete
    const auditRecord = await prisma.auditLog.findFirst({
      where: {
        action: 'MODERATION_DELETE_COMMENT',
        targetId: comment1Id,
      },
    });
    assert(
      auditRecord !== null && auditRecord.actorId === adminMember.id,
      'AuditLog record created for administrative comment moderation'
    );

    // Member 2 deletes their own comment
    const resDeleteC2 = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments/${comment2Id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenMember2}` },
      }
    );
    assert(resDeleteC2.status === 200, 'Member 2 deletes their own comment (200 OK)');

    // Verify comments count is now 0 in DB
    const dbCommentsCount = await prisma.comment.count({ where: { postId: testPost.id } });
    assert(dbCommentsCount === 0, 'All comments deleted from database');

    // ---------------------------------------------------------------
    // 7. Inactive / Suspended Author Post Interaction Restriction
    // ---------------------------------------------------------------
    console.log('\n--- 7. Inactive Author Post Visibility & Interaction ---');

    // Suspend author of testPost
    await prisma.user.update({
      where: { id: activeMember1.id },
      data: { status: UserStatus.SUSPENDED },
    });

    // Attempt to like post of suspended author
    const resLikeSuspendedPost = await fetch(`${baseUrl}/api/v1/posts/${testPost.id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMember2}` },
    });
    assert(
      resLikeSuspendedPost.status === 404,
      'Liking post of suspended author returns 404 Post not found / unavailable'
    );

    // Attempt to comment on post of suspended author
    const resCommentSuspendedPost = await fetch(
      `${baseUrl}/api/v1/posts/${testPost.id}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenMember2}`,
        },
        body: JSON.stringify({ content: 'Should fail' }),
      }
    );
    assert(
      resCommentSuspendedPost.status === 404,
      'Commenting on post of suspended author returns 404 Post not found / unavailable'
    );

    // Clean up testPost
    await prisma.post.delete({ where: { id: testPost.id } });

  } finally {
    // Teardown
    server.close();
    await prisma.user.deleteMany({
      where: { phone: { in: allPhones } },
    });
    await prisma.$disconnect();
  }

  console.log('\n[Test] ====================================================');
  console.log(`[Test] Test Summary: ${passed} passed, ${failed} failed`);
  console.log('[Test] ====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLikesAndCommentsTests().catch((err) => {
  console.error('[Test] Unhandled error during test execution:', err);
  process.exit(1);
});

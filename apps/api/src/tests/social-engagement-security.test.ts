import assert from 'node:assert';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { config } from '../config/env';
import { tenantDbManager, PrismaClient } from '@apnasamaj/database';
import { UserRole, UserStatus, PostType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14C: Social Engagement Security Tests    ');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function assertTest(condition: boolean, message: string, detail?: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${message}${detail ? ' - ' + detail : ''}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Multi-Tenant Mock State
// ---------------------------------------------------------------------------

interface MockTenantStore {
  users: Array<{
    id: string;
    phone: string;
    role: string;
    status: string;
    isPhoneVerified: boolean;
    profile: {
      fullName: string;
      avatarUrl: string | null;
      city: string | null;
      state: string | null;
    } | null;
  }>;
  posts: Array<{
    id: string;
    authorId: string;
    groupId: string | null;
    content: string;
    type: string;
    isPinned: boolean;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      role: string;
      status: string;
      profile: {
        fullName: string;
        avatarUrl: string | null;
        city: string | null;
        state: string | null;
      } | null;
    };
    group?: {
      id: string;
      privacy: 'PUBLIC' | 'PRIVATE';
    } | null;
    media: any[];
  }>;
  postLikes: Array<{
    id: string;
    postId: string;
    userId: string;
    createdAt: Date;
  }>;
  comments: Array<{
    id: string;
    postId: string;
    authorId: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      role: string;
      profile: {
        fullName: string;
        avatarUrl: string | null;
        city: string | null;
        state: string | null;
      } | null;
    };
  }>;
  groupMembers: Array<{
    id: string;
    groupId: string;
    userId: string;
    role: string;
  }>;
  auditLogs: Array<{
    id: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    details: any;
  }>;
}

function createTenantClient(tenantSlug: string, store: MockTenantStore): PrismaClient {
  const client: any = {
    user: {
      findUnique: async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      },
    },
    profile: {
      findUnique: async ({ where }: any) => {
        const u = store.users.find((user) => user.id === where.userId);
        return u?.profile ? { fullName: u.profile.fullName } : null;
      },
    },
    post: {
      findUnique: async ({ where, include, select }: any) => {
        const post = store.posts.find((p) => p.id === where.id);
        if (!post) return null;

        if (select) {
          const res: any = {};
          if (select.id) res.id = post.id;
          if (select.authorId) res.authorId = post.authorId;
          if (select.groupId) res.groupId = post.groupId;
          if (select.author) res.author = { status: post.author.status };
          if (select.group) res.group = post.group ? { id: post.group.id, privacy: post.group.privacy } : null;
          return res;
        }

        const likesCount = store.postLikes.filter((l) => l.postId === post.id).length;
        const commentsCount = store.comments.filter((c) => c.postId === post.id).length;

        return {
          ...post,
          _count: {
            likes: likesCount,
            comments: commentsCount,
            views: 0,
          },
        };
      },
      count: async () => store.posts.length,
    },
    postLike: {
      findUnique: async ({ where }: any) => {
        if (where.postId_userId) {
          return (
            store.postLikes.find(
              (l) => l.postId === where.postId_userId.postId && l.userId === where.postId_userId.userId
            ) || null
          );
        }
        return null;
      },
      upsert: async ({ where, create }: any) => {
        const existing = store.postLikes.find(
          (l) => l.postId === where.postId_userId.postId && l.userId === where.postId_userId.userId
        );
        if (existing) return existing;
        const newLike = {
          id: `like-${Date.now()}-${Math.random()}`,
          postId: create.postId,
          userId: create.userId,
          createdAt: new Date(),
        };
        store.postLikes.push(newLike);
        return newLike;
      },
      deleteMany: async ({ where }: any) => {
        const initialCount = store.postLikes.length;
        store.postLikes = store.postLikes.filter(
          (l) => !(l.postId === where.postId && l.userId === where.userId)
        );
        return { count: initialCount - store.postLikes.length };
      },
      count: async ({ where }: any) => {
        return store.postLikes.filter((l) => l.postId === where.postId).length;
      },
    },
    comment: {
      findUnique: async ({ where }: any) => {
        return store.comments.find((c) => c.id === where.id) || null;
      },
      findMany: async ({ where }: any) => {
        return store.comments.filter((c) => c.postId === where.postId);
      },
      create: async ({ data }: any) => {
        const user = store.users.find((u) => u.id === data.authorId);
        const newComment = {
          id: `comment-${Date.now()}-${Math.random()}`,
          postId: data.postId,
          authorId: data.authorId,
          content: data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
          author: {
            id: data.authorId,
            role: user?.role || 'MEMBER',
            profile: user?.profile || null,
          },
        };
        store.comments.push(newComment);
        return newComment;
      },
      update: async ({ where, data }: any) => {
        const comment = store.comments.find((c) => c.id === where.id);
        if (!comment) throw new Error('Comment not found');
        comment.content = data.content;
        comment.updatedAt = new Date();
        return comment;
      },
      delete: async ({ where }: any) => {
        const idx = store.comments.findIndex((c) => c.id === where.id);
        if (idx !== -1) store.comments.splice(idx, 1);
        return { id: where.id };
      },
      count: async ({ where }: any) => {
        return store.comments.filter((c) => c.postId === where.postId).length;
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        if (where.groupId_userId) {
          return (
            store.groupMembers.find(
              (m) =>
                m.groupId === where.groupId_userId.groupId &&
                m.userId === where.groupId_userId.userId
            ) || null
          );
        }
        return null;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const log = { id: `audit-${Date.now()}`, ...data };
        store.auditLogs.push(log);
        return log;
      },
    },
    notification: {
      create: async () => ({ id: 'notif-1' }),
    },
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(client),
    $disconnect: async () => {},
  };

  return client as PrismaClient;
}

function makeToken(
  user: { id: string; phone: string; role: string; status: string },
  communitySlug?: string
) {
  return jwt.sign(
    {
      sub: user.id,
      phone: user.phone,
      role: user.role,
      status: user.status,
      ...(communitySlug ? { communitySlug } : {}),
    },
    config.jwtAccessSecret,
    { expiresIn: '15m' }
  );
}

async function runSecurityTests() {
  // Set up mock data for Community Kewat and Community Gupta
  const userKewatActive = {
    id: 'user-kewat-1',
    phone: '+919800000001',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    profile: { fullName: 'Kewat Active Member', avatarUrl: null, city: 'Indore', state: 'MP' },
  };

  const userKewatAdmin = {
    id: 'user-kewat-admin',
    phone: '+919800000002',
    role: UserRole.COMMUNITY_ADMIN,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    profile: { fullName: 'Kewat Moderator', avatarUrl: null, city: 'Indore', state: 'MP' },
  };

  const userKewatSuspended = {
    id: 'user-kewat-suspended',
    phone: '+919800000003',
    role: UserRole.MEMBER,
    status: UserStatus.SUSPENDED,
    isPhoneVerified: true,
    profile: { fullName: 'Kewat Suspended Member', avatarUrl: null, city: 'Indore', state: 'MP' },
  };

  const userGuptaActive = {
    id: 'user-gupta-1',
    phone: '+919800000004',
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    isPhoneVerified: true,
    profile: { fullName: 'Gupta Active Member', avatarUrl: null, city: 'Jaipur', state: 'Rajasthan' },
  };

  const publicPostKewat = {
    id: 'post-kewat-public',
    authorId: userKewatActive.id,
    groupId: null,
    content: 'Kewat Community public announcement.',
    type: 'GENERAL',
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: userKewatActive.id,
      role: userKewatActive.role,
      status: userKewatActive.status,
      profile: userKewatActive.profile,
    },
    group: null,
    media: [],
  };

  const privateGroupPostKewat = {
    id: 'post-kewat-private',
    authorId: userKewatActive.id,
    groupId: 'grp-kewat-council',
    content: 'Kewat Community private council discussion.',
    type: 'GENERAL',
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: userKewatActive.id,
      role: userKewatActive.role,
      status: userKewatActive.status,
      profile: userKewatActive.profile,
    },
    group: {
      id: 'grp-kewat-council',
      privacy: 'PRIVATE' as const,
    },
    media: [],
  };

  const publicPostGupta = {
    id: 'post-gupta-public',
    authorId: userGuptaActive.id,
    groupId: null,
    content: 'Gupta Community public post.',
    type: 'GENERAL',
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: {
      id: userGuptaActive.id,
      role: userGuptaActive.role,
      status: userGuptaActive.status,
      profile: userGuptaActive.profile,
    },
    group: null,
    media: [],
  };

  const kewatStore: MockTenantStore = {
    users: [userKewatActive, userKewatAdmin, userKewatSuspended],
    posts: [publicPostKewat, privateGroupPostKewat],
    postLikes: [],
    comments: [],
    groupMembers: [
      { id: 'gm-1', groupId: 'grp-kewat-council', userId: userKewatActive.id, role: 'MEMBER' },
    ],
    auditLogs: [],
  };

  const guptaStore: MockTenantStore = {
    users: [userGuptaActive],
    posts: [publicPostGupta],
    postLikes: [],
    comments: [],
    groupMembers: [],
    auditLogs: [],
  };

  const kewatClient = createTenantClient('kewat', kewatStore);
  const guptaClient = createTenantClient('gupta', guptaStore);

  tenantDbManager.setClient('kewat', kewatClient, 'Kewat Samaj');
  tenantDbManager.setClient('gupta', guptaClient, 'Gupta Samaj');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const tokenKewatActive = makeToken(userKewatActive, 'kewat');
  const tokenKewatAdmin = makeToken(userKewatAdmin, 'kewat');
  const tokenKewatSuspended = makeToken(userKewatSuspended, 'kewat');
  const tokenGuptaActive = makeToken(userGuptaActive, 'gupta');

  try {
    // -----------------------------------------------------------------------
    // 1. Cross-Tenant Isolation: Like and Comment Rejection
    // -----------------------------------------------------------------------
    console.log('--- 1. Cross-Tenant Boundary Enforcement ---');
    {
      // Attempting to like Kewat post using Gupta tenant header & token
      const resCrossLike = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenGuptaActive}`,
          'X-Community-Slug': 'gupta',
        },
      });
      assertTest(
        resCrossLike.status === 404,
        'Cannot like Kewat post from Gupta tenant context (returns 404 Post not found)'
      );

      // Attempting to comment on Kewat post using Gupta tenant header & token
      const resCrossComment = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenGuptaActive}`,
          'X-Community-Slug': 'gupta',
        },
        body: JSON.stringify({ content: 'Cross-tenant injection comment' }),
      });
      assertTest(
        resCrossComment.status === 404,
        'Cannot comment on Kewat post from Gupta tenant context (returns 404 Post not found)'
      );

      // Cross-tenant token attack: using Kewat token with Gupta header
      const resTokenMismatch = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'gupta',
        },
      });
      assertTest(
        resTokenMismatch.status === 403,
        'Cross-tenant token mismatch (Kewat token with Gupta header) rejected with 403 Forbidden'
      );
    }

    // -----------------------------------------------------------------------
    // 2. Private Group Access Enforcement
    // -----------------------------------------------------------------------
    console.log('\n--- 2. Private Group Access Control ---');
    {
      // Non-member (Kewat Admin or another user who is NOT a group member)
      const resNonMemberLike = await fetch(`${baseUrl}/api/v1/posts/${privateGroupPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatAdmin}`,
          'X-Community-Slug': 'kewat',
        },
      });
      assertTest(
        resNonMemberLike.status === 404,
        'Non-member cannot like private-group post (returns 404 Post not found / unavailable)'
      );

      const resNonMemberComment = await fetch(
        `${baseUrl}/api/v1/posts/${privateGroupPostKewat.id}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenKewatAdmin}`,
            'X-Community-Slug': 'kewat',
          },
          body: JSON.stringify({ content: 'Unauthorized comment in private council' }),
        }
      );
      assertTest(
        resNonMemberComment.status === 404,
        'Non-member cannot comment on private-group post (returns 404)'
      );

      // Active member of the private group CAN like and comment
      const resMemberLike = await fetch(`${baseUrl}/api/v1/posts/${privateGroupPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'kewat',
        },
      });
      assertTest(resMemberLike.status === 200, 'Active group member successfully likes private-group post');

      const resMemberComment = await fetch(
        `${baseUrl}/api/v1/posts/${privateGroupPostKewat.id}/comments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenKewatActive}`,
            'X-Community-Slug': 'kewat',
          },
          body: JSON.stringify({ content: 'Official council discussion note.' }),
        }
      );
      assertTest(resMemberComment.status === 201, 'Active group member successfully comments on private-group post');
    }

    // -----------------------------------------------------------------------
    // 3. Suspended User & Status Authorization
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Suspended User Restriction ---');
    {
      // Suspended user attempting to like
      const resSuspendedLike = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatSuspended}`,
          'X-Community-Slug': 'kewat',
        },
      });
      assertTest(
        resSuspendedLike.status === 403,
        'Suspended caller like request is rejected with 403 Forbidden'
      );

      // Suspended user attempting to comment
      const resSuspendedComment = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenKewatSuspended}`,
          'X-Community-Slug': 'kewat',
        },
        body: JSON.stringify({ content: 'Suspended user trying to speak' }),
      });
      assertTest(
        resSuspendedComment.status === 403,
        'Suspended caller comment request is rejected with 403 Forbidden'
      );
    }

    // -----------------------------------------------------------------------
    // 4. Like / Unlike Idempotency and State Consistency
    // -----------------------------------------------------------------------
    console.log('\n--- 4. Like / Unlike Idempotency & Count Integrity ---');
    {
      // Like post
      const resLike1 = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'kewat',
        },
      });
      const dataLike1 = ((await resLike1.json()) as any).data;
      assertTest(dataLike1.likesCount === 1, 'Initial like records count 1');
      assertTest(dataLike1.isLikedByMe === true, 'Initial like sets isLikedByMe: true');

      // Duplicate like (idempotency check)
      const resLikeDup = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'kewat',
        },
      });
      const dataLikeDup = ((await resLikeDup.json()) as any).data;
      assertTest(dataLikeDup.likesCount === 1, 'Duplicate like does not double-count');
      assertTest(dataLikeDup.isLikedByMe === true, 'Duplicate like preserves isLikedByMe: true');

      // Unlike
      const resUnlike1 = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'kewat',
        },
      });
      const dataUnlike1 = ((await resUnlike1.json()) as any).data;
      assertTest(dataUnlike1.likesCount === 0, 'Unlike decrements count to 0');
      assertTest(dataUnlike1.isLikedByMe === false, 'Unlike sets isLikedByMe: false');

      // Duplicate unlike
      const resUnlikeDup = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/like`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'kewat',
        },
      });
      const dataUnlikeDup = ((await resUnlikeDup.json()) as any).data;
      assertTest(dataUnlikeDup.likesCount === 0, 'Duplicate unlike preserves count 0');
      assertTest(dataUnlikeDup.isLikedByMe === false, 'Duplicate unlike preserves isLikedByMe: false');
    }

    // -----------------------------------------------------------------------
    // 5. Comment Edit & Deletion Ownership with Moderation Audit
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Comment Ownership & Moderator Audit ---');
    {
      // Create comment by Kewat Active
      const resCreate = await fetch(`${baseUrl}/api/v1/posts/${publicPostKewat.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenKewatActive}`,
          'X-Community-Slug': 'kewat',
        },
        body: JSON.stringify({ content: 'Comment for ownership check' }),
      });
      const createdComment = ((await resCreate.json()) as any).data;
      const commentId = createdComment.id;

      // Kewat Admin attempts to edit Kewat Active's comment
      const resForbiddenEdit = await fetch(
        `${baseUrl}/api/v1/posts/${publicPostKewat.id}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenKewatAdmin}`,
            'X-Community-Slug': 'kewat',
          },
          body: JSON.stringify({ content: 'Admin trying to edit member comment' }),
        }
      );
      assertTest(
        resForbiddenEdit.status === 403,
        'Admin cannot edit another member comment (ownership strictly enforced: 403)'
      );

      // Kewat Active edits their own comment
      const resOwnerEdit = await fetch(
        `${baseUrl}/api/v1/posts/${publicPostKewat.id}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenKewatActive}`,
            'X-Community-Slug': 'kewat',
          },
          body: JSON.stringify({ content: 'Edited by the actual author' }),
        }
      );
      assertTest(resOwnerEdit.status === 200, 'Author successfully edits their own comment');

      // Kewat Admin moderates / deletes member comment
      const resAdminDelete = await fetch(
        `${baseUrl}/api/v1/posts/${publicPostKewat.id}/comments/${commentId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${tokenKewatAdmin}`,
            'X-Community-Slug': 'kewat',
          },
        }
      );
      assertTest(resAdminDelete.status === 200, 'Community Admin successfully deletes comment for moderation');

      // Verify AuditLog record was created for the moderation delete
      const auditLog = kewatStore.auditLogs.find(
        (l) => l.action === 'MODERATION_DELETE_COMMENT' && l.targetId === commentId
      );
      assertTest(
        Boolean(auditLog) && auditLog?.actorId === userKewatAdmin.id,
        'AuditLog entry recorded with MODERATION_DELETE_COMMENT and moderator actorId'
      );
    }
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(`Security Test Results: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Unhandled security test failure:', err);
  process.exit(1);
});

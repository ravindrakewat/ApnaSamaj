import assert from 'node:assert';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { config } from '../config/env';
import { tenantDbManager, PrismaClient } from '@apnasamaj/database';
import { UserRole, UserStatus, PostType } from '@apnasamaj/shared-types';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14A.6: Cross-Tenant & Live HTTP API Tests ');
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
// In-Memory Mock Prisma Client Factory for Tenant Isolation Testing
// ---------------------------------------------------------------------------

interface MockTenantState {
  users: Array<{
    id: string;
    phone: string;
    role: string;
    status: string;
    isPhoneVerified: boolean;
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
    likes: any[];
    comments: any[];
  }>;
  postViews: Array<{
    id: string;
    postId: string;
    userId: string;
    createdAt: Date;
  }>;
  groupMembers: Array<{
    id: string;
    groupId: string;
    userId: string;
    role: string;
  }>;
}

function createMockTenantPrismaClient(tenantSlug: string, initialState: MockTenantState): PrismaClient {
  const state: MockTenantState = {
    users: [...initialState.users],
    posts: [...initialState.posts],
    postViews: [...initialState.postViews],
    groupMembers: [...initialState.groupMembers],
  };

  const client: any = {
    user: {
      findUnique: async ({ where }: any) => {
        return state.users.find((u) => u.id === where.id) || null;
      },
    },
    post: {
      findUnique: async ({ where }: any) => {
        const post = state.posts.find((p) => p.id === where.id);
        if (!post) return null;
        return {
          id: post.id,
          authorId: post.authorId,
          groupId: post.groupId,
          author: { status: post.author.status },
          group: post.group ? { id: post.group.id, privacy: post.group.privacy } : null,
        };
      },
    },
    groupMember: {
      findUnique: async ({ where }: any) => {
        if (where.groupId_userId) {
          return (
            state.groupMembers.find(
              (m) => m.groupId === where.groupId_userId.groupId && m.userId === where.groupId_userId.userId
            ) || null
          );
        }
        return null;
      },
    },
    postView: {
      upsert: async ({ where, create }: any) => {
        const existing = state.postViews.find(
          (pv) => pv.postId === where.postId_userId.postId && pv.userId === where.postId_userId.userId
        );
        if (existing) {
          return existing;
        }
        const newView = {
          id: `view-${tenantSlug}-${state.postViews.length + 1}`,
          postId: create.postId,
          userId: create.userId,
          createdAt: new Date(),
        };
        state.postViews.push(newView);
        return newView;
      },
      count: async ({ where }: any) => {
        return state.postViews.filter((pv) => pv.postId === where.postId).length;
      },
      findUnique: async ({ where }: any) => {
        return (
          state.postViews.find(
            (pv) => pv.postId === where.postId_userId.postId && pv.userId === where.postId_userId.userId
          ) || null
        );
      },
    },
    $disconnect: async () => {},
  };

  return client as PrismaClient;
}

// ---------------------------------------------------------------------------
// Test Data Setup
// ---------------------------------------------------------------------------

const KEWAT_USER_ID = 'usr-kewat-101';
const GUPTA_USER_ID = 'usr-gupta-201';
const KEWAT_USER_B_ID = 'usr-kewat-102'; // Not member of private group
const KEWAT_SUSPENDED_USER_ID = 'usr-kewat-999';

const kewatState: MockTenantState = {
  users: [
    {
      id: KEWAT_USER_ID,
      phone: '+919876543210',
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
    },
    {
      id: KEWAT_USER_B_ID,
      phone: '+919876543211',
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
    },
    {
      id: KEWAT_SUSPENDED_USER_ID,
      phone: '+919876543299',
      role: UserRole.MEMBER,
      status: UserStatus.SUSPENDED,
      isPhoneVerified: true,
    },
  ],
  posts: [
    {
      id: 'post-kewat-public-1',
      authorId: KEWAT_USER_ID,
      groupId: null,
      content: 'Public Kewat Post',
      type: PostType.GENERAL,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: KEWAT_USER_ID,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        profile: {
          fullName: 'Kewat Member A',
          avatarUrl: null,
          city: 'Indore',
          state: 'MP',
        },
      },
      media: [],
      likes: [],
      comments: [],
    },
    {
      id: 'post-kewat-private-1',
      authorId: KEWAT_USER_ID,
      groupId: 'grp-kewat-secret',
      content: 'Private Group Kewat Post',
      type: PostType.GENERAL,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: KEWAT_USER_ID,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        profile: {
          fullName: 'Kewat Member A',
          avatarUrl: null,
          city: 'Indore',
          state: 'MP',
        },
      },
      group: {
        id: 'grp-kewat-secret',
        privacy: 'PRIVATE',
      },
      media: [],
      likes: [],
      comments: [],
    },
  ],
  postViews: [],
  groupMembers: [
    {
      id: 'gm-1',
      groupId: 'grp-kewat-secret',
      userId: KEWAT_USER_ID, // KEWAT_USER_ID is a member
      role: 'ADMIN',
    },
  ],
};

const guptaState: MockTenantState = {
  users: [
    {
      id: GUPTA_USER_ID,
      phone: '+919876500001',
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
    },
  ],
  posts: [
    {
      id: 'post-gupta-1',
      authorId: GUPTA_USER_ID,
      groupId: null,
      content: 'Gupta Community Exclusive Post',
      type: PostType.GENERAL,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: GUPTA_USER_ID,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        profile: {
          fullName: 'Gupta Member',
          avatarUrl: null,
          city: 'Delhi',
          state: 'Delhi',
        },
      },
      media: [],
      likes: [],
      comments: [],
    },
  ],
  postViews: [],
  groupMembers: [],
};

// Generate test JWTs with cryptographic signature using project's JWT secret
function makeTestJwt(userId: string, communitySlug?: string, phone: string = '+919876543210') {
  return jwt.sign(
    {
      sub: userId,
      phone,
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      ...(communitySlug ? { communitySlug } : {}),
    },
    config.jwtAccessSecret,
    { expiresIn: '15m' }
  );
}

// ---------------------------------------------------------------------------
// Test Execution Suite
// ---------------------------------------------------------------------------

async function runTestSuite() {
  // Register isolated mock clients into tenantDbManager
  const mockKewatClient = createMockTenantPrismaClient('kewat', kewatState);
  const mockGuptaClient = createMockTenantPrismaClient('gupta', guptaState);

  tenantDbManager.setClient('kewat', mockKewatClient, 'Kewat Samaj');
  tenantDbManager.setClient('gupta', mockGuptaClient, 'Gupta Samaj');

  // Start real Express server instance
  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Test Harness] Live Express server listening on ephemeral port ${port}\n`);

  try {
    const tokenKewatA = makeTestJwt(KEWAT_USER_ID, 'kewat');
    const tokenGupta = makeTestJwt(GUPTA_USER_ID, 'gupta');
    const tokenKewatB = makeTestJwt(KEWAT_USER_B_ID, 'kewat');
    const tokenSuspended = makeTestJwt(KEWAT_SUSPENDED_USER_ID, 'kewat');

    // -----------------------------------------------------------------------
    // Case 1: Missing community context
    // -----------------------------------------------------------------------
    console.log('--- 1. Missing Community Context ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`,
          // Deliberately omitted X-Community-Slug header
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 400, 'Rejects with HTTP 400 Bad Request when community context is missing');
      assertTest(
        body.error?.includes('Community context required'),
        'Returns clear error explaining community context is required'
      );
    }

    // -----------------------------------------------------------------------
    // Case 2: Unknown or unconfigured community
    // -----------------------------------------------------------------------
    console.log('\n--- 2. Unknown or Unconfigured Community ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`,
          'X-Community-Slug': 'unknown-random-community',
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 404, 'Rejects with HTTP 404 Not Found for unregistered community tenant');
      assertTest(
        body.error?.includes('Unknown community tenant'),
        'Returns message indicating community is not registered'
      );
    }

    // -----------------------------------------------------------------------
    // Case 3: Cross-tenant attack (Community A token with Community B header)
    // -----------------------------------------------------------------------
    console.log('\n--- 3. Cross-Tenant Attack (Token A with Header B) ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-gupta-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`, // Kewat token
          'X-Community-Slug': 'gupta', // Target Gupta community
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 403, 'Rejects cross-tenant request with HTTP 403 Forbidden');
      assertTest(
        body.error?.includes('Access token was issued for a different community'),
        'Returns strict error: Access token was issued for a different community'
      );
    }

    // -----------------------------------------------------------------------
    // Case 4: Valid Community A token with Community A header
    // -----------------------------------------------------------------------
    console.log('\n--- 4. Valid Tenant Match (Token A with Header A) ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`,
          'X-Community-Slug': 'kewat',
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 200, 'Authorized view recording succeeds with HTTP 200 OK');
      assertTest(body.success === true, 'Response indicates success: true');
      assertTest(body.data?.totalViews === 1, 'Total views count is 1');
      assertTest(body.data?.uniqueMembers === 1, 'Unique members count is 1');
      assertTest(body.data?.hasViewed === true, 'hasViewed is true');
    }

    // -----------------------------------------------------------------------
    // Case 5: Access to a post ID that exists only in another community
    // -----------------------------------------------------------------------
    console.log('\n--- 5. Post ID Existing Only in Another Community ---');
    {
      // Gupta user querying a post in Kewat database under Gupta context
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenGupta}`,
          'X-Community-Slug': 'gupta',
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 404, 'Returns HTTP 404 Not Found (post does not exist in target community DB)');
      assertTest(body.error?.includes('Post not found'), 'Does not leak existence of other community post');
    }

    // -----------------------------------------------------------------------
    // Case 6: Unauthorized access to private-group posts
    // -----------------------------------------------------------------------
    console.log('\n--- 6. Private-Group Post Access Authorization ---');
    {
      // User B is a Kewat member, but NOT in the secret group
      const resRecord = await fetch(`${baseUrl}/api/v1/posts/post-kewat-private-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatB}`,
          'X-Community-Slug': 'kewat',
        },
      });

      const bodyRecord: any = await resRecord.json();
      assertTest(resRecord.status === 404, 'Non-group member recording view receives HTTP 404 Not Found');

      const resGet = await fetch(`${baseUrl}/api/v1/posts/post-kewat-private-1/views`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenKewatB}`,
          'X-Community-Slug': 'kewat',
        },
      });

      const bodyGet: any = await resGet.json();
      assertTest(resGet.status === 404, 'Non-group member fetching views receives HTTP 404 Not Found');

      // Member A (who is a group member) can access private group post views
      const resMemberA = await fetch(`${baseUrl}/api/v1/posts/post-kewat-private-1/views`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`,
          'X-Community-Slug': 'kewat',
        },
      });
      assertTest(resMemberA.status === 200, 'Authorized group member successfully reads private group post views');
    }

    // -----------------------------------------------------------------------
    // Case 7: Privacy verification (Response returns only aggregate info)
    // -----------------------------------------------------------------------
    console.log('\n--- 7. Privacy Verification (Strict Aggregates Only) ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/views`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`,
          'X-Community-Slug': 'kewat',
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 200, 'GET /views returns HTTP 200');
      const dataKeys = Object.keys(body.data || {});
      assertTest(
        dataKeys.includes('totalViews') && dataKeys.includes('uniqueMembers') && dataKeys.includes('hasViewed'),
        'Response contains totalViews, uniqueMembers, and hasViewed'
      );
      assertTest(!dataKeys.includes('userId'), 'Response does NOT expose userId');
      assertTest(!dataKeys.includes('viewers'), 'Response does NOT expose viewers list');
      assertTest(!dataKeys.includes('users'), 'Response does NOT expose users array');
      assertTest(!dataKeys.includes('names'), 'Response does NOT expose member names');
    }

    // -----------------------------------------------------------------------
    // Case 8: Idempotency & Repeat View Handling
    // -----------------------------------------------------------------------
    console.log('\n--- 8. Repeat View Idempotency ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenKewatA}`,
          'X-Community-Slug': 'kewat',
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 200, 'Repeated view returns HTTP 200 OK');
      assertTest(body.data?.totalViews === 1, 'Total views remains 1 (no duplicate increment)');
      assertTest(body.data?.uniqueMembers === 1, 'Unique members remains 1');
    }

    // -----------------------------------------------------------------------
    // Case 9: Suspended User Rejection
    // -----------------------------------------------------------------------
    console.log('\n--- 9. Suspended User Rejection ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenSuspended}`,
          'X-Community-Slug': 'kewat',
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 403, 'Suspended user is rejected with HTTP 403 Forbidden');
      assertTest(body.error?.includes('Account is suspended'), 'Returns Account is suspended error message');
    }

    // -----------------------------------------------------------------------
    // Case 10: Unauthenticated Request Rejection
    // -----------------------------------------------------------------------
    console.log('\n--- 10. Unauthenticated Request Rejection ---');
    {
      const res = await fetch(`${baseUrl}/api/v1/posts/post-kewat-public-1/view`, {
        method: 'POST',
        headers: {
          'X-Community-Slug': 'kewat',
          // No Authorization header
        },
      });

      const body: any = await res.json();
      assertTest(res.status === 401, 'Unauthenticated request is rejected with HTTP 401 Unauthorized');
      assertTest(body.error?.includes('Authentication required'), 'Returns Authentication required message');
    }
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    console.log('\n[Test Harness] Ephemeral server closed gracefully.');
  }

  console.log('\n================================================================');
  console.log(`   Tests Completed: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

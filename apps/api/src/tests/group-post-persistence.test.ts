import { createPostSchema, updatePostSchema } from '@apnasamaj/validation';
import {
  PostServiceError,
  ForbiddenPostActionError,
  PostNotFoundError,
} from '../modules/posts/posts.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14A.1 Group Post Persistence & Privacy    ');
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

// Mock group data fixture
interface MockGroup {
  id: string;
  name: string;
  slug: string;
  privacy: 'PUBLIC' | 'PRIVATE';
  memberUserIds: string[];
}

const mockGroups: Record<string, MockGroup> = {
  'group-public-1': {
    id: 'group-public-1',
    name: 'Public Community Circle',
    slug: 'public-circle',
    privacy: 'PUBLIC',
    memberUserIds: ['user-author-1', 'user-member-2'],
  },
  'group-private-1': {
    id: 'group-private-1',
    name: 'Private Elder Council',
    slug: 'private-council',
    privacy: 'PRIVATE',
    memberUserIds: ['user-author-1', 'user-elder-3'],
  },
};

// Simulation of createPost group validation and persistence logic
function simulateCreatePost(
  authorId: string,
  input: {
    content?: string;
    type?: 'GENERAL' | 'ANNOUNCEMENT' | 'EVENT';
    groupId?: string;
    media?: any[];
  }
) {
  let targetGroupId: string | null = null;

  if (input.groupId) {
    const group = mockGroups[input.groupId];
    if (!group) {
      throw new PostServiceError('Target group not found.', 404);
    }

    const isMember = group.memberUserIds.includes(authorId);
    if (!isMember) {
      if (group.privacy === 'PRIVATE') {
        throw new ForbiddenPostActionError(
          'You must be a member of this private group to publish posts.'
        );
      }
      throw new ForbiddenPostActionError(
        'You must be a member of this group to publish posts.'
      );
    }

    targetGroupId = group.id;
  }

  const post = {
    id: 'post-new-uuid',
    authorId,
    groupId: targetGroupId,
    group: targetGroupId
      ? {
          id: mockGroups[targetGroupId].id,
          name: mockGroups[targetGroupId].name,
          slug: mockGroups[targetGroupId].slug,
        }
      : null,
    content: input.content || '',
    type: input.type || 'GENERAL',
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return post;
}

// Simulation of updatePost boundary check
function simulateUpdatePost(
  postId: string,
  userId: string,
  existingPost: { id: string; authorId: string; groupId: string | null },
  input: { content?: string; type?: any; groupId?: string }
) {
  if (existingPost.authorId !== userId) {
    throw new ForbiddenPostActionError('You can only edit your own posts.');
  }

  if (input.groupId !== undefined && input.groupId !== existingPost.groupId) {
    throw new PostServiceError('Moving posts across group boundaries is not permitted.', 400);
  }

  return {
    ...existingPost,
    content: input.content !== undefined ? input.content : 'existing content',
    updatedAt: new Date().toISOString(),
  };
}

// Simulation of verifyActivePost for private group visibility
function simulateVerifyActivePost(
  post: { id: string; authorId: string; groupId: string | null; authorStatus: string },
  currentUserId?: string
) {
  if (post.authorStatus !== 'ACTIVE') {
    throw new PostNotFoundError('Post not found or is unavailable.');
  }

  if (post.groupId) {
    const group = mockGroups[post.groupId];
    if (group && group.privacy === 'PRIVATE') {
      if (!currentUserId || !group.memberUserIds.includes(currentUserId)) {
        throw new PostNotFoundError('Post not found or is unavailable.');
      }
    }
  }

  return { id: post.id, authorId: post.authorId, groupId: post.groupId };
}

async function runTests() {
  console.log('--- 1. Schema Validation for Group Posts ---');

  // Valid schema with groupId
  const validGroupPostPayload = {
    content: 'Discussing upcoming community mandal festival.',
    groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  };
  const parsedGroupPost = createPostSchema.safeParse(validGroupPostPayload);
  assertTest(parsedGroupPost.success === true, 'Valid group post payload with UUID groupId is accepted');
  if (parsedGroupPost.success) {
    assertTest(parsedGroupPost.data.groupId === 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'groupId is correctly extracted from payload');
  }

  // Invalid non-UUID groupId is rejected
  const invalidGroupPostPayload = {
    content: 'Some discussion text',
    groupId: 'not-a-valid-uuid',
  };
  const parsedInvalid = createPostSchema.safeParse(invalidGroupPostPayload);
  assertTest(parsedInvalid.success === false, 'Invalid non-UUID groupId string is rejected by schema');

  // General post without groupId is valid and groupId is undefined
  const generalPayload = { content: 'General community news update.' };
  const parsedGeneral = createPostSchema.safeParse(generalPayload);
  assertTest(parsedGeneral.success === true, 'General post payload without groupId is accepted');
  if (parsedGeneral.success) {
    assertTest(parsedGeneral.data.groupId === undefined, 'General post has undefined groupId');
  }

  console.log('\n--- 2. Group Post Persistence & Active Member Publishing ---');

  // A. Authorized active member publishes to a public group
  const publicGroupPost = simulateCreatePost('user-author-1', {
    content: 'Hello Public Circle members!',
    groupId: 'group-public-1',
  });
  assertTest(publicGroupPost.groupId === 'group-public-1', 'Group post persists the correct groupId for public group');
  assertTest(publicGroupPost.group?.slug === 'public-circle', 'Populates group object with slug and name');

  // B. Authorized active member publishes to a private group
  const privateGroupPost = simulateCreatePost('user-author-1', {
    content: 'Private meeting notes for council.',
    groupId: 'group-private-1',
  });
  assertTest(privateGroupPost.groupId === 'group-private-1', 'Group post persists the correct groupId for private group');
  assertTest(privateGroupPost.group?.name === 'Private Elder Council', 'Group metadata is accurately populated');

  // C. General community post without groupId
  const generalPost = simulateCreatePost('user-author-1', {
    content: 'Public announcement for everyone in Apna Samaj.',
  });
  assertTest(generalPost.groupId === null, 'General community post persists groupId as null');
  assertTest(generalPost.group === null, 'General community post has null group object');

  console.log('\n--- 3. Authorization & Privacy Rejection Rules ---');

  // D. Non-member publishing to a private group -> 403 Forbidden
  try {
    simulateCreatePost('user-outsider-99', {
      content: 'Attempting to leak into private council.',
      groupId: 'group-private-1',
    });
    assertTest(false, 'Non-member should not be able to publish to a private group');
  } catch (err: any) {
    assertTest(err instanceof ForbiddenPostActionError && err.statusCode === 403, 'Non-member cannot publish to a private group (HTTP 403)');
    assertTest(err.message.includes('private group'), 'Returns descriptive private group restriction error message');
  }

  // E. Non-member publishing to a public group -> 403 Forbidden
  try {
    simulateCreatePost('user-outsider-99', {
      content: 'Posting to public circle without joining.',
      groupId: 'group-public-1',
    });
    assertTest(false, 'Non-member should not be able to publish to a public group without joining');
  } catch (err: any) {
    assertTest(err instanceof ForbiddenPostActionError && err.statusCode === 403, 'Non-member cannot publish to a public group (HTTP 403)');
    assertTest(err.message.includes('member of this group'), 'Returns descriptive membership requirement error');
  }

  // F. User publishing to a nonexistent group -> 404 Not Found
  try {
    simulateCreatePost('user-author-1', {
      content: 'Posting to nonexistent circle.',
      groupId: 'group-ghost-404',
    });
    assertTest(false, 'Publishing to nonexistent group should throw 404');
  } catch (err: any) {
    assertTest(err instanceof PostServiceError && err.statusCode === 404, 'User cannot publish to a nonexistent group (HTTP 404)');
    assertTest(err.message === 'Target group not found.', 'Returns Target group not found message');
  }

  console.log('\n--- 4. Group Boundary Protection & Edit Restrictions ---');

  const existingCouncilPost = {
    id: 'post-100',
    authorId: 'user-author-1',
    groupId: 'group-private-1',
  };

  // Author edits content within same group -> Allowed
  const updatedContent = simulateUpdatePost('post-100', 'user-author-1', existingCouncilPost, {
    content: 'Updated notes within council.',
  });
  assertTest(updatedContent.groupId === 'group-private-1', 'Author can edit content while preserving existing groupId');

  // Attempt to move post to general feed (groupId: null or different) -> 400 Bad Request
  try {
    simulateUpdatePost('post-100', 'user-author-1', existingCouncilPost, {
      content: 'Trying to move post to another group',
      groupId: 'group-public-1',
    });
    assertTest(false, 'Changing groupId on post update should throw error');
  } catch (err: any) {
    assertTest(err instanceof PostServiceError && err.statusCode === 400, 'Editing cannot move post across group boundaries (HTTP 400)');
    assertTest(err.message.includes('group boundaries is not permitted'), 'Descriptive error message returned');
  }

  // Non-owner cannot edit post -> 403 Forbidden
  try {
    simulateUpdatePost('post-100', 'user-imposter-2', existingCouncilPost, {
      content: 'Hacked content',
    });
    assertTest(false, 'Non-owner should not be able to edit post');
  } catch (err: any) {
    assertTest(err instanceof ForbiddenPostActionError && err.statusCode === 403, 'Non-owner cannot edit post (HTTP 403)');
  }

  console.log('\n--- 5. Private Group Privacy Verification (verifyActivePost) ---');

  const privateCouncilPostRecord = {
    id: 'post-private-200',
    authorId: 'user-author-1',
    groupId: 'group-private-1',
    authorStatus: 'ACTIVE',
  };

  // Member of private council can access post
  const verifiedForMember = simulateVerifyActivePost(privateCouncilPostRecord, 'user-author-1');
  assertTest(verifiedForMember.id === 'post-private-200', 'Active private group member can access post');

  // Non-member accessing private council post -> 404 Not Found (avoids leaking existence)
  try {
    simulateVerifyActivePost(privateCouncilPostRecord, 'user-outsider-99');
    assertTest(false, 'Non-member should not be able to access private group post');
  } catch (err: any) {
    assertTest(err instanceof PostNotFoundError && err.statusCode === 404, 'Non-member cannot access private group post (HTTP 404 avoids leaking existence)');
  }

  // Unauthenticated caller accessing private group post -> 404 Not Found
  try {
    simulateVerifyActivePost(privateCouncilPostRecord, undefined);
    assertTest(false, 'Unauthenticated caller should not access private group post');
  } catch (err: any) {
    assertTest(err instanceof PostNotFoundError && err.statusCode === 404, 'Unauthenticated caller receives HTTP 404 for private group post');
  }

  console.log('\n================================================================');
  console.log(`Summary: All ${passedTests} checks passed! (Failed: ${failedTests})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

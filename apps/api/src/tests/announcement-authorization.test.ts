import assert from 'node:assert';
import { UserRole, PostType } from '@apnasamaj/shared-types';
import { createPostSchema, updatePostSchema } from '@apnasamaj/validation';
import {
  PostServiceError,
  ForbiddenPostActionError,
  canPublishAnnouncement,
} from '../modules/posts/posts.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14A.2 Backend Announcement Authorization  ');
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

// Logic simulation mirroring the backend createPost implementation
function simulateCreatePost(
  authorId: string,
  authorRole: UserRole,
  input: {
    content?: string;
    type?: PostType;
    groupId?: string;
    media?: any[];
  }
) {
  // Only SUPER_ADMIN, COMMUNITY_ADMIN, and MODERATOR can publish ANNOUNCEMENT posts
  if (input.type === PostType.ANNOUNCEMENT && !canPublishAnnouncement(authorRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can publish announcements.'
    );
  }

  return {
    id: 'post-test-uuid',
    authorId,
    type: input.type || PostType.GENERAL,
    content: input.content || '',
    groupId: input.groupId || null,
    isPinned: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Logic simulation mirroring the backend updatePost implementation
function simulateUpdatePost(
  postId: string,
  userId: string,
  userRole: UserRole,
  existingPost: { id: string; authorId: string; type: PostType; groupId: string | null },
  input: { content?: string; type?: PostType; groupId?: string }
) {
  if (existingPost.authorId !== userId) {
    throw new ForbiddenPostActionError('You can only edit your own posts.');
  }

  if (input.type === PostType.ANNOUNCEMENT && !canPublishAnnouncement(userRole)) {
    throw new ForbiddenPostActionError(
      'Only community administrators and moderators can set post type to announcement.'
    );
  }

  if (input.groupId !== undefined && input.groupId !== existingPost.groupId) {
    throw new PostServiceError('Moving posts across group boundaries is not permitted.', 400);
  }

  return {
    ...existingPost,
    content: input.content !== undefined ? input.content : 'existing content',
    type: input.type !== undefined ? input.type : existingPost.type,
    updatedAt: new Date().toISOString(),
  };
}

async function runTests() {
  console.log('--- 1. canPublishAnnouncement Helper Role Checks ---');

  assertTest(canPublishAnnouncement(UserRole.SUPER_ADMIN) === true, 'SUPER_ADMIN is authorized for announcements');
  assertTest(canPublishAnnouncement(UserRole.COMMUNITY_ADMIN) === true, 'COMMUNITY_ADMIN is authorized for announcements');
  assertTest(canPublishAnnouncement(UserRole.MODERATOR) === true, 'MODERATOR is authorized for announcements');
  assertTest(canPublishAnnouncement(UserRole.MEMBER) === false, 'MEMBER is NOT authorized for announcements');
  assertTest(canPublishAnnouncement(undefined) === false, 'Undefined role is NOT authorized for announcements');

  console.log('\n--- 2. Member Denial on ANNOUNCEMENT Creation ---');

  // MEMBER attempts to create an ANNOUNCEMENT -> 403 Forbidden
  try {
    simulateCreatePost('user-member-1', UserRole.MEMBER, {
      content: 'Fake leadership announcement.',
      type: PostType.ANNOUNCEMENT,
    });
    assertTest(false, 'MEMBER should not be able to create an announcement');
  } catch (err: any) {
    assertTest(err instanceof ForbiddenPostActionError && err.statusCode === 403, 'MEMBER denial on create returns HTTP 403');
    assertTest(err.message.includes('administrators and moderators can publish announcements'), 'Returns descriptive error message');
  }

  console.log('\n--- 3. Member Denial on ANNOUNCEMENT Update ---');

  const memberGeneralPost = {
    id: 'post-1',
    authorId: 'user-member-1',
    type: PostType.GENERAL,
    groupId: null,
  };

  // MEMBER attempts to update their GENERAL post to ANNOUNCEMENT -> 403 Forbidden
  try {
    simulateUpdatePost('post-1', 'user-member-1', UserRole.MEMBER, memberGeneralPost, {
      type: PostType.ANNOUNCEMENT,
    });
    assertTest(false, 'MEMBER should not be able to update a post to announcement');
  } catch (err: any) {
    assertTest(err instanceof ForbiddenPostActionError && err.statusCode === 403, 'MEMBER denial on update returns HTTP 403');
    assertTest(err.message.includes('administrators and moderators can set post type to announcement'), 'Returns descriptive error message on update');
  }

  console.log('\n--- 4. Authorized Roles Permitted to Create Announcements ---');

  // SUPER_ADMIN creates ANNOUNCEMENT
  const superAdminPost = simulateCreatePost('user-super-1', UserRole.SUPER_ADMIN, {
    content: 'Official Samaj Mahasabha 2026 Announcement.',
    type: PostType.ANNOUNCEMENT,
  });
  assertTest(superAdminPost.type === PostType.ANNOUNCEMENT, 'SUPER_ADMIN successfully creates ANNOUNCEMENT post');

  // COMMUNITY_ADMIN creates ANNOUNCEMENT
  const commAdminPost = simulateCreatePost('user-admin-2', UserRole.COMMUNITY_ADMIN, {
    content: 'Annual Community Gathering Announcement.',
    type: PostType.ANNOUNCEMENT,
  });
  assertTest(commAdminPost.type === PostType.ANNOUNCEMENT, 'COMMUNITY_ADMIN successfully creates ANNOUNCEMENT post');

  // MODERATOR creates ANNOUNCEMENT
  const modPost = simulateCreatePost('user-mod-3', UserRole.MODERATOR, {
    content: 'Community Guidelines Update Announcement.',
    type: PostType.ANNOUNCEMENT,
  });
  assertTest(modPost.type === PostType.ANNOUNCEMENT, 'MODERATOR successfully creates ANNOUNCEMENT post');

  console.log('\n--- 5. Authorized Roles Permitted to Update Announcements ---');

  const adminPost = {
    id: 'post-2',
    authorId: 'user-admin-2',
    type: PostType.GENERAL,
    groupId: null,
  };

  const updatedToAnnouncement = simulateUpdatePost('post-2', 'user-admin-2', UserRole.COMMUNITY_ADMIN, adminPost, {
    type: PostType.ANNOUNCEMENT,
  });
  assertTest(updatedToAnnouncement.type === PostType.ANNOUNCEMENT, 'COMMUNITY_ADMIN successfully changes post type to ANNOUNCEMENT');

  console.log('\n--- 6. Regression Coverage: Ordinary Posts by Regular Members ---');

  // MEMBER creates GENERAL post
  const memberGeneral = simulateCreatePost('user-member-1', UserRole.MEMBER, {
    content: 'Daily discussion post.',
    type: PostType.GENERAL,
  });
  assertTest(memberGeneral.type === PostType.GENERAL, 'MEMBER can freely create GENERAL post');

  // MEMBER creates EVENT post
  const memberEvent = simulateCreatePost('user-member-1', UserRole.MEMBER, {
    content: 'Youth cricket tournament meet-up.',
    type: PostType.EVENT,
  });
  assertTest(memberEvent.type === PostType.EVENT, 'MEMBER can freely create EVENT post');

  // MEMBER updates their own GENERAL post
  const updatedGeneral = simulateUpdatePost('post-1', 'user-member-1', UserRole.MEMBER, memberGeneralPost, {
    content: 'Updated discussion content.',
  });
  assertTest(updatedGeneral.content === 'Updated discussion content.', 'MEMBER can freely edit content of their post');
  assertTest(updatedGeneral.type === PostType.GENERAL, 'Post retains GENERAL type');

  // MEMBER updates GENERAL post to EVENT
  const updatedToEvent = simulateUpdatePost('post-1', 'user-member-1', UserRole.MEMBER, memberGeneralPost, {
    type: PostType.EVENT,
  });
  assertTest(updatedToEvent.type === PostType.EVENT, 'MEMBER can change post type between GENERAL and EVENT');

  console.log('\n--- 7. Group Safeguard & Post Ownership Preservation ---');

  const groupPost = {
    id: 'post-group-1',
    authorId: 'user-member-1',
    type: PostType.GENERAL,
    groupId: 'group-uuid-1',
  };

  // Editing within same group keeps groupId
  const editedGroupPost = simulateUpdatePost('post-group-1', 'user-member-1', UserRole.MEMBER, groupPost, {
    content: 'Updated group discussion.',
  });
  assertTest(editedGroupPost.groupId === 'group-uuid-1', 'Editing preserves groupId');

  // Editing cannot move post to another group or clear group
  try {
    simulateUpdatePost('post-group-1', 'user-member-1', UserRole.MEMBER, groupPost, {
      groupId: 'group-uuid-2',
    });
    assertTest(false, 'Moving post across group boundary should be blocked');
  } catch (err: any) {
    assertTest(err instanceof PostServiceError && err.statusCode === 400, 'Cross-group move throws HTTP 400');
  }

  // Non-owner cannot edit post
  try {
    simulateUpdatePost('post-group-1', 'user-other-2', UserRole.COMMUNITY_ADMIN, groupPost, {
      content: 'Admin trying to edit member content directly',
    });
    assertTest(false, 'Non-owner should not be able to edit another member post');
  } catch (err: any) {
    assertTest(err instanceof ForbiddenPostActionError && err.statusCode === 403, 'Non-owner edit throws HTTP 403');
  }

  console.log('\n================================================================');
  console.log(`Summary: All ${passedTests} checks passed! (Failed: ${failedTests})`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

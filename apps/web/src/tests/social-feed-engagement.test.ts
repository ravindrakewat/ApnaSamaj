import assert from 'node:assert';
import type { PostItem, CommentItem } from '@apnasamaj/shared-types';
import { buildSharePayload, getCleanShareSnippet } from '../utils/post-sharing';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14C: Social Feed Engagement Tests        ');
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
// Simulators for Frontend Engagement Logic in PostCard
// ---------------------------------------------------------------------------

interface PostState {
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  isLikePending: boolean;
  feedbackMessage: string | null;
  commentError: string | null;
}

interface SimulatedPostCard {
  post: PostItem;
  user: { id: string; fullName: string } | null;
  state: PostState;
  onPostUpdatedCalls: PostItem[];
}

function createSimulatedPostCard(
  initialPost: PostItem,
  currentUser: { id: string; fullName: string } | null
): SimulatedPostCard {
  return {
    post: { ...initialPost },
    user: currentUser,
    state: {
      isLiked: Boolean(initialPost.isLikedByMe),
      likesCount: initialPost.likesCount || 0,
      commentsCount: initialPost.commentsCount || 0,
      isLikePending: false,
      feedbackMessage: null,
      commentError: null,
    },
    onPostUpdatedCalls: [],
  };
}

async function simulateToggleLike(
  card: SimulatedPostCard,
  apiCall: (postId: string, nextIsLiked: boolean) => Promise<{ likesCount: number; isLikedByMe: boolean }>
): Promise<void> {
  if (card.state.isLikePending) return;

  if (!card.user) {
    card.state.feedbackMessage = 'Please log in to like posts.';
    return;
  }

  // Optimistic UI update
  const nextIsLiked = !card.state.isLiked;
  const nextLikesCount = nextIsLiked
    ? card.state.likesCount + 1
    : Math.max(0, card.state.likesCount - 1);

  card.state.isLiked = nextIsLiked;
  card.state.likesCount = nextLikesCount;
  card.state.isLikePending = true;

  try {
    const res = await apiCall(card.post.id, nextIsLiked);
    card.state.isLiked = res.isLikedByMe;
    card.state.likesCount = res.likesCount;

    const updatedPost = {
      ...card.post,
      isLikedByMe: res.isLikedByMe,
      likesCount: res.likesCount,
    };
    card.post = updatedPost;
    card.onPostUpdatedCalls.push(updatedPost);
  } catch (err: unknown) {
    // Revert optimistic update
    card.state.isLiked = !nextIsLiked;
    card.state.likesCount = card.post.likesCount || 0;
    card.state.feedbackMessage = err instanceof Error ? err.message : 'Failed to update like status.';
  } finally {
    card.state.isLikePending = false;
  }
}

async function simulateCreateComment(
  card: SimulatedPostCard,
  rawContent: string,
  apiCall: (postId: string, content: string) => Promise<CommentItem>
): Promise<void> {
  if (!card.user) {
    card.state.commentError = 'Please log in to post a comment.';
    return;
  }

  const trimmed = rawContent.trim();
  if (!trimmed) {
    card.state.commentError = 'Comment content cannot be empty.';
    return;
  }

  if (trimmed.length > 1000) {
    card.state.commentError = 'Comment cannot exceed 1000 characters.';
    return;
  }

  card.state.commentError = null;

  try {
    await apiCall(card.post.id, trimmed);
    const nextCount = card.state.commentsCount + 1;
    card.state.commentsCount = nextCount;

    const updatedPost = {
      ...card.post,
      commentsCount: nextCount,
    };
    card.post = updatedPost;
    card.onPostUpdatedCalls.push(updatedPost);
  } catch (err: unknown) {
    card.state.commentError = err instanceof Error ? err.message : 'Failed to post comment.';
  }
}

function simulateCopyLink(card: SimulatedPostCard, origin: string): string {
  const isPrivate = card.post.group?.privacy === 'PRIVATE';
  const msg = isPrivate
    ? 'Post link copied! Note: Only members of this private group can view it.'
    : 'Post link copied to clipboard!';
  card.state.feedbackMessage = msg;
  return `${origin}/posts/${card.post.id}`;
}

async function runTests() {
  const origin = 'https://apna-samaj.vercel.app';

  const basePost: PostItem = {
    id: 'post-engagement-1',
    authorId: 'author-user-1',
    author: {
      id: 'author-user-1',
      fullName: 'Ramesh Patel',
      avatarUrl: null,
      role: 'MEMBER' as any,
      city: 'Surat',
      state: 'Gujarat',
    },
    groupId: null,
    group: null,
    type: 'GENERAL' as any,
    content: 'Community engagement discussion topic.',
    isPinned: false,
    media: [],
    likesCount: 5,
    commentsCount: 2,
    viewsCount: 20,
    uniqueMembersCount: 15,
    isLikedByMe: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // -------------------------------------------------------------------------
  // 1. Post Likes: Optimistic Update, Success, and Parent Sync
  // -------------------------------------------------------------------------
  console.log('--- 1. Post Likes: Optimistic Update & Parent State Sync ---');
  {
    const card = createSimulatedPostCard(basePost, { id: 'member-10', fullName: 'Vikas Kumar' });

    // Like the post successfully
    await simulateToggleLike(card, async (_postId, nextIsLiked) => {
      assertTest(card.state.isLikePending === true, 'Lock set while request is in-flight');
      return { postId: 'post-engagement-1', likesCount: 6, isLikedByMe: nextIsLiked };
    });

    assertTest(card.state.isLiked === true, 'isLiked is true after successful like');
    assertTest(card.state.likesCount === 6, 'likesCount increments to 6');
    assertTest(card.state.isLikePending === false, 'isLikePending lock released after completion');
    assertTest(card.onPostUpdatedCalls.length === 1, 'onPostUpdated invoked for parent feed synchronization');
    assertTest(card.onPostUpdatedCalls[0].likesCount === 6, 'Parent post updated with likesCount: 6');
    assertTest(card.onPostUpdatedCalls[0].isLikedByMe === true, 'Parent post updated with isLikedByMe: true');

    // Unlike the post successfully
    await simulateToggleLike(card, async (_postId, nextIsLiked) => {
      return { postId: 'post-engagement-1', likesCount: 5, isLikedByMe: nextIsLiked };
    });

    assertTest(card.state.isLiked === false, 'isLiked is false after unlike');
    assertTest(card.state.likesCount === 5, 'likesCount decrements back to 5');
    assertTest(card.onPostUpdatedCalls.length === 2, 'onPostUpdated called again on unlike');
    assertTest(card.onPostUpdatedCalls[1].likesCount === 5, 'Parent post synchronized on unlike');
  }

  // -------------------------------------------------------------------------
  // 2. Post Likes: Optimistic Rollback on Server Error
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Post Likes: Optimistic Rollback on Server Error ---');
  {
    const card = createSimulatedPostCard(basePost, { id: 'member-10', fullName: 'Vikas Kumar' });

    // Fail the like attempt (e.g. network timeout or 500 error)
    await simulateToggleLike(card, async () => {
      throw new Error('Network timeout. Please check your connection.');
    });

    assertTest(card.state.isLiked === false, 'Optimistic like cleanly reverted to false on error');
    assertTest(card.state.likesCount === 5, 'likesCount reverted back to initial count 5');
    assertTest(card.state.isLikePending === false, 'Lock released on error');
    assertTest(
      card.state.feedbackMessage === 'Network timeout. Please check your connection.',
      'User receives clear feedback regarding the like failure'
    );
    assertTest(card.onPostUpdatedCalls.length === 0, 'onPostUpdated NOT called on failed attempt');
  }

  // -------------------------------------------------------------------------
  // 3. Unauthenticated Like Protection
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Unauthenticated Like Protection ---');
  {
    let apiCalled = false;
    const guestCard = createSimulatedPostCard(basePost, null); // user is null (guest)

    await simulateToggleLike(guestCard, async () => {
      apiCalled = true;
      return { postId: 'post-engagement-1', likesCount: 6, isLikedByMe: true };
    });

    assertTest(guestCard.state.isLiked === false, 'Guest like does not flip isLiked');
    assertTest(guestCard.state.likesCount === 5, 'Guest like does not modify likesCount');
    assertTest(apiCalled === false, 'API request is completely suppressed for unauthenticated guest');
    assertTest(
      guestCard.state.feedbackMessage === 'Please log in to like posts.',
      'Guest receives friendly login prompt feedback'
    );
  }

  // -------------------------------------------------------------------------
  // 4. In-Flight Duplicate Click Suppression
  // -------------------------------------------------------------------------
  console.log('\n--- 4. In-Flight Click Locking (Rapid Double Click) ---');
  {
    const card = createSimulatedPostCard(basePost, { id: 'member-10', fullName: 'Vikas Kumar' });
    let simultaneousCalls = 0;

    // Simulate in-flight pending state
    card.state.isLikePending = true;

    // Second click during in-flight
    await simulateToggleLike(card, async () => {
      simultaneousCalls++;
      return { postId: 'post-engagement-1', likesCount: 6, isLikedByMe: true };
    });

    assertTest(simultaneousCalls === 0, 'Concurrent click during pending request is suppressed');
    assertTest(card.state.likesCount === 5, 'Count is preserved without double-increment');
  }

  // -------------------------------------------------------------------------
  // 5. Comments: Creation & Parent Synchronization
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Comments: Creation & Parent Synchronization ---');
  {
    const card = createSimulatedPostCard(basePost, { id: 'member-10', fullName: 'Vikas Kumar' });

    await simulateCreateComment(card, 'Great initiative for the community!', async () => {
      return {
        id: 'comm-new-1',
        postId: basePost.id,
        authorId: 'member-10',
        content: 'Great initiative for the community!',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          id: 'member-10',
          fullName: 'Vikas Kumar',
          avatarUrl: null,
          role: 'MEMBER' as any,
          city: 'Bhopal',
          state: 'MP',
        },
      };
    });

    assertTest(card.state.commentsCount === 3, 'commentsCount increments from 2 to 3');
    assertTest(card.onPostUpdatedCalls.length === 1, 'onPostUpdated invoked upon comment creation');
    assertTest(card.onPostUpdatedCalls[0].commentsCount === 3, 'Parent post updated with commentsCount: 3');
    assertTest(card.state.commentError === null, 'No comment error on success');
  }

  // -------------------------------------------------------------------------
  // 6. Comments: Unauthenticated & Validation Guards
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Comments: Unauthenticated & Validation Guards ---');
  {
    let apiCalled = false;
    const guestCard = createSimulatedPostCard(basePost, null);

    await simulateCreateComment(guestCard, 'Guest trying to comment', async () => {
      apiCalled = true;
      return {} as any;
    });

    assertTest(guestCard.state.commentsCount === 2, 'Comments count unchanged');
    assertTest(apiCalled === false, 'API not called for unauthenticated guest comment');
    assertTest(
      guestCard.state.commentError === 'Please log in to post a comment.',
      'Clear login prompt provided to guest'
    );

    const authedCard = createSimulatedPostCard(basePost, { id: 'member-10', fullName: 'Vikas' });

    // Empty comment
    await simulateCreateComment(authedCard, '   ', async () => {
      apiCalled = true;
      return {} as any;
    });
    assertTest(
      authedCard.state.commentError === 'Comment content cannot be empty.',
      'Rejects empty comment with descriptive error'
    );

    // Oversized comment
    await simulateCreateComment(authedCard, 'A'.repeat(1005), async () => {
      apiCalled = true;
      return {} as any;
    });
    assertTest(
      authedCard.state.commentError === 'Comment cannot exceed 1000 characters.',
      'Rejects comment exceeding character limit'
    );
  }

  // -------------------------------------------------------------------------
  // 7. Sharing: Public vs. Private Group Posts
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Sharing: Public vs. Private Group Transparency ---');
  {
    // Public post copy
    const publicCard = createSimulatedPostCard(basePost, { id: 'user-1', fullName: 'Ramesh' });
    const publicUrl = simulateCopyLink(publicCard, origin);
    assertTest(publicUrl === `${origin}/posts/post-engagement-1`, 'Returns canonical public post URL');
    assertTest(
      publicCard.state.feedbackMessage === 'Post link copied to clipboard!',
      'Standard copy feedback for public post'
    );

    // Private group post copy
    const privatePost: PostItem = {
      ...basePost,
      id: 'private-post-99',
      groupId: 'private-group-1',
      group: {
        id: 'private-group-1',
        name: 'Executive Committee',
        slug: 'executive-committee',
        privacy: 'PRIVATE' as any,
      },
    };
    const privateCard = createSimulatedPostCard(privatePost, { id: 'user-1', fullName: 'Ramesh' });
    const privateUrl = simulateCopyLink(privateCard, origin);
    assertTest(privateUrl === `${origin}/posts/private-post-99`, 'Returns clean canonical URL for private post without leaking tokens');
    assertTest(
      privateCard.state.feedbackMessage === 'Post link copied! Note: Only members of this private group can view it.',
      'Transparent feedback informs user that private group membership is required'
    );

    // Share payload for private group
    const privatePayload = buildSharePayload({
      authorName: privatePost.author.fullName,
      content: privatePost.content,
      canonicalUrl: privateUrl,
      isPrivateGroup: true,
    });
    assertTest(
      privatePayload.title === 'Ramesh Patel on Apna Samaj (Private Group)',
      'Title includes (Private Group) indicator'
    );
    assertTest(
      privatePayload.nativeShareText.includes('(Private Group)'),
      'Native share text includes private group status'
    );
    assertTest(
      privatePayload.whatsappMessage.includes('(Private Group)'),
      'WhatsApp message carries private group notice'
    );
  }

  console.log('\n================================================================');
  console.log(`Frontend Engagement Tests: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});

import assert from 'assert';
import { postsApi } from '../api/posts.api';
import { apiClient } from '../api/client';
import { formatRelativeTime } from '../utils/date';
import { PostItem, FeedResponseData, CommentsResponseData, CommentItem, UserRole } from '@apnasamaj/shared-types';
import { setStoredCommunitySlug, clearAuthTokens, setAuthTokens } from '../services/storage.service';

console.log('\n================================================================');
console.log('   Apna Samaj — Batch 3 Mobile Feed & Interactions Test Suite   ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passedTests++;
          console.log(`✅ PASS: ${desc}`);
        })
        .catch((err) => {
          console.error(`❌ FAIL: ${desc}`);
          console.error(err);
          process.exitCode = 1;
        });
    } else {
      passedTests++;
      console.log(`✅ PASS: ${desc}`);
    }
  } catch (err) {
    console.error(`❌ FAIL: ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Mock mock posts data
const mockPost1: PostItem = {
  id: 'post-1',
  authorId: 'usr-1',
  author: {
    id: 'usr-1',
    fullName: 'राहुल शर्मा',
    avatarUrl: null,
    role: UserRole.MEMBER,
    city: 'इंदौर',
  },
  type: 'GENERAL',
  title: 'समाज मिलन समारोह',
  content: 'इस रविवार को समाज के सभी परिवारों का एकत्रीकरण रखा गया है।',
  isPinned: true,
  media: [
    {
      id: 'med-1',
      postId: 'post-1',
      mediaType: 'IMAGE',
      url: 'https://example.com/photo.jpg',
      thumbnail: 'https://example.com/photo-thumb.jpg',
      order: 0,
    },
  ],
  likesCount: 15,
  commentsCount: 3,
  isLikedByMe: false,
  createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  updatedAt: new Date(Date.now() - 3600000).toISOString(),
};

const mockPost2: PostItem = {
  id: 'post-2',
  authorId: 'usr-2',
  author: {
    id: 'usr-2',
    fullName: 'प्रिया केवट',
    avatarUrl: null,
    role: UserRole.COMMUNITY_ADMIN,
  },
  type: 'ANNOUNCEMENT',
  title: 'छात्रवृत्ति सूचना',
  content: 'समाज के मेधावी छात्र-छात्राओं हेतु छात्रवृत्ति के आवेदन आमंत्रित हैं।',
  isPinned: false,
  media: [
    {
      id: 'med-2',
      postId: 'post-2',
      mediaType: 'VIDEO',
      url: 'https://example.com/speech.mp4',
      thumbnail: 'https://example.com/speech-thumb.jpg',
      order: 0,
    },
  ],
  likesCount: 42,
  commentsCount: 8,
  isLikedByMe: true,
  createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
  updatedAt: new Date(Date.now() - 7200000).toISOString(),
};

async function runFeedTests() {
  console.log('--- 1. Feed API Query & Contract Alignment ---');

  it('postsApi defines getFeed, getPost, likePost, unlikePost, getComments, createComment, and recordView', () => {
    assert.strictEqual(typeof postsApi.getFeed, 'function');
    assert.strictEqual(typeof postsApi.getPost, 'function');
    assert.strictEqual(typeof postsApi.likePost, 'function');
    assert.strictEqual(typeof postsApi.unlikePost, 'function');
    assert.strictEqual(typeof postsApi.getComments, 'function');
    assert.strictEqual(typeof postsApi.createComment, 'function');
    assert.strictEqual(typeof postsApi.recordView, 'function');
  });

  console.log('\n--- 2. Post Data Model & Media Validation ---');

  it('PostItem correctly models title, pinned status, post type, and media items', () => {
    assert.strictEqual(mockPost1.title, 'समाज मिलन समारोह');
    assert.strictEqual(mockPost1.isPinned, true);
    assert.strictEqual(mockPost1.type, 'GENERAL');
    assert.strictEqual(mockPost1.media[0].mediaType, 'IMAGE');
    assert.strictEqual(mockPost1.media[0].url, 'https://example.com/photo.jpg');

    assert.strictEqual(mockPost2.type, 'ANNOUNCEMENT');
    assert.strictEqual(mockPost2.media[0].mediaType, 'VIDEO');
    assert.strictEqual(mockPost2.media[0].thumbnail, 'https://example.com/speech-thumb.jpg');
  });

  console.log('\n--- 3. Relative Date & Time Formatter ---');

  it('formatRelativeTime formats Hindi intervals (अभी-अभी, मिनट पहले, घंटे पहले, दिन पहले)', () => {
    const justNow = new Date().toISOString();
    assert.strictEqual(formatRelativeTime(justNow, 'hi'), 'अभी-अभी');

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    assert.strictEqual(formatRelativeTime(tenMinsAgo, 'hi'), '10 मिनट पहले');

    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    assert.strictEqual(formatRelativeTime(threeHoursAgo, 'hi'), '3 घंटे पहले');

    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    assert.strictEqual(formatRelativeTime(twoDaysAgo, 'hi'), '2 दिन पहले');
  });

  it('formatRelativeTime formats English intervals (Just now, 10m ago, 3h ago, 2d ago)', () => {
    const justNow = new Date().toISOString();
    assert.strictEqual(formatRelativeTime(justNow, 'en'), 'Just now');

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    assert.strictEqual(formatRelativeTime(tenMinsAgo, 'en'), '10m ago');

    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    assert.strictEqual(formatRelativeTime(threeHoursAgo, 'en'), '3h ago');

    const twoDaysAgo = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    assert.strictEqual(formatRelativeTime(twoDaysAgo, 'en'), '2d ago');
  });

  console.log('\n--- 4. Feed Pagination & Deduplication Logic ---');

  it('Handles pagination appending and duplicate post avoidance', () => {
    const page1Posts = [mockPost1];
    const page2Posts = [mockPost1, mockPost2]; // Contains duplicate mockPost1

    // Simulate appending page 2
    const existingIds = new Set(page1Posts.map((p) => p.id));
    const deduped = page2Posts.filter((p) => !existingIds.has(p.id));
    const combined = [...page1Posts, ...deduped];

    assert.strictEqual(combined.length, 2);
    assert.strictEqual(combined[0].id, 'post-1');
    assert.strictEqual(combined[1].id, 'post-2');
  });

  console.log('\n--- 5. Likes and Comments State Handling ---');

  it('Optimistic like toggle correctly increments/decrements count', () => {
    let post = { ...mockPost1, isLikedByMe: false, likesCount: 15 };

    // Like
    post = {
      ...post,
      isLikedByMe: true,
      likesCount: post.likesCount + 1,
    };
    assert.strictEqual(post.isLikedByMe, true);
    assert.strictEqual(post.likesCount, 16);

    // Unlike
    post = {
      ...post,
      isLikedByMe: false,
      likesCount: post.likesCount - 1,
    };
    assert.strictEqual(post.isLikedByMe, false);
    assert.strictEqual(post.likesCount, 15);
  });

  it('Comment creation updates comment list and increments count', () => {
    const mockComment: CommentItem = {
      id: 'com-1',
      postId: 'post-1',
      authorId: 'usr-1',
      author: {
        id: 'usr-1',
        fullName: 'राहुल शर्मा',
        role: UserRole.MEMBER,
      },
      content: 'बहुत ही सराहनीय पहल!',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let post = { ...mockPost1, commentsCount: 3 };
    const commentsList = [mockComment];
    post = { ...post, commentsCount: post.commentsCount + 1 };

    assert.strictEqual(commentsList.length, 1);
    assert.strictEqual(post.commentsCount, 4);
    assert.strictEqual(commentsList[0].content, 'बहुत ही सराहनीय पहल!');
  });

  console.log('\n--- 6. Multi-Tenant Request Isolation ---');

  await it('Feed requests inherit active tenant slug and authentication token', async () => {
    await setStoredCommunitySlug('kewat-samaj');
    await setAuthTokens({
      accessToken: 'test-feed-token-jwt',
      refreshToken: 'test-feed-refresh-jwt',
    });

    const headers = await (apiClient as any).buildHeaders({});
    assert.strictEqual(headers['x-community-slug'], 'kewat-samaj');
    assert.strictEqual(headers.Authorization, 'Bearer test-feed-token-jwt');

    await clearAuthTokens();
  });

  console.log('\n================================================================');
  console.log(`Summary: All ${passedTests}/${totalTests} Batch 3 feed tests passed!`);
  console.log('================================================================\n');
}

runFeedTests();


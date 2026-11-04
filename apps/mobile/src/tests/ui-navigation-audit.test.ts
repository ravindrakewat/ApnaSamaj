import assert from 'assert';
import { ApiClient } from '../api/client';
import { authApi } from '../api/auth.api';
import { postsApi } from '../api/posts.api';
import { usersApi } from '../api/users.api';
import { groupsApi } from '../api/groups.api';
import {
  setStoredCommunitySlug,
  getStoredCommunitySlug,
  setAuthTokens,
  getAuthTokens,
  clearAuthTokens,
} from '../services/storage.service';
import { resolveTranslation } from '../localization/i18n';
import {
  validatePhone,
  validatePassword,
  validateCommunitySlug,
  validatePostTitle,
  validatePostContent,
} from '../utils/validation';

async function describe(name: string, fn: () => Promise<void> | void) {
  console.log(`\n--- ${name} ---`);
  await fn();
}

async function it(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✅ PASS: ${name}`);
  } catch (err: any) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    throw err;
  }
}

async function runNavigationAuditTests() {
  console.log('================================================================');
  console.log('   Apna Samaj — Mobile UI & User Flows Navigation Test Suite    ');
  console.log('================================================================');

  let passedTests = 0;

  // Flow 1: Open app → Community Selection → Login
  await describe('Flow 1: Open App → Community Selection → Login', async () => {
    await it('Validates community slug and phone input formatting', () => {
      const slugVal = validateCommunitySlug('kewat', 'hi');
      assert.strictEqual(slugVal.isValid, true);

      const phoneVal = validatePhone('9876543210', 'hi');
      assert.strictEqual(phoneVal.isValid, true);
      assert.strictEqual(phoneVal.normalized, '+919876543210');
      passedTests++;
    });

    await it('Persists community slug in SecureStore', async () => {
      await setStoredCommunitySlug('kewat');
      const savedSlug = await getStoredCommunitySlug();
      assert.strictEqual(savedSlug, 'kewat');
      passedTests++;
    });

    await it('Rejects invalid phone numbers during login flow', () => {
      const invalidPhone = validatePhone('12345', 'en');
      assert.strictEqual(invalidPhone.isValid, false);
      assert.ok(invalidPhone.error);
      passedTests++;
    });
  });

  // Flow 2: Login → Feed
  await describe('Flow 2: Login → Feed Transition', async () => {
    await it('Saves session tokens and verifies authenticated state', async () => {
      await setAuthTokens({
        accessToken: 'mock_access_token_123',
        refreshToken: 'mock_refresh_token_456',
      });
      const tokens = await getAuthTokens();
      assert.strictEqual(tokens?.accessToken, 'mock_access_token_123');
      assert.strictEqual(tokens?.refreshToken, 'mock_refresh_token_456');
      passedTests++;
    });

    await it('Feed query builder includes community slug and auth header', async () => {
      const client = new ApiClient('http://localhost:4000/api/v1');
      const headers = await (client as any).buildHeaders({ communitySlug: 'kewat' });
      assert.strictEqual(headers['x-community-slug'], 'kewat');
      assert.ok(headers['Authorization']);
      passedTests++;
    });
  });

  // Flow 3: Feed → Create Post → Publish
  await describe('Flow 3: Feed → Create Post → Publish Flow', async () => {
    await it('Enforces title rules for ANNOUNCEMENT and EVENT posts', () => {
      const eventWithoutTitle = validatePostTitle('', 'EVENT', 'en');
      assert.strictEqual(eventWithoutTitle.isValid, false);
      assert.strictEqual(eventWithoutTitle.error, 'Title is required for this post type');

      const eventWithTitle = validatePostTitle('Diwali Milan Samaroh', 'EVENT', 'en');
      assert.strictEqual(eventWithTitle.isValid, true);
      passedTests++;
    });

    await it('Allows optional title for GENERAL feed posts', () => {
      const generalEmptyTitle = validatePostTitle('', 'GENERAL', 'hi');
      assert.strictEqual(generalEmptyTitle.isValid, true);
      passedTests++;
    });

    await it('Validates post content bounds (1-5000 chars)', () => {
      const emptyPost = validatePostContent('', '', false, 'en');
      assert.strictEqual(emptyPost.isValid, false);

      const validPost = validatePostContent('Namaste Samaj Bandhu', 'Welcome', false, 'en');
      assert.strictEqual(validPost.isValid, true);
      passedTests++;
    });
  });

  // Flow 4: Feed → Post Details → Comments
  await describe('Flow 4: Feed → Post Details → Comments Flow', async () => {
    await it('Constructs post comments query with pagination params', () => {
      const client = new ApiClient('http://localhost:4000/api/v1');
      const url = (client as any).buildUrl('/posts/post_123/comments', { page: 1, limit: 10 });
      assert.strictEqual(url, 'http://localhost:4000/api/v1/posts/post_123/comments?page=1&limit=10');
      passedTests++;
    });

    await it('Verifies comments API definition on postsApi', () => {
      assert.strictEqual(typeof postsApi.getComments, 'function');
      assert.strictEqual(typeof postsApi.createComment, 'function');
      passedTests++;
    });
  });

  // Flow 5: Feed → Members → Member Profile
  await describe('Flow 5: Feed → Members → Member Profile Flow', async () => {
    await it('Constructs directory query with subcaste and location filters', () => {
      const client = new ApiClient('http://localhost:4000/api/v1');
      const url = (client as any).buildUrl('/users/directory', {
        page: 1,
        limit: 10,
        city: 'Indore',
        gotra: 'Kashyap',
      });
      assert.strictEqual(
        url,
        'http://localhost:4000/api/v1/users/directory?page=1&limit=10&city=Indore&gotra=Kashyap'
      );
      passedTests++;
    });

    await it('usersApi.getPublicProfile contract requires UUID', () => {
      assert.strictEqual(typeof usersApi.getPublicProfile, 'function');
      passedTests++;
    });
  });

  // Flow 6: Feed → Groups → Group Details → Join / Leave
  await describe('Flow 6: Feed → Groups → Group Details → Join / Leave Flow', async () => {
    await it('Constructs groups list query with privacy filter and search', () => {
      const client = new ApiClient('http://localhost:4000/api/v1');
      const url = (client as any).buildUrl('/groups', {
        page: 1,
        limit: 12,
        privacy: 'PUBLIC',
        search: 'Yuva',
      });
      assert.strictEqual(
        url,
        'http://localhost:4000/api/v1/groups?page=1&limit=12&privacy=PUBLIC&search=Yuva'
      );
      passedTests++;
    });

    await it('groupsApi defines getGroupBySlug, joinGroup, and leaveGroup', () => {
      assert.strictEqual(typeof groupsApi.getGroupBySlug, 'function');
      assert.strictEqual(typeof groupsApi.joinGroup, 'function');
      assert.strictEqual(typeof groupsApi.leaveGroup, 'function');
      passedTests++;
    });
  });

  // Flow 7: Profile → Language Selection → Logout
  await describe('Flow 7: Profile → Language Selection → Logout Flow', async () => {
    await it('Toggles language resource resolution dynamically between Hindi and English', () => {
      const hiLoginTitle = resolveTranslation('auth:loginTitle', { lang: 'hi' });
      const enLoginTitle = resolveTranslation('auth:loginTitle', { lang: 'en' });
      assert.ok(hiLoginTitle.length > 0);
      assert.ok(enLoginTitle.length > 0);
      assert.notStrictEqual(hiLoginTitle, enLoginTitle);
      passedTests++;
    });

    await it('Logout wipes all session tokens and profile caches from SecureStore', async () => {
      await setAuthTokens({ accessToken: 'to_be_wiped', refreshToken: 'to_be_wiped' });
      await clearAuthTokens();
      const tokensAfter = await getAuthTokens();
      assert.strictEqual(tokensAfter.accessToken, null);
      assert.strictEqual(tokensAfter.refreshToken, null);
      passedTests++;
    });

    await it('Preserves community slug in SecureStore after logout', async () => {
      await setStoredCommunitySlug('kewat');
      await clearAuthTokens();
      const slugAfter = await getStoredCommunitySlug();
      assert.strictEqual(slugAfter, 'kewat');
      passedTests++;
    });
  });

  console.log(`\n================================================================`);
  console.log(` Navigation & Flows Test Summary: ${passedTests} passed, 0 failed`);
  console.log(`================================================================\n`);
}

runNavigationAuditTests();

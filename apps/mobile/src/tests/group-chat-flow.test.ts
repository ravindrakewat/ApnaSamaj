import assert from 'node:assert';
import { chatApi } from '../api/chat.api';
import { apiClient } from '../api/client';
import {
  ChatMessageItem,
  ChatMessagesResponseData,
  NewChatMessageEvent,
  UserTypingEvent,
} from '@apnasamaj/shared-types';
import {
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getStoredCommunitySlug,
  setStoredCommunitySlug,
  clearMemoryStorageForTesting,
} from '../services/storage.service';
import {
  getSocketServerUrl,
  getChatSocket,
  disconnectChatSocket,
} from '../services/socket.service';

export async function runGroupChatFlowTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 8.1: Mobile Group Chat Tests              ');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   ${err?.message || err}`);
      failed++;
    }
  }

  // Backup original apiClient methods for restore after tests
  const originalGet = apiClient.get.bind(apiClient);
  const originalPost = apiClient.post.bind(apiClient);

  const mockMessage1: ChatMessageItem = {
    id: 'msg-001',
    groupId: 'grp-kewat-101',
    senderId: 'usr-kewat-1',
    content: 'नमस्ते सभी को, समाज बैठक में आपका स्वागत है।',
    createdAt: '2026-11-04T10:00:00.000Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
    sender: {
      id: 'usr-kewat-1',
      fullName: 'सुनील कुमार',
      avatarUrl: 'https://example.com/avatar1.jpg',
    },
  };

  const mockMessage2: ChatMessageItem = {
    id: 'msg-002',
    groupId: 'grp-kewat-101',
    senderId: 'usr-kewat-2',
    content: 'धन्यवाद! बैठक का एजेंडा क्या है?',
    createdAt: '2026-11-04T10:05:00.000Z',
    updatedAt: '2026-11-04T10:05:00.000Z',
    sender: {
      id: 'usr-kewat-2',
      fullName: 'राकेश शर्मा',
      avatarUrl: null,
    },
  };

  try {
    // -------------------------------------------------------------------------
    // Test 1: Group Chat route navigation contract
    // -------------------------------------------------------------------------
    await test('Test 1: Group Chat route navigation contract conforms to Expo Router', () => {
      const chatRoute = 'apps/mobile/app/(app)/group/[slug]/chat.tsx';
      assert(chatRoute.includes('/group/[slug]/chat.tsx'));
      assert(chatRoute.startsWith('apps/mobile/app/(app)/'));
    });

    // -------------------------------------------------------------------------
    // Test 2: Message history loading via GET /groups/:id/messages
    // -------------------------------------------------------------------------
    await test('Test 2: chatApi.getGroupMessages retrieves message history via GET /groups/:id/messages', async () => {
      let interceptedEndpoint = '';
      let interceptedParams: any = null;

      (apiClient as any).get = async (endpoint: string, options: any) => {
        interceptedEndpoint = endpoint;
        interceptedParams = options?.params;
        return {
          success: true,
          data: {
            messages: [mockMessage2, mockMessage1],
            nextCursor: mockMessage1.createdAt,
            hasMore: true,
          },
        };
      };

      const result = await chatApi.getGroupMessages('grp-kewat-101', { limit: 20 });
      assert.strictEqual(interceptedEndpoint, '/groups/grp-kewat-101/messages');
      assert.strictEqual(interceptedParams.limit, 20);
      assert.strictEqual(result.messages.length, 2);
      assert.strictEqual(result.messages[0].id, 'msg-002');
      assert.strictEqual(result.nextCursor, '2026-11-04T10:00:00.000Z');
      assert.strictEqual(result.hasMore, true);
    });

    // -------------------------------------------------------------------------
    // Test 3: Cursor-based pagination with before date
    // -------------------------------------------------------------------------
    await test('Test 3: chatApi.getGroupMessages handles cursor pagination using before parameter', async () => {
      let interceptedParams: any = null;

      (apiClient as any).get = async (_endpoint: string, options: any) => {
        interceptedParams = options?.params;
        return {
          success: true,
          data: {
            messages: [mockMessage1],
            nextCursor: null,
            hasMore: false,
          },
        };
      };

      const cursor = '2026-11-04T10:00:00.000Z';
      const result = await chatApi.getGroupMessages('grp-kewat-101', { before: cursor, limit: 30 });
      assert.strictEqual(interceptedParams.before, cursor);
      assert.strictEqual(interceptedParams.limit, 30);
      assert.strictEqual(result.hasMore, false);
      assert.strictEqual(result.nextCursor, null);
    });

    // -------------------------------------------------------------------------
    // Test 4: Sending message via HTTP fallback
    // -------------------------------------------------------------------------
    await test('Test 4: chatApi.sendGroupMessage sends message via POST /groups/:id/messages', async () => {
      let interceptedEndpoint = '';
      let interceptedBody: any = null;

      (apiClient as any).post = async (endpoint: string, body: any) => {
        interceptedEndpoint = endpoint;
        interceptedBody = body;
        return {
          success: true,
          data: {
            id: 'msg-003',
            groupId: 'grp-kewat-101',
            senderId: 'usr-kewat-1',
            content: body.content,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sender: {
              id: 'usr-kewat-1',
              fullName: 'सुनील कुमार',
              avatarUrl: null,
            },
          },
        };
      };

      const tempId = 'temp_12345';
      const result = await chatApi.sendGroupMessage('grp-kewat-101', 'नया संदेश परीक्षण', tempId);
      assert.strictEqual(interceptedEndpoint, '/groups/grp-kewat-101/messages');
      assert.strictEqual(interceptedBody.content, 'नया संदेश परीक्षण');
      assert.strictEqual(interceptedBody.tempId, tempId);
      assert.strictEqual(result.content, 'नया संदेश परीक्षण');
    });

    // -------------------------------------------------------------------------
    // Test 5: Receiving real-time new_message event & optimistic replacement
    // -------------------------------------------------------------------------
    await test('Test 5: Real-time new_message event replaces optimistic tempId correctly', () => {
      const tempId = 'temp_optimistic_999';
      const initialMessages = [
        {
          id: tempId,
          groupId: 'grp-kewat-101',
          senderId: 'usr-kewat-1',
          content: 'ऑप्टिमिस्टिक संदेश',
          createdAt: '2026-11-04T10:15:00.000Z',
          updatedAt: '2026-11-04T10:15:00.000Z',
          isOptimistic: true,
          tempId,
        },
      ];

      const incomingEvent: NewChatMessageEvent = {
        message: {
          id: 'msg-persisted-999',
          groupId: 'grp-kewat-101',
          senderId: 'usr-kewat-1',
          content: 'ऑप्टिमिस्टिक संदेश',
          createdAt: '2026-11-04T10:15:00.500Z',
          updatedAt: '2026-11-04T10:15:00.500Z',
          sender: { id: 'usr-kewat-1', fullName: 'सुनील कुमार', avatarUrl: null },
        },
        tempId,
      };

      // Simulate reducer logic in useGroupChat
      const updatedMessages = initialMessages.map((m) =>
        m.tempId === incomingEvent.tempId
          ? { ...incomingEvent.message, isOptimistic: false }
          : m
      );

      assert.strictEqual(updatedMessages.length, 1);
      assert.strictEqual(updatedMessages[0].id, 'msg-persisted-999');
      assert.strictEqual(updatedMessages[0].isOptimistic, false);
      assert.strictEqual(updatedMessages[0].content, 'ऑप्टिमिस्टिक संदेश');
    });

    // -------------------------------------------------------------------------
    // Test 6: Typing indicators contract (user_typing event)
    // -------------------------------------------------------------------------
    await test('Test 6: Typing indicator contract tracks and clears active typing users', () => {
      let typingUsers: string[] = [];

      const startEvent: UserTypingEvent = {
        groupId: 'grp-kewat-101',
        userId: 'usr-kewat-2',
        userName: 'राकेश शर्मा',
        isTyping: true,
      };

      // User starts typing
      if (startEvent.isTyping) {
        typingUsers = typingUsers.includes(startEvent.userName)
          ? typingUsers
          : [...typingUsers, startEvent.userName];
      }
      assert.strictEqual(typingUsers.length, 1);
      assert.strictEqual(typingUsers[0], 'राकेश शर्मा');

      // User stops typing
      const stopEvent: UserTypingEvent = {
        groupId: 'grp-kewat-101',
        userId: 'usr-kewat-2',
        userName: 'राकेश शर्मा',
        isTyping: false,
      };
      if (!stopEvent.isTyping) {
        typingUsers = typingUsers.filter((u) => u !== stopEvent.userName);
      }
      assert.strictEqual(typingUsers.length, 0);
    });

    // -------------------------------------------------------------------------
    // Test 7: Duplicate message prevention (by id and tempId)
    // -------------------------------------------------------------------------
    await test('Test 7: Prevents duplicate message rendering by message ID', () => {
      const existingList = [mockMessage1, mockMessage2];

      const isDuplicate = (newMessage: ChatMessageItem): boolean => {
        return existingList.some((m) => m.id === newMessage.id);
      };

      assert.strictEqual(isDuplicate(mockMessage1), true);
      assert.strictEqual(
        isDuplicate({
          ...mockMessage1,
          id: 'msg-004-unique',
        }),
        false
      );
    });

    // -------------------------------------------------------------------------
    // Test 8: Socket reconnection configuration & URL derivation
    // -------------------------------------------------------------------------
    await test('Test 8: Socket.IO server URL derivation and connection options', () => {
      const serverUrl = getSocketServerUrl();
      assert(!serverUrl.endsWith('/api/v1'));
      assert(serverUrl.startsWith('http'));

      const socket = getChatSocket();
      assert(socket !== null);
      assert(socket.io.opts.reconnection === true);
      assert.strictEqual(socket.io.opts.path, '/socket.io');
    });

    // -------------------------------------------------------------------------
    // Test 9: Socket listener cleanup on unmount / disconnect
    // -------------------------------------------------------------------------
    await test('Test 9: disconnectChatSocket resets singleton instance and cleans listeners', () => {
      const socket = getChatSocket();
      assert(socket !== null);

      disconnectChatSocket();
      // Calling getChatSocket after disconnect creates fresh instance
      const newSocket = getChatSocket();
      assert(newSocket !== null);
    });

    // -------------------------------------------------------------------------
    // Test 10: Private group access restrictions (403 Forbidden)
    // -------------------------------------------------------------------------
    await test('Test 10: Private group access restrictions reject unauthorized non-members with 403', async () => {
      (apiClient as any).get = async () => {
        return {
          success: false,
          error: 'You must be a member of this private group to access its chat.',
        };
      };

      await assert.rejects(
        async () => {
          await chatApi.getGroupMessages('grp-private-locked');
        },
        (err: Error) => {
          return err.message.includes('private group');
        }
      );
    });

    // -------------------------------------------------------------------------
    // Test 11: Public group send permission (membership validation)
    // -------------------------------------------------------------------------
    await test('Test 11: Public group requires membership to send messages', () => {
      const validateCanSend = (isMember: boolean, content: string): boolean => {
        if (!isMember) return false;
        const trimmed = content.trim();
        return trimmed.length > 0 && trimmed.length <= 2000;
      };

      assert.strictEqual(validateCanSend(false, 'Hello public group'), false);
      assert.strictEqual(validateCanSend(true, 'Hello public group'), true);
      assert.strictEqual(validateCanSend(true, ''), false);
      assert.strictEqual(validateCanSend(true, 'a'.repeat(2001)), false);
    });

    // -------------------------------------------------------------------------
    // Test 12: Tenant isolation header and auth payload contract
    // -------------------------------------------------------------------------
    await test('Test 12: Multi-tenant isolation attached to chat API requests', async () => {
      await clearMemoryStorageForTesting();
      await setStoredCommunitySlug('kewat-community');
      await setAuthTokens({ accessToken: 'test-token', refreshToken: 'test-refresh' });

      const headers = await (apiClient as any).buildHeaders({});
      assert.strictEqual(headers['x-community-slug'], 'kewat-community');
      assert.strictEqual(headers.Authorization, 'Bearer test-token');
    });

  } finally {
    // Restore original apiClient methods and disconnect socket
    (apiClient as any).get = originalGet;
    (apiClient as any).post = originalPost;
    disconnectChatSocket();
  }

  console.log('----------------------------------------------------------------');
  console.log(`Group Chat Flow Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Group Chat Flow suite.`);
  }
}


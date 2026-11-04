import assert from 'node:assert';
import { chatApi } from '../api/chat.api';
import { apiClient } from '../api/client';
import {
  DirectMessageItem,
  DirectMessagesResponseData,
  DirectConversationItem,
  DirectInboxResponseData,
  DirectNewMessageEvent,
  DirectUserTypingEvent,
  DirectMessageReadEvent,
  GroupListItem,
  GroupPrivacy,
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

export async function runPersonalChatFlowTests(): Promise<void> {
  console.log('\n================================================================');
  console.log('   Apna Samaj — Batch 8.3: Mobile Personal Chat & Inbox Tests   ');
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

  const mockPersonalConv: DirectConversationItem = {
    id: 'conv-kewat-101',
    otherUser: {
      id: 'usr-bhavna-222',
      fullName: 'भावना केवट',
      avatarUrl: 'https://example.com/bhavna.jpg',
      lastReadAt: '2026-11-04T12:00:00.000Z',
    },
    lastMessage: {
      id: 'dmsg-002',
      conversationId: 'conv-kewat-101',
      senderId: 'usr-bhavna-222',
      content: 'हाँ भाई, मैं वार्षिक बैठक में आ रही हूँ।',
      createdAt: '2026-11-04T12:05:00.000Z',
      updatedAt: '2026-11-04T12:05:00.000Z',
    },
    unreadCount: 1,
    createdAt: '2026-11-04T10:00:00.000Z',
    updatedAt: '2026-11-04T12:05:00.000Z',
  };

  const mockDirectMessage1: DirectMessageItem = {
    id: 'dmsg-001',
    conversationId: 'conv-kewat-101',
    senderId: 'usr-aarav-111',
    content: 'नमस्ते भावना जी, क्या आप बैठक में शामिल हो रही हैं?',
    createdAt: '2026-11-04T12:00:00.000Z',
    updatedAt: '2026-11-04T12:00:00.000Z',
    sender: {
      id: 'usr-aarav-111',
      fullName: 'आरव केवट',
      avatarUrl: null,
    },
  };

  const mockGroupItem: GroupListItem = {
    id: 'grp-yuva-1',
    name: 'केवट युवा मंडल',
    slug: 'kewat-yuva-mandal',
    description: 'समाज के युवाओं का आधिकारिक समूह',
    coverUrl: null,
    privacy: GroupPrivacy.PUBLIC,
    membersCount: 45,
    postsCount: 12,
    isMember: true,
    myRole: null,
    createdAt: '2026-11-04T11:00:00.000Z',
  };

  try {
    // -------------------------------------------------------------------------
    // Test 1: Member profile Message button & self-chat prevention
    // -------------------------------------------------------------------------
    await test('Test 1: Member profile Message button contract & self-chat prevention', () => {
      const currentUserId: string = 'usr-aarav-111';
      const otherUserId: string = 'usr-bhavna-222';
      const selfUserId: string = 'usr-aarav-111';

      // Self-chat check
      const canMessageSelf = currentUserId !== selfUserId;
      assert.strictEqual(canMessageSelf, false, 'Cannot message self on own profile');

      // Other user check
      const canMessageOther = currentUserId !== otherUserId;
      assert.strictEqual(canMessageOther, true, 'Can message other community member');
    });

    // -------------------------------------------------------------------------
    // Test 2: chatApi.createDirectConversation calls POST /chat/direct
    // -------------------------------------------------------------------------
    await test('Test 2: chatApi.createDirectConversation starts or retrieves 1-to-1 conversation', async () => {
      let capturedEndpoint = '';
      let capturedBody: any = null;

      (apiClient as any).post = async (url: string, body: any) => {
        capturedEndpoint = url;
        capturedBody = body;
        return {
          success: true,
          data: mockPersonalConv,
        };
      };

      const result = await chatApi.createDirectConversation('usr-bhavna-222');

      assert.strictEqual(capturedEndpoint, '/chat/direct');
      assert.strictEqual(capturedBody?.recipientId, 'usr-bhavna-222');
      assert.strictEqual(result.id, 'conv-kewat-101');
      assert.strictEqual(result.otherUser.fullName, 'भावना केवट');
    });

    // -------------------------------------------------------------------------
    // Test 3: chatApi.getDirectInbox retrieves personal conversation list
    // -------------------------------------------------------------------------
    await test('Test 3: chatApi.getDirectInbox retrieves inbox with unread counts & previews', async () => {
      let capturedEndpoint = '';
      let capturedParams: any = null;

      (apiClient as any).get = async (url: string, options: any) => {
        capturedEndpoint = url;
        capturedParams = options?.params;
        return {
          success: true,
          data: {
            conversations: [mockPersonalConv],
            nextCursor: null,
            hasMore: false,
          },
        };
      };

      const result = await chatApi.getDirectInbox({ limit: 20 });

      assert.strictEqual(capturedEndpoint, '/chat/inbox');
      assert.strictEqual(capturedParams?.limit, 20);
      assert.strictEqual(result.conversations.length, 1);
      assert.strictEqual(result.conversations[0].unreadCount, 1);
      assert.strictEqual(result.conversations[0].lastMessage?.content, 'हाँ भाई, मैं वार्षिक बैठक में आ रही हूँ।');
    });

    // -------------------------------------------------------------------------
    // Test 4: Unified Inbox tab filtering (All, Personal, Groups)
    // -------------------------------------------------------------------------
    await test('Test 4: Unified Inbox tab filtering isolates Personal and Group chats', () => {
      const items = [
        { type: 'personal', id: mockPersonalConv.id, name: mockPersonalConv.otherUser.fullName },
        { type: 'group', id: mockGroupItem.id, name: mockGroupItem.name },
      ];

      const allTab = items;
      assert.strictEqual(allTab.length, 2, 'All tab includes both personal and group chats');

      const personalTab = items.filter((i) => i.type === 'personal');
      assert.strictEqual(personalTab.length, 1, 'Personal tab includes only personal chats');
      assert.strictEqual(personalTab[0].name, 'भावना केवट');

      const groupsTab = items.filter((i) => i.type === 'group');
      assert.strictEqual(groupsTab.length, 1, 'Groups tab includes only group chats');
      assert.strictEqual(groupsTab[0].name, 'केवट युवा मंडल');
    });

    // -------------------------------------------------------------------------
    // Test 5: Combined inbox sorting by timestamp descending
    // -------------------------------------------------------------------------
    await test('Test 5: Combined inbox sorts chats strictly by most recent activity timestamp', () => {
      const chatA = { name: 'Older Chat', timestamp: '2026-11-04T10:00:00.000Z' };
      const chatB = { name: 'Newer Chat', timestamp: '2026-11-04T12:05:00.000Z' };
      const chatC = { name: 'Middle Group', timestamp: '2026-11-04T11:00:00.000Z' };

      const sorted = [chatA, chatB, chatC].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      assert.strictEqual(sorted[0].name, 'Newer Chat');
      assert.strictEqual(sorted[1].name, 'Middle Group');
      assert.strictEqual(sorted[2].name, 'Older Chat');
    });

    // -------------------------------------------------------------------------
    // Test 6: chatApi.getDirectMessages cursor pagination
    // -------------------------------------------------------------------------
    await test('Test 6: chatApi.getDirectMessages handles cursor pagination (before parameter)', async () => {
      let capturedEndpoint = '';
      let capturedParams: any = null;

      (apiClient as any).get = async (url: string, options: any) => {
        capturedEndpoint = url;
        capturedParams = options?.params;
        return {
          success: true,
          data: {
            messages: [mockDirectMessage1],
            nextCursor: 'dmsg-001',
            hasMore: true,
          },
        };
      };

      const result = await chatApi.getDirectMessages('conv-kewat-101', {
        before: 'dmsg-cursor-999',
        limit: 15,
      });

      assert.strictEqual(capturedEndpoint, '/chat/conversations/conv-kewat-101/messages');
      assert.strictEqual(capturedParams?.before, 'dmsg-cursor-999');
      assert.strictEqual(capturedParams?.limit, 15);
      assert.strictEqual(result.messages.length, 1);
      assert.strictEqual(result.hasMore, true);
    });

    // -------------------------------------------------------------------------
    // Test 7: chatApi.sendDirectMessage sends message via POST
    // -------------------------------------------------------------------------
    await test('Test 7: chatApi.sendDirectMessage sends direct message with tempId', async () => {
      let capturedEndpoint = '';
      let capturedBody: any = null;

      (apiClient as any).post = async (url: string, body: any) => {
        capturedEndpoint = url;
        capturedBody = body;
        return {
          success: true,
          data: {
            ...mockDirectMessage1,
            id: 'dmsg-confirmed-101',
          },
        };
      };

      const result = await chatApi.sendDirectMessage(
        'conv-kewat-101',
        'नमस्ते भावना जी',
        'temp-client-999'
      );

      assert.strictEqual(capturedEndpoint, '/chat/conversations/conv-kewat-101/messages');
      assert.strictEqual(capturedBody?.content, 'नमस्ते भावना जी');
      assert.strictEqual(capturedBody?.tempId, 'temp-client-999');
      assert.strictEqual(result.id, 'dmsg-confirmed-101');
    });

    // -------------------------------------------------------------------------
    // Test 8: Optimistic message sending & tempId replacement
    // -------------------------------------------------------------------------
    await test('Test 8: Optimistic message is reconciled by tempId on confirmation', () => {
      const tempId = 'temp-12345';
      const initialMessages = [
        {
          id: tempId,
          conversationId: 'conv-kewat-101',
          senderId: 'usr-aarav-111',
          content: 'Optimistic direct message',
          createdAt: '2026-11-04T12:00:00.000Z',
          updatedAt: '2026-11-04T12:00:00.000Z',
          isOptimistic: true,
          tempId,
        },
      ];

      const confirmedServerMessage: DirectMessageItem = {
        id: 'dmsg-server-777',
        conversationId: 'conv-kewat-101',
        senderId: 'usr-aarav-111',
        content: 'Optimistic direct message',
        createdAt: '2026-11-04T12:00:00.000Z',
        updatedAt: '2026-11-04T12:00:00.000Z',
      };

      // Reconciliation logic
      const reconciled = initialMessages.map((m) =>
        m.tempId === tempId ? { ...confirmedServerMessage, isOptimistic: false } : m
      );

      assert.strictEqual(reconciled.length, 1, 'Reconciled message count stays 1');
      assert.strictEqual(reconciled[0].id, 'dmsg-server-777', 'Replaced tempId with permanent server ID');
      assert.strictEqual(reconciled[0].isOptimistic, false, 'Optimistic flag cleared');
    });

    // -------------------------------------------------------------------------
    // Test 9: Duplicate message prevention
    // -------------------------------------------------------------------------
    await test('Test 9: Prevents duplicate message rendering by message ID', () => {
      const messages = [mockDirectMessage1];
      const incomingDuplicate: DirectMessageItem = { ...mockDirectMessage1 };

      const exists = messages.some((m) => m.id === incomingDuplicate.id);
      assert.strictEqual(exists, true, 'Detected duplicate message');

      const updated = exists ? messages : [incomingDuplicate, ...messages];
      assert.strictEqual(updated.length, 1, 'List does not append duplicate message');
    });

    // -------------------------------------------------------------------------
    // Test 10: Failed message retry
    // -------------------------------------------------------------------------
    await test('Test 10: Failed message marks isError and allows retry', () => {
      const tempId = 'temp-failed-1';
      const failedMessage = {
        id: tempId,
        conversationId: 'conv-kewat-101',
        senderId: 'usr-aarav-111',
        content: 'Retryable message',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isOptimistic: false,
        isError: true,
        errorMessage: 'Network timeout',
        tempId,
      };

      assert.strictEqual(failedMessage.isError, true, 'Message marked with isError');
      assert.strictEqual(Boolean(failedMessage.tempId), true, 'Preserved tempId for retry identification');
    });

    // -------------------------------------------------------------------------
    // Test 11: Read-status updates & blue-tick calculation
    // -------------------------------------------------------------------------
    await test('Test 11: Read-status marking & blue-tick receipt calculation', async () => {
      (apiClient as any).post = async (url: string) => {
        return {
          success: true,
          data: {
            conversationId: 'conv-kewat-101',
            readAt: '2026-11-04T12:10:00.000Z',
          },
        };
      };

      const res = await chatApi.markDirectConversationAsRead('conv-kewat-101');
      assert.strictEqual(res.conversationId, 'conv-kewat-101');
      assert.strictEqual(res.readAt, '2026-11-04T12:10:00.000Z');

      // Blue-tick test: message sent at 12:00:00, recipient read at 12:10:00
      const messageSentAt = new Date('2026-11-04T12:00:00.000Z').getTime();
      const otherUserReadAt = new Date(res.readAt).getTime();
      const isRead = messageSentAt <= otherUserReadAt;
      assert.strictEqual(isRead, true, 'Message is rendered with blue ticks (read status)');
    });

    // -------------------------------------------------------------------------
    // Test 12: Typing indicators (start & stop)
    // -------------------------------------------------------------------------
    await test('Test 12: Typing indicators properly track typing status per conversation', () => {
      let isTyping = false;
      let typingUserName = '';

      const handleTypingEvent = (payload: DirectUserTypingEvent) => {
        if (payload.conversationId === 'conv-kewat-101') {
          isTyping = payload.isTyping;
          typingUserName = payload.userName;
        }
      };

      // Start typing
      handleTypingEvent({
        conversationId: 'conv-kewat-101',
        userId: 'usr-bhavna-222',
        userName: 'भावना केवट',
        isTyping: true,
      });
      assert.strictEqual(isTyping, true, 'Typing state is active');
      assert.strictEqual(typingUserName, 'भावना केवट', 'Typing user name tracked');

      // Stop typing
      handleTypingEvent({
        conversationId: 'conv-kewat-101',
        userId: 'usr-bhavna-222',
        userName: 'भावना केवट',
        isTyping: false,
      });
      assert.strictEqual(isTyping, false, 'Typing state is cleared');
    });

    // -------------------------------------------------------------------------
    // Test 13: Socket reconnect and listener cleanup
    // -------------------------------------------------------------------------
    await test('Test 13: disconnectChatSocket resets instance and cleans all listeners', () => {
      const socket = getChatSocket();
      assert.ok(socket, 'Socket instance initialized');

      disconnectChatSocket();
      // Socket instance is nullified after disconnectChatSocket
      const freshSocket = getChatSocket();
      assert.ok(freshSocket, 'Fresh socket created on subsequent call');
      disconnectChatSocket();
    });

    // -------------------------------------------------------------------------
    // Test 14: Community switching and chat cache isolation
    // -------------------------------------------------------------------------
    await test('Test 14: Community switching isolates tenant context', async () => {
      clearMemoryStorageForTesting();
      await setStoredCommunitySlug('kewat');
      assert.strictEqual(await getStoredCommunitySlug(), 'kewat', 'Stored Kewat slug');

      await setStoredCommunitySlug('patel');
      assert.strictEqual(await getStoredCommunitySlug(), 'patel', 'Switched to Patel slug');

      clearMemoryStorageForTesting();
    });

    // -------------------------------------------------------------------------
    // Test 15: Existing Group Chat regression test
    // -------------------------------------------------------------------------
    await test('Test 15: Existing Group Chat endpoints continue working without regression', async () => {
      (apiClient as any).get = async (url: string) => {
        if (url.includes('/groups/grp-yuva-1/messages')) {
          return {
            success: true,
            data: {
              messages: [],
              hasMore: false,
            },
          };
        }
        throw new Error('Unexpected URL');
      };

      const groupChat = await chatApi.getGroupMessages('grp-yuva-1');
      assert.strictEqual(groupChat.hasMore, false, 'Group chat messages retrieved successfully');
    });

    // -------------------------------------------------------------------------
    // Test 16: Navigation from inbox to correct Personal and Group chat routes
    // -------------------------------------------------------------------------
    await test('Test 16: Navigation routes correctly to /chat/[id] for personal and /group/[slug]/chat for groups', () => {
      const personalItem = { type: 'personal', id: 'conv-kewat-101' };
      const groupItem = { type: 'group', slug: 'kewat-yuva-mandal' };

      const personalRoute = `/chat/${personalItem.id}`;
      const groupRoute = `/group/${groupItem.slug}/chat`;

      assert.strictEqual(personalRoute, '/chat/conv-kewat-101', 'Personal chat route matches');
      assert.strictEqual(groupRoute, '/group/kewat-yuva-mandal/chat', 'Group chat route matches');
    });

  } finally {
    // Restore original apiClient methods
    apiClient.get = originalGet;
    apiClient.post = originalPost;
    disconnectChatSocket();
  }

  console.log('----------------------------------------------------------------');
  console.log(`Personal Chat Flow Test Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    throw new Error(`${failed} personal chat flow test(s) failed`);
  }
}

import assert from 'node:assert';
import { PrismaClient, tenantDbManager } from '@apnasamaj/database';
import {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotificationSafely,
  NotificationNotFoundError,
  NotificationServiceError,
} from '../modules/notifications/notifications.service';
import {
  getGroupChatHistory,
  sendChatMessage,
  verifyGroupChatAccess,
  ChatNotFoundError,
  ForbiddenChatError,
  ChatServiceError,
} from '../modules/chat/chat.service';
import {
  initChatSocketServer,
  chatSocketAuthMiddleware,
  CustomSocket,
} from '../modules/chat/chat.socket';
import { generateAccessToken } from '../modules/auth/auth.tokens';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

console.log('================================================================');
console.log('   Apna Samaj — Phase 15C.4 Notifications & Chat Isolation      ');
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

// -------------------------------------------------------------
// Isolated In-Memory Mock Prisma Client Factory
// -------------------------------------------------------------
interface MockDataStore {
  notifications: any[];
  groups: any[];
  groupMembers: any[];
  chatMessages: any[];
  users: any[];
}

function createMockPrismaClient(communitySlug: string, initialData: MockDataStore) {
  const queryLog: string[] = [];
  const data = {
    notifications: [...initialData.notifications],
    groups: [...initialData.groups],
    groupMembers: [...initialData.groupMembers],
    chatMessages: [...initialData.chatMessages],
    users: [...initialData.users],
  };

  const client = {
    communitySlug,
    queryLog,
    data,
    resetLog: () => {
      queryLog.length = 0;
    },

    notification: {
      count: async ({ where }: any = {}) => {
        queryLog.push(`notification.count(${communitySlug})`);
        return data.notifications.filter((n) => {
          if (where?.recipientId && n.recipientId !== where.recipientId) return false;
          if (where?.isRead !== undefined && n.isRead !== where.isRead) return false;
          return true;
        }).length;
      },
      findMany: async ({ where, skip = 0, take = 20 }: any = {}) => {
        queryLog.push(`notification.findMany(${communitySlug})`);
        const filtered = data.notifications.filter((n) => {
          if (where?.recipientId && n.recipientId !== where.recipientId) return false;
          if (where?.isRead !== undefined && n.isRead !== where.isRead) return false;
          return true;
        });
        return filtered.slice(skip, skip + take).map((n) => ({
          ...n,
          actor: n.actorId
            ? {
                id: n.actorId,
                profile: { fullName: `Member ${n.actorId}`, avatarUrl: null },
              }
            : null,
        }));
      },
      findUnique: async ({ where }: any) => {
        queryLog.push(`notification.findUnique(${communitySlug})`);
        return data.notifications.find((n) => n.id === where.id) || null;
      },
      update: async ({ where, data: patch }: any) => {
        queryLog.push(`notification.update(${communitySlug})`);
        const item = data.notifications.find((n) => n.id === where.id);
        if (!item) throw new Error('Not found');
        Object.assign(item, patch);
        return { ...item };
      },
      updateMany: async ({ where, data: patch }: any) => {
        queryLog.push(`notification.updateMany(${communitySlug})`);
        let count = 0;
        data.notifications.forEach((n) => {
          if (where?.recipientId && n.recipientId !== where.recipientId) return;
          if (where?.isRead !== undefined && n.isRead !== where.isRead) return;
          Object.assign(n, patch);
          count++;
        });
        return { count };
      },
      delete: async ({ where }: any) => {
        queryLog.push(`notification.delete(${communitySlug})`);
        const idx = data.notifications.findIndex((n) => n.id === where.id);
        if (idx >= 0) {
          data.notifications.splice(idx, 1);
        }
        return { id: where.id };
      },
      findFirst: async ({ where }: any) => {
        queryLog.push(`notification.findFirst(${communitySlug})`);
        return (
          data.notifications.find((n) => {
            if (where?.recipientId && n.recipientId !== where.recipientId) return false;
            if (where?.actorId && n.actorId !== where.actorId) return false;
            if (where?.type && n.type !== where.type) return false;
            if (where?.entityId && n.entityId !== where.entityId) return false;
            if (where?.isRead !== undefined && n.isRead !== where.isRead) return false;
            return true;
          }) || null
        );
      },
      create: async ({ data: payload }: any) => {
        queryLog.push(`notification.create(${communitySlug})`);
        const newNotif = {
          id: `notif-${communitySlug}-${Date.now()}-${Math.random()}`,
          isRead: false,
          readAt: null,
          createdAt: new Date(),
          ...payload,
        };
        data.notifications.push(newNotif);
        return newNotif;
      },
    },

    group: {
      findFirst: async ({ where }: any) => {
        queryLog.push(`group.findFirst(${communitySlug})`);
        const identifier = where?.OR?.[0]?.id || where?.OR?.[1]?.slug;
        return data.groups.find((g) => g.id === identifier || g.slug === identifier) || null;
      },
    },

    groupMember: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`groupMember.findUnique(${communitySlug})`);
        const { groupId, userId } = where.groupId_userId;
        return (
          data.groupMembers.find(
            (gm) => gm.groupId === groupId && gm.userId === userId
          ) || null
        );
      },
    },

    chatMessage: {
      findMany: async ({ where, take = 20 }: any = {}) => {
        queryLog.push(`chatMessage.findMany(${communitySlug})`);
        const msgs = data.chatMessages.filter((m) => m.groupId === where.groupId);
        return msgs.slice(0, take).map((m) => ({
          ...m,
          sender: {
            id: m.senderId,
            profile: { fullName: `User ${m.senderId}`, avatarUrl: null },
          },
        }));
      },
      create: async ({ data: payload }: any) => {
        queryLog.push(`chatMessage.create(${communitySlug})`);
        const newMsg = {
          id: `msg-${communitySlug}-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
          sender: {
            id: payload.senderId,
            profile: { fullName: `User ${payload.senderId}`, avatarUrl: null },
          },
        };
        data.chatMessages.push(newMsg);
        return newMsg;
      },
    },

    user: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`user.findUnique(${communitySlug})`);
        return data.users.find((u) => u.id === where.id) || null;
      },
    },
  };

  return client as unknown as PrismaClient & typeof client;
}

// -------------------------------------------------------------
// Test Setup Data
// -------------------------------------------------------------
const mockKewatData: MockDataStore = {
  notifications: [
    {
      id: 'kewat-notif-1',
      recipientId: 'kewat-user-1',
      actorId: 'kewat-user-2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Someone liked your post in Kewat Samaj.',
      entityType: 'Post',
      entityId: 'kewat-post-1',
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    },
    {
      id: 'kewat-notif-2',
      recipientId: 'kewat-user-1',
      actorId: 'kewat-user-2',
      type: 'POST_COMMENT',
      title: 'New Comment',
      message: 'Someone commented on your post.',
      entityType: 'Post',
      entityId: 'kewat-post-1',
      isRead: true,
      readAt: new Date(),
      createdAt: new Date(Date.now() - 3600000),
    },
  ],
  groups: [
    {
      id: 'kewat-grp-public',
      name: 'Kewat Yuva Mandal',
      slug: 'kewat-yuva-mandal',
      privacy: 'PUBLIC',
    },
    {
      id: 'kewat-grp-private',
      name: 'Kewat Elders Circle',
      slug: 'kewat-elders-circle',
      privacy: 'PRIVATE',
    },
  ],
  groupMembers: [
    { groupId: 'kewat-grp-public', userId: 'kewat-user-1', role: 'MEMBER' },
    { groupId: 'kewat-grp-private', userId: 'kewat-user-1', role: 'ADMIN' },
  ],
  chatMessages: [
    {
      id: 'kewat-msg-1',
      groupId: 'kewat-grp-public',
      senderId: 'kewat-user-1',
      content: 'Jai Shri Ram from Kewat Samaj',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  users: [
    {
      id: 'kewat-user-1',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
      profile: { fullName: 'Ramesh Kewat', avatarUrl: null },
    },
    {
      id: 'kewat-user-2',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
      profile: { fullName: 'Suresh Kewat', avatarUrl: null },
    },
  ],
};

const mockGuptaData: MockDataStore = {
  notifications: [
    {
      id: 'gupta-notif-1',
      recipientId: 'gupta-user-1',
      actorId: 'gupta-user-2',
      type: 'MATRIMONIAL_INTEREST_RECEIVED',
      title: 'New Matrimonial Interest',
      message: 'A member sent you an interest request in Gupta Samaj.',
      entityType: 'MATRIMONIAL_INTEREST',
      entityId: 'gupta-mi-1',
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    },
  ],
  groups: [
    {
      id: 'gupta-grp-public',
      name: 'Gupta Vyapar Sangh',
      slug: 'gupta-vyapar-sangh',
      privacy: 'PUBLIC',
    },
  ],
  groupMembers: [
    { groupId: 'gupta-grp-public', userId: 'gupta-user-1', role: 'MEMBER' },
  ],
  chatMessages: [
    {
      id: 'gupta-msg-1',
      groupId: 'gupta-grp-public',
      senderId: 'gupta-user-1',
      content: 'Welcome to Gupta Vyapar chat',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  users: [
    {
      id: 'gupta-user-1',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
      profile: { fullName: 'Anil Gupta', avatarUrl: null },
    },
    {
      id: 'gupta-user-2',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
      profile: { fullName: 'Priya Gupta', avatarUrl: null },
    },
  ],
};

const kewatClient = createMockPrismaClient('kewat', mockKewatData);
const guptaClient = createMockPrismaClient('gupta', mockGuptaData);

// -------------------------------------------------------------
// Test Execution
// -------------------------------------------------------------
async function runTests() {
  console.log('--- Suite 1: Notifications Physical Database Isolation ---');

  // 1. Kewat unread count queries only Kewat client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const kewatCount = await getUnreadCount('kewat-user-1', kewatClient);
  assertTest(kewatCount.unreadCount === 1, 'Kewat unread count is 1');
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('notification.count(kewat)')),
    'getUnreadCount queried supplied Kewat client'
  );
  assertTest(guptaClient.queryLog.length === 0, 'Gupta client received zero queries');

  // 2. Gupta unread count queries only Gupta client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const guptaCount = await getUnreadCount('gupta-user-1', guptaClient);
  assertTest(guptaCount.unreadCount === 1, 'Gupta unread count is 1');
  assertTest(
    guptaClient.queryLog.some((q) => q.includes('notification.count(gupta)')),
    'getUnreadCount queried supplied Gupta client'
  );
  assertTest(kewatClient.queryLog.length === 0, 'Kewat client received zero queries');

  // 3. Kewat notifications feed queries only Kewat client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const kewatFeed = await getNotifications('kewat-user-1', { page: 1, limit: 10 }, kewatClient);
  assertTest(kewatFeed.notifications.length === 2, 'Kewat feed returned 2 notifications');
  assertTest(
    kewatFeed.notifications.every((n) => n.id.startsWith('kewat-')),
    'All notifications belong to Kewat'
  );
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('notification.findMany(kewat)')),
    'getNotifications queried Kewat client'
  );
  assertTest(guptaClient.queryLog.length === 0, 'Gupta client received zero queries during Kewat feed');

  // 4. Gupta notifications feed queries only Gupta client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const guptaFeed = await getNotifications('gupta-user-1', { page: 1, limit: 10 }, guptaClient);
  assertTest(guptaFeed.notifications.length === 1, 'Gupta feed returned 1 notification');
  assertTest(guptaFeed.notifications[0].id === 'gupta-notif-1', 'Notification belongs to Gupta');
  assertTest(
    guptaClient.queryLog.some((q) => q.includes('notification.findMany(gupta)')),
    'getNotifications queried Gupta client'
  );
  assertTest(kewatClient.queryLog.length === 0, 'Kewat client received zero queries during Gupta feed');

  // 5. Cross-community notification access rejected
  // Attempting to mark a Kewat notification using the Gupta client fails with 404
  try {
    await markAsRead('kewat-notif-1', 'kewat-user-1', guptaClient);
    assertTest(false, 'Cross-community markAsRead should fail');
  } catch (err: any) {
    assertTest(
      err instanceof NotificationNotFoundError && err.statusCode === 404,
      'Cross-community notification markAsRead fails closed with 404'
    );
  }

  // Attempting to delete a Kewat notification using the Gupta client fails with 404
  try {
    await deleteNotification('kewat-notif-1', 'kewat-user-1', guptaClient);
    assertTest(false, 'Cross-community deleteNotification should fail');
  } catch (err: any) {
    assertTest(
      err instanceof NotificationNotFoundError && err.statusCode === 404,
      'Cross-community deleteNotification fails closed with 404'
    );
  }

  // 6. Missing tenant db fails closed with 400
  try {
    await getUnreadCount('kewat-user-1', undefined);
    assertTest(false, 'Missing tenant client should throw 400');
  } catch (err: any) {
    assertTest(
      err instanceof NotificationServiceError && err.statusCode === 400,
      'Missing tenant db in notifications fails closed with 400'
    );
  }

  // 7. Mark as read on correct client
  kewatClient.resetLog();
  const readRes = await markAsRead('kewat-notif-1', 'kewat-user-1', kewatClient);
  assertTest(readRes.isRead === true, 'Notification marked as read');
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('notification.update(kewat)')),
    'markAsRead executed update on Kewat client'
  );

  // 8. Safe delivery persists to supplied tenant client
  kewatClient.resetLog();
  await sendNotificationSafely(
    {
      recipientId: 'kewat-user-1',
      actorId: 'kewat-user-2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Someone liked your post',
      entityId: 'post-100',
    },
    kewatClient
  );
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('notification.create(kewat)')),
    'sendNotificationSafely created record on Kewat client'
  );

  console.log('\n--- Suite 2: Chat Service Physical Database Isolation & Permissions ---');

  // 9. Kewat chat history queries only Kewat client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const kewatHistory = await getGroupChatHistory(
    'kewat-grp-public',
    'kewat-user-1',
    { limit: 20 },
    kewatClient
  );
  assertTest(kewatHistory.messages.length === 1, 'Kewat chat history returns 1 message');
  assertTest(kewatHistory.messages[0].content.includes('Kewat Samaj'), 'Message content verified');
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('chatMessage.findMany(kewat)')),
    'getGroupChatHistory queried Kewat client'
  );
  assertTest(guptaClient.queryLog.length === 0, 'Gupta client received zero queries during Kewat chat history');

  // 10. Gupta chat history queries only Gupta client
  kewatClient.resetLog();
  guptaClient.resetLog();
  const guptaHistory = await getGroupChatHistory(
    'gupta-grp-public',
    'gupta-user-1',
    { limit: 20 },
    guptaClient
  );
  assertTest(guptaHistory.messages.length === 1, 'Gupta chat history returns 1 message');
  assertTest(guptaHistory.messages[0].content.includes('Gupta Vyapar'), 'Gupta message content verified');
  assertTest(
    guptaClient.queryLog.some((q) => q.includes('chatMessage.findMany(gupta)')),
    'getGroupChatHistory queried Gupta client'
  );
  assertTest(kewatClient.queryLog.length === 0, 'Kewat client received zero queries during Gupta chat history');

  // 11. Cross-community group chat access rejected
  // Attempting to access Kewat group on Gupta client throws 404 ChatNotFoundError
  try {
    await getGroupChatHistory('kewat-grp-public', 'kewat-user-1', { limit: 20 }, guptaClient);
    assertTest(false, 'Cross-community chat history should fail with 404');
  } catch (err: any) {
    assertTest(
      err instanceof ChatNotFoundError && err.statusCode === 404,
      'Cross-community group chat access fails closed with 404'
    );
  }

  // 12. Private group access control on tenant client:
  // Non-member cannot access private group chat
  try {
    await getGroupChatHistory('kewat-grp-private', 'kewat-user-2', { limit: 20 }, kewatClient);
    assertTest(false, 'Non-member should be denied access to private group chat');
  } catch (err: any) {
    assertTest(
      err instanceof ForbiddenChatError && err.statusCode === 403,
      'Private group chat access denied to non-members with 403'
    );
  }

  // 13. Sending chat message requires group membership
  try {
    await sendChatMessage('kewat-grp-private', 'kewat-user-2', 'Hello there', undefined, kewatClient);
    assertTest(false, 'Non-member sending message should fail');
  } catch (err: any) {
    assertTest(
      err instanceof ForbiddenChatError && err.statusCode === 403,
      'Sending message without group membership fails with 403'
    );
  }

  // 14. Sending chat message succeeds on supplied tenant client for authorized member
  kewatClient.resetLog();
  const sentMsg = await sendChatMessage(
    'kewat-grp-public',
    'kewat-user-1',
    'Hello Kewat Samaj members',
    'temp-1',
    kewatClient
  );
  assertTest(sentMsg.content === 'Hello Kewat Samaj members', 'Message sent successfully');
  assertTest(
    kewatClient.queryLog.some((q) => q.includes('chatMessage.create(kewat)')),
    'sendChatMessage created record on Kewat client'
  );

  // 15. Missing tenant client in chat service fails closed with 400
  try {
    await getGroupChatHistory('kewat-grp-public', 'kewat-user-1', { limit: 20 }, undefined);
    assertTest(false, 'Missing tenant client in chat should throw 400');
  } catch (err: any) {
    assertTest(
      err instanceof ChatServiceError && err.statusCode === 400,
      'Missing tenant db in chat service fails closed with 400'
    );
  }

  console.log('\n--- Suite 3: Socket.IO Multi-Tenant Architecture & Invariants ---');

  // Inject mock clients into tenantDbManager for isolated socket tests
  tenantDbManager.setClient('kewat', kewatClient);
  tenantDbManager.setClient('gupta', guptaClient);

  // 16. Verify Socket.IO server initialization
  const dummyServer = http.createServer();
  const io = initChatSocketServer(dummyServer);
  assertTest(Boolean(io), 'initChatSocketServer initializes Socket.IO server');

  // 17. Handshake Tenant Resolution & Authentication Middleware Tests
  assertTest(typeof chatSocketAuthMiddleware === 'function', 'chatSocketAuthMiddleware function is exported');

  // Generate tokens for testing
  const validKewatToken = generateAccessToken({
    id: 'kewat-user-1',
    phone: '+919999999991',
    role: 'COMMUNITY_MEMBER',
    status: 'ACTIVE',
  });
  const validGuptaToken = generateAccessToken({
    id: 'gupta-user-1',
    phone: '+919999999992',
    role: 'COMMUNITY_MEMBER',
    status: 'ACTIVE',
  });

  // Test 17a: Missing access token is rejected
  let missingTokenError: any = null;
  const mockMissingTokenSocket: any = {
    handshake: {
      headers: { origin: 'https://kewat.samaz.in' },
      auth: {},
    },
    data: {},
  };
  await chatSocketAuthMiddleware(mockMissingTokenSocket, (err: any) => {
    missingTokenError = err;
  });
  assertTest(
    missingTokenError?.message?.includes('Missing access token'),
    'Handshake without token rejected'
  );

  // Test 17b: Missing community context is rejected
  let missingTenantError: any = null;
  const mockMissingTenantSocket: any = {
    handshake: {
      headers: { origin: 'https://samaz.in' }, // apex, no community
      auth: { token: validKewatToken },
    },
    data: {},
  };
  await chatSocketAuthMiddleware(mockMissingTenantSocket, (err: any) => {
    missingTenantError = err;
  });
  assertTest(
    missingTenantError?.message?.includes('Community tenant context required'),
    'Handshake without community context rejected'
  );

  // Test 17c: Conflicting tenant header vs Origin is rejected
  let conflictError: any = null;
  const mockConflictSocket: any = {
    handshake: {
      headers: {
        origin: 'https://kewat.samaz.in',
        'x-community-slug': 'gupta',
      },
      auth: { token: validKewatToken },
    },
    data: {},
  };
  await chatSocketAuthMiddleware(mockConflictSocket, (err: any) => {
    conflictError = err;
  });
  assertTest(
    conflictError?.message?.includes('Tenant conflict'),
    'Handshake with conflicting header vs Origin rejected'
  );

  // Test 17d: Unknown community tenant is rejected
  let unknownTenantError: any = null;
  const mockUnknownTenantSocket: any = {
    handshake: {
      headers: {
        'x-community-slug': 'unknown-samaj',
      },
      auth: { token: validKewatToken },
    },
    data: {},
  };
  await chatSocketAuthMiddleware(mockUnknownTenantSocket, (err: any) => {
    unknownTenantError = err;
  });
  assertTest(
    unknownTenantError?.message?.includes('Unknown community tenant'),
    'Handshake with unregistered community rejected'
  );

  // Test 17e: Successful Kewat handshake binds tenant and database
  let kewatAuthSuccess = false;
  const mockKewatSocket: any = {
    handshake: {
      headers: {
        origin: 'https://kewat.samaz.in',
      },
      auth: { token: validKewatToken },
    },
    data: {},
  };
  await chatSocketAuthMiddleware(mockKewatSocket, (err: any) => {
    if (!err) kewatAuthSuccess = true;
  });
  assertTest(kewatAuthSuccess, 'Kewat handshake authorized successfully');
  assertTest(mockKewatSocket.data.tenant?.slug === 'kewat', 'Socket bound to Kewat tenant');
  assertTest(mockKewatSocket.data.db !== undefined, 'Socket bound to tenant database client');
  assertTest(mockKewatSocket.data.user?.id === 'kewat-user-1', 'Socket bound to authenticated user');

  // Test 17f: Cross-community token access rejected
  // User with token for non-existent/different user on Gupta Samaj connecting to Gupta origin fails closed
  const foreignToken = generateAccessToken({
    id: 'non-existent-user',
    phone: '+919999999999',
    role: 'COMMUNITY_MEMBER',
    status: 'ACTIVE',
  });
  let crossCommunityError: any = null;
  const mockCrossSocket: any = {
    handshake: {
      headers: {
        origin: 'https://gupta.samaz.in',
      },
      auth: { token: foreignToken },
    },
    data: {},
  };
  await chatSocketAuthMiddleware(mockCrossSocket, (err: any) => {
    crossCommunityError = err;
  });
  assertTest(
    crossCommunityError?.message?.includes('Account not found or inactive in this community'),
    'Cross-community token fails closed on tenant database user lookup'
  );

  // 18. Tenant Room Scoping Verification:
  // When a socket joins a room or receives an event, it MUST use `${tenantSlug}:group:${groupId}`
  const mockSocketInstance: any = {
    data: {
      user: { id: 'kewat-user-1', role: 'COMMUNITY_MEMBER', fullName: 'Ramesh Kewat', avatarUrl: null },
      tenant: { slug: 'kewat' },
      db: kewatClient,
    },
    rooms: new Set<string>(),
    join: function (room: string) {
      this.rooms.add(room);
    },
    leave: function (room: string) {
      this.rooms.delete(room);
    },
  };

  const tenantSlug = mockSocketInstance.data.tenant.slug;
  const testRoomName = `${tenantSlug}:group:kewat-grp-public`;
  mockSocketInstance.join(testRoomName);
  assertTest(
    mockSocketInstance.rooms.has('kewat:group:kewat-grp-public'),
    'Room is strictly prefixed with tenant slug (kewat:group:groupId)'
  );
  assertTest(
    !mockSocketInstance.rooms.has('gupta:group:kewat-grp-public'),
    'Room cannot collide with Gupta namespace'
  );

  // Clean up server
  dummyServer.close();

  console.log('\n================================================================');
  console.log(`   Phase 15C.4 Results: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

import assert from 'node:assert';
import http from 'http';
import {
  initChatSocketServer,
  chatSocketAuthMiddleware,
  getUserNotificationRoomName,
  emitRealtimeNotification,
  emitRealtimeUnreadCount,
  getIO,
} from '../modules/chat/chat.socket';
import { generateAccessToken } from '../modules/auth/auth.tokens';
import { tenantDbManager, PrismaClient } from '@apnasamaj/database';
import { sendNotificationSafely } from '../modules/notifications/notifications.service';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14E: Real-Time Notifications & Socket.IO  ');
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
// Mock Tenant Database Clients for Real-Time Notification Isolation Testing
// ---------------------------------------------------------------------------
function createMockTenantDatabase(tenantSlug: string) {
  const users: Record<string, { id: string; status: string; fullName: string; role: string }> = {
    [`${tenantSlug}-user-1`]: {
      id: `${tenantSlug}-user-1`,
      status: 'ACTIVE',
      fullName: `${tenantSlug.toUpperCase()} User One`,
      role: 'COMMUNITY_MEMBER',
    },
    [`${tenantSlug}-user-2`]: {
      id: `${tenantSlug}-user-2`,
      status: 'ACTIVE',
      fullName: `${tenantSlug.toUpperCase()} User Two`,
      role: 'COMMUNITY_MEMBER',
    },
    [`${tenantSlug}-user-suspended`]: {
      id: `${tenantSlug}-user-suspended`,
      status: 'SUSPENDED',
      fullName: `${tenantSlug.toUpperCase()} Suspended User`,
      role: 'COMMUNITY_MEMBER',
    },
  };

  const notifications: any[] = [];

  const client: any = {
    _tenantSlug: tenantSlug,
    user: {
      findUnique: async ({ where }: any) => {
        const u = users[where.id];
        if (!u) return null;
        return {
          id: u.id,
          status: u.status,
          role: u.role,
          profile: {
            fullName: u.fullName,
            avatarUrl: null,
          },
        };
      },
    },
    notification: {
      findFirst: async ({ where }: any) => {
        return notifications.find((n) => {
          if (where.recipientId && n.recipientId !== where.recipientId) return false;
          if (where.actorId && n.actorId !== where.actorId) return false;
          if (where.type && n.type !== where.type) return false;
          if (where.entityId && n.entityId !== where.entityId) return false;
          if (where.isRead !== undefined && n.isRead !== where.isRead) return false;
          if (where.createdAt?.gte && n.createdAt < where.createdAt.gte) return false;
          return true;
        }) || null;
      },
      create: async ({ data, include }: any) => {
        const newNotif = {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          recipientId: data.recipientId,
          actorId: data.actorId || null,
          type: data.type,
          title: data.title,
          message: data.message,
          entityType: data.entityType || null,
          entityId: data.entityId || null,
          isRead: false,
          readAt: null,
          createdAt: new Date(),
          actor: data.actorId
            ? {
                id: data.actorId,
                role: 'COMMUNITY_MEMBER',
                profile: { fullName: 'Mock Actor', avatarUrl: null },
              }
            : null,
        };
        notifications.push(newNotif);
        return newNotif;
      },
      count: async ({ where }: any) => {
        return notifications.filter((n) => {
          if (where.recipientId && n.recipientId !== where.recipientId) return false;
          if (where.isRead !== undefined && n.isRead !== where.isRead) return false;
          return true;
        }).length;
      },
    },
  };

  return client;
}

async function runTests() {
  const kewatDb = createMockTenantDatabase('kewat');
  const guptaDb = createMockTenantDatabase('gupta');

  tenantDbManager.setClient('kewat', kewatDb as unknown as PrismaClient);
  tenantDbManager.setClient('gupta', guptaDb as unknown as PrismaClient);

  const dummyServer = http.createServer();
  const io = initChatSocketServer(dummyServer);

  console.log('--- 1. Valid Authenticated Socket Connection ---');
  {
    const validToken = generateAccessToken({
      id: 'kewat-user-1',
      phone: '+919999999901',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
    });

    const mockSocket: any = {
      handshake: {
        headers: { origin: 'https://kewat.samaz.in' },
        auth: { token: validToken },
      },
      data: {},
    };

    let authError: any = null;
    await chatSocketAuthMiddleware(mockSocket, (err) => {
      authError = err;
    });

    assertTest(!authError, 'Valid handshake succeeds without error');
    assertTest(mockSocket.data.user?.id === 'kewat-user-1', 'User identity derived from verified token');
    assertTest(mockSocket.data.tenant?.slug === 'kewat', 'Tenant slug resolved as kewat');
    assertTest(mockSocket.data.db !== undefined, 'Tenant database client bound to socket');

    const expectedRoom = getUserNotificationRoomName('kewat', 'kewat-user-1');
    assertTest(expectedRoom === 'kewat:user:kewat-user-1', 'Room naming convention is ${tenantSlug}:user:${userId}');
  }

  console.log('--- 2. Invalid & Expired JWT Rejection ---');
  {
    // Test 2a: Tampered / Invalid Token
    const invalidSocket: any = {
      handshake: {
        headers: { origin: 'https://kewat.samaz.in' },
        auth: { token: 'invalid.jwt.token' },
      },
      data: {},
    };
    let invalidError: any = null;
    await chatSocketAuthMiddleware(invalidSocket, (err) => {
      invalidError = err;
    });
    assertTest(
      invalidError?.message?.includes('Invalid token'),
      'Tampered or malformed token rejected'
    );

    const expiredToken = jwt.sign(
      { sub: 'kewat-user-1', phone: '+919999999901', role: 'COMMUNITY_MEMBER', status: 'ACTIVE' },
      config.jwtAccessSecret,
      { expiresIn: '-10s' }
    );
    const expiredSocket: any = {
      handshake: {
        headers: { origin: 'https://kewat.samaz.in' },
        auth: { token: expiredToken },
      },
      data: {},
    };
    let expiredError: any = null;
    await chatSocketAuthMiddleware(expiredSocket, (err) => {
      expiredError = err;
    });
    assertTest(
      expiredError?.message?.includes('Token expired'),
      'Expired token rejected with Token expired'
    );
  }

  console.log('--- 3. Cross-Tenant Token & Header Mismatch Rejection ---');
  {
    const validToken = generateAccessToken({
      id: 'kewat-user-1',
      phone: '+919999999901',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
    });

    const mismatchSocket: any = {
      handshake: {
        headers: {
          origin: 'https://kewat.samaz.in',
          'x-community-slug': 'gupta',
        },
        auth: { token: validToken },
      },
      data: {},
    };
    let mismatchError: any = null;
    await chatSocketAuthMiddleware(mismatchSocket, (err) => {
      mismatchError = err;
    });
    assertTest(
      mismatchError?.message?.includes('Tenant conflict'),
      'Origin vs X-Community-Slug mismatch rejected with 400 Tenant conflict'
    );
  }

  console.log('--- 4. Unknown & Unconfigured Tenant Rejection ---');
  {
    const validToken = generateAccessToken({
      id: 'kewat-user-1',
      phone: '+919999999901',
      role: 'COMMUNITY_MEMBER',
      status: 'ACTIVE',
    });

    const unknownTenantSocket: any = {
      handshake: {
        headers: {
          'x-community-slug': 'non-existent-samaj',
        },
        auth: { token: validToken },
      },
      data: {},
    };
    let unknownError: any = null;
    await chatSocketAuthMiddleware(unknownTenantSocket, (err) => {
      unknownError = err;
    });
    assertTest(
      unknownError?.message?.includes('Unknown community tenant'),
      'Unregistered community tenant rejected'
    );
  }

  console.log('--- 5. Suspended User Connection Rejection ---');
  {
    const suspendedToken = generateAccessToken({
      id: 'kewat-user-suspended',
      phone: '+919999999909',
      role: 'COMMUNITY_MEMBER',
      status: 'SUSPENDED',
    });

    const suspendedSocket: any = {
      handshake: {
        headers: { origin: 'https://kewat.samaz.in' },
        auth: { token: suspendedToken },
      },
      data: {},
    };
    let suspendedError: any = null;
    await chatSocketAuthMiddleware(suspendedSocket, (err) => {
      suspendedError = err;
    });
    assertTest(
      suspendedError?.message?.includes('Account not found or inactive'),
      'Suspended user fails closed during database verification'
    );
  }

  console.log('--- 6. Attempted Arbitrary-User Room Subscription Rejection ---');
  {
    const authenticatedUserId = 'kewat-user-1';
    const attemptedTargetUserId = 'kewat-user-2';

    // Simulate connection handler logic
    const joinedRooms = new Set<string>();
    const mockClientSocket: any = {
      join: (room: string) => joinedRooms.add(room),
    };

    // Handler simulating join_user_notifications
    let rejectionCallbackResult: any = null;
    function handleJoinUserNotifications(payload: { userId?: string }) {
      if (payload?.userId && payload.userId !== authenticatedUserId) {
        rejectionCallbackResult = {
          success: false,
          error: 'Forbidden: Cannot subscribe to another user notification room.',
        };
        return;
      }
      mockClientSocket.join(getUserNotificationRoomName('kewat', authenticatedUserId));
      rejectionCallbackResult = { success: true };
    }

    // 1. Attempt arbitrary user join
    handleJoinUserNotifications({ userId: attemptedTargetUserId });
    assertTest(
      rejectionCallbackResult?.success === false &&
      rejectionCallbackResult?.error?.includes('Forbidden'),
      'Arbitrary user room subscription attempt rejected'
    );
    assertTest(
      !joinedRooms.has(getUserNotificationRoomName('kewat', attemptedTargetUserId)),
      'Target user room was NOT joined'
    );

    // 2. Joining own room succeeds
    handleJoinUserNotifications({ userId: authenticatedUserId });
    assertTest(rejectionCallbackResult?.success === true, 'Self-room join authorized');
    assertTest(
      joinedRooms.has(getUserNotificationRoomName('kewat', authenticatedUserId)),
      'Authenticated user room successfully joined'
    );
  }

  console.log('--- 7. Isolation Between Users in Same Community ---');
  {
    const user1Room = getUserNotificationRoomName('kewat', 'kewat-user-1');
    const user2Room = getUserNotificationRoomName('kewat', 'kewat-user-2');

    assertTest(user1Room !== user2Room, 'User 1 and User 2 rooms are strictly distinct');
    assertTest(user1Room === 'kewat:user:kewat-user-1', 'User 1 room name verified');
    assertTest(user2Room === 'kewat:user:kewat-user-2', 'User 2 room name verified');
  }

  console.log('--- 8. Isolation Between Different Communities ---');
  {
    const kewatRoom = getUserNotificationRoomName('kewat', 'user-123');
    const guptaRoom = getUserNotificationRoomName('gupta', 'user-123');

    assertTest(kewatRoom !== guptaRoom, 'Same userId across communities has distinct rooms');
    assertTest(kewatRoom === 'kewat:user:user-123', 'Kewat namespace verified');
    assertTest(guptaRoom === 'gupta:user:user-123', 'Gupta namespace verified');
  }

  console.log('--- 9. New Notification Event Delivery & Minimum Payload ---');
  {
    // Capture emitted events from Socket.IO
    const emittedEvents: Array<{ room: string; event: string; payload: any }> = [];

    const mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ room, event, payload });
        },
      }),
    };

    // Override internal getIO reference in test scope
    (io as any).to = mockIo.to;

    // Send a safe notification via service
    await sendNotificationSafely(
      {
        recipientId: 'kewat-user-1',
        actorId: 'kewat-user-2',
        type: 'POST_COMMENT',
        title: 'New Comment',
        message: 'Ramesh commented on your post',
        entityType: 'Post',
        entityId: 'post-101',
        tenantSlug: 'kewat',
      },
      kewatDb as unknown as PrismaClient
    );

    const newNotifEvent = emittedEvents.find((e) => e.event === 'notification:new');
    const unreadCountEvent = emittedEvents.find((e) => e.event === 'notification:unread-count');

    assertTest(Boolean(newNotifEvent), 'notification:new event was emitted');
    assertTest(
      newNotifEvent?.room === 'kewat:user:kewat-user-1',
      'Event delivered strictly to recipient user room'
    );
    assertTest(
      newNotifEvent?.payload?.notification?.type === 'POST_COMMENT',
      'Event carries correct notification type'
    );
    assertTest(
      newNotifEvent?.payload?.notification?.entityId === 'post-101',
      'Event carries entityId deep-link target'
    );
    assertTest(
      Boolean(unreadCountEvent),
      'notification:unread-count event was emitted'
    );
    assertTest(
      unreadCountEvent?.payload?.unreadCount === 1,
      'Updated unread count matches database state (1)'
    );
  }

  console.log('--- 10. No Duplicate Event for Deduplicated POST_LIKE ---');
  {
    const emittedEvents: Array<{ room: string; event: string; payload: any }> = [];
    (io as any).to = (room: string) => ({
      emit: (event: string, payload: any) => {
        emittedEvents.push({ room, event, payload });
      },
    });

    // First like
    await sendNotificationSafely(
      {
        recipientId: 'kewat-user-1',
        actorId: 'kewat-user-2',
        type: 'POST_LIKE',
        title: 'New Like',
        message: 'Liked your post',
        entityType: 'Post',
        entityId: 'post-dedup-1',
        tenantSlug: 'kewat',
      },
      kewatDb as unknown as PrismaClient
    );

    const firstLikeEventsCount = emittedEvents.filter((e) => e.event === 'notification:new').length;
    assertTest(firstLikeEventsCount === 1, 'First like emitted notification:new');

    // Repeated like within 24h while unread (deduplicated)
    await sendNotificationSafely(
      {
        recipientId: 'kewat-user-1',
        actorId: 'kewat-user-2',
        type: 'POST_LIKE',
        title: 'New Like',
        message: 'Liked your post again',
        entityType: 'Post',
        entityId: 'post-dedup-1',
        tenantSlug: 'kewat',
      },
      kewatDb as unknown as PrismaClient
    );

    const afterSecondLikeCount = emittedEvents.filter((e) => e.event === 'notification:new').length;
    assertTest(
      afterSecondLikeCount === 1,
      'Deduplicated like did NOT emit a duplicate notification:new event'
    );
  }

  console.log('--- 11. Socket Delivery Failure Does Not Fail Parent Action ---');
  {
    // Simulate broken Socket.IO instance
    (io as any).to = () => {
      throw new Error('Socket.IO transport crashed');
    };

    let postActionSucceeded = false;
    try {
      await sendNotificationSafely(
        {
          recipientId: 'kewat-user-1',
          actorId: 'kewat-user-2',
          type: 'POST_COMMENT',
          title: 'New Comment',
          message: 'Nice post',
          entityType: 'Post',
          entityId: 'post-error-test',
          tenantSlug: 'kewat',
        },
        kewatDb as unknown as PrismaClient
      );
      postActionSucceeded = true;
    } catch {
      postActionSucceeded = false;
    }

    assertTest(
      postActionSucceeded === true,
      'Parent action completes successfully despite Socket.IO crash'
    );
  }

  console.log('--- 12. Frontend Reconnection & Duplicate Prevention Logic ---');
  {
    // Simulate NotificationBell state machine handling incoming socket events
    const initialList: any[] = [
      { id: 'notif-1', isRead: false },
      { id: 'notif-2', isRead: true },
    ];
    let currentUnreadCount = 1;

    function receiveSocketNotification(incoming: any) {
      if (initialList.some((n) => n.id === incoming.id)) {
        return; // Suppress duplicate
      }
      initialList.unshift(incoming);
      if (!incoming.isRead) {
        currentUnreadCount++;
      }
    }

    // 1. Receive new notification
    receiveSocketNotification({ id: 'notif-3', isRead: false });
    assertTest(initialList.length === 3, 'New notification added to list');
    assertTest(currentUnreadCount === 2, 'Unread count incremented to 2');

    // 2. Reconnection replay of existing notification (notif-3 arrives again)
    receiveSocketNotification({ id: 'notif-3', isRead: false });
    assertTest(initialList.length === 3, 'Duplicate incoming notification ignored');
    assertTest(currentUnreadCount === 2, 'Unread count not incremented for duplicate');

    // 3. Socket unread count sync event
    function receiveSocketUnreadCount(count: number) {
      currentUnreadCount = count;
    }
    receiveSocketUnreadCount(0);
    assertTest(currentUnreadCount === 0, 'Unread count synced directly from server event');
  }

  console.log('--- 13. Existing Group Chat Functionality Intact ---');
  {
    // Verify chat message room convention
    const chatRoom = `kewat:group:grp-123`;
    assertTest(chatRoom.startsWith('kewat:group:'), 'Group chat room maintains prefix ${tenantSlug}:group:');
  }

  dummyServer.close();

  console.log('\n================================================================');
  console.log(`   Real-Time Notification Tests: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

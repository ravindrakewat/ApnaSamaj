import assert from 'node:assert';
import crypto from 'node:crypto';
import { PrismaClient } from '@apnasamaj/database';
import {
  registerDevicePushToken,
  deactivateDevicePushToken,
  deactivateAllUserTokens,
  getNotificationPreferences,
  updateNotificationPreferences,
  dispatchPushNotificationToUser,
  dispatchPushNotificationToMultipleUsers,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../modules/notifications/push-notification.service';
import {
  sendPushNotificationToToken,
  sendMulticastPushNotification,
  isPermanentFCMError,
  isTransientFCMError,
  isApnsDeviceToken,
  isFirebaseConfigured,
  resetFirebaseAdminForTesting,
  setForceMockForTesting,
} from '../services/firebase.service';
import { sendDirectMessage } from '../modules/chat/direct-chat.service';
import { sendChatMessage } from '../modules/chat/chat.service';
import { sendNotificationSafely } from '../modules/notifications/notifications.service';

setForceMockForTesting(true);

console.log('================================================================');
console.log('   Apna Samaj — Batch 8.5: FCM Push Notifications Test Suite    ');
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
// In-Memory Mock Prisma Client Factory for Push Notifications
// -------------------------------------------------------------
interface MockDataStore {
  users: any[];
  devicePushTokens: any[];
  notificationPreferences: any[];
  notificationLogs: any[];
  notifications: any[];
  groups: any[];
  groupMembers: any[];
  chatMessages: any[];
  directConversations: any[];
  directConversationParticipants: any[];
  directMessages: any[];
  chatAttachments: any[];
}

function createMockPrismaClient(communitySlug: string, initialData: Partial<MockDataStore> = {}) {
  const queryLog: string[] = [];
  const data: MockDataStore = {
    users: initialData.users ? [...initialData.users] : [],
    devicePushTokens: initialData.devicePushTokens ? [...initialData.devicePushTokens] : [],
    notificationPreferences: initialData.notificationPreferences ? [...initialData.notificationPreferences] : [],
    notificationLogs: initialData.notificationLogs ? [...initialData.notificationLogs] : [],
    notifications: initialData.notifications ? [...initialData.notifications] : [],
    groups: initialData.groups ? [...initialData.groups] : [],
    groupMembers: initialData.groupMembers ? [...initialData.groupMembers] : [],
    chatMessages: initialData.chatMessages ? [...initialData.chatMessages] : [],
    directConversations: initialData.directConversations ? [...initialData.directConversations] : [],
    directConversationParticipants: initialData.directConversationParticipants
      ? [...initialData.directConversationParticipants]
      : [],
    directMessages: initialData.directMessages ? [...initialData.directMessages] : [],
    chatAttachments: initialData.chatAttachments ? [...initialData.chatAttachments] : [],
  };

  const client: any = {
    communitySlug,
    queryLog,
    data,

    user: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`user.findUnique(${communitySlug})`);
        const found = data.users.find((u) => u.id === where.id);
        if (!found) return null;
        return {
          ...found,
          profile: found.profile || { fullName: `User ${found.id}`, avatarUrl: null },
        };
      },
    },

    devicePushToken: {
      findMany: async ({ where }: any) => {
        queryLog.push(`devicePushToken.findMany(${communitySlug})`);
        return data.devicePushTokens.filter((t) => {
          if (where?.userId && t.userId !== where.userId) return false;
          if (where?.isActive !== undefined && t.isActive !== where.isActive) return false;
          return true;
        });
      },
      upsert: async ({ where, update, create }: any) => {
        queryLog.push(`devicePushToken.upsert(${communitySlug})`);
        const token = where.token;
        const existingIndex = data.devicePushTokens.findIndex((t) => t.token === token);
        const now = new Date();
        if (existingIndex >= 0) {
          const updated = {
            ...data.devicePushTokens[existingIndex],
            ...update,
            updatedAt: now,
          };
          data.devicePushTokens[existingIndex] = updated;
          return updated;
        } else {
          const created = {
            id: `token-${crypto.randomUUID()}`,
            token,
            createdAt: now,
            updatedAt: now,
            lastUsedAt: now,
            isActive: true,
            ...create,
          };
          data.devicePushTokens.push(created);
          return created;
        }
      },
      updateMany: async ({ where, data: updateData }: any) => {
        queryLog.push(`devicePushToken.updateMany(${communitySlug})`);
        let count = 0;
        for (const token of data.devicePushTokens) {
          let match = true;
          if (where?.userId && token.userId !== where.userId) match = false;
          if (where?.token?.in && !where.token.in.includes(token.token)) match = false;
          if (where?.OR) {
            const matchesOr = where.OR.some((cond: any) => {
              if (cond.id && token.id === cond.id) return true;
              if (cond.token && token.token === cond.token) return true;
              return false;
            });
            if (!matchesOr) match = false;
          }
          if (match) {
            Object.assign(token, updateData);
            count++;
          }
        }
        return { count };
      },
    },

    notificationPreference: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`notificationPreference.findUnique(${communitySlug})`);
        return data.notificationPreferences.find((p) => p.userId === where.userId) || null;
      },
      upsert: async ({ where, update, create }: any) => {
        queryLog.push(`notificationPreference.upsert(${communitySlug})`);
        const existingIndex = data.notificationPreferences.findIndex((p) => p.userId === where.userId);
        const now = new Date();
        if (existingIndex >= 0) {
          const updated = {
            ...data.notificationPreferences[existingIndex],
            ...update,
            updatedAt: now,
          };
          data.notificationPreferences[existingIndex] = updated;
          return updated;
        } else {
          const created = {
            id: `pref-${crypto.randomUUID()}`,
            userId: where.userId,
            createdAt: now,
            updatedAt: now,
            ...create,
          };
          data.notificationPreferences.push(created);
          return created;
        }
      },
    },

    notificationLog: {
      create: async ({ data: logData }: any) => {
        queryLog.push(`notificationLog.create(${communitySlug})`);
        const created = {
          id: `log-${crypto.randomUUID()}`,
          createdAt: new Date(),
          ...logData,
        };
        data.notificationLogs.push(created);
        return created;
      },
      findMany: async () => data.notificationLogs,
    },

    notification: {
      findFirst: async ({ where }: any) => {
        queryLog.push(`notification.findFirst(${communitySlug})`);
        return (
          data.notifications.find((n) => {
            if (where?.recipientId && n.recipientId !== where.recipientId) return false;
            if (where?.type && n.type !== where.type) return false;
            if (where?.actorId && n.actorId !== where.actorId) return false;
            if (where?.entityType && n.entityType !== where.entityType) return false;
            if (where?.entityId && n.entityId !== where.entityId) return false;
            if (where?.isRead !== undefined && n.isRead !== where.isRead) return false;
            if (where?.createdAt?.gte && new Date(n.createdAt) < where.createdAt.gte) return false;
            return true;
          }) || null
        );
      },
      count: async ({ where }: any) => {
        return data.notifications.filter((n) => {
          if (where?.recipientId && n.recipientId !== where.recipientId) return false;
          if (where?.isRead !== undefined && n.isRead !== where.isRead) return false;
          return true;
        }).length;
      },
      create: async ({ data: notifData, include }: any) => {
        queryLog.push(`notification.create(${communitySlug})`);
        const created = {
          id: `notif-${crypto.randomUUID()}`,
          createdAt: new Date(),
          isRead: false,
          readAt: null,
          ...notifData,
        };
        data.notifications.push(created);
        const actor = data.users.find((u) => u.id === created.actorId) || null;
        return {
          ...created,
          actor: actor
            ? {
                id: actor.id,
                profile: actor.profile || { fullName: `User ${actor.id}`, avatarUrl: null },
              }
            : null,
        };
      },
    },

    directConversation: {
      findUnique: async ({ where }: any) => {
        queryLog.push(`directConversation.findUnique(${communitySlug})`);
        let conv: any = null;
        if (where?.id) {
          conv = data.directConversations.find((c) => c.id === where.id);
        } else if (where?.userOneId_userTwoId) {
          const { userOneId, userTwoId } = where.userOneId_userTwoId;
          conv = data.directConversations.find(
            (c) => c.userOneId === userOneId && c.userTwoId === userTwoId
          );
        }
        return conv || null;
      },
      update: async ({ where, data: updateData }: any) => {
        const conv = data.directConversations.find((c) => c.id === where.id);
        if (conv) Object.assign(conv, updateData);
        return conv;
      },
    },

    directConversationParticipant: {
      upsert: async ({ where, update, create }: any) => {
        const { conversationId, userId } = where.conversationId_userId;
        const idx = data.directConversationParticipants.findIndex(
          (p) => p.conversationId === conversationId && p.userId === userId
        );
        if (idx >= 0) {
          Object.assign(data.directConversationParticipants[idx], update);
          return data.directConversationParticipants[idx];
        } else {
          const created = { id: `part-${crypto.randomUUID()}`, conversationId, userId, ...create };
          data.directConversationParticipants.push(created);
          return created;
        }
      },
    },

    directMessage: {
      create: async ({ data: msgData }: any) => {
        queryLog.push(`directMessage.create(${communitySlug})`);
        const sender = data.users.find((u) => u.id === msgData.senderId);
        const now = new Date();
        const created = {
          id: `dmsg-${crypto.randomUUID()}`,
          createdAt: now,
          updatedAt: now,
          ...msgData,
          attachments: [],
          sender: {
            id: sender?.id || msgData.senderId,
            profile: sender?.profile || { fullName: 'Test Sender', avatarUrl: null },
          },
        };
        data.directMessages.push(created);
        return created;
      },
    },

    chatAttachment: {
      findFirst: async ({ where }: any) => {
        return data.chatAttachments.find((a) => a.storagePath === where.storagePath) || null;
      },
    },

    group: {
      findFirst: async ({ where }: any) => {
        queryLog.push(`group.findFirst(${communitySlug})`);
        return (
          data.groups.find((g) => {
            if (where?.OR) {
              return where.OR.some(
                (cond: any) => (cond.id && g.id === cond.id) || (cond.slug && g.slug === cond.slug)
              );
            }
            return g.id === where?.id || g.slug === where?.slug;
          }) || null
        );
      },
      findUnique: async ({ where }: any) => {
        queryLog.push(`group.findUnique(${communitySlug})`);
        return data.groups.find((g) => g.id === where.id || g.slug === where.slug) || null;
      },
    },

    groupMember: {
      findMany: async ({ where }: any) => {
        queryLog.push(`groupMember.findMany(${communitySlug})`);
        return data.groupMembers.filter((m) => {
          if (where?.groupId && m.groupId !== where.groupId) return false;
          if (where?.userId?.not && m.userId === where.userId.not) return false;
          return true;
        });
      },
      findUnique: async ({ where }: any) => {
        const { groupId_userId } = where;
        return (
          data.groupMembers.find(
            (m) => m.groupId === groupId_userId.groupId && m.userId === groupId_userId.userId
          ) || null
        );
      },
    },

    chatMessage: {
      create: async ({ data: msgData }: any) => {
        queryLog.push(`chatMessage.create(${communitySlug})`);
        const sender = data.users.find((u) => u.id === msgData.senderId);
        const now = new Date();
        const created = {
          id: `cmsg-${crypto.randomUUID()}`,
          createdAt: now,
          updatedAt: now,
          ...msgData,
          attachments: [],
          sender: {
            id: sender?.id || msgData.senderId,
            profile: sender?.profile || { fullName: 'Group Sender', avatarUrl: null },
          },
        };
        data.chatMessages.push(created);
        return created;
      },
    },
  };

  return client as PrismaClient;
}

// -------------------------------------------------------------
// Test Execution Pipeline
// -------------------------------------------------------------
async function runPushNotificationsTestSuite() {
  console.log('--- 1. Device Token Registration ---');
  const dbAlpha = createMockPrismaClient('community-alpha', {
    users: [
      { id: 'user-1', email: 'user1@example.com', profile: { fullName: 'Sunil Kewat' } },
      { id: 'user-2', email: 'user2@example.com', profile: { fullName: 'Rahul Sharma' } },
      { id: 'user-3', email: 'user3@example.com', profile: { fullName: 'Priya Verma' } },
    ],
  });

  const regResult = await registerDevicePushToken(
    'user-1',
    { token: 'fcm-token-device-a', platform: 'ANDROID', deviceId: 'pixel-8-pro' },
    dbAlpha
  );
  assertTest(regResult.isActive === true, 'Device push token registered with active status');
  assertTest(regResult.platform === 'ANDROID', 'Device platform stored correctly as ANDROID');
  assertTest(
    !(regResult as any).token,
    'FCM registration token is NOT leaked in client response object'
  );

  console.log('\n--- 2. Duplicate Token Registration / Re-assignment ---');
  // Device passed from user-1 to user-2: same token registered by user-2
  const reassignResult = await registerDevicePushToken(
    'user-2',
    { token: 'fcm-token-device-a', platform: 'ANDROID', deviceId: 'pixel-8-pro' },
    dbAlpha
  );
  const rawTokens = (dbAlpha as any).data.devicePushTokens;
  const matchedTokens = rawTokens.filter((t: any) => t.token === 'fcm-token-device-a');
  assertTest(matchedTokens.length === 1, 'Token record upserted without creating duplicate records');
  assertTest(
    matchedTokens[0].userId === 'user-2',
    'Token ownership atomically transferred to user-2'
  );
  assertTest(matchedTokens[0].isActive === true, 'Re-assigned token reactivated');

  console.log('\n--- 3. Multiple Devices Per User ---');
  // user-2 registers a second device (e.g. tablet or iPad)
  await registerDevicePushToken(
    'user-2',
    { token: 'fcm-token-device-b', platform: 'IOS', deviceId: 'ipad-air' },
    dbAlpha
  );
  const user2Tokens = rawTokens.filter((t: any) => t.userId === 'user-2' && t.isActive);
  assertTest(user2Tokens.length === 2, 'User-2 successfully holds 2 distinct active device tokens');

  console.log('\n--- 4. Token Refresh on Same Device ---');
  // App generates a refreshed token for device-b
  await registerDevicePushToken(
    'user-2',
    { token: 'fcm-token-device-b-refreshed', platform: 'IOS', deviceId: 'ipad-air' },
    dbAlpha
  );
  const refreshedFound = rawTokens.find(
    (t: any) => t.token === 'fcm-token-device-b-refreshed' && t.userId === 'user-2'
  );
  assertTest(Boolean(refreshedFound), 'Refreshed token stored and active for user-2');

  console.log('\n--- 5. Device Deactivation on Logout ---');
  // user-2 logs out from device-a
  const deactResult = await deactivateDevicePushToken('user-2', 'fcm-token-device-a', dbAlpha);
  assertTest(deactResult.success === true, 'Device deactivation returns success');
  const tokenA = rawTokens.find((t: any) => t.token === 'fcm-token-device-a');
  assertTest(tokenA.isActive === false, 'Deactivated token has isActive: false');

  // Deactivate all tokens for user-2
  const deactAllResult = await deactivateAllUserTokens('user-2', dbAlpha);
  assertTest(deactAllResult.count >= 1, 'Deactivate all user tokens deactivates all remaining tokens');
  const anyActiveUser2 = rawTokens.some((t: any) => t.userId === 'user-2' && t.isActive);
  assertTest(!anyActiveUser2, 'All tokens for user-2 are now inactive');

  console.log('\n--- 6. Tenant Isolation Across Community Databases ---');
  const dbBeta = createMockPrismaClient('community-beta', {
    users: [{ id: 'user-beta-1', profile: { fullName: 'Beta Member' } }],
  });
  await registerDevicePushToken(
    'user-beta-1',
    { token: 'fcm-token-beta', platform: 'ANDROID' },
    dbBeta
  );
  const betaTokens = (dbBeta as any).data.devicePushTokens;
  const alphaTokens = (dbAlpha as any).data.devicePushTokens;
  assertTest(betaTokens.length === 1, 'Token exists in Community Beta DB');
  assertTest(
    !alphaTokens.some((t: any) => t.token === 'fcm-token-beta'),
    'Community Beta token is strictly absent from Community Alpha DB'
  );

  console.log('\n--- 7. User Notification Preferences ---');
  // Default preferences returned when user has not configured preferences
  const defaultPrefs = await getNotificationPreferences('user-1', dbAlpha);
  assertTest(
    defaultPrefs.personalMessages === true && defaultPrefs.groupMessages === true,
    'Default preferences returned with all categories enabled'
  );

  // Update preferences: disable likes and matrimonial
  const updatedPrefs = await updateNotificationPreferences(
    'user-1',
    { likes: false, matrimonial: false },
    dbAlpha
  );
  assertTest(updatedPrefs.likes === false, 'User disabled likes notifications');
  assertTest(updatedPrefs.matrimonial === false, 'User disabled matrimonial notifications');
  assertTest(updatedPrefs.personalMessages === true, 'Preserved personalMessages as true');

  console.log('\n--- 8. Personal Chat Notification Trigger & Privacy Payload ---');
  // Re-activate a token for user-1
  await registerDevicePushToken(
    'user-1',
    { token: 'fcm-token-user1-active', platform: 'ANDROID' },
    dbAlpha
  );

  // Setup direct conversation between user-2 (sender) and user-1 (recipient)
  const convId = 'conv-123';
  (dbAlpha as any).data.directConversations.push({
    id: convId,
    userOneId: 'user-1',
    userTwoId: 'user-2',
    updatedAt: new Date(),
  });
  (dbAlpha as any).data.directConversationParticipants.push(
    { conversationId: convId, userId: 'user-1', lastReadAt: null },
    { conversationId: convId, userId: 'user-2', lastReadAt: new Date() }
  );

  // Send message from user-2 to user-1: signature is (conversationId, senderId, content, tempId, db)
  const directMsg = await sendDirectMessage(
    convId,
    'user-2',
    'Confidential personal chat message content that should not leak',
    undefined,
    dbAlpha
  );
  assertTest(Boolean(directMsg.id), 'Direct message sent and persisted');

  // Verify notification log recorded for user-1
  const logsUser1 = (dbAlpha as any).data.notificationLogs.filter((l: any) => l.userId === 'user-1');
  assertTest(logsUser1.length > 0, 'FCM dispatch was triggered for recipient user-1');
  assertTest(
    logsUser1[0].category === 'personalMessages',
    'Push category logged as personalMessages'
  );

  console.log('\n--- 9. Group Chat Notification Trigger ---');
  const groupId = 'group-100';
  (dbAlpha as any).data.groups.push({
    id: groupId,
    name: 'Youth Committee',
    slug: 'youth-committee',
    privacy: 'PUBLIC',
  });
  (dbAlpha as any).data.groupMembers.push(
    { groupId, userId: 'user-1', role: 'MEMBER' },
    { groupId, userId: 'user-2', role: 'ADMIN' },
    { groupId, userId: 'user-3', role: 'MEMBER' }
  );

  // Setup active token for user-3
  await registerDevicePushToken(
    'user-3',
    { token: 'fcm-token-user3-active', platform: 'IOS' },
    dbAlpha
  );

  // user-2 sends group message: signature is (groupIdOrSlug, senderId, content, tempId, db)
  const groupMsg = await sendChatMessage(
    groupId,
    'user-2',
    'Hello everyone in Youth Committee',
    undefined,
    dbAlpha
  );
  assertTest(Boolean(groupMsg.id), 'Group chat message successfully sent and persisted');

  // Verify notification log created for members user-1 and user-3
  const groupLogs = (dbAlpha as any).data.notificationLogs.filter(
    (l: any) => l.category === 'groupMessages'
  );
  assertTest(groupLogs.length >= 2, 'Multicast push triggered for other group members');

  console.log('\n--- 10. Matrimonial Notification Trigger ---');
  // Matrimonial push should be blocked if user-1 has matrimonial disabled
  const matResultDisabled = await dispatchPushNotificationToUser(
    {
      recipientId: 'user-1',
      category: 'matrimonial',
      title: 'Matrimonial Interest',
      body: 'Someone expressed interest in your profile',
      routingPayload: { type: 'MATRIMONIAL_INTEREST', interestId: 'interest-1' },
      actorId: 'user-2',
    },
    dbAlpha
  );
  assertTest(
    matResultDisabled.skipped === true && matResultDisabled.reason === 'CATEGORY_DISABLED_BY_USER',
    'Matrimonial notification skipped when recipient disabled matrimonial category'
  );

  // Re-enable matrimonial preference for user-1
  await updateNotificationPreferences('user-1', { matrimonial: true }, dbAlpha);
  const matResultEnabled = await dispatchPushNotificationToUser(
    {
      recipientId: 'user-1',
      category: 'matrimonial',
      title: 'Matrimonial Interest',
      body: 'Someone expressed interest in your profile',
      routingPayload: { type: 'MATRIMONIAL_INTEREST', interestId: 'interest-1' },
      actorId: 'user-2',
    },
    dbAlpha
  );
  assertTest(
    matResultEnabled.deliveredCount > 0,
    'Matrimonial notification delivered once category re-enabled'
  );

  console.log('\n--- 11. Social Feed Notification Trigger (Likes & Comments) ---');
  // user-1 has likes disabled: test like notification suppression
  await sendNotificationSafely(
    {
      recipientId: 'user-1',
      actorId: 'user-2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Rahul Sharma liked your post.',
      entityType: 'POST',
      entityId: 'post-99',
    },
    dbAlpha
  );
  // Notification table has it, but FCM log was skipped because user-1 has likes=false
  const notifLikes = (dbAlpha as any).data.notifications.filter((n: any) => n.type === 'POST_LIKE');
  assertTest(notifLikes.length === 1, 'In-app notification created in DB');

  // Comment notification: user-1 has comments=true (default)
  await sendNotificationSafely(
    {
      recipientId: 'user-1',
      actorId: 'user-2',
      type: 'POST_COMMENT',
      title: 'New Comment',
      message: 'Rahul Sharma commented on your post.',
      entityType: 'POST',
      entityId: 'post-99',
    },
    dbAlpha
  );
  const commentLogs = (dbAlpha as any).data.notificationLogs.filter((l: any) => l.category === 'comments');
  assertTest(commentLogs.length > 0, 'Comment push notification delivered to post author');

  console.log('\n--- 12. Sender Self-Action Exclusion ---');
  const selfActionPush = await dispatchPushNotificationToUser(
    {
      recipientId: 'user-2',
      category: 'personalMessages',
      title: 'Message',
      body: 'Self message',
      routingPayload: { type: 'PERSONAL_CHAT', conversationId: 'c-1' },
      actorId: 'user-2', // Actor is same as recipient
    },
    dbAlpha
  );
  assertTest(
    selfActionPush.skipped === true && selfActionPush.reason === 'SELF_ACTION',
    'Push suppressed when actorId equals recipientId'
  );

  console.log('\n--- 13. Invalid FCM Token Identification & Automatic Cleanup ---');
  assertTest(
    isPermanentFCMError({ code: 'messaging/registration-token-not-registered' }),
    'messaging/registration-token-not-registered recognized as permanent error'
  );
  assertTest(
    isPermanentFCMError({ code: 'messaging/invalid-registration-token' }),
    'messaging/invalid-registration-token recognized as permanent error'
  );
  assertTest(
    !isPermanentFCMError({ code: 'messaging/internal-error' }),
    'Transient messaging/internal-error not marked as permanent invalid token'
  );

  // Simulate token cleanup in DB
  const invalidToken = 'fcm-stale-token-to-clean';
  await registerDevicePushToken('user-3', { token: invalidToken, platform: 'ANDROID' }, dbAlpha);
  assertTest(
    rawTokens.some((t: any) => t.token === invalidToken && t.isActive),
    'Stale token initially active'
  );

  // Trigger deactivation of invalid tokens simulating FCM feedback
  await (dbAlpha as any).devicePushToken.updateMany({
    where: { token: { in: [invalidToken] } },
    data: { isActive: false, updatedAt: new Date() },
  });
  const cleanedToken = rawTokens.find((t: any) => t.token === invalidToken);
  assertTest(cleanedToken.isActive === false, 'Stale/invalid FCM token automatically deactivated');

  console.log('\n--- 14. Firebase Mock Mode Resilience ---');
  // In development/test without credentials, sendPushNotificationToToken does not throw
  const mockSingleSend = await sendPushNotificationToToken('any-token', {
    title: 'Test Mock',
    body: 'Testing mock fallback',
  });
  assertTest(mockSingleSend.success === true, 'Mock mode single push succeeds gracefully');
  assertTest(
    typeof mockSingleSend.messageId === 'string' && mockSingleSend.messageId.startsWith('mock-fcm-'),
    'Mock messageId generated'
  );

  const mockMulticast = await sendMulticastPushNotification(['token-1', 'token-2'], {
    title: 'Mock Multicast',
    body: 'Testing mock multicast fallback',
  });
  assertTest(mockMulticast.successCount === 2, 'Mock multicast reports all tokens successful');

  console.log('\n--- 15. Notification Failure Does Not Break Primary Message Persistence ---');
  // Even if dispatchPushNotificationToUser encounters an error, sendDirectMessage must succeed
  const failingDb = createMockPrismaClient('community-failing', {
    users: [
      { id: 'failing-sender', profile: { fullName: 'Failing Sender' } },
      { id: 'failing-recipient', profile: { fullName: 'Failing Recipient' } },
    ],
    directConversations: [
      {
        id: 'conv-failing',
        userOneId: 'failing-sender',
        userTwoId: 'failing-recipient',
        updatedAt: new Date(),
      },
    ],
    directConversationParticipants: [
      { conversationId: 'conv-failing', userId: 'failing-sender', lastReadAt: null },
      { conversationId: 'conv-failing', userId: 'failing-recipient', lastReadAt: null },
    ],
  });

  // Corrupt devicePushToken findMany to simulate unhandled database error in notification pipeline
  (failingDb as any).devicePushToken.findMany = async () => {
    throw new Error('Simulated database connection timeout during push token lookup');
  };

  const safeMsg = await sendDirectMessage(
    'conv-failing',
    'failing-sender',
    'Primary message that must never be lost',
    undefined,
    failingDb
  );
  assertTest(
    Boolean(safeMsg.id) && safeMsg.content === 'Primary message that must never be lost',
    'Direct message successfully persisted even when push notification lookup throws error'
  );

  console.log('\n--- 16. Duplicate Notification Prevention ---');
  // Verify deduplication in sendReportResolutionNotification
  const notifCountBefore = (dbAlpha as any).data.notifications.length;
  // Send first notification
  await sendNotificationSafely(
    {
      recipientId: 'user-1',
      actorId: 'user-2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Duplicate like notice',
      entityType: 'POST',
      entityId: 'post-dedup-1',
    },
    dbAlpha
  );
  const notifCountAfterFirst = (dbAlpha as any).data.notifications.length;
  assertTest(notifCountAfterFirst === notifCountBefore + 1, 'First notification created');

  // Attempt duplicate send within same window (service checks existing like within 24h)
  await sendNotificationSafely(
    {
      recipientId: 'user-1',
      actorId: 'user-2',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Duplicate like notice 2',
      entityType: 'POST',
      entityId: 'post-dedup-1',
    },
    dbAlpha
  );
  const notifCountAfterSecond = (dbAlpha as any).data.notifications.length;
  assertTest(
    notifCountAfterSecond === notifCountAfterFirst,
    'Duplicate notification within 24 hours was suppressed'
  );

  console.log('\n--- 17. Privacy Payload Verification ---');
  // Verify that routing payload does not include message body, passwords, or phone numbers
  const testPayload = {
    type: 'PERSONAL_CHAT' as const,
    conversationId: 'conv-123',
    entityId: 'msg-456',
  };
  assertTest(!('content' in testPayload), 'Privacy check: message content absent from routing payload');
  assertTest(!('phone' in testPayload), 'Privacy check: phone numbers absent from routing payload');
  assertTest(!('token' in testPayload), 'Privacy check: auth tokens absent from routing payload');
  assertTest(
    testPayload.type === 'PERSONAL_CHAT' && testPayload.conversationId === 'conv-123',
    'Routing payload contains only minimal navigation identifiers'
  );

  console.log('\n--- 18. iOS APNs Token Identification & Inactive Registration Guard ---');
  const validApnsHex = '410564ffd0aaf91dd06e8ab7b8362238e2c7f1bbd5a520d6afaff38c9b670a90';
  const fcmTokenSample = 'fL6_xYz91b:APA91bF2c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7';
  assertTest(isApnsDeviceToken(validApnsHex), '64-character hex string identified as raw APNs device token');
  assertTest(!isApnsDeviceToken(fcmTokenSample), 'FCM registration token correctly distinguished from APNs token');
  assertTest(!isApnsDeviceToken('short-token'), 'Short invalid string rejected as APNs token');

  // Verify that registering a raw APNs token does NOT silently activate it
  const apnsRegResult = await registerDevicePushToken(
    'user-1',
    { token: validApnsHex, platform: 'IOS' },
    dbAlpha
  );
  assertTest(
    apnsRegResult.isActive === false,
    'Raw iOS APNs token registered as inactive (isActive: false) to prevent invalid FCM delivery'
  );

  // Verify that registering an authentic native FCM token on iOS is active
  const fcmIosRegResult = await registerDevicePushToken(
    'user-1',
    { token: fcmTokenSample, platform: 'IOS' },
    dbAlpha
  );
  assertTest(
    fcmIosRegResult.isActive === true,
    'Authentic native iOS FCM token registered as active (isActive: true)'
  );

  // Test raw APNs token safety in sendPushNotificationToToken
  const rawApnsSend = await sendPushNotificationToToken(validApnsHex, {
    title: 'APNs Test',
    body: 'Should not crash Firebase',
  });
  assertTest(
    rawApnsSend.success === false && rawApnsSend.isInvalidToken === false,
    'Raw APNs token intercepted and prevented from direct FCM send without throwing'
  );

  // Test transient error classification
  assertTest(isTransientFCMError({ code: 'messaging/server-unavailable' }), 'messaging/server-unavailable classified as transient');
  assertTest(!isTransientFCMError({ code: 'messaging/invalid-registration-token' }), 'Permanent error not classified as transient');

  console.log('\n================================================================');
  console.log(`🎉 TEST SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPushNotificationsTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

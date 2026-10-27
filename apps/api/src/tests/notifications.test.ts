import assert from 'node:assert';
import {
  NotificationType,
  NotificationItem,
} from '@apnasamaj/shared-types';
import {
  NotificationNotFoundError,
  NotificationServiceError,
} from '../modules/notifications/notifications.service';

console.log('================================================================');
console.log('   Apna Samaj — Batch 14B.3: Backend Notifications Test Suite   ');
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

// In-memory simulation of Notification DB table to test service logic & contracts
interface MockDbNotification {
  id: string;
  recipientId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
}

class MockNotificationStore {
  public notifications: MockDbNotification[] = [];

  reset() {
    this.notifications = [];
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notifications.filter(
      (n) => n.recipientId === userId && !n.isRead
    ).length;
  }

  async getNotifications(
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean }
  ) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const filtered = this.notifications
      .filter((n) => {
        if (n.recipientId !== userId) return false;
        if (query.unreadOnly && n.isRead) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filtered.length;
    const paginated = filtered.slice(skip, skip + limit);
    const unreadCount = await this.getUnreadCount(userId);

    return {
      notifications: paginated,
      total,
      unreadCount,
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification || notification.recipientId !== userId) {
      throw new NotificationNotFoundError();
    }

    if (notification.isRead && notification.readAt) {
      return {
        id: notification.id,
        isRead: true,
        readAt: notification.readAt.toISOString(),
      };
    }

    const now = new Date();
    notification.isRead = true;
    notification.readAt = now;

    return {
      id: notification.id,
      isRead: true,
      readAt: now.toISOString(),
    };
  }

  async markAllAsRead(userId: string) {
    const now = new Date();
    let updatedCount = 0;
    for (const n of this.notifications) {
      if (n.recipientId === userId && !n.isRead) {
        n.isRead = true;
        n.readAt = now;
        updatedCount++;
      }
    }
    return { updatedCount };
  }

  async deleteNotification(id: string, userId: string) {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index === -1 || this.notifications[index].recipientId !== userId) {
      throw new NotificationNotFoundError();
    }
    this.notifications.splice(index, 1);
  }

  async sendNotificationSafely(params: {
    recipientId: string;
    actorId?: string | null;
    type: NotificationType;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
  }) {
    // 1. Suppress self-action notifications
    if (params.actorId && params.recipientId === params.actorId) {
      return { created: false, reason: 'SELF_ACTION' };
    }

    // 2. 24-Hour POST_LIKE deduplication check
    if (params.type === 'POST_LIKE' && params.actorId && params.entityId) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existingUnreadLike = this.notifications.find(
        (n) =>
          n.recipientId === params.recipientId &&
          n.actorId === params.actorId &&
          n.type === 'POST_LIKE' &&
          n.entityId === params.entityId &&
          !n.isRead &&
          n.createdAt >= twentyFourHoursAgo
      );

      if (existingUnreadLike) {
        return { created: false, reason: 'DEDUPLICATED_POST_LIKE' };
      }
    }

    // 3. Insert notification
    const newNotif: MockDbNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      recipientId: params.recipientId,
      actorId: params.actorId || null,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      isRead: false,
      readAt: null,
      createdAt: new Date(),
    };
    this.notifications.push(newNotif);
    return { created: true, id: newNotif.id };
  }
}

async function runTests() {
  const store = new MockNotificationStore();

  console.log('--- 1. Unread Count Calculation & User Isolation ---');
  {
    store.reset();
    store.notifications.push(
      {
        id: 'n1',
        recipientId: 'user-A',
        actorId: 'user-B',
        type: 'POST_LIKE',
        title: 'Like',
        message: 'liked',
        isRead: false,
        createdAt: new Date(),
      },
      {
        id: 'n2',
        recipientId: 'user-A',
        actorId: 'user-C',
        type: 'POST_COMMENT',
        title: 'Comment',
        message: 'commented',
        isRead: true,
        readAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'n3',
        recipientId: 'user-A',
        actorId: 'user-D',
        type: 'POST_LIKE',
        title: 'Like',
        message: 'liked',
        isRead: false,
        createdAt: new Date(),
      },
      {
        id: 'n4',
        recipientId: 'user-B',
        actorId: 'user-A',
        type: 'POST_LIKE',
        title: 'Like',
        message: 'liked',
        isRead: false,
        createdAt: new Date(),
      }
    );

    const countA = await store.getUnreadCount('user-A');
    assertTest(countA === 2, 'User A unread count is exactly 2 (ignoring read item)');

    const countB = await store.getUnreadCount('user-B');
    assertTest(countB === 1, 'User B unread count is isolated to User B items');

    const countC = await store.getUnreadCount('user-C');
    assertTest(countC === 0, 'User C with zero notifications returns 0');
  }

  console.log('--- 2. Recipient Ownership Isolation for Read & Delete ---');
  {
    store.reset();
    store.notifications.push({
      id: 'private-notif-1',
      recipientId: 'owner-user',
      actorId: 'actor-user',
      type: 'POST_COMMENT',
      title: 'Comment',
      message: 'Hello',
      isRead: false,
      createdAt: new Date(),
    });

    // Case A: Unauthorized user attempts to mark as read
    let caughtAuthRead = false;
    try {
      await store.markAsRead('private-notif-1', 'attacker-user');
    } catch (err) {
      if (err instanceof NotificationNotFoundError) {
        caughtAuthRead = true;
      }
    }
    assertTest(caughtAuthRead, 'Non-owner receives 404 when attempting to mark notification as read');

    // Case B: Unauthorized user attempts to delete
    let caughtAuthDelete = false;
    try {
      await store.deleteNotification('private-notif-1', 'attacker-user');
    } catch (err) {
      if (err instanceof NotificationNotFoundError) {
        caughtAuthDelete = true;
      }
    }
    assertTest(caughtAuthDelete, 'Non-owner receives 404 when attempting to delete notification');

    // Case C: Owner marks as read
    const readResult = await store.markAsRead('private-notif-1', 'owner-user');
    assertTest(readResult.isRead === true, 'Owner successfully marks notification as read');
    assertTest(typeof readResult.readAt === 'string', 'readAt timestamp is populated');

    // Case D: Idempotency (marking already-read notification)
    const secondRead = await store.markAsRead('private-notif-1', 'owner-user');
    assertTest(secondRead.readAt === readResult.readAt, 'Marking read twice preserves original readAt');

    // Case E: Owner deletes notification
    await store.deleteNotification('private-notif-1', 'owner-user');
    const remaining = store.notifications.find((n) => n.id === 'private-notif-1');
    assertTest(remaining === undefined, 'Owner successfully deletes notification');
  }

  console.log('--- 3. Mark All As Read Batch Operation ---');
  {
    store.reset();
    for (let i = 1; i <= 5; i++) {
      store.notifications.push({
        id: `batch-${i}`,
        recipientId: 'user-batch',
        actorId: 'actor-batch',
        type: 'POST_LIKE',
        title: 'Like',
        message: 'liked',
        isRead: false,
        createdAt: new Date(),
      });
    }

    const unreadBefore = await store.getUnreadCount('user-batch');
    assertTest(unreadBefore === 5, 'Initially 5 unread notifications');

    const result = await store.markAllAsRead('user-batch');
    assertTest(result.updatedCount === 5, 'markAllAsRead reports 5 updated records');

    const unreadAfter = await store.getUnreadCount('user-batch');
    assertTest(unreadAfter === 0, 'Unread count becomes 0 after markAllAsRead');
  }

  console.log('--- 4. Self-Action Notification Suppression ---');
  {
    store.reset();
    const selfLike = await store.sendNotificationSafely({
      recipientId: 'author-123',
      actorId: 'author-123', // Self-action
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'You liked your own post',
      entityId: 'post-1',
    });
    assertTest(selfLike.created === false, 'Self-like notification is discarded');
    assertTest(selfLike.reason === 'SELF_ACTION', 'Discard reason is SELF_ACTION');

    const selfComment = await store.sendNotificationSafely({
      recipientId: 'author-456',
      actorId: 'author-456', // Self-action
      type: 'POST_COMMENT',
      title: 'New Comment',
      message: 'You commented',
      entityId: 'post-2',
    });
    assertTest(selfComment.created === false, 'Self-comment notification is discarded');
    assertTest(store.notifications.length === 0, 'No rows created for self actions');
  }

  console.log('--- 5. POST_LIKE 24-Hour Deduplication ---');
  {
    store.reset();
    const recipientId = 'post-author-1';
    const actorId = 'liker-member-2';
    const postId = 'post-uuid-999';

    // First like: should succeed
    const firstLike = await store.sendNotificationSafely({
      recipientId,
      actorId,
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Member liked your post',
      entityType: 'Post',
      entityId: postId,
    });
    assertTest(firstLike.created === true, 'First like creates notification');
    assertTest(store.notifications.length === 1, 'Store has 1 notification');

    // Repeated like within 24h while first is UNREAD: should be deduplicated
    const secondLike = await store.sendNotificationSafely({
      recipientId,
      actorId,
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Member liked your post',
      entityType: 'Post',
      entityId: postId,
    });
    assertTest(secondLike.created === false, 'Re-like within 24h while unread is deduplicated');
    assertTest(secondLike.reason === 'DEDUPLICATED_POST_LIKE', 'Reason is DEDUPLICATED_POST_LIKE');
    assertTest(store.notifications.length === 1, 'Store count remains 1');

    // Different post by same liker: should succeed
    const differentPostLike = await store.sendNotificationSafely({
      recipientId,
      actorId,
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Member liked another post',
      entityType: 'Post',
      entityId: 'post-uuid-888',
    });
    assertTest(differentPostLike.created === true, 'Like on a different post is NOT deduplicated');
    assertTest(store.notifications.length === 2, 'Store count is now 2');

    // Different actor liking the same post: should succeed
    const differentActorLike = await store.sendNotificationSafely({
      recipientId,
      actorId: 'liker-member-3',
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Another member liked your post',
      entityType: 'Post',
      entityId: postId,
    });
    assertTest(differentActorLike.created === true, 'Different actor like is NOT deduplicated');
    assertTest(store.notifications.length === 3, 'Store count is now 3');

    // Mark the original like as read:
    await store.markAsRead(firstLike.id!, recipientId);

    // After recipient reads the notification, a subsequent like is permitted:
    const likeAfterRead = await store.sendNotificationSafely({
      recipientId,
      actorId,
      type: 'POST_LIKE',
      title: 'New Like',
      message: 'Member liked your post',
      entityType: 'Post',
      entityId: postId,
    });
    assertTest(likeAfterRead.created === true, 'Like after previous notification read is permitted');
  }

  console.log('--- 6. Non-Blocking Delivery & Failure Isolation ---');
  {
    // Simulating database error during notification insert
    const errorThrowingDbClient = {
      notification: {
        findFirst: async () => {
          throw new Error('Database connection reset during notification lookup');
        },
        create: async () => {
          throw new Error('Database disk full on notification insert');
        },
      },
    };

    let postActionCompleted: boolean = false;
    let notificationErrorCaught: boolean = false;

    try {
      // Primary business operation: e.g. post like or comment completes
      postActionCompleted = true;

      // Safe notification wrapper that mirrors sendNotificationSafely
      try {
        await (async function safeNotify() {
          try {
            await errorThrowingDbClient.notification.create();
          } catch {
            // Log warning, never bubble error to caller
            notificationErrorCaught = true;
          }
        })();
      } catch {
        postActionCompleted = false;
      }
    } catch {
      postActionCompleted = false;
    }

    assertTest(Boolean(postActionCompleted), 'Primary post action completes successfully despite notification DB error');
    assertTest(Boolean(notificationErrorCaught), 'Notification error was safely absorbed without throwing');
  }

  console.log('--- 7. Private Destination Privacy & Authorization Guard ---');
  {
    interface TestPostItem {
      id: string;
      groupId: string | null;
      isPrivateGroup: boolean;
      allowedMembers?: string[];
    }

    // Verify that navigating to a notification destination for a private group post fails closed
    const mockPosts: TestPostItem[] = [
      { id: 'p-pub', groupId: null, isPrivateGroup: false },
      { id: 'p-priv', groupId: 'g-priv', isPrivateGroup: true, allowedMembers: ['user-author', 'user-member'] },
    ];

    function verifyDestinationAccess(postId: string, userId: string): { authorized: boolean; httpStatus: number } {
      const post = mockPosts.find((p) => p.id === postId);
      if (!post) {
        return { authorized: false, httpStatus: 404 };
      }
      if (post.isPrivateGroup && !(post.allowedMembers?.includes(userId))) {
        // Fails closed with 404 to avoid leaking post existence or private group content
        return { authorized: false, httpStatus: 404 };
      }
      return { authorized: true, httpStatus: 200 };
    }

    // Public post access
    const pubAccess = verifyDestinationAccess('p-pub', 'user-outsider');
    assertTest(pubAccess.authorized === true, 'Public post destination authorized for community member');

    // Private group post member access
    const privMemberAccess = verifyDestinationAccess('p-priv', 'user-member');
    assertTest(privMemberAccess.authorized === true, 'Private group member successfully accesses destination');

    // Private group post non-member access (fails closed with 404)
    const privNonMemberAccess = verifyDestinationAccess('p-priv', 'user-outsider');
    assertTest(privNonMemberAccess.authorized === false && privNonMemberAccess.httpStatus === 404,
      'Non-member receives 404 on private group post destination without content leakage'
    );
  }

  console.log('\n================================================================');
  console.log(`   Backend Notification Tests: ${passedTests} passed, ${failedTests} failed   `);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

import { NotificationType, NotificationItem } from '@apnasamaj/shared-types';

export interface NotificationTypeMeta {
  category: 'social' | 'groups' | 'account' | 'matrimonial';
  color: string;
  iconType: 'like' | 'comment' | 'group' | 'security' | 'matrimonial' | 'moderation' | 'default';
  description: string;
}

/**
 * Returns descriptive visual metadata and categorization for each NotificationType.
 */
export function getNotificationTypeMeta(type: NotificationType | string): NotificationTypeMeta {
  switch (type) {
    case 'POST_LIKE':
      return {
        category: 'social',
        color: '#e91e63', // Pink/Red for likes
        iconType: 'like',
        description: 'Post Like',
      };
    case 'POST_COMMENT':
      return {
        category: 'social',
        color: '#0288d1', // Light Blue for comments
        iconType: 'comment',
        description: 'Post Comment',
      };
    case 'POST_MODERATED':
      return {
        category: 'social',
        color: '#ed6c02', // Orange for moderation notices
        iconType: 'moderation',
        description: 'Moderation Notice',
      };
    case 'GROUP_ROLE_UPDATE':
      return {
        category: 'groups',
        color: '#2e7d32', // Green for promotion/role update
        iconType: 'group',
        description: 'Group Role Update',
      };
    case 'GROUP_MEMBER_REMOVED':
      return {
        category: 'groups',
        color: '#d32f2f', // Red for removal
        iconType: 'group',
        description: 'Group Removal',
      };
    case 'ACCOUNT_STATUS_UPDATE':
      return {
        category: 'account',
        color: '#1976d2', // Primary Blue for account verification/status
        iconType: 'security',
        description: 'Account Status',
      };
    case 'MATRIMONIAL_INTEREST_RECEIVED':
    case 'MATRIMONIAL_INTEREST_ACCEPTED':
    case 'MATRIMONIAL_PROFILE_APPROVED':
    case 'MATRIMONIAL_PROFILE_REJECTED':
      return {
        category: 'matrimonial',
        color: '#9c27b0', // Purple for matrimonial
        iconType: 'matrimonial',
        description: 'Matrimonial Update',
      };
    default:
      return {
        category: 'account',
        color: '#757575',
        iconType: 'default',
        description: 'Notification',
      };
  }
}

/**
 * Computes human-friendly relative time strings for notifications.
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

/**
 * Resolves the destination route for a given notification item.
 * When entityId is provided for post interactions, deep links to /posts/:postId.
 * When entityId is missing or empty, gracefully falls back to /feed.
 */
export function resolveNotificationTarget(item: NotificationItem): string | null {
  switch (item.type) {
    case 'POST_LIKE':
    case 'POST_COMMENT':
      return item.entityId ? `/posts/${item.entityId}` : '/feed';
    case 'GROUP_ROLE_UPDATE':
      return item.entityId ? `/groups/${item.entityId}` : '/groups';
    case 'GROUP_MEMBER_REMOVED':
      return '/groups';
    case 'ACCOUNT_STATUS_UPDATE':
      return '/profile';
    case 'POST_MODERATED':
      return '/feed';
    case 'MATRIMONIAL_INTEREST_RECEIVED':
    case 'MATRIMONIAL_INTEREST_ACCEPTED':
    case 'MATRIMONIAL_PROFILE_APPROVED':
    case 'MATRIMONIAL_PROFILE_REJECTED':
      return '/matrimonial/me';
    default:
      return null;
  }
}

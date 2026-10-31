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
 * Computes human-friendly relative time strings for notifications in Hindi and English.
 *
 * Supported formats:
 * - Hindi ('hi'): "अभी", "1 मिनट पहले", "5 मिनट पहले", "1 घंटा पहले", "2 घंटे पहले", "कल", "4 दिन पहले"
 * - English ('en'): "Just now", "1 minute ago", "5 minutes ago", "1 hour ago", "2 hours ago", "Yesterday", "4 days ago"
 * - Compact fallback (omitted lang or compact mode): "Just now", "5m ago", "3h ago", "4d ago"
 */
export function formatRelativeTime(
  dateString: string | null | undefined,
  lang?: string,
  options?: { compact?: boolean }
): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) {
      return lang?.startsWith('hi') ? 'अभी' : 'Just now';
    }

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) {
      return lang?.startsWith('hi') ? 'अभी' : 'Just now';
    }

    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    // If no language specified and not explicitly set to full, preserve legacy compact format
    if (lang === undefined && !options?.compact) {
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return date.toLocaleDateString();
    }

    const isHindi = lang?.startsWith('hi');

    if (diffMin < 60) {
      if (isHindi) {
        return diffMin === 1 ? '1 मिनट पहले' : `${diffMin} मिनट पहले`;
      }
      if (options?.compact) return `${diffMin}m ago`;
      return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
    }

    if (diffHour < 24) {
      if (isHindi) {
        return diffHour === 1 ? '1 घंटा पहले' : `${diffHour} घंटे पहले`;
      }
      if (options?.compact) return `${diffHour}h ago`;
      return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
    }

    if (diffDay === 1) {
      return isHindi ? 'कल' : 'Yesterday';
    }

    if (diffDay < 7) {
      if (isHindi) {
        return `${diffDay} दिन पहले`;
      }
      if (options?.compact) return `${diffDay}d ago`;
      return `${diffDay} days ago`;
    }

    return date.toLocaleDateString(isHindi ? 'hi-IN' : 'en-US');
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
      return item.entityId ? `/appeals?postId=${encodeURIComponent(item.entityId)}` : '/feed';
    case 'MATRIMONIAL_INTEREST_RECEIVED':
    case 'MATRIMONIAL_INTEREST_ACCEPTED':
    case 'MATRIMONIAL_PROFILE_APPROVED':
    case 'MATRIMONIAL_PROFILE_REJECTED':
      return '/matrimonial/me';
    default:
      return null;
  }
}

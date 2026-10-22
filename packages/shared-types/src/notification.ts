export type NotificationType =
  | 'POST_LIKE'
  | 'POST_COMMENT'
  | 'GROUP_ROLE_UPDATE'
  | 'GROUP_MEMBER_REMOVED'
  | 'ACCOUNT_STATUS_UPDATE'
  | 'POST_MODERATED'
  | 'MATRIMONIAL_INTEREST_RECEIVED'
  | 'MATRIMONIAL_INTEREST_ACCEPTED'
  | 'MATRIMONIAL_PROFILE_APPROVED'
  | 'MATRIMONIAL_PROFILE_REJECTED';

export const NotificationType = {
  POST_LIKE: 'POST_LIKE' as const,
  POST_COMMENT: 'POST_COMMENT' as const,
  GROUP_ROLE_UPDATE: 'GROUP_ROLE_UPDATE' as const,
  GROUP_MEMBER_REMOVED: 'GROUP_MEMBER_REMOVED' as const,
  ACCOUNT_STATUS_UPDATE: 'ACCOUNT_STATUS_UPDATE' as const,
  POST_MODERATED: 'POST_MODERATED' as const,
  MATRIMONIAL_INTEREST_RECEIVED: 'MATRIMONIAL_INTEREST_RECEIVED' as const,
  MATRIMONIAL_INTEREST_ACCEPTED: 'MATRIMONIAL_INTEREST_ACCEPTED' as const,
  MATRIMONIAL_PROFILE_APPROVED: 'MATRIMONIAL_PROFILE_APPROVED' as const,
  MATRIMONIAL_PROFILE_REJECTED: 'MATRIMONIAL_PROFILE_REJECTED' as const,
};

export interface NotificationActorInfo {
  id: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string | null;
  actor?: NotificationActorInfo | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface NotificationsResponseData {
  notifications: NotificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  unreadCount: number;
}

export interface MarkNotificationReadResponse {
  id: string;
  isRead: boolean;
  readAt: string;
}

export interface MarkAllNotificationsReadResponse {
  updatedCount: number;
}

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
  | 'MATRIMONIAL_PROFILE_REJECTED'
  | 'MATRIMONIAL_PROFILE_SUSPENDED'
  | 'MATRIMONIAL_DOCUMENT_APPROVED'
  | 'MATRIMONIAL_DOCUMENT_REJECTED';

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
  MATRIMONIAL_PROFILE_SUSPENDED: 'MATRIMONIAL_PROFILE_SUSPENDED' as const,
  MATRIMONIAL_DOCUMENT_APPROVED: 'MATRIMONIAL_DOCUMENT_APPROVED' as const,
  MATRIMONIAL_DOCUMENT_REJECTED: 'MATRIMONIAL_DOCUMENT_REJECTED' as const,
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
  readAt: string | null;
}

export interface MarkAllNotificationsReadResponse {
  updatedCount: number;
}

// --------------------------------------------------------
// FCM PUSH NOTIFICATIONS & DEVICE REGISTRATION
// --------------------------------------------------------

export type DevicePlatform = 'ANDROID' | 'IOS';
export type PushTokenType = 'FCM' | 'APNS';

export interface RegisterDeviceTokenInput {
  token: string;
  platform: DevicePlatform;
  tokenType?: PushTokenType;
  deviceId?: string;
}

export interface RegisterDeviceTokenResponseData {
  id: string;
  platform: DevicePlatform;
  isActive: boolean;
  createdAt: string;
}

export interface NotificationPreferencesItem {
  personalMessages: boolean;
  groupMessages: boolean;
  matrimonial: boolean;
  likes: boolean;
  comments: boolean;
  announcements: boolean;
  communityUpdates: boolean;
}

export type UpdateNotificationPreferencesInput = Partial<NotificationPreferencesItem>;

export interface PushNotificationRoutingPayload {
  type:
    | 'PERSONAL_CHAT'
    | 'GROUP_CHAT'
    | 'MATRIMONIAL_INTEREST'
    | 'POST_COMMENT'
    | 'POST_LIKE'
    | 'ANNOUNCEMENT';
  conversationId?: string;
  groupId?: string;
  groupSlug?: string;
  postId?: string;
  interestId?: string;
  entityId?: string;
}

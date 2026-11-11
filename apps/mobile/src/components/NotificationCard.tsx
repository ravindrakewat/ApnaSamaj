import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { NotificationItem, NotificationType } from '@apnasamaj/shared-types';
import { Typography } from './Typography';
import { ProfileAvatar } from './ProfileAvatar';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export interface NotificationCardProps {
  notification: NotificationItem;
  onPress: (notification: NotificationItem) => void;
  onDelete?: (notification: NotificationItem) => void;
  style?: ViewStyle;
}

/**
 * Returns a human-friendly relative time string in Hindi or English.
 */
export function formatNotificationTime(
  dateStr: string,
  language: 'hi' | 'en' = 'hi'
): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (language === 'hi') {
    if (diffMin < 1) return 'अभी-अभी';
    if (diffMin < 60) return `${diffMin} मिनट पहले`;
    if (diffHour < 24) return `${diffHour} घंटे पहले`;
    if (diffDay < 7) return `${diffDay} दिन पहले`;
    return date.toLocaleDateString('hi-IN', { day: 'numeric', month: 'short' });
  } else {
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
}

/**
 * Returns an expressive emoji badge for each notification type.
 */
export function getNotificationIcon(type: NotificationType | string): string {
  switch (type) {
    case 'POST_LIKE':
      return '❤️';
    case 'POST_COMMENT':
      return '💬';
    case 'GROUP_ROLE_UPDATE':
      return '👥';
    case 'GROUP_MEMBER_REMOVED':
      return '🚪';
    case 'ACCOUNT_STATUS_UPDATE':
      return '👤';
    case 'POST_MODERATED':
      return '🛡️';
    case 'MATRIMONIAL_INTEREST_RECEIVED':
      return '💌';
    case 'MATRIMONIAL_INTEREST_ACCEPTED':
      return '💍';
    case 'MATRIMONIAL_PROFILE_APPROVED':
      return '✅';
    case 'MATRIMONIAL_PROFILE_REJECTED':
      return '❌';
    case 'MATRIMONIAL_PROFILE_SUSPENDED':
      return '⚠️';
    case 'MATRIMONIAL_DOCUMENT_APPROVED':
      return '📜';
    case 'MATRIMONIAL_DOCUMENT_REJECTED':
      return '⚠️';
    default:
      return '🔔';
  }
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onPress,
  onDelete,
  style,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();

  const isUnread = !notification.isRead;
  const timeFormatted = formatNotificationTime(notification.createdAt, language as 'hi' | 'en');
  const iconEmoji = getNotificationIcon(notification.type);

  return (
    <Pressable
      onPress={() => onPress(notification)}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}, ${notification.message}, ${timeFormatted}`}
      style={({ pressed }) => [
        styles.cardContainer,
        {
          backgroundColor: isUnread ? '#F0F9FF' : theme.colors.surface,
          borderColor: isUnread ? '#BAE6FD' : theme.colors.border,
          opacity: pressed ? 0.92 : 1,
        },
        style,
      ]}
    >
      {/* 1. Left Avatar / Icon with Overlay Badge */}
      <View style={styles.avatarWrapper}>
        {notification.actor ? (
          <ProfileAvatar
            uri={notification.actor.avatarUrl}
            initial={notification.actor.fullName?.charAt(0) || 'अ'}
            size="md"
          />
        ) : (
          <View style={[styles.defaultAvatarBox, { backgroundColor: theme.colors.primaryLight }]}>
            <Typography variant="md">{iconEmoji}</Typography>
          </View>
        )}

        {notification.actor && (
          <View style={styles.typeBadge}>
            <Typography variant="xs" style={styles.badgeEmoji}>
              {iconEmoji}
            </Typography>
          </View>
        )}
      </View>

      {/* 2. Middle Content Body */}
      <View style={styles.contentCol}>
        <View style={styles.titleRow}>
          <Typography
            variant="sm"
            weight={isUnread ? 'bold' : 'semibold'}
            color={theme.colors.textPrimary}
            numberOfLines={1}
            style={styles.titleText}
          >
            {notification.title}
          </Typography>

          <Typography variant="xs" color={theme.colors.textSecondary} style={styles.timeText}>
            {timeFormatted}
          </Typography>
        </View>

        <Typography
          variant="xs"
          color={isUnread ? theme.colors.textPrimary : theme.colors.textSecondary}
          numberOfLines={2}
          style={styles.messageText}
        >
          {notification.message}
        </Typography>
      </View>

      {/* 3. Right Status Dot / Actions */}
      <View style={styles.rightActionCol}>
        {isUnread && <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />}

        {onDelete && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDelete(notification);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'सूचना हटाएं' : 'Delete notification'}
            style={styles.deleteButton}
          >
            <Typography variant="xs" color={theme.colors.textMuted}>
              ✕
            </Typography>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  defaultAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeEmoji: {
    fontSize: 10,
    lineHeight: 12,
  },
  contentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  titleText: {
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 11,
  },
  messageText: {
    lineHeight: 16,
  },
  rightActionCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
    gap: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deleteButton: {
    padding: 4,
  },
});

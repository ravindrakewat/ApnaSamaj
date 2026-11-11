import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { GroupPrivacy } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { Badge } from '../Badge';
import { ProfileAvatar } from '../ProfileAvatar';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';

export interface ChatConversationCardProps {
  type: 'personal' | 'group';
  id: string;
  name: string;
  avatarUrl?: string | null;
  lastMessage?: string;
  timestamp: string;
  unreadCount?: number;
  privacy?: GroupPrivacy;
  subtitle?: string;
  isOutgoing?: boolean;
  deliveryStatus?: 'sending' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  onPress: () => void;
}

export function formatConversationTime(dateString: string, language: 'en' | 'hi' = 'en'): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString(language === 'hi' ? 'hi-IN' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return language === 'hi' ? 'कल' : 'Yesterday';
    }
    return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

export const ChatConversationCard: React.FC<ChatConversationCardProps> = ({
  type,
  id,
  name,
  avatarUrl,
  lastMessage,
  timestamp,
  unreadCount = 0,
  privacy,
  subtitle,
  isOutgoing = false,
  deliveryStatus,
  onPress,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();

  const formattedTime = formatConversationTime(timestamp, language as 'en' | 'hi');

  const renderStatusIcon = () => {
    if (!isOutgoing || !deliveryStatus) return null;
    if (deliveryStatus === 'failed') {
      return <Typography variant="xs" color={theme.colors.error} style={styles.statusTick}>⚠️</Typography>;
    }
    if (deliveryStatus === 'sending') {
      return <Typography variant="xs" color="#94A3B8" style={styles.statusTick}>⏳</Typography>;
    }
    if (deliveryStatus === 'pending') {
      return <Typography variant="xs" color="#94A3B8" style={styles.statusTick}>🕒</Typography>;
    }
    if (deliveryStatus === 'read') {
      return <Typography variant="xs" weight="bold" color="#0284C7" style={styles.statusTick}>✓✓</Typography>;
    }
    if (deliveryStatus === 'delivered') {
      return <Typography variant="xs" color="#64748B" style={styles.statusTick}>✓✓</Typography>;
    }
    return <Typography variant="xs" color="#64748B" style={styles.statusTick}>✓</Typography>;
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${lastMessage || subtitle || ''}`}
    >
      {/* Avatar Container */}
      <View style={styles.avatarWrapper}>
        <ProfileAvatar
          uri={avatarUrl}
          name={name}
          size="md"
        />
        {type === 'group' && (
          <View style={[styles.groupBadgeOverlay, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="xs" color="#FFFFFF" style={styles.groupBadgeIcon}>
              👥
            </Typography>
          </View>
        )}
      </View>

      {/* Content Details */}
      <View style={styles.detailsContainer}>
        {/* Name and Timestamp Row */}
        <View style={styles.headerRow}>
          <Typography
            variant="sm"
            weight="bold"
            color={theme.colors.textPrimary}
            numberOfLines={1}
            style={styles.nameText}
          >
            {name}
          </Typography>

          {formattedTime ? (
            <Typography
              variant="xs"
              color={unreadCount > 0 ? theme.colors.primary : theme.colors.textMuted}
              weight={unreadCount > 0 ? 'bold' : 'regular'}
              style={styles.timeText}
            >
              {formattedTime}
            </Typography>
          ) : null}
        </View>

        {/* Preview and Unread Badge Row */}
        <View style={styles.previewRow}>
          <View style={styles.previewTextWrapper}>
            {renderStatusIcon()}
            <Typography
              variant="xs"
              color={unreadCount > 0 ? theme.colors.textPrimary : theme.colors.textSecondary}
              weight={unreadCount > 0 ? 'semibold' : 'regular'}
              numberOfLines={1}
              style={styles.previewText}
            >
              {lastMessage || subtitle || (type === 'group' ? (language === 'hi' ? 'समूह चैट' : 'Group Chat') : '')}
            </Typography>
          </View>

          {/* Group Privacy Pill or Unread Badge */}
          {type === 'group' && privacy && (
            <Badge
              label={
                privacy === GroupPrivacy.PRIVATE
                  ? language === 'hi' ? 'निजी' : 'Private'
                  : language === 'hi' ? 'सार्वजनिक' : 'Public'
              }
              variant={privacy === GroupPrivacy.PRIVATE ? 'warning' : 'info'}
              size="sm"
            />
          )}

          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
              <Typography variant="xs" weight="bold" color="#FFFFFF" style={styles.unreadCountText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Typography>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  avatarWrapper: {
    position: 'relative',
  },
  groupBadgeOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  groupBadgeIcon: {
    fontSize: 9,
  },
  detailsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  nameText: {
    flex: 1,
  },
  timeText: {
    fontSize: 11,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewTextWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewText: {
    flex: 1,
  },
  statusTick: {
    fontSize: 11,
    marginRight: 2,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCountText: {
    fontSize: 10,
  },
});

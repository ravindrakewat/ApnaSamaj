import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { CommentItem as CommentItemType } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { Badge } from '../Badge';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';
import { formatRelativeTime } from '../../utils/date';

export interface CommentItemProps {
  comment: CommentItemType;
}

export const CommentItem: React.FC<CommentItemProps> = ({ comment }) => {
  const theme = useTheme();
  const { language } = useLocalization();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      {/* Author Avatar or Initial */}
      {comment.author?.avatarUrl ? (
        <Image
          source={{ uri: comment.author.avatarUrl }}
          style={styles.avatar}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.avatarInitial, { backgroundColor: theme.colors.primaryLight }]}>
          <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
            {comment.author?.fullName ? comment.author.fullName.charAt(0).toUpperCase() : 'स'}
          </Typography>
        </View>
      )}

      {/* Content Column */}
      <View style={styles.contentCol}>
        <View style={styles.headerRow}>
          <Typography variant="xs" weight="semibold" color={theme.colors.textPrimary}>
            {comment.author?.fullName || (language === 'hi' ? 'सदस्य' : 'Member')}
          </Typography>
          {comment.author?.role && comment.author.role !== 'MEMBER' && (
            <Badge label={comment.author.role} variant="info" size="sm" />
          )}
          <Typography variant="xs" color={theme.colors.textMuted} style={styles.timestamp}>
            {formatRelativeTime(comment.createdAt, language)}
          </Typography>
        </View>

        <Typography variant="sm" color={theme.colors.textPrimary} style={styles.commentText}>
          {comment.content}
        </Typography>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarInitial: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentCol: {
    flex: 1,
    marginLeft: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  timestamp: {
    marginLeft: 'auto',
  },
  commentText: {
    lineHeight: 18,
  },
});


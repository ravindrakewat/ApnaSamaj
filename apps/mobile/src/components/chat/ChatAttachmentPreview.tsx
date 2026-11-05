import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Typography } from '../Typography';
import { SelectedChatAttachment } from './ChatAttachmentButton';

interface ChatAttachmentPreviewProps {
  attachment: SelectedChatAttachment;
  onCancel: () => void;
  isUploading?: boolean;
}

export const ChatAttachmentPreview: React.FC<ChatAttachmentPreviewProps> = ({
  attachment,
  onCancel,
  isUploading = false,
}) => {
  const theme = useTheme();

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryIcon = () => {
    switch (attachment.category) {
      case 'IMAGE':
        return '📷';
      case 'VIDEO':
        return '🎥';
      case 'DOCUMENT':
        return '📄';
      default:
        return '📎';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.previewBox}>
        {attachment.category === 'IMAGE' && attachment.uri ? (
          <Image
            source={{ uri: attachment.uri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.iconBox}>
            <Typography variant="md">{getCategoryIcon()}</Typography>
          </View>
        )}

        <View style={styles.infoCol}>
          <Typography
            variant="sm"
            weight="medium"
            color={theme.colors.textPrimary}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {attachment.name}
          </Typography>
          <Typography variant="xs" color={theme.colors.textSecondary}>
            {formatSize(attachment.size)} • {attachment.category}
          </Typography>
        </View>

        {isUploading ? (
          <View style={styles.spinnerBox}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Remove attachment"
          >
            <Typography variant="sm" weight="bold" color="#64748B">
              ✕
            </Typography>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F8FAFC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#E2E8F0',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  infoCol: {
    flex: 1,
    marginRight: 8,
  },
  cancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerBox: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

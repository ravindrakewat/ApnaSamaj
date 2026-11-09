import React from 'react';
import { View, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { ChatAttachmentItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';
import { resolveAttachmentDisplayUrl } from '../../utils/attachment';

interface ChatDocumentMessageProps {
  attachment: ChatAttachmentItem;
}

export const ChatDocumentMessage: React.FC<ChatDocumentMessageProps> = ({ attachment }) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getDocExtension = (filename: string) => {
    const ext = filename.split('.').pop()?.toUpperCase() || 'DOC';
    return ext.length <= 4 ? ext : 'DOC';
  };

  const handleOpen = () => {
    const docUrl = resolveAttachmentDisplayUrl(attachment.url);
    if (docUrl) {
      Linking.openURL(docUrl).catch((err) => {
        console.warn('[ChatDocumentMessage] Could not open document URL:', err);
      });
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handleOpen}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Open document: ${attachment.fileName}`}
    >
      <View style={styles.iconBox}>
        <Typography variant="md">📄</Typography>
        <Typography variant="xxs" weight="bold" color={theme.colors.primary} style={styles.extBadge}>
          {getDocExtension(attachment.fileName)}
        </Typography>
      </View>

      <View style={styles.infoCol}>
        <Typography
          variant="sm"
          weight="semibold"
          color={theme.colors.textPrimary}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {attachment.fileName}
        </Typography>
        <Typography variant="xs" color={theme.colors.textSecondary}>
          {formatSize(attachment.fileSizeBytes)} • {isHindi ? 'डाउनलोड / खोलें' : 'Tap to open'}
        </Typography>
      </View>

      <View style={styles.arrowBox}>
        <Typography variant="sm" color="#64748B">
          📥
        </Typography>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    padding: 8,
    marginBottom: 4,
    maxWidth: 240,
    width: '100%',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    position: 'relative',
  },
  extBadge: {
    fontSize: 8,
    marginTop: -2,
  },
  infoCol: {
    flex: 1,
    marginRight: 6,
  },
  arrowBox: {
    padding: 4,
  },
});

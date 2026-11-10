import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ChatAttachmentItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';
import { resolveAttachmentDisplayUrl } from '../../utils/attachment';
import { UnifiedVideoModal } from '../video/UnifiedVideoModal';

interface ChatVideoMessageProps {
  attachment: ChatAttachmentItem;
}

export const ChatVideoMessage: React.FC<ChatVideoMessageProps> = ({ attachment }) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const [isPlayingInApp, setIsPlayingInApp] = useState(false);

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const videoUrl = resolveAttachmentDisplayUrl(attachment.url || (attachment as any).localUri);

  const handlePlay = () => {
    if (videoUrl) {
      setIsPlayingInApp(true);
    }
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePlay}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`Play video: ${attachment.fileName}`}
      >
        <View style={styles.thumbnailPlaceholder}>
          <View style={styles.playBadge}>
            <Typography variant="md" color="#FFFFFF">
              ▶
            </Typography>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.textCol}>
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
              🎥 {isHindi ? 'वीडियो' : 'Video'} • {formatSize(attachment.fileSizeBytes)}
            </Typography>
          </View>

          <View style={styles.actionPill}>
            <Typography variant="xs" weight="medium" color={theme.colors.primary}>
              {isHindi ? 'देखें' : 'Watch'}
            </Typography>
          </View>
        </View>
      </TouchableOpacity>

      {/* In-App Video Playback Modal */}
      {isPlayingInApp && (
        <UnifiedVideoModal
          visible={isPlayingInApp}
          media={{
            id: attachment.id,
            mediaType: 'VIDEO',
            url: videoUrl,
            thumbnail: null,
            order: 0,
          }}
          authorName={attachment.fileName}
          onClose={() => setIsPlayingInApp(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    marginBottom: 4,
    maxWidth: 240,
    width: '100%',
  },
  thumbnailPlaceholder: {
    height: 110,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 3,
  },
  infoRow: {
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textCol: {
    flex: 1,
    marginRight: 6,
  },
  actionPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
  },
});

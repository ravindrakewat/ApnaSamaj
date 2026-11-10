import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  BackHandler,
  Platform,
  StatusBar,
} from 'react-native';
import { PostMediaItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';
import { getVideoSourceDetails } from '../../utils/video';
import { NativeVideoPlayer } from './NativeVideoPlayer';
import { YouTubeVideoPlayer } from './YouTubeVideoPlayer';

export interface UnifiedVideoModalProps {
  visible: boolean;
  media: PostMediaItem | null;
  postTitle?: string | null;
  authorName?: string | null;
  onClose: () => void;
}

export const UnifiedVideoModal: React.FC<UnifiedVideoModalProps> = ({
  visible,
  media,
  postTitle,
  authorName,
  onClose,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const isHindi = language === 'hi';

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hardware Back Handler on Android: close modal and preserve feed position
  useEffect(() => {
    if (!visible) return;

    const onBackPress = () => {
      if (isFullscreen) {
        setIsFullscreen(false);
        return true;
      }
      onClose();
      return true;
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );

    return () => {
      backSubscription.remove();
    };
  }, [visible, isFullscreen, onClose]);

  // Reset fullscreen when modal closes
  useEffect(() => {
    if (!visible) {
      setIsFullscreen(false);
    }
  }, [visible]);

  if (!media) return null;

  const videoDetails = getVideoSourceDetails(media.url, media.thumbnail);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, isFullscreen && styles.fullscreenBackdrop]}>
        <StatusBar hidden={isFullscreen} />

        <View
          style={[
            styles.playerCard,
            { backgroundColor: isFullscreen ? '#000000' : theme.colors.surface },
            isFullscreen && styles.fullscreenCard,
          ]}
        >
          {/* Header Row */}
          {!isFullscreen && (
            <View style={styles.header}>
              <View style={styles.headerTitleRow}>
                {videoDetails.sourceType === 'YOUTUBE' ? (
                  <Badge label="🔴 YouTube" variant="error" size="sm" />
                ) : (
                  <Badge
                    label={isHindi ? '🎥 सामुदायिक वीडियो' : '🎥 Community Video'}
                    variant="info"
                    size="sm"
                  />
                )}
                <Typography
                  variant="sm"
                  weight="bold"
                  color={theme.colors.textPrimary}
                  numberOfLines={1}
                  style={styles.headerTitle}
                >
                  {postTitle || authorName || (isHindi ? 'वीडियो' : 'Video')}
                </Typography>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close video player"
                style={styles.closeBtn}
              >
                <Typography variant="md" weight="bold" color={theme.colors.textMuted}>
                  ✕
                </Typography>
              </Pressable>
            </View>
          )}

          {/* Player Container */}
          <View style={[styles.videoWrapper, isFullscreen && styles.fullscreenVideoWrapper]}>
            {videoDetails.sourceType === 'YOUTUBE' ? (
              <YouTubeVideoPlayer
                embedUrl={videoDetails.playbackUrl}
                youtubeId={videoDetails.youtubeId}
                thumbnailUrl={videoDetails.thumbnailUrl}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
              />
            ) : (
              <NativeVideoPlayer
                videoUrl={videoDetails.playbackUrl}
                thumbnailUrl={videoDetails.thumbnailUrl}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
                autoPlay
              />
            )}
          </View>

          {/* Subtitle Information & Controls (Only when not fullscreen) */}
          {!isFullscreen && (
            <View style={styles.footer}>
              <Typography variant="xs" color={theme.colors.textSecondary} style={styles.noticeText}>
                {videoDetails.sourceType === 'YOUTUBE'
                  ? isHindi
                    ? 'यूट्यूब प्लेयर सीधे अपना समाज ऐप के भीतर चल रहा है।'
                    : 'Official YouTube player playing in-app without external redirection.'
                  : isHindi
                    ? 'कम-रैम उपकरणों के लिए अनुकूलित: स्थानीय स्ट्रीम सीधे ऐप में चल रही है।'
                    : 'Optimized for low-RAM devices: In-app direct media stream.'}
              </Typography>

              <View style={styles.footerActions}>
                <Button
                  title={isHindi ? 'पूर्ण स्क्रीन' : 'Fullscreen'}
                  variant="outline"
                  size="sm"
                  onPress={toggleFullscreen}
                  style={styles.fullscreenBtn}
                />
                <Button
                  title={isHindi ? 'बंद करें' : 'Close'}
                  size="sm"
                  onPress={onClose}
                  style={styles.closeActionBtn}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullscreenBackdrop: {
    padding: 0,
    backgroundColor: '#000000',
  },
  playerCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  fullscreenCard: {
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    borderRadius: 0,
    elevation: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  videoWrapper: {
    width: '100%',
    backgroundColor: '#000000',
  },
  fullscreenVideoWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    padding: 14,
  },
  noticeText: {
    marginBottom: 12,
    lineHeight: 18,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  fullscreenBtn: {
    minWidth: 90,
  },
  closeActionBtn: {
    minWidth: 80,
  },
});


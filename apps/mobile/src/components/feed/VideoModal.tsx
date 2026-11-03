import React from 'react';
import {
  Modal,
  View,
  Image,
  StyleSheet,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { PostMediaItem } from '@apnasamaj/shared-types';
import { Typography } from '../Typography';
import { Button } from '../Button';
import { useTheme } from '../../hooks/useTheme';
import { useLocalization } from '../../hooks/useLocalization';

export interface VideoModalProps {
  visible: boolean;
  media: PostMediaItem | null;
  onClose: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({
  visible,
  media,
  onClose,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();

  if (!media) return null;

  const handleOpenVideo = async () => {
    try {
      const supported = await Linking.canOpenURL(media.url);
      if (supported) {
        await Linking.openURL(media.url);
      } else {
        Alert.alert(
          language === 'hi' ? 'त्रुटि' : 'Error',
          language === 'hi'
            ? 'इस वीडियो को चलाने के लिए कोई उपयुक्त ऐप नहीं मिला।'
            : 'No app found to play this video stream.'
        );
      }
    } catch {
      Alert.alert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi'
          ? 'वीडियो लिंक खोलने में असमर्थ।'
          : 'Unable to open video stream.'
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.dialogCard, { backgroundColor: theme.colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
              {language === 'hi' ? 'सामुदायिक वीडियो' : 'Community Video'}
            </Typography>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close video dialog"
            >
              <Typography variant="md" weight="bold" color={theme.colors.textMuted}>
                ✕
              </Typography>
            </Pressable>
          </View>

          {/* Thumbnail preview */}
          {media.thumbnail ? (
            <Image
              source={{ uri: media.thumbnail }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.placeholderBox, { backgroundColor: '#1E293B' }]}>
              <Typography variant="title" color="#FFFFFF">
                ▶
              </Typography>
            </View>
          )}

          {/* Subtitle notice */}
          <Typography
            variant="xs"
            color={theme.colors.textSecondary}
            style={styles.noticeText}
          >
            {language === 'hi'
              ? 'कम रैम खपत और डेटा बचत के लिए, वीडियो आपके पसंदीदा मीडिया प्लेयर में चलेगा।'
              : 'Optimized for low-RAM devices: Stream plays in your preferred media player.'}
          </Typography>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <Button
              title={language === 'hi' ? 'वीडियो चलाएं' : 'Play Video'}
              onPress={handleOpenVideo}
              fullWidth
              style={styles.playBtn}
            />
            <Button
              title={language === 'hi' ? 'बंद करें' : 'Close'}
              variant="outline"
              onPress={onClose}
              fullWidth
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 18,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  placeholderBox: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  noticeText: {
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  buttonRow: {
    gap: 8,
  },
  playBtn: {
    marginBottom: 4,
  },
});


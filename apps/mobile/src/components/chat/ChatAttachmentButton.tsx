import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../hooks/useTheme';
import { Typography } from '../Typography';
import { useLocalization } from '../../hooks/useLocalization';

export interface SelectedChatAttachment {
  uri: string;
  name: string;
  type: string;
  size?: number;
  category: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  file?: any;
}

interface ChatAttachmentButtonProps {
  onSelect: (attachment: SelectedChatAttachment) => void;
  disabled?: boolean;
}

export const ChatAttachmentButton: React.FC<ChatAttachmentButtonProps> = ({
  onSelect,
  disabled = false,
}) => {
  const theme = useTheme();
  const { language } = useLocalization();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isHindi = language === 'hi';

  const closeAndRun = (action: () => Promise<void>) => {
    setIsModalOpen(false);
    setTimeout(() => {
      action().catch((err: unknown) => {
        console.warn('[ChatAttachmentButton] Action error:', err);
      });
    }, 250);
  };

  const handlePickImage = () => {
    closeAndRun(async () => {
      try {
        if (Platform.OS === 'ios') {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert(
              isHindi ? 'अनुमति अस्वीकृत' : 'Permission Denied',
              isHindi
                ? 'फ़ोटो भेजने के लिए मीडिया लाइब्रेरी की अनुमति आवश्यक है।'
                : 'Media library permission is required to send images.'
            );
            return;
          }
        } else if (Platform.OS === 'android') {
          try {
            const current = await ImagePicker.getMediaLibraryPermissionsAsync();
            if (!current.granted && current.canAskAgain) {
              await ImagePicker.requestMediaLibraryPermissionsAsync();
            }
          } catch {
            // Android 13+ system photo picker does not require storage permissions
          }
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return;
        }

        const asset = result.assets[0];
        const fileSize = asset.fileSize || 0;
        if (fileSize > 10 * 1024 * 1024) {
          Alert.alert(
            isHindi ? 'फ़ाइल बहुत बड़ी है' : 'File Too Large',
            isHindi ? 'फ़ोटो का आकार 10MB से अधिक नहीं होना चाहिए।' : 'Image size must not exceed 10MB.'
          );
          return;
        }

        let name = asset.fileName || '';
        let type = asset.mimeType || '';

        if (!name) {
          const uriParts = (asset.uri || '').split('/');
          const lastPart = uriParts[uriParts.length - 1]?.split('?')[0];
          name = lastPart && lastPart.includes('.') ? lastPart : `image-${Date.now()}.jpg`;
        }
        if (!type) {
          const ext = name.toLowerCase().split('.').pop();
          if (ext === 'png') type = 'image/png';
          else if (ext === 'webp') type = 'image/webp';
          else type = 'image/jpeg';
        }

        onSelect({
          uri: asset.uri,
          name,
          type,
          size: fileSize,
          category: 'IMAGE',
          file: (asset as any).file,
        });
      } catch (err: unknown) {
        console.warn('[ChatAttachmentButton] Image pick error:', err);
        Alert.alert(
          isHindi ? 'त्रुटि' : 'Error',
          isHindi ? 'फ़ोटो चुनने में विफल। कृपया पुन: प्रयास करें।' : 'Failed to select image. Please try again.'
        );
      }
    });
  };

  const handlePickVideo = () => {
    closeAndRun(async () => {
      try {
        if (Platform.OS === 'ios') {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            Alert.alert(
              isHindi ? 'अनुमति अस्वीकृत' : 'Permission Denied',
              isHindi
                ? 'वीडियो भेजने के लिए मीडिया लाइब्रेरी की अनुमति आवश्यक है।'
                : 'Media library permission is required to send videos.'
            );
            return;
          }
        } else if (Platform.OS === 'android') {
          try {
            const current = await ImagePicker.getMediaLibraryPermissionsAsync();
            if (!current.granted && current.canAskAgain) {
              await ImagePicker.requestMediaLibraryPermissionsAsync();
            }
          } catch {
            // Android 13+ system photo picker does not require storage permissions
          }
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['videos'],
          allowsEditing: false,
          quality: 0.8,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return;
        }

        const asset = result.assets[0];
        const fileSize = asset.fileSize || 0;
        if (fileSize > 50 * 1024 * 1024) {
          Alert.alert(
            isHindi ? 'फ़ाइल बहुत बड़ी है' : 'File Too Large',
            isHindi ? 'वीडियो का आकार 50MB से अधिक नहीं होना चाहिए।' : 'Video size must not exceed 50MB.'
          );
          return;
        }

        let name = asset.fileName || '';
        let type = asset.mimeType || '';

        if (!name) {
          const uriParts = (asset.uri || '').split('/');
          const lastPart = uriParts[uriParts.length - 1]?.split('?')[0];
          name = lastPart && lastPart.includes('.') ? lastPart : `video-${Date.now()}.mp4`;
        }
        if (!type) {
          const ext = name.toLowerCase().split('.').pop();
          if (ext === 'mov') type = 'video/quicktime';
          else type = 'video/mp4';
        }

        onSelect({
          uri: asset.uri,
          name,
          type,
          size: fileSize,
          category: 'VIDEO',
          file: (asset as any).file,
        });
      } catch (err: unknown) {
        console.warn('[ChatAttachmentButton] Video pick error:', err);
        Alert.alert(
          isHindi ? 'त्रुटि' : 'Error',
          isHindi ? 'वीडियो चुनने में विफल। कृपया पुन: प्रयास करें।' : 'Failed to select video. Please try again.'
        );
      }
    });
  };

  const handlePickDocument = () => {
    closeAndRun(async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '*/*',
          ],
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) {
          return;
        }

        const doc = result.assets[0];
        const fileSize = doc.size || 0;
        if (fileSize > 20 * 1024 * 1024) {
          Alert.alert(
            isHindi ? 'फ़ाइल बहुत बड़ी है' : 'File Too Large',
            isHindi
              ? 'दस्तावेज़ का आकार 20MB से अधिक नहीं होना चाहिए।'
              : 'Document size must not exceed 20MB.'
          );
          return;
        }

        let name = doc.name || '';
        if (!name) {
          const uriParts = (doc.uri || '').split('/');
          const lastPart = uriParts[uriParts.length - 1]?.split('?')[0];
          name = lastPart && lastPart.includes('.') ? lastPart : `document-${Date.now()}.pdf`;
        }

        let type = doc.mimeType || '';
        const ext = name.toLowerCase().split('.').pop() || '';
        if (!type || type === 'application/octet-stream' || type === '*/*') {
          if (ext === 'pdf') type = 'application/pdf';
          else if (ext === 'doc') type = 'application/msword';
          else if (ext === 'docx') type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          else if (ext === 'xls') type = 'application/vnd.ms-excel';
          else if (ext === 'xlsx') type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else type = 'application/pdf';
        }

        const validDocExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
        if (!validDocExts.includes(ext) && !type.includes('pdf') && !type.includes('msword') && !type.includes('officedocument') && !type.includes('excel')) {
          Alert.alert(
            isHindi ? 'असमर्थित फ़ाइल' : 'Unsupported File',
            isHindi
              ? 'कृपया PDF, Word, या Excel दस्तावेज़ चुनें।'
              : 'Please choose a PDF, Word, or Excel document.'
          );
          return;
        }

        onSelect({
          uri: doc.uri,
          name,
          type,
          size: fileSize,
          category: 'DOCUMENT',
          file: (doc as any).file,
        });
      } catch (err: unknown) {
        console.warn('[ChatAttachmentButton] Document pick error:', err);
        Alert.alert(
          isHindi ? 'त्रुटि' : 'Error',
          isHindi ? 'दस्तावेज़ चुनने में विफल। कृपया पुन: प्रयास करें।' : 'Failed to select document. Please try again.'
        );
      }
    });
  };

  return (
    <View>
      <TouchableOpacity
        style={[styles.attachButton, disabled && styles.disabled]}
        onPress={() => setIsModalOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={isHindi ? 'फ़ाइल संलग्न करें' : 'Attach file'}
      >
        <Typography variant="sm" color={theme.colors.textSecondary}>
          📎
        </Typography>
      </TouchableOpacity>

      <Modal
        visible={isModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsModalOpen(false)}
        >
          <View style={styles.menuContainer}>
            <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary} style={styles.menuTitle}>
              {isHindi ? 'फ़ाइल संलग्न करें' : 'Attach Media'}
            </Typography>

            <TouchableOpacity style={styles.menuItem} onPress={handlePickImage}>
              <View style={[styles.iconPill, { backgroundColor: '#E0F2FE' }]}>
                <Typography variant="sm">📷</Typography>
              </View>
              <View style={styles.menuTextCol}>
                <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
                  {isHindi ? 'फ़ोटो (Photos)' : 'Photo / Image'}
                </Typography>
                <Typography variant="xs" color={theme.colors.textSecondary}>
                  JPEG, PNG, WebP (Max 10MB)
                </Typography>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handlePickVideo}>
              <View style={[styles.iconPill, { backgroundColor: '#FEF3C7' }]}>
                <Typography variant="sm">🎥</Typography>
              </View>
              <View style={styles.menuTextCol}>
                <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
                  {isHindi ? 'वीडियो (Videos)' : 'Video clip'}
                </Typography>
                <Typography variant="xs" color={theme.colors.textSecondary}>
                  MP4, MOV (Max 50MB)
                </Typography>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handlePickDocument}>
              <View style={[styles.iconPill, { backgroundColor: '#F3E8FF' }]}>
                <Typography variant="sm">📄</Typography>
              </View>
              <View style={styles.menuTextCol}>
                <Typography variant="sm" weight="medium" color={theme.colors.textPrimary}>
                  {isHindi ? 'दस्तावेज़ (Document)' : 'Document'}
                </Typography>
                <Typography variant="xs" color={theme.colors.textSecondary}>
                  PDF, DOCX, XLSX (Max 20MB)
                </Typography>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setIsModalOpen(false)}
            >
              <Typography variant="sm" weight="medium" color={theme.colors.error}>
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </Typography>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  disabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: Platform.OS === 'ios' ? 24 : 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  menuTitle: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  iconPill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextCol: {
    flex: 1,
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
});

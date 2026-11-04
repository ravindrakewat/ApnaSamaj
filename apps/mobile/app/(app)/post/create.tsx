import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { PostType, PostMediaInput } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Input,
  Button,
  Badge,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { postsApi } from '../../../src/api/posts.api';
import {
  validatePostTitle,
  validatePostContent,
  validateImageAttachment,
} from '../../../src/utils/validation';

export default function CreatePostScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, t } = useLocalization();

  // Form State
  const [selectedType, setSelectedType] = useState<PostType>('GENERAL');
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');

  // Selected Image Attachment
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    name: string;
    type: string;
    size: number;
  } | null>(null);

  // Validation & Submission States
  const [titleError, setTitleError] = useState<string | undefined>();
  const [contentError, setContentError] = useState<string | undefined>();
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadStage, setUploadStage] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);

  // Pick Image from Gallery
  const handlePickImage = async () => {
    setImageError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          language === 'hi' ? 'अनुमति आवश्यक' : 'Permission Required',
          language === 'hi'
            ? 'फ़ोटो संलग्न करने के लिए मीडिया लाइब्रेरी तक पहुंच की अनुमति आवश्यक है।'
            : 'Permission to access media library is required to attach an image.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const size = asset.fileSize || 0;
        const mime = asset.mimeType || 'image/jpeg';

        // Validate size and format
        if (size > 0) {
          const validation = validateImageAttachment(size, mime, language);
          if (!validation.isValid) {
            setImageError(validation.error || 'Invalid image file.');
            return;
          }
        }

        setSelectedImage({
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          type: mime,
          size,
        });
      }
    } catch (err) {
      console.warn('[CreatePost] Image picker error:', err);
      setImageError(
        language === 'hi'
          ? 'छवि चुनने में विफल। कृपया पुनः प्रयास करें।'
          : 'Failed to select image. Please try again.'
      );
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImageError(null);
  };

  const handlePublish = async () => {
    if (isSubmittingRef.current) return;

    // Validate fields
    const titleVal = validatePostTitle(title, selectedType, language);
    const contentVal = validatePostContent(content, title, Boolean(selectedImage), language);

    setTitleError(titleVal.error);
    setContentError(contentVal.error);

    if (!titleVal.isValid || !contentVal.isValid) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let uploadedMedia: PostMediaInput[] = [];

      // 1. Upload attached image if present
      if (selectedImage) {
        setUploadStage(language === 'hi' ? 'छवि अपलोड हो रही है...' : 'Uploading image...');
        const uploadResult = await postsApi.uploadMedia({
          uri: selectedImage.uri,
          name: selectedImage.name,
          type: selectedImage.type,
        });

        uploadedMedia.push({
          url: uploadResult.url,
          mediaType: 'IMAGE',
          order: 0,
        });
      }

      // 2. Publish post via existing backend API
      setUploadStage(language === 'hi' ? 'पोस्ट प्रकाशित हो रही है...' : 'Publishing post...');
      await postsApi.createPost({
        title: title.trim() || undefined,
        content: content.trim(),
        type: selectedType,
        media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
      });

      // 3. Return to feed
      router.back();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'पोस्ट प्रकाशित करने में विफल। कृपया पुनः प्रयास करें।'
          : 'Failed to publish post. Please try again.';
      setSubmitError(msg);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setUploadStage(null);
    }
  };

  const isTitleRequired = selectedType === 'ANNOUNCEMENT' || selectedType === 'EVENT';
  const charsRemaining = 5000 - content.length;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Row with Back Button */}
        <View style={styles.topHeader}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Typography variant="sm" weight="semibold" color={theme.colors.primary}>
              {language === 'hi' ? '← वापस' : '← Back'}
            </Typography>
          </Pressable>

          <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
            {language === 'hi' ? 'नई पोस्ट बनाएं' : 'Create New Post'}
          </Typography>

          <View style={styles.backBtn} />
        </View>

        {/* Post Form Card */}
        <Card style={styles.formCard}>
          {/* Server Error Alert */}
          {submitError && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.errorLight,
                  borderColor: theme.colors.error,
                },
              ]}
            >
              <Typography variant="xs" weight="medium" color={theme.colors.error}>
                {submitError}
              </Typography>
            </View>
          )}

          {/* 1. Post Type Selector Chips */}
          <Typography variant="sm" weight="medium" style={styles.sectionLabel}>
            {language === 'hi' ? 'पोस्ट का प्रकार' : 'Post Category'}
          </Typography>
          <View style={styles.typeRow}>
            {(
              [
                { key: 'GENERAL' as PostType, hi: 'सामान्य', en: 'General' },
                { key: 'ANNOUNCEMENT' as PostType, hi: 'सूचना', en: 'Announcement' },
                { key: 'EVENT' as PostType, hi: 'आयोजन', en: 'Event' },
              ] as const
            ).map((item) => {
              const isSelected = selectedType === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setSelectedType(item.key);
                    if (titleError) setTitleError(undefined);
                  }}
                  style={[
                    styles.typeChip,
                    {
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <Typography
                    variant="xs"
                    weight="semibold"
                    color={isSelected ? theme.colors.textInverse : theme.colors.textPrimary}
                  >
                    {language === 'hi' ? item.hi : item.en}
                  </Typography>
                </Pressable>
              );
            })}
          </View>

          {/* 2. Post Title Input */}
          <Input
            label={
              isTitleRequired
                ? language === 'hi'
                  ? 'शीर्षक (आवश्यक) *'
                  : 'Title (Required) *'
                : language === 'hi'
                ? 'शीर्षक (वैकल्पिक)'
                : 'Title (Optional)'
            }
            value={title}
            onChangeText={(val) => {
              setTitle(val);
              if (titleError) setTitleError(undefined);
            }}
            placeholder={
              language === 'hi'
                ? 'पोस्ट का संक्षिप्त शीर्षक दर्ज करें...'
                : 'Enter post title...'
            }
            maxLength={150}
            error={titleError}
            helperText={
              isTitleRequired
                ? language === 'hi'
                  ? 'सूचना या आयोजन के लिए शीर्षक अनिवार्य है'
                  : 'Title is mandatory for announcements and events'
                : undefined
            }
          />

          {/* 3. Post Content Input */}
          <Input
            label={language === 'hi' ? 'संदेश / विवरण' : 'Content / Message'}
            value={content}
            onChangeText={(val) => {
              setContent(val);
              if (contentError) setContentError(undefined);
            }}
            placeholder={
              language === 'hi'
                ? 'समाज में क्या नया है? कोई अपडेट, विचार या सूचना साझा करें...'
                : "What's new in the community? Share an update, thoughts, or announcement..."
            }
            multiline
            numberOfLines={6}
            maxLength={5000}
            error={contentError}
            inputStyle={styles.contentInput}
            helperText={
              language === 'hi'
                ? `${charsRemaining} अक्षर शेष`
                : `${charsRemaining} characters left`
            }
          />

          {/* 4. Image Attachment Section */}
          <View style={styles.attachmentSection}>
            <Typography variant="sm" weight="medium" style={styles.attachmentLabel}>
              {language === 'hi' ? 'फोटो संलग्न करें (वैकल्पिक)' : 'Attach Photo (Optional)'}
            </Typography>

            {selectedImage ? (
              /* Selected Image Preview */
              <View style={[styles.previewContainer, { borderColor: theme.colors.border }]}>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
                <View style={styles.previewInfo}>
                  <Typography variant="xs" weight="medium" numberOfLines={1} style={styles.fileName}>
                    {selectedImage.name}
                  </Typography>
                  {selectedImage.size > 0 && (
                    <Typography variant="xs" color={theme.colors.textMuted}>
                      {(selectedImage.size / (1024 * 1024)).toFixed(2)} MB
                    </Typography>
                  )}
                </View>
                <Pressable
                  onPress={handleRemoveImage}
                  style={styles.removeBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Typography variant="xs" weight="bold" color={theme.colors.error}>
                    {language === 'hi' ? '✕ हटाएं' : '✕ Remove'}
                  </Typography>
                </Pressable>
              </View>
            ) : (
              /* Pick Photo Button */
              <Button
                title={language === 'hi' ? '📷 फोटो चुनें (अधिकतम 5MB)' : '📷 Choose Photo (Max 5MB)'}
                variant="outline"
                onPress={handlePickImage}
                style={styles.pickBtn}
              />
            )}

            {imageError && (
              <Typography variant="xs" color={theme.colors.error} style={styles.imageErrorText}>
                {imageError}
              </Typography>
            )}
          </View>

          {/* 5. Submit Button */}
          <Button
            title={
              uploadStage
                ? uploadStage
                : language === 'hi'
                ? 'पोस्ट प्रकाशित करें'
                : 'Publish Post'
            }
            onPress={handlePublish}
            loading={isSubmitting}
            disabled={isSubmitting}
            fullWidth
            style={styles.publishBtn}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    minWidth: 60,
    paddingVertical: 8,
  },
  formCard: {
    padding: 18,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentInput: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  attachmentSection: {
    marginTop: 4,
    marginBottom: 20,
  },
  attachmentLabel: {
    marginBottom: 8,
  },
  pickBtn: {
    borderStyle: 'dashed',
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  previewImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  previewInfo: {
    flex: 1,
    marginLeft: 10,
  },
  fileName: {
    marginBottom: 2,
  },
  removeBtn: {
    padding: 6,
  },
  imageErrorText: {
    marginTop: 6,
  },
  publishBtn: {
    marginTop: 8,
  },
});


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
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { PostType, PostMediaInput, UserRole } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Input,
  Button,
  Badge,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { postsApi } from '../../../src/api/posts.api';
import {
  validatePostTitle,
  validatePostContent,
  validateImageAttachment,
  validateVideoAttachment,
  PostCategoryType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_FILE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
} from '../../../src/utils/validation';
import { parseYouTubeUrl, ParsedYouTubeVideo } from '@apnasamaj/validation';

export interface UploadedImageItem {
  id: string;
  uri: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  isUploading: boolean;
  error?: string;
  file?: any;
}

export interface UploadedVideoItem {
  uri: string;
  name: string;
  type: string;
  size: number;
  durationSeconds?: number;
  url?: string;
  isUploading: boolean;
  uploadProgress: number;
  error?: string;
  file?: any;
}

const MAX_TOTAL_MEDIA = 4;

export default function CreatePostScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { user } = useAuth();
  const isHindi = language === 'hi';

  const isAdminOrMod =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.COMMUNITY_ADMIN ||
    user?.role === UserRole.MODERATOR;

  // Form State
  const [selectedCategory, setSelectedCategory] = useState<PostCategoryType>('GENERAL');
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');

  // Media Attachments
  const [mediaList, setMediaList] = useState<UploadedImageItem[]>([]);
  const [attachedVideo, setAttachedVideo] = useState<UploadedVideoItem | null>(null);

  // YouTube Attachment State
  const [youtubeInputOpen, setYoutubeInputOpen] = useState<boolean>(false);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState<string>('');
  const [attachedYoutubeVideo, setAttachedYoutubeVideo] = useState<ParsedYouTubeVideo | null>(null);
  const [youtubeInputError, setYoutubeInputError] = useState<string | null>(null);

  // Submission & Validation States
  const [titleError, setTitleError] = useState<string | undefined>();
  const [contentError, setContentError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isSubmittingRef = useRef(false);

  const totalMediaCount =
    mediaList.length +
    (attachedVideo ? 1 : 0) +
    (attachedYoutubeVideo ? 1 : 0);

  const isAnyMediaUploading =
    mediaList.some((m) => m.isUploading) || Boolean(attachedVideo?.isUploading);

  const hasMediaError =
    mediaList.some((m) => Boolean(m.error)) || Boolean(attachedVideo?.error);

  // ---------------------------------------------------------------------------
  // 1. Photo Picker & Upload
  // ---------------------------------------------------------------------------
  const uploadSingleImage = async (item: UploadedImageItem) => {
    try {
      const res = await postsApi.uploadMedia({
        uri: item.uri,
        name: item.name,
        type: item.type,
        file: item.file,
      });

      setMediaList((prev) =>
        prev.map((m) =>
          m.id === item.id ? { ...m, url: res.url, isUploading: false, error: undefined } : m
        )
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isHindi
          ? 'छवि अपलोड विफल रही'
          : 'Failed to upload image';
      setMediaList((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, isUploading: false, error: msg } : m))
      );
    }
  };

  const handlePickImages = async () => {
    if (totalMediaCount >= MAX_TOTAL_MEDIA) {
      Alert.alert(
        isHindi ? 'सीमा समाप्त' : 'Limit Reached',
        isHindi
          ? `आप एक पोस्ट में अधिकतम ${MAX_TOTAL_MEDIA} मीडिया आइटम जोड़ सकते हैं।`
          : `You can attach at most ${MAX_TOTAL_MEDIA} media items per post.`
      );
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          isHindi ? 'अनुमति आवश्यक' : 'Permission Required',
          isHindi
            ? 'फ़ोटो संलग्न करने के लिए मीडिया लाइब्रेरी तक पहुंच की अनुमति आवश्यक है।'
            : 'Permission to access media library is required to attach images.'
        );
        return;
      }

      const availableSlots = MAX_TOTAL_MEDIA - totalMediaCount;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: availableSlots,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAssets = result.assets.slice(0, availableSlots);
        const newItems: UploadedImageItem[] = [];

        for (const asset of selectedAssets) {
          const size = asset.fileSize || 0;
          const mime = asset.mimeType || 'image/jpeg';

          if (size > 0) {
            const validation = validateImageAttachment(size, mime, language);
            if (!validation.isValid) {
              Alert.alert(
                isHindi ? 'अमान्य फ़ाइल' : 'Invalid File',
                validation.error || 'Invalid image file.'
              );
              continue;
            }
          }

          const newItem: UploadedImageItem = {
            id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            uri: asset.uri,
            name: asset.fileName || `photo_${Date.now()}.jpg`,
            type: mime,
            size,
            isUploading: true,
            file: (asset as any).file,
          };

          newItems.push(newItem);
        }

        if (newItems.length > 0) {
          setMediaList((prev) => [...prev, ...newItems]);
          // Asynchronously upload each image
          newItems.forEach((item) => uploadSingleImage(item));
        }
      }
    } catch (err) {
      console.warn('[CreatePost] Pick images error:', err);
    }
  };

  const handleRemoveImage = (id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id));
  };

  const handleRetryImageUpload = (id: string) => {
    const item = mediaList.find((m) => m.id === id);
    if (!item) return;

    setMediaList((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isUploading: true, error: undefined } : m))
    );
    uploadSingleImage(item);
  };

  // ---------------------------------------------------------------------------
  // 2. Direct Video Picker & Upload
  // ---------------------------------------------------------------------------
  const uploadVideoFile = async (videoItem: UploadedVideoItem) => {
    try {
      const res = await postsApi.uploadVideo(
        {
          uri: videoItem.uri,
          name: videoItem.name,
          type: videoItem.type,
          file: videoItem.file,
        },
        (progress) => {
          setAttachedVideo((prev) => (prev ? { ...prev, uploadProgress: progress } : null));
        }
      );

      setAttachedVideo((prev) =>
        prev
          ? {
              ...prev,
              url: res.url,
              isUploading: false,
              uploadProgress: 100,
              error: undefined,
            }
          : null
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isHindi
          ? 'वीडियो अपलोड विफल रहा'
          : 'Failed to upload video';
      setAttachedVideo((prev) =>
        prev ? { ...prev, isUploading: false, error: msg } : null
      );
    }
  };

  const handlePickVideo = async () => {
    if (attachedVideo || attachedYoutubeVideo) {
      Alert.alert(
        isHindi ? 'वीडियो पहले से संलग्न है' : 'Video Already Attached',
        isHindi
          ? 'एक पोस्ट में केवल एक वीडियो (अपलोड या YouTube) संलग्न किया जा सकता है।'
          : 'Only one video (uploaded or YouTube) can be attached per post.'
      );
      return;
    }

    if (totalMediaCount >= MAX_TOTAL_MEDIA) {
      Alert.alert(
        isHindi ? 'सीमा समाप्त' : 'Limit Reached',
        isHindi
          ? `आप एक पोस्ट में अधिकतम ${MAX_TOTAL_MEDIA} मीडिया आइटम जोड़ सकते हैं।`
          : `You can attach at most ${MAX_TOTAL_MEDIA} media items per post.`
      );
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          isHindi ? 'अनुमति आवश्यक' : 'Permission Required',
          isHindi
            ? 'वीडियो संलग्न करने के लिए मीडिया लाइब्रेरी तक पहुंच की अनुमति आवश्यक है।'
            : 'Permission to access media library is required to attach a video.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const size = asset.fileSize || 0;
        const mime = asset.mimeType || 'video/mp4';
        const durationSec = asset.duration
          ? Math.round(asset.duration > 1000 ? asset.duration / 1000 : asset.duration)
          : undefined;

        // Validation
        const validation = validateVideoAttachment(size, durationSec, mime, language);
        if (!validation.isValid) {
          Alert.alert(
            isHindi ? 'अमान्य वीडियो' : 'Invalid Video',
            validation.error || 'Invalid video file.'
          );
          return;
        }

        const newVideo: UploadedVideoItem = {
          uri: asset.uri,
          name: asset.fileName || `video_${Date.now()}.mp4`,
          type: mime,
          size,
          durationSeconds: durationSec,
          isUploading: true,
          uploadProgress: 0,
          file: (asset as any).file,
        };

        setAttachedVideo(newVideo);
        uploadVideoFile(newVideo);
      }
    } catch (err) {
      console.warn('[CreatePost] Pick video error:', err);
    }
  };

  const handleRemoveVideo = () => {
    setAttachedVideo(null);
  };

  const handleRetryVideoUpload = () => {
    if (!attachedVideo) return;
    setAttachedVideo((prev) =>
      prev ? { ...prev, isUploading: true, error: undefined, uploadProgress: 0 } : null
    );
    uploadVideoFile(attachedVideo);
  };

  // ---------------------------------------------------------------------------
  // 3. YouTube URL Submission
  // ---------------------------------------------------------------------------
  const handleAddYouTubeVideo = () => {
    const trimmed = youtubeUrlInput.trim();
    if (!trimmed) {
      setYoutubeInputError(
        isHindi ? 'कृपया YouTube URL दर्ज करें' : 'Please enter a YouTube URL'
      );
      return;
    }

    const parsed = parseYouTubeUrl(trimmed);
    if (!parsed) {
      setYoutubeInputError(
        isHindi
          ? 'अमान्य YouTube URL। कृपया मान्य youtube.com या youtu.be लिंक दर्ज करें।'
          : 'Invalid YouTube URL. Please enter a valid youtube.com or youtu.be link.'
      );
      return;
    }

    setAttachedYoutubeVideo(parsed);
    setYoutubeUrlInput('');
    setYoutubeInputOpen(false);
    setYoutubeInputError(null);
  };

  const handleRemoveYouTubeVideo = () => {
    setAttachedYoutubeVideo(null);
    setYoutubeInputError(null);
  };

  // ---------------------------------------------------------------------------
  // 4. Publishing Logic & Parity with Web
  // ---------------------------------------------------------------------------
  const isTitleRequired =
    selectedCategory === 'ANNOUNCEMENT' ||
    selectedCategory === 'EVENT' ||
    selectedCategory === 'EMPLOYMENT' ||
    selectedCategory === 'GOVERNMENT_SCHEME' ||
    selectedCategory === 'MATRIMONIAL';

  const charsRemaining = 5000 - content.length;
  const titleCharsRemaining = 150 - title.length;

  const hasAnyContentOrMedia =
    title.trim().length > 0 ||
    content.trim().length > 0 ||
    mediaList.length > 0 ||
    Boolean(attachedVideo) ||
    Boolean(attachedYoutubeVideo);

  const canPublish =
    hasAnyContentOrMedia &&
    (!isTitleRequired || title.trim().length > 0) &&
    title.length <= 150 &&
    !isAnyMediaUploading &&
    !hasMediaError &&
    !isSubmitting;

  const handlePublish = async () => {
    if (isSubmittingRef.current || !canPublish) return;

    // Validate fields
    const titleVal = validatePostTitle(title, selectedCategory, language);
    const contentVal = validatePostContent(
      content,
      title,
      mediaList.length > 0 || Boolean(attachedVideo) || Boolean(attachedYoutubeVideo),
      language
    );

    setTitleError(titleVal.error);
    setContentError(contentVal.error);

    if (!titleVal.isValid || !contentVal.isValid) {
      return;
    }

    if (isAnyMediaUploading) {
      Alert.alert(
        isHindi ? 'अपलोड जारी है' : 'Upload in Progress',
        isHindi
          ? 'कृपया सभी मीडिया फ़ाइलों के अपलोड पूरा होने की प्रतीक्षा करें।'
          : 'Please wait for all media files to finish uploading.'
      );
      return;
    }

    if (hasMediaError) {
      Alert.alert(
        isHindi ? 'अपलोड त्रुटि' : 'Upload Error',
        isHindi
          ? 'कुछ मीडिया अपलोड विफल हो गए हैं। कृपया पुनः प्रयास करें या उन्हें हटा दें।'
          : 'Some media uploads failed. Please retry or remove them before publishing.'
      );
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Build assembled media list (Images + Video/YouTube)
      const validMedia: PostMediaInput[] = mediaList
        .filter((m) => m.url && !m.error)
        .map((m, idx) => ({
          url: m.url!,
          mediaType: 'IMAGE',
          order: idx,
        }));

      if (attachedVideo && attachedVideo.url) {
        validMedia.push({
          url: attachedVideo.url,
          mediaType: 'VIDEO',
          order: validMedia.length,
        });
      }

      if (attachedYoutubeVideo) {
        validMedia.push({
          url: attachedYoutubeVideo.embedUrl,
          thumbnail: attachedYoutubeVideo.thumbnailUrl,
          mediaType: 'VIDEO',
          order: validMedia.length,
        });
      }

      // 2. Map category to backend database PostType and structured title prefix
      let finalTitle: string | undefined = title.trim() || undefined;
      let finalType: PostType = 'GENERAL';

      if (selectedCategory === 'ANNOUNCEMENT') {
        finalType = 'ANNOUNCEMENT';
      } else if (selectedCategory === 'EVENT') {
        finalType = 'EVENT';
      } else if (selectedCategory === 'EMPLOYMENT') {
        finalType = 'GENERAL';
        if (finalTitle && !finalTitle.startsWith('[रोजगार') && !finalTitle.startsWith('[Employment')) {
          finalTitle = `[रोजगार / Employment] ${finalTitle}`.slice(0, 150);
        }
      } else if (selectedCategory === 'GOVERNMENT_SCHEME') {
        finalType = 'GENERAL';
        if (finalTitle && !finalTitle.startsWith('[सरकारी') && !finalTitle.startsWith('[Govt')) {
          finalTitle = `[सरकारी योजना / Govt Scheme] ${finalTitle}`.slice(0, 150);
        }
      } else if (selectedCategory === 'MATRIMONIAL') {
        finalType = 'GENERAL';
        if (finalTitle && !finalTitle.startsWith('[वैवाहिक') && !finalTitle.startsWith('[Matrimonial')) {
          finalTitle = `[वैवाहिक / Matrimonial] ${finalTitle}`.slice(0, 150);
        }
      }

      // 3. Call backend API
      await postsApi.createPost({
        title: finalTitle,
        content: content.trim(),
        type: finalType,
        media: validMedia.length > 0 ? validMedia : undefined,
      });

      // 4. Clear all form fields & attached media
      setTitle('');
      setContent('');
      setMediaList([]);
      setAttachedVideo(null);
      setAttachedYoutubeVideo(null);
      setSelectedCategory('GENERAL');
      setTitleError(undefined);
      setContentError(undefined);
      setSubmitError(null);

      // 5. Display success confirmation message
      const successMsg = isHindi
        ? '✅ आपकी पोस्ट सफलतापूर्वक प्रकाशित हो गई है!'
        : '✅ Post published successfully!';
      setSuccessMessage(successMsg);

      // 6. Seamlessly redirect back to feed after short delay for user feedback
      setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(app)' as any);
        }
      }, 1200);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : isHindi
          ? 'पोस्ट प्रकाशित करने में विफल। कृपया पुनः प्रयास करें।'
          : 'Failed to publish post. Please try again.';
      setSubmitError(msg);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

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
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(app)' as any);
              }
            }}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Typography variant="sm" weight="semibold" color={theme.colors.primary}>
              {isHindi ? '← वापस' : '← Back'}
            </Typography>
          </Pressable>

          <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
            {isHindi ? 'नई पोस्ट बनाएं' : 'Create New Post'}
          </Typography>

          <Pressable
            onPress={() => {
              setTitle('');
              setContent('');
              setMediaList([]);
              setAttachedVideo(null);
              setAttachedYoutubeVideo(null);
              setSelectedCategory('GENERAL');
              setTitleError(undefined);
              setContentError(undefined);
              setSubmitError(null);
              setSuccessMessage(null);
            }}
            style={styles.clearBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear fields"
          >
            <Typography variant="xs" color={theme.colors.textMuted}>
              {isHindi ? 'साफ़ करें' : 'Clear'}
            </Typography>
          </Pressable>
        </View>

        {/* Post Form Card */}
        <Card style={styles.formCard}>
          {/* Success Confirmation Banner */}
          {successMessage && (
            <View style={[styles.successBanner, { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }]}>
              <Typography variant="sm" weight="bold" color="#166534">
                {successMessage}
              </Typography>
              <Typography variant="xs" color="#15803D" style={{ marginTop: 2 }}>
                {isHindi ? 'फ़ीड पर रीडायरेक्ट किया जा रहा है...' : 'Redirecting to community feed...'}
              </Typography>
              <Pressable
                onPress={() => {
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/(app)' as any);
                  }
                }}
                style={styles.successActionBtn}
                accessibilityRole="button"
                accessibilityLabel="Go to feed"
              >
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  {isHindi ? 'फ़ीड देखें →' : 'View Feed →'}
                </Typography>
              </Pressable>
            </View>
          )}

          {/* Server / Publish Error Alert */}
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

          {/* User Author Row */}
          <View style={styles.authorRow}>
            <View style={[styles.avatarInitial, { backgroundColor: theme.colors.primary }]}>
              <Typography variant="sm" weight="bold" color={theme.colors.textInverse}>
                {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
              </Typography>
            </View>
            <View style={styles.authorMeta}>
              <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
                {user?.fullName || (isHindi ? 'समाज सदस्य' : 'Community Member')}
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted}>
                {isHindi ? 'अपने समाज के साथ साझा करें' : 'Share with community'}
              </Typography>
            </View>
          </View>

          {/* 1. Category Selector Chips */}
          <Typography variant="sm" weight="medium" style={styles.sectionLabel}>
            {isHindi ? 'पोस्ट का प्रकार चुनें' : 'Select Category'}
          </Typography>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {(
              [
                { key: 'GENERAL' as PostCategoryType, hi: '💬 सामान्य', en: '💬 General' },
                ...(isAdminOrMod
                  ? [{ key: 'ANNOUNCEMENT' as PostCategoryType, hi: '📢 सूचना', en: '📢 Announcement' }]
                  : []),
                { key: 'EVENT' as PostCategoryType, hi: '📅 आयोजन', en: '📅 Event' },
                { key: 'EMPLOYMENT' as PostCategoryType, hi: '💼 रोजगार', en: '💼 Employment' },
                { key: 'GOVERNMENT_SCHEME' as PostCategoryType, hi: '🏛️ सरकारी योजना', en: '🏛️ Govt Scheme' },
                { key: 'MATRIMONIAL' as PostCategoryType, hi: '💍 वैवाहिक', en: '💍 Matrimonial' },
              ] as const
            ).map((item) => {
              const isSelected = selectedCategory === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    setSelectedCategory(item.key);
                    setTitleError(undefined);
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
                    {isHindi ? item.hi : item.en}
                  </Typography>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Matrimonial Info Banner if selected */}
          {selectedCategory === 'MATRIMONIAL' && (
            <View style={[styles.infoBanner, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <Typography variant="xs" color="#0369A1">
                {isHindi
                  ? '💍 वैवाहिक सूचना: यहाँ सामान्य वैवाहिक विवरण या सूचना साझा करें। आधिकारिक बायोडाटा एवं फ़ोटो प्रोफ़ाइल बनाने के लिए नीचे वैवाहिक अनुभाग पर जाएं।'
                  : '💍 Matrimonial Notice: Share matrimonial announcements with the community. For a full verified matrimonial biodata profile, visit the Matrimonial tab.'}
              </Typography>
            </View>
          )}

          {/* 2. Title Input (Required for Announcements, Events, Employment, Govt Scheme, Matrimonial) */}
          <View style={styles.inputSection}>
            <View style={styles.labelRow}>
              <Typography variant="xs" weight="semibold" color={theme.colors.textSecondary}>
                {isHindi ? 'शीर्षक (Title)' : 'Title'}
                {isTitleRequired && (
                  <Typography variant="xs" color={theme.colors.error}>
                    {' *'}
                  </Typography>
                )}
              </Typography>
              <Typography
                variant="xs"
                color={titleCharsRemaining < 20 ? theme.colors.error : theme.colors.textMuted}
              >
                {titleCharsRemaining} {isHindi ? 'वर्ण शेष' : 'chars left'}
              </Typography>
            </View>

            <Input
              placeholder={
                selectedCategory === 'ANNOUNCEMENT'
                  ? isHindi ? 'सूचना का मुख्य विषय दर्ज करें *' : 'Enter announcement title *'
                  : selectedCategory === 'EVENT'
                  ? isHindi ? 'आयोजन का नाम दर्ज करें *' : 'Enter event title *'
                  : selectedCategory === 'EMPLOYMENT'
                  ? isHindi ? 'नौकरी / रोजगार का पद दर्ज करें *' : 'Enter job position / title *'
                  : selectedCategory === 'GOVERNMENT_SCHEME'
                  ? isHindi ? 'सरकारी योजना का नाम दर्ज करें *' : 'Enter government scheme name *'
                  : selectedCategory === 'MATRIMONIAL'
                  ? isHindi ? 'वैवाहिक सूचना शीर्षक दर्ज करें *' : 'Enter matrimonial notice title *'
                  : isHindi ? 'पोस्ट का शीर्षक (वैकल्पिक)' : 'Post title (optional)'
              }
              value={title}
              onChangeText={(text) => {
                if (text.length <= 150) {
                  setTitle(text);
                  if (titleError) setTitleError(undefined);
                }
              }}
              error={titleError}
              containerStyle={styles.textInput}
            />
          </View>

          {/* 3. Post Content Textarea */}
          <View style={styles.inputSection}>
            <View style={styles.labelRow}>
              <Typography variant="xs" weight="semibold" color={theme.colors.textSecondary}>
                {isHindi ? 'विवरण (Description)' : 'Description'}
              </Typography>
              <Typography
                variant="xs"
                color={charsRemaining < 200 ? theme.colors.error : theme.colors.textMuted}
              >
                {charsRemaining} {isHindi ? 'वर्ण शेष' : 'chars left'}
              </Typography>
            </View>

            <TextInput
              multiline
              numberOfLines={5}
              placeholder={
                isHindi
                  ? 'अपने विचार, जानकारी या विवरण यहाँ लिखें...'
                  : 'Write your thoughts, details or information here...'
              }
              placeholderTextColor={theme.colors.textMuted}
              value={content}
              onChangeText={(text) => {
                if (text.length <= 5000) {
                  setContent(text);
                  if (contentError) setContentError(undefined);
                }
              }}
              style={[
                styles.contentArea,
                {
                  borderColor: contentError ? theme.colors.error : theme.colors.border,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.surface,
                },
              ]}
              textAlignVertical="top"
            />
            {contentError && (
              <Typography variant="xs" color={theme.colors.error} style={styles.fieldError}>
                {contentError}
              </Typography>
            )}
          </View>

          {/* 4. Collapsible YouTube URL Input Box */}
          {youtubeInputOpen && !attachedYoutubeVideo && (
            <View style={[styles.youtubeInputContainer, { backgroundColor: '#F8FAFC', borderColor: theme.colors.border }]}>
              <View style={styles.youtubeHeaderRow}>
                <Typography variant="xs" weight="bold" color="#DC2626">
                  🔴 {isHindi ? 'YouTube वीडियो लिंक जोड़ें' : 'Attach YouTube Video'}
                </Typography>
                <Pressable onPress={() => setYoutubeInputOpen(false)} hitSlop={8}>
                  <Typography variant="xs" color={theme.colors.textMuted}>
                    ✕
                  </Typography>
                </Pressable>
              </View>

              <View style={styles.youtubeInputRow}>
                <Input
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrlInput}
                  onChangeText={(val) => {
                    setYoutubeUrlInput(val);
                    if (youtubeInputError) setYoutubeInputError(null);
                  }}
                  containerStyle={styles.youtubeField}
                  error={youtubeInputError || undefined}
                />
                <Button
                  title={isHindi ? 'जोड़ें' : 'Add'}
                  size="sm"
                  onPress={handleAddYouTubeVideo}
                  style={styles.addYtBtn}
                />
              </View>
            </View>
          )}

          {/* 5. Attached YouTube Video Preview Card */}
          {attachedYoutubeVideo && (
            <View style={[styles.mediaCard, { borderColor: theme.colors.border }]}>
              <Image
                source={{ uri: attachedYoutubeVideo.thumbnailUrl }}
                style={styles.ytThumb}
                resizeMode="cover"
              />
              <View style={styles.mediaDetails}>
                <Typography variant="xs" weight="bold" color="#DC2626">
                  🔴 YouTube
                </Typography>
                <Typography variant="xs" color={theme.colors.textPrimary} numberOfLines={1}>
                  ID: {attachedYoutubeVideo.videoId}
                </Typography>
                {attachedYoutubeVideo.startTimeSeconds !== undefined && (
                  <Typography variant="xs" color={theme.colors.textMuted}>
                    {isHindi ? `शुरुआत: ${attachedYoutubeVideo.startTimeSeconds}s` : `Starts at: ${attachedYoutubeVideo.startTimeSeconds}s`}
                  </Typography>
                )}
              </View>
              <Pressable
                onPress={handleRemoveYouTubeVideo}
                style={styles.removeMediaBtn}
                accessibilityRole="button"
                accessibilityLabel="Remove YouTube video"
              >
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  ✕
                </Typography>
              </Pressable>
            </View>
          )}

          {/* 6. Attached Direct Video Preview Card with Progress & Retry */}
          {attachedVideo && (
            <View style={[styles.videoPreviewCard, { borderColor: attachedVideo.error ? theme.colors.error : theme.colors.border }]}>
              <View style={styles.videoCardTop}>
                <View style={styles.videoIconPlaceholder}>
                  <Typography variant="md" color="#FFFFFF">
                    ▶
                  </Typography>
                </View>

                <View style={styles.mediaDetails}>
                  <Typography variant="xs" weight="bold" color={theme.colors.primary}>
                    🎥 {isHindi ? 'वीडियो संलग्न है' : 'Video Attached'}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textPrimary} numberOfLines={1}>
                    {attachedVideo.name}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textMuted}>
                    {(attachedVideo.size / (1024 * 1024)).toFixed(1)} MB
                    {attachedVideo.durationSeconds !== undefined && ` · ${Math.floor(attachedVideo.durationSeconds / 60)}:${String(attachedVideo.durationSeconds % 60).padStart(2, '0')}`}
                  </Typography>
                </View>

                <Pressable
                  onPress={handleRemoveVideo}
                  style={styles.removeMediaBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Remove video"
                >
                  <Typography variant="xs" weight="bold" color="#FFFFFF">
                    ✕
                  </Typography>
                </Pressable>
              </View>

              {/* Upload Progress Bar */}
              {attachedVideo.isUploading && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${attachedVideo.uploadProgress}%`, backgroundColor: theme.colors.primary },
                      ]}
                    />
                  </View>
                  <Typography variant="xs" color={theme.colors.textMuted} style={styles.progressLabel}>
                    {isHindi ? `अपलोड हो रहा है: ${attachedVideo.uploadProgress}%` : `Uploading: ${attachedVideo.uploadProgress}%`}
                  </Typography>
                </View>
              )}

              {/* Upload Error & Retry */}
              {attachedVideo.error && (
                <View style={styles.errorRetryRow}>
                  <Typography variant="xs" color={theme.colors.error} style={{ flex: 1 }}>
                    {attachedVideo.error}
                  </Typography>
                  <Button
                    title={isHindi ? 'पुनः प्रयास' : 'Retry'}
                    size="sm"
                    variant="outline"
                    onPress={handleRetryVideoUpload}
                  />
                </View>
              )}
            </View>
          )}

          {/* 7. Attached Images Grid Preview (Up to 4 images) */}
          {mediaList.length > 0 && (
            <View style={styles.imageGridContainer}>
              <Typography variant="xs" weight="semibold" color={theme.colors.textSecondary} style={{ marginBottom: 6 }}>
                {isHindi ? `संलग्न फ़ोटो (${mediaList.length}/4)` : `Attached Photos (${mediaList.length}/4)`}
              </Typography>
              <View style={styles.imageGrid}>
                {mediaList.map((item) => (
                  <View key={item.id} style={styles.imageGridItem}>
                    <Image source={{ uri: item.uri }} style={styles.gridImage} resizeMode="cover" />

                    {/* Upload Spinner Overlay */}
                    {item.isUploading && (
                      <View style={styles.imageUploadingOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    )}

                    {/* Error Overlay with Retry */}
                    {item.error && (
                      <View style={styles.imageErrorOverlay}>
                        <Pressable onPress={() => handleRetryImageUpload(item.id)} style={styles.retryImageBtn}>
                          <Typography variant="xs" weight="bold" color="#FFFFFF">
                            ↻ {isHindi ? 'पुनः' : 'Retry'}
                          </Typography>
                        </Pressable>
                      </View>
                    )}

                    {/* Remove Button */}
                    <Pressable
                      onPress={() => handleRemoveImage(item.id)}
                      style={styles.removeImagePill}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <Typography variant="xs" weight="bold" color="#FFFFFF">
                        ✕
                      </Typography>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 8. Media Attachment Buttons Row */}
          <View style={[styles.mediaToolbar, { borderTopColor: theme.colors.border }]}>
            <View style={styles.toolbarButtons}>
              {/* Photo Picker Button */}
              <Pressable
                onPress={handlePickImages}
                disabled={isSubmitting || totalMediaCount >= MAX_TOTAL_MEDIA}
                style={[
                  styles.toolbarBtn,
                  totalMediaCount >= MAX_TOTAL_MEDIA && styles.btnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Attach photo"
              >
                <Typography variant="xs" weight="semibold" color={totalMediaCount >= MAX_TOTAL_MEDIA ? theme.colors.textMuted : theme.colors.primary}>
                  📷 {isHindi ? `फ़ोटो (${mediaList.length}/4)` : `Photo (${mediaList.length}/4)`}
                </Typography>
              </Pressable>

              {/* Video Picker Button */}
              <Pressable
                onPress={handlePickVideo}
                disabled={isSubmitting || Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA}
                style={[
                  styles.toolbarBtn,
                  (Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA) && styles.btnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Attach video"
              >
                <Typography
                  variant="xs"
                  weight="semibold"
                  color={
                    Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA
                      ? theme.colors.textMuted
                      : theme.colors.primary
                  }
                >
                  🎥 {isHindi ? 'वीडियो' : 'Video'}
                </Typography>
              </Pressable>

              {/* YouTube Link Button */}
              <Pressable
                onPress={() => {
                  if (!attachedYoutubeVideo && !attachedVideo) {
                    setYoutubeInputOpen((prev) => !prev);
                  }
                }}
                disabled={isSubmitting || Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA}
                style={[
                  styles.toolbarBtn,
                  (Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA) && styles.btnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Attach YouTube link"
              >
                <Typography
                  variant="xs"
                  weight="semibold"
                  color={
                    Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA
                      ? theme.colors.textMuted
                      : '#DC2626'
                  }
                >
                  🔴 YouTube
                </Typography>
              </Pressable>
            </View>
          </View>

          {/* 9. Publish Button */}
          <Button
            title={
              isSubmitting
                ? isHindi ? 'प्रकाशित हो रहा है...' : 'Publishing...'
                : isHindi ? 'पोस्ट प्रकाशित करें' : 'Publish Post'
            }
            onPress={handlePublish}
            disabled={!canPublish}
            loading={isSubmitting}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 60,
  },
  clearBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'flex-end',
    minWidth: 60,
  },
  formCard: {
    padding: 16,
  },
  successBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  successActionBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  avatarInitial: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorMeta: {
    flex: 1,
  },
  sectionLabel: {
    marginBottom: 8,
  },
  categoryScroll: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 14,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  infoBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  inputSection: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  textInput: {
    marginBottom: 0,
  },
  contentArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 110,
  },
  fieldError: {
    marginTop: 4,
  },
  youtubeInputContainer: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  youtubeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  youtubeInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  youtubeField: {
    flex: 1,
    marginBottom: 0,
  },
  addYtBtn: {
    minHeight: 42,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    gap: 10,
  },
  ytThumb: {
    width: 90,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#000000',
  },
  mediaDetails: {
    flex: 1,
    gap: 2,
  },
  removeMediaBtn: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  videoPreviewCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  videoCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  videoIconPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  progressLabel: {
    marginTop: 4,
    textAlign: 'right',
  },
  errorRetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  imageGridContainer: {
    marginBottom: 14,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageGridItem: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  imageUploadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageErrorOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(220,38,38,0.85)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  retryImageBtn: {
    paddingHorizontal: 8,
  },
  removeImagePill: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaToolbar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginBottom: 16,
  },
  toolbarButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  toolbarBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  publishBtn: {
    marginTop: 4,
  },
});

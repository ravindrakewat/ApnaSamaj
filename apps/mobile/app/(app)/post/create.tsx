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

  // Focus States
  const [isTitleFocused, setIsTitleFocused] = useState<boolean>(false);
  const [isContentFocused, setIsContentFocused] = useState<boolean>(false);

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

  const hasFormContent =
    title.trim().length > 0 ||
    content.trim().length > 0 ||
    mediaList.length > 0 ||
    Boolean(attachedVideo) ||
    Boolean(attachedYoutubeVideo);

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

  const handleClearAll = () => {
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
    setYoutubeInputOpen(false);
  };

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

      // 6. Seamlessly redirect back to feed after short delay
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

  // Category Configuration Data
  const categoriesList = [
    {
      key: 'GENERAL' as PostCategoryType,
      hi: 'सामान्य',
      en: 'General',
      icon: '💬',
      subHi: 'विचार व चर्चा',
      subEn: 'Discussions',
      color: '#0284C7',
      bgLight: '#E0F2FE',
    },
    ...(isAdminOrMod
      ? [
          {
            key: 'ANNOUNCEMENT' as PostCategoryType,
            hi: 'सूचना',
            en: 'Announcement',
            icon: '📢',
            subHi: 'आधिकारिक घोषणा',
            subEn: 'Official Notice',
            color: '#DC2626',
            bgLight: '#FEE2E2',
          },
        ]
      : []),
    {
      key: 'EVENT' as PostCategoryType,
      hi: 'आयोजन',
      en: 'Event',
      icon: '📅',
      subHi: 'समारोह व बैठक',
      subEn: 'Events & Meetings',
      color: '#059669',
      bgLight: '#D1FAE5',
    },
    {
      key: 'EMPLOYMENT' as PostCategoryType,
      hi: 'रोजगार',
      en: 'Employment',
      icon: '💼',
      subHi: 'नौकरी व अवसर',
      subEn: 'Jobs & Careers',
      color: '#7C3AED',
      bgLight: '#EDE9FE',
    },
    {
      key: 'GOVERNMENT_SCHEME' as PostCategoryType,
      hi: 'सरकारी योजना',
      en: 'Govt Scheme',
      icon: '🏛️',
      subHi: 'कल्याणकारी योजनाएं',
      subEn: 'Welfare Schemes',
      color: '#0D9488',
      bgLight: '#CCFBF1',
    },
    {
      key: 'MATRIMONIAL' as PostCategoryType,
      hi: 'वैवाहिक',
      en: 'Matrimonial',
      icon: '💍',
      subHi: 'रिश्ते व बायोडाटा',
      subEn: 'Match & Biodata',
      color: '#DB2777',
      bgLight: '#FCE7F3',
    },
  ] as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      {/* 1. Modern Header Bar */}
      <View style={[styles.navHeader, { paddingTop: Math.max(insets.top, 12), backgroundColor: theme.colors.surface }]}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(app)' as any);
            }
          }}
          style={styles.backButtonPill}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Typography variant="sm" weight="bold" color={theme.colors.primary}>
            {isHindi ? '← वापस' : '← Back'}
          </Typography>
        </Pressable>

        <View style={styles.headerCenter}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
            {isHindi ? 'नई पोस्ट बनाएं' : 'Create Post'}
          </Typography>
          <Typography variant="xs" color={theme.colors.textMuted} style={styles.communityScopeText}>
            {isHindi ? '🌍 अपना समाज फ़ीड' : '🌍 Apna Samaj Feed'}
          </Typography>
        </View>

        <Pressable
          onPress={handleClearAll}
          disabled={!hasFormContent}
          style={[styles.clearButtonPill, !hasFormContent && styles.clearButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Clear form"
          hitSlop={8}
        >
          <Typography
            variant="xs"
            weight="semibold"
            color={hasFormContent ? theme.colors.error : theme.colors.textMuted}
          >
            {isHindi ? 'साफ़ करें' : 'Clear'}
          </Typography>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 80 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Success Confirmation Banner */}
        {successMessage && (
          <View style={styles.successBanner}>
            <View style={styles.successIconCircle}>
              <Typography variant="md" color="#166534">
                ✓
              </Typography>
            </View>
            <View style={styles.successTextContainer}>
              <Typography variant="sm" weight="bold" color="#166534">
                {successMessage}
              </Typography>
              <Typography variant="xs" color="#15803D" style={{ marginTop: 2 }}>
                {isHindi ? 'फ़ीड पर रीडायरेक्ट किया जा रहा है...' : 'Redirecting to community feed...'}
              </Typography>
            </View>
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
                {isHindi ? 'देखें →' : 'View →'}
              </Typography>
            </Pressable>
          </View>
        )}

        {/* Server / Publish Error Alert */}
        {submitError && (
          <View style={[styles.errorBanner, { backgroundColor: theme.colors.errorLight, borderColor: theme.colors.error }]}>
            <Typography variant="sm" color={theme.colors.error} style={{ marginRight: 6 }}>
              ⚠️
            </Typography>
            <Typography variant="xs" weight="medium" color={theme.colors.error} style={{ flex: 1 }}>
              {submitError}
            </Typography>
          </View>
        )}

        {/* Author Info Bar */}
        <View style={[styles.authorCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={[styles.avatarInitial, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="md" weight="bold" color={theme.colors.textInverse}>
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
            </Typography>
          </View>
          <View style={styles.authorMeta}>
            <View style={styles.authorNameRow}>
              <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
                {user?.fullName || (isHindi ? 'समाज सदस्य' : 'Community Member')}
              </Typography>
              {isAdminOrMod && (
                <View style={styles.roleBadgeContainer}>
                  <Badge
                    label={isHindi ? 'प्रशासक' : 'Admin'}
                    variant="info"
                    size="sm"
                  />
                </View>
              )}
            </View>
            <View style={styles.audienceRow}>
              <Typography variant="xs" color={theme.colors.textSecondary}>
                {isHindi ? 'समाज के साथ साझा कर रहे हैं • 🌐 सार्वजनिक' : 'Sharing with community • 🌐 Public'}
              </Typography>
            </View>
          </View>
        </View>

        {/* 2. Modern Post Type Selectable Cards */}
        <View style={styles.sectionHeaderRow}>
          <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
            {isHindi ? 'पोस्ट का प्रकार चुनें' : 'Select Post Type'}
          </Typography>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {isHindi ? 'आवश्यकतानुसार चुनें' : 'Choose category'}
          </Typography>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryCardsScroll}
        >
          {categoriesList.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => {
                  setSelectedCategory(cat.key);
                  setTitleError(undefined);
                }}
                style={[
                  styles.categoryCard,
                  {
                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    backgroundColor: isSelected ? '#EFF6FF' : theme.colors.surface,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                {/* Checkmark badge for selected state */}
                {isSelected && (
                  <View style={[styles.categoryCheckBadge, { backgroundColor: theme.colors.primary }]}>
                    <Typography variant="xs" weight="bold" color="#FFFFFF" style={{ fontSize: 9 }}>
                      ✓
                    </Typography>
                  </View>
                )}

                <View style={[styles.categoryIconCircle, { backgroundColor: cat.bgLight }]}>
                  <Typography variant="md">{cat.icon}</Typography>
                </View>

                <Typography
                  variant="sm"
                  weight={isSelected ? 'bold' : 'semibold'}
                  color={isSelected ? theme.colors.primaryDark : theme.colors.textPrimary}
                  style={styles.categoryCardTitle}
                  numberOfLines={1}
                >
                  {isHindi ? cat.hi : cat.en}
                </Typography>

                <Typography
                  variant="xs"
                  color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                  style={styles.categoryCardSubtitle}
                  numberOfLines={1}
                >
                  {isHindi ? cat.subHi : cat.subEn}
                </Typography>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 3. Category-Specific Guidance Banner */}
        {selectedCategory === 'ANNOUNCEMENT' && (
          <View style={[styles.guidanceBanner, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Typography variant="md" style={styles.guidanceIcon}>
              📢
            </Typography>
            <View style={styles.guidanceTextCol}>
              <Typography variant="xs" weight="bold" color="#991B1B">
                {isHindi ? 'आधिकारिक सूचना (Official Announcement)' : 'Official Announcement'}
              </Typography>
              <Typography variant="xs" color="#B91C1C" style={styles.guidanceDesc}>
                {isHindi
                  ? 'यह सूचना समाज के सभी सदस्यों को प्राथमिकता के साथ प्रदर्शित होगी। कृपया आधिकारिक व सटीक जानकारी ही दें।'
                  : 'This notice will be highlighted for all community members. Please ensure accurate official information.'}
              </Typography>
            </View>
          </View>
        )}

        {selectedCategory === 'EVENT' && (
          <View style={[styles.guidanceBanner, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
            <Typography variant="md" style={styles.guidanceIcon}>
              📅
            </Typography>
            <View style={styles.guidanceTextCol}>
              <Typography variant="xs" weight="bold" color="#166534">
                {isHindi ? 'आयोजन व समारोह (Community Event)' : 'Community Event'}
              </Typography>
              <Typography variant="xs" color="#15803D" style={styles.guidanceDesc}>
                {isHindi
                  ? 'कृपया शीर्षक में कार्यक्रम का नाम तथा विवरण में दिनांक, समय, मुख्य अतिथि व आयोजन स्थल (Venue) का उल्लेख करें।'
                  : 'Please include the event name in the title, and specify the date, time, venue, and chief guests in the description.'}
              </Typography>
            </View>
          </View>
        )}

        {selectedCategory === 'EMPLOYMENT' && (
          <View style={[styles.guidanceBanner, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
            <Typography variant="md" style={styles.guidanceIcon}>
              💼
            </Typography>
            <View style={styles.guidanceTextCol}>
              <Typography variant="xs" weight="bold" color="#5B21B6">
                {isHindi ? 'रोजगार व भर्ती अवसर (Employment & Job Opportunity)' : 'Employment & Job Opportunity'}
              </Typography>
              <Typography variant="xs" color="#6D28D9" style={styles.guidanceDesc}>
                {isHindi
                  ? 'कृपया पद का नाम, आवश्यक शैक्षणिक योग्यता, अनुभव, कार्य स्थल एवं आवेदन/संपर्क का तरीका विवरण में अवश्य लिखें।'
                  : 'Please clearly state the job position, required qualifications, location, salary range, and contact details.'}
              </Typography>
            </View>
          </View>
        )}

        {selectedCategory === 'GOVERNMENT_SCHEME' && (
          <View style={[styles.guidanceBanner, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
            <Typography variant="md" style={styles.guidanceIcon}>
              🏛️
            </Typography>
            <View style={styles.guidanceTextCol}>
              <Typography variant="xs" weight="bold" color="#115E59">
                {isHindi ? 'सरकारी योजना सहायता (Government Welfare Scheme)' : 'Government Welfare Scheme'}
              </Typography>
              <Typography variant="xs" color="#0F766E" style={styles.guidanceDesc}>
                {isHindi
                  ? 'योजना का नाम, मिलने वाले लाभ, आवश्यक दस्तावेज (Aadhaar, आय प्रमाण आदि) एवं आवेदन की अंतिम तिथि साझा करें।'
                  : 'Share scheme benefits, eligibility criteria, required documents, and official application process.'}
              </Typography>
            </View>
          </View>
        )}

        {selectedCategory === 'MATRIMONIAL' && (
          <View style={[styles.guidanceBanner, { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' }]}>
            <Typography variant="md" style={styles.guidanceIcon}>
              💍
            </Typography>
            <View style={styles.guidanceTextCol}>
              <Typography variant="xs" weight="bold" color="#9D174D">
                {isHindi ? 'वैवाहिक सूचना (Matrimonial Notice)' : 'Matrimonial Notice'}
              </Typography>
              <Typography variant="xs" color="#BE185D" style={styles.guidanceDesc}>
                {isHindi
                  ? 'यहाँ सामान्य वैवाहिक सूचना साझा करें। यदि आप विस्तृत बायोडाटा, कुंडली एवं पारिवारिक विवरण के साथ प्रोफ़ाइल बनाना चाहते हैं, तो वैवाहिक अनुभाग का उपयोग करें।'
                  : 'Share general matrimonial announcements here. For an official biodata profile with photos and horoscope, use the Matrimonial section.'}
              </Typography>
            </View>
          </View>
        )}

        {/* 4. Title Input Section */}
        <View style={[styles.cardSection, { backgroundColor: theme.colors.surface, borderColor: titleError ? theme.colors.error : isTitleFocused ? theme.colors.primary : theme.colors.border }]}>
          <View style={styles.fieldHeaderRow}>
            <View style={styles.fieldLabelContainer}>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary}>
                {isHindi ? 'शीर्षक' : 'Title'}
              </Typography>
              <View
                style={[
                  styles.requiredBadgePill,
                  { backgroundColor: isTitleRequired ? '#FEE2E2' : '#F1F5F9' },
                ]}
              >
                <Typography
                  variant="xs"
                  weight="bold"
                  color={isTitleRequired ? '#DC2626' : theme.colors.textMuted}
                  style={{ fontSize: 10 }}
                >
                  {isTitleRequired
                    ? isHindi ? 'आवश्यक *' : 'Required *'
                    : isHindi ? 'वैकल्पिक' : 'Optional'}
                </Typography>
              </View>
            </View>

            <Typography
              variant="xs"
              weight="medium"
              color={titleCharsRemaining < 20 ? theme.colors.error : theme.colors.textMuted}
            >
              {title.length}/150
            </Typography>
          </View>

          <TextInput
            placeholder={
              selectedCategory === 'ANNOUNCEMENT'
                ? isHindi ? 'सूचना का मुख्य विषय दर्ज करें *' : 'Enter announcement title *'
                : selectedCategory === 'EVENT'
                ? isHindi ? 'आयोजन का नाम दर्ज करें *' : 'Enter event title *'
                : selectedCategory === 'EMPLOYMENT'
                ? isHindi ? 'नौकरी / पद का नाम दर्ज करें *' : 'Enter job position / title *'
                : selectedCategory === 'GOVERNMENT_SCHEME'
                ? isHindi ? 'सरकारी योजना का नाम दर्ज करें *' : 'Enter government scheme name *'
                : selectedCategory === 'MATRIMONIAL'
                ? isHindi ? 'वैवाहिक सूचना शीर्षक दर्ज करें *' : 'Enter matrimonial notice title *'
                : isHindi ? 'पोस्ट का शीर्षक (वैकल्पिक)' : 'Post title (optional)'
            }
            placeholderTextColor={theme.colors.textMuted}
            value={title}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={() => setIsTitleFocused(false)}
            onChangeText={(text) => {
              if (text.length <= 150) {
                setTitle(text);
                if (titleError) setTitleError(undefined);
              }
            }}
            style={[
              styles.titleInputField,
              { color: theme.colors.textPrimary },
            ]}
            maxLength={150}
          />

          {titleError && (
            <View style={styles.inlineErrorRow}>
              <Typography variant="xs" color={theme.colors.error} style={{ marginRight: 4 }}>
                ⚠️
              </Typography>
              <Typography variant="xs" weight="medium" color={theme.colors.error}>
                {titleError}
              </Typography>
            </View>
          )}
        </View>

        {/* 5. Description Input Section */}
        <View style={[styles.cardSection, { backgroundColor: theme.colors.surface, borderColor: contentError ? theme.colors.error : isContentFocused ? theme.colors.primary : theme.colors.border }]}>
          <View style={styles.fieldHeaderRow}>
            <View style={styles.fieldLabelContainer}>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary}>
                {isHindi ? 'विवरण' : 'Description'}
              </Typography>
            </View>

            <Typography
              variant="xs"
              weight="medium"
              color={charsRemaining < 200 ? theme.colors.error : theme.colors.textMuted}
            >
              {content.length}/5000
            </Typography>
          </View>

          <TextInput
            multiline
            numberOfLines={6}
            placeholder={
              isHindi
                ? 'अपने विचार, जानकारी या विवरण यहाँ विस्तार से लिखें...'
                : 'Write your thoughts, details or information here in detail...'
            }
            placeholderTextColor={theme.colors.textMuted}
            value={content}
            onFocus={() => setIsContentFocused(true)}
            onBlur={() => setIsContentFocused(false)}
            onChangeText={(text) => {
              if (text.length <= 5000) {
                setContent(text);
                if (contentError) setContentError(undefined);
              }
            }}
            style={[
              styles.contentInputField,
              { color: theme.colors.textPrimary },
            ]}
            textAlignVertical="top"
            maxLength={5000}
          />

          {contentError && (
            <View style={styles.inlineErrorRow}>
              <Typography variant="xs" color={theme.colors.error} style={{ marginRight: 4 }}>
                ⚠️
              </Typography>
              <Typography variant="xs" weight="medium" color={theme.colors.error}>
                {contentError}
              </Typography>
            </View>
          )}

          <View style={styles.editorFooterHintRow}>
            <Typography variant="xs" color={theme.colors.textMuted}>
              {isHindi ? '💡 विनम्र व उपयोगी जानकारी साझा करें' : '💡 Share clear and helpful information'}
            </Typography>
          </View>
        </View>

        {/* 6. Media Attachment Section */}
        <View style={[styles.mediaCardContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={styles.mediaSectionHeader}>
            <View style={styles.mediaTitleRow}>
              <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
                {isHindi ? 'मीडिया जोड़ें' : 'Attach Media'}
              </Typography>
              <View style={[styles.mediaCountBadge, { backgroundColor: theme.colors.primaryLight }]}>
                <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
                  {totalMediaCount}/4
                </Typography>
              </View>
            </View>

            <Typography variant="xs" color={theme.colors.textMuted}>
              {isHindi ? 'फ़ोटो • वीडियो • YouTube' : 'Photos • Video • YouTube'}
            </Typography>
          </View>

          {/* Quick Action Tiles */}
          <View style={styles.mediaTilesRow}>
            {/* 1. Photos Tile */}
            <Pressable
              onPress={handlePickImages}
              disabled={isSubmitting || totalMediaCount >= MAX_TOTAL_MEDIA}
              style={[
                styles.mediaActionTile,
                totalMediaCount >= MAX_TOTAL_MEDIA && styles.tileDisabled,
                { borderColor: theme.colors.border },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Attach photos"
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#E0F2FE' }]}>
                <Typography variant="md">📷</Typography>
              </View>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary}>
                {isHindi ? 'फ़ोटो' : 'Photo'}
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.tileSubtext}>
                {mediaList.length > 0 ? `${mediaList.length}/4` : (isHindi ? 'अधिकतम 4' : 'Max 4')}
              </Typography>
            </Pressable>

            {/* 2. Direct Video Tile */}
            <Pressable
              onPress={handlePickVideo}
              disabled={
                isSubmitting ||
                Boolean(attachedVideo) ||
                Boolean(attachedYoutubeVideo) ||
                totalMediaCount >= MAX_TOTAL_MEDIA
              }
              style={[
                styles.mediaActionTile,
                (Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA) &&
                  styles.tileDisabled,
                { borderColor: theme.colors.border },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Attach video"
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#F3E8FF' }]}>
                <Typography variant="md">🎥</Typography>
              </View>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary}>
                {isHindi ? 'वीडियो' : 'Video'}
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.tileSubtext}>
                {attachedVideo ? (isHindi ? 'संलग्न है' : 'Attached') : (isHindi ? '30MB · 90s' : '30MB · 90s')}
              </Typography>
            </Pressable>

            {/* 3. YouTube Link Tile */}
            <Pressable
              onPress={() => {
                if (!attachedYoutubeVideo && !attachedVideo) {
                  setYoutubeInputOpen((prev) => !prev);
                }
              }}
              disabled={
                isSubmitting ||
                Boolean(attachedVideo) ||
                Boolean(attachedYoutubeVideo) ||
                totalMediaCount >= MAX_TOTAL_MEDIA
              }
              style={[
                styles.mediaActionTile,
                (Boolean(attachedVideo) || Boolean(attachedYoutubeVideo) || totalMediaCount >= MAX_TOTAL_MEDIA) &&
                  styles.tileDisabled,
                { borderColor: theme.colors.border },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Attach YouTube link"
            >
              <View style={[styles.tileIconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Typography variant="md">🔴</Typography>
              </View>
              <Typography variant="xs" weight="bold" color="#DC2626">
                YouTube
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.tileSubtext}>
                {attachedYoutubeVideo ? (isHindi ? 'संलग्न है' : 'Attached') : (isHindi ? 'लिंक जोड़ें' : 'Embed')}
              </Typography>
            </Pressable>
          </View>

          {/* YouTube Input Box (Expandable) */}
          {youtubeInputOpen && !attachedYoutubeVideo && (
            <View style={[styles.youtubeCardBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
              <View style={styles.youtubeCardHeader}>
                <View style={styles.ytHeaderLeft}>
                  <Typography variant="sm" color="#DC2626" style={{ marginRight: 6 }}>
                    🔴
                  </Typography>
                  <Typography variant="xs" weight="bold" color="#991B1B">
                    {isHindi ? 'YouTube वीडियो लिंक दर्ज करें' : 'Enter YouTube Video URL'}
                  </Typography>
                </View>
                <Pressable onPress={() => setYoutubeInputOpen(false)} hitSlop={8}>
                  <Typography variant="xs" weight="bold" color="#991B1B">
                    ✕
                  </Typography>
                </Pressable>
              </View>

              <View style={styles.youtubeInputGroup}>
                <TextInput
                  placeholder="https://www.youtube.com/watch?v=..."
                  placeholderTextColor="#F87171"
                  value={youtubeUrlInput}
                  onChangeText={(val) => {
                    setYoutubeUrlInput(val);
                    if (youtubeInputError) setYoutubeInputError(null);
                  }}
                  style={[
                    styles.ytUrlInput,
                    { borderColor: youtubeInputError ? theme.colors.error : '#FCA5A5' },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Button
                  title={isHindi ? 'जोड़ें' : 'Add'}
                  size="sm"
                  onPress={handleAddYouTubeVideo}
                  style={styles.ytAddButton}
                />
              </View>

              {youtubeInputError && (
                <Typography variant="xs" color={theme.colors.error} style={{ marginTop: 4 }}>
                  {youtubeInputError}
                </Typography>
              )}
            </View>
          )}

          {/* Attached YouTube Preview Card */}
          {attachedYoutubeVideo && (
            <View style={[styles.attachedYtCard, { borderColor: '#FCA5A5' }]}>
              <Image
                source={{ uri: attachedYoutubeVideo.thumbnailUrl }}
                style={styles.attachedYtThumb}
                resizeMode="cover"
              />
              <View style={styles.attachedYtMeta}>
                <View style={styles.ytBadgeTag}>
                  <Typography variant="xs" weight="bold" color="#DC2626" style={{ fontSize: 10 }}>
                    🔴 YouTube
                  </Typography>
                </View>
                <Typography variant="xs" weight="bold" color={theme.colors.textPrimary} numberOfLines={1}>
                  ID: {attachedYoutubeVideo.videoId}
                </Typography>
                <Typography variant="xs" color={theme.colors.textMuted} numberOfLines={1}>
                  {attachedYoutubeVideo.embedUrl}
                </Typography>
              </View>
              <Pressable
                onPress={handleRemoveYouTubeVideo}
                style={styles.circularRemoveBtn}
                accessibilityRole="button"
                accessibilityLabel="Remove YouTube video"
                hitSlop={8}
              >
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  ✕
                </Typography>
              </Pressable>
            </View>
          )}

          {/* Attached Direct Video Preview Card */}
          {attachedVideo && (
            <View
              style={[
                styles.attachedVideoCard,
                { borderColor: attachedVideo.error ? theme.colors.error : theme.colors.border },
              ]}
            >
              <View style={styles.attachedVideoTop}>
                <View style={styles.attachedVideoIconCircle}>
                  <Typography variant="md" color="#FFFFFF">
                    ▶
                  </Typography>
                </View>

                <View style={styles.attachedVideoMeta}>
                  <View style={styles.videoBadgeTag}>
                    <Typography variant="xs" weight="bold" color={theme.colors.primaryDark} style={{ fontSize: 10 }}>
                      🎥 {isHindi ? 'वीडियो संलग्न है' : 'Video Attached'}
                    </Typography>
                  </View>
                  <Typography variant="xs" weight="bold" color={theme.colors.textPrimary} numberOfLines={1}>
                    {attachedVideo.name}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textMuted}>
                    {(attachedVideo.size / (1024 * 1024)).toFixed(1)} MB
                    {attachedVideo.durationSeconds !== undefined &&
                      ` · ${Math.floor(attachedVideo.durationSeconds / 60)}:${String(
                        attachedVideo.durationSeconds % 60
                      ).padStart(2, '0')}`}
                  </Typography>
                </View>

                <Pressable
                  onPress={handleRemoveVideo}
                  style={styles.circularRemoveBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Remove video"
                  hitSlop={8}
                >
                  <Typography variant="xs" weight="bold" color="#FFFFFF">
                    ✕
                  </Typography>
                </Pressable>
              </View>

              {/* Upload Progress Bar */}
              {attachedVideo.isUploading && (
                <View style={styles.uploadProgressBox}>
                  <View style={styles.uploadProgressTrack}>
                    <View
                      style={[
                        styles.uploadProgressBarFill,
                        { width: `${attachedVideo.uploadProgress}%`, backgroundColor: theme.colors.primary },
                      ]}
                    />
                  </View>
                  <View style={styles.progressPercentRow}>
                    <Typography variant="xs" color={theme.colors.textSecondary}>
                      {isHindi ? 'वीडियो अपलोड जारी है...' : 'Uploading video...'}
                    </Typography>
                    <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
                      {attachedVideo.uploadProgress}%
                    </Typography>
                  </View>
                </View>
              )}

              {/* Upload Error & Retry */}
              {attachedVideo.error && (
                <View style={styles.uploadErrorRow}>
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

          {/* Attached Images Responsive Grid (Up to 4 images) */}
          {mediaList.length > 0 && (
            <View style={styles.imageGridSection}>
              <Typography variant="xs" weight="bold" color={theme.colors.textSecondary} style={styles.gridSectionTitle}>
                {isHindi ? `संलग्न फ़ोटो (${mediaList.length}/4)` : `Attached Photos (${mediaList.length}/4)`}
              </Typography>
              <View style={styles.imagesGrid}>
                {mediaList.map((item) => (
                  <View key={item.id} style={styles.gridImageWrapper}>
                    <Image source={{ uri: item.uri }} style={styles.imageTile} resizeMode="cover" />

                    {/* Loading Spinner Overlay */}
                    {item.isUploading && (
                      <View style={styles.uploadingOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Typography variant="xs" weight="semibold" color="#FFFFFF" style={{ marginTop: 4, fontSize: 10 }}>
                          {isHindi ? 'अपलोड...' : 'Uploading...'}
                        </Typography>
                      </View>
                    )}

                    {/* Error Overlay with Retry */}
                    {item.error && (
                      <View style={styles.imageErrorOverlay}>
                        <Pressable onPress={() => handleRetryImageUpload(item.id)} style={styles.retryImagePill}>
                          <Typography variant="xs" weight="bold" color="#FFFFFF">
                            ↻ {isHindi ? 'पुनः' : 'Retry'}
                          </Typography>
                        </Pressable>
                      </View>
                    )}

                    {/* Circular Remove Button */}
                    <Pressable
                      onPress={() => handleRemoveImage(item.id)}
                      style={styles.imageRemovePill}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                      hitSlop={8}
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
        </View>
      </ScrollView>

      {/* 7. Modern Sticky Bottom Publish Bar */}
      <View
        style={[
          styles.stickyBottomBar,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.bottomBarContent}>
          <View style={styles.bottomSummaryCol}>
            <View style={styles.summaryBadgePill}>
              <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
                {totalMediaCount > 0
                  ? `${isHindi ? 'मीडिया' : 'Media'}: ${totalMediaCount}/4`
                  : (isHindi ? 'टेक्स्ट पोस्ट' : 'Text Post')}
              </Typography>
            </View>
            <Typography variant="xs" color={theme.colors.textMuted} numberOfLines={1}>
              {selectedCategory === 'GENERAL'
                ? isHindi ? 'सामान्य पोस्ट' : 'General Post'
                : selectedCategory === 'ANNOUNCEMENT'
                ? isHindi ? 'सूचना' : 'Announcement'
                : selectedCategory === 'EVENT'
                ? isHindi ? 'आयोजन' : 'Event'
                : selectedCategory === 'EMPLOYMENT'
                ? isHindi ? 'रोजगार' : 'Employment'
                : selectedCategory === 'GOVERNMENT_SCHEME'
                ? isHindi ? 'सरकारी योजना' : 'Govt Scheme'
                : isHindi ? 'वैवाहिक' : 'Matrimonial'}
            </Typography>
          </View>

          <Button
            title={
              isSubmitting
                ? isHindi ? 'प्रकाशित हो रहा है...' : 'Publishing...'
                : isHindi ? 'पोस्ट प्रकाशित करें →' : 'Publish Post →'
            }
            onPress={handlePublish}
            disabled={!canPublish}
            loading={isSubmitting}
            style={styles.bottomPublishButton}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  backButtonPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerCenter: {
    alignItems: 'center',
  },
  communityScopeText: {
    marginTop: 2,
    fontSize: 11,
  },
  clearButtonPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  clearButtonDisabled: {
    backgroundColor: '#F1F5F9',
    opacity: 0.5,
  },
  scrollContent: {
    padding: 16,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  successIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  successTextContainer: {
    flex: 1,
  },
  successActionBtn: {
    backgroundColor: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatarInitial: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorMeta: {
    flex: 1,
    marginLeft: 12,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleBadgeContainer: {
    marginLeft: 4,
  },
  audienceRow: {
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  categoryCardsScroll: {
    gap: 10,
    paddingBottom: 4,
    marginBottom: 16,
  },
  categoryCard: {
    width: 124,
    padding: 12,
    borderRadius: 14,
    position: 'relative',
    alignItems: 'flex-start',
  },
  categoryCheckBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryCardTitle: {
    marginBottom: 2,
    fontSize: 13,
  },
  categoryCardSubtitle: {
    fontSize: 10,
  },
  guidanceBanner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  guidanceIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  guidanceTextCol: {
    flex: 1,
  },
  guidanceDesc: {
    marginTop: 3,
    lineHeight: 16,
  },
  cardSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requiredBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  titleInputField: {
    fontSize: 15,
    paddingVertical: 6,
    paddingHorizontal: 0,
    lineHeight: 22,
  },
  contentInputField: {
    fontSize: 14,
    paddingVertical: 6,
    paddingHorizontal: 0,
    minHeight: 120,
    lineHeight: 22,
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  editorFooterHintRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
  },
  mediaCardContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  mediaSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  mediaTilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  mediaActionTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  tileDisabled: {
    opacity: 0.45,
  },
  tileIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileSubtext: {
    fontSize: 10,
    marginTop: 2,
  },
  youtubeCardBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  youtubeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ytHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  youtubeInputGroup: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  ytUrlInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    color: '#0F172A',
  },
  ytAddButton: {
    minHeight: 40,
    paddingHorizontal: 14,
  },
  attachedYtCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    gap: 10,
  },
  attachedYtThumb: {
    width: 80,
    height: 54,
    borderRadius: 6,
    backgroundColor: '#000000',
  },
  attachedYtMeta: {
    flex: 1,
    gap: 2,
  },
  ytBadgeTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  circularRemoveBtn: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  attachedVideoCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  attachedVideoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attachedVideoIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachedVideoMeta: {
    flex: 1,
    gap: 2,
  },
  videoBadgeTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  uploadProgressBox: {
    marginTop: 10,
  },
  uploadProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  uploadProgressBarFill: {
    height: '100%',
  },
  progressPercentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  uploadErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  imageGridSection: {
    marginTop: 4,
  },
  gridSectionTitle: {
    marginBottom: 8,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridImageWrapper: {
    width: '48.5%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  imageTile: {
    width: '100%',
    height: '100%',
  },
  uploadingOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageErrorOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  retryImagePill: {
    paddingHorizontal: 8,
  },
  imageRemovePill: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingHorizontal: 16,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  bottomBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomSummaryCol: {
    flex: 1,
  },
  summaryBadgePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  bottomPublishButton: {
    minWidth: 160,
  },
});

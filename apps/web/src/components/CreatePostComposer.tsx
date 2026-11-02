import React, { useState, useRef } from 'react';
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  Avatar,
  MenuItem,
  CircularProgress,
  Alert,
  Stack,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CampaignIcon from '@mui/icons-material/Campaign';
import EventIcon from '@mui/icons-material/Event';
import ForumIcon from '@mui/icons-material/Forum';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import YouTubeIcon from '@mui/icons-material/YouTube';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import VideocamIcon from '@mui/icons-material/Videocam';
import RefreshIcon from '@mui/icons-material/Refresh';
import { PostItem, PostType, UserRole } from '@apnasamaj/shared-types';
import {
  createPostSchema,
  parseYouTubeUrl,
  ParsedYouTubeVideo,
  MAX_VIDEO_FILE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
  ALLOWED_VIDEO_MIME_TYPES,
} from '@apnasamaj/validation';
import { useTranslation } from '@apnasamaj/i18n';
import { createPostApi, uploadPostMediaApi, uploadPostVideoApi } from '../services/posts.service';
import { useAuth } from '../context/AuthContext';


export interface UploadedVideoItem {
  url: string;
  previewUrl: string;
  file: File;
  fileName: string;
  fileSizeBytes: number;
  durationSeconds?: number;
  isUploading: boolean;
  uploadProgress: number;
  error?: string;
}

export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read video metadata'));
    };
    video.src = objectUrl;
  });
}

interface UploadedMediaItem {
  url: string;
  previewUrl: string;
  isUploading: boolean;
  error?: string;
}

interface CreatePostComposerProps {
  groupId?: string;
  onPostCreated: (post: PostItem) => void;
}

const MAX_IMAGES = 4;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const CreatePostComposer: React.FC<CreatePostComposerProps> = ({ groupId, onPostCreated }) => {
  const { user } = useAuth();
  const { t } = useTranslation(['feed', 'common']);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [attachedVideo, setAttachedVideo] = useState<UploadedVideoItem | null>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostType>(PostType.GENERAL);
  const [mediaList, setMediaList] = useState<UploadedMediaItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // YouTube embedding state
  const [youtubeInputOpen, setYoutubeInputOpen] = useState(false);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState('');
  const [attachedYoutubeVideo, setAttachedYoutubeVideo] = useState<ParsedYouTubeVideo | null>(null);
  const [youtubeInputError, setYoutubeInputError] = useState<string | null>(null);

  const isAdminOrMod =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.COMMUNITY_ADMIN ||
    user?.role === UserRole.MODERATOR;

  const handleAddYoutubeVideo = () => {
    const trimmed = youtubeUrlInput.trim();
    if (!trimmed) {
      setYoutubeInputError(t('youtubeRequired'));
      return;
    }
    const parsed = parseYouTubeUrl(trimmed);
    if (!parsed) {
      setYoutubeInputError(t('youtubeInvalid'));
      return;
    }
    setAttachedYoutubeVideo(parsed);
    setYoutubeUrlInput('');
    setYoutubeInputOpen(false);
    setYoutubeInputError(null);
  };


  const uploadVideoWithProgress = async (file: File, previewUrl: string) => {
    try {
      const uploadResult = await uploadPostVideoApi(file, (percent) => {
        setAttachedVideo((prev) => (prev ? { ...prev, uploadProgress: percent } : null));
      });
      setAttachedVideo((prev) =>
        prev && prev.previewUrl === previewUrl
          ? { ...prev, url: uploadResult.url, isUploading: false, uploadProgress: 100 }
          : prev
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('uploadFailedGeneral');
      setAttachedVideo((prev) =>
        prev && prev.previewUrl === previewUrl
          ? { ...prev, isUploading: false, error: msg }
          : prev
      );
    }
  };

  const handleSelectVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    if (videoFileInputRef.current) videoFileInputRef.current.value = '';

    if (attachedVideo || attachedYoutubeVideo) {
      setErrorMessage(t('composerVideoDisabledTooltip'));
      return;
    }

    if (mediaList.length >= 4) {
      setErrorMessage(t('composerVideoDisabledTooltip'));
      return;
    }

    setErrorMessage(null);

    // 1. File size check
    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
      setErrorMessage(t('videoSizeExceeded'));
      return;
    }

    // 2. MIME type check
    if (!ALLOWED_VIDEO_MIME_TYPES.includes(file.type as any)) {
      setErrorMessage(t('unsupportedVideoFormat'));
      return;
    }

    // 3. Duration check via HTMLVideoElement
    let duration = 0;
    try {
      duration = await getVideoDuration(file);
    } catch {
      setErrorMessage(t('videoMetadataError'));
      return;
    }

    if (duration > MAX_VIDEO_DURATION_SECONDS) {
      setErrorMessage(
        t('videoDurationExceeded', {
          actual: Math.round(duration),
        })
      );
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const newVideoItem: UploadedVideoItem = {
      url: '',
      previewUrl,
      file,
      fileName: file.name,
      fileSizeBytes: file.size,
      durationSeconds: Math.round(duration),
      isUploading: true,
      uploadProgress: 0,
    };

    setAttachedVideo(newVideoItem);
    await uploadVideoWithProgress(file, previewUrl);
  };

  const handleRemoveVideo = () => {
    if (attachedVideo) {
      URL.revokeObjectURL(attachedVideo.previewUrl);
      setAttachedVideo(null);
    }
  };

  const handleRetryVideoUpload = async () => {
    if (!attachedVideo) return;
    setAttachedVideo((prev) =>
      prev ? { ...prev, isUploading: true, error: undefined, uploadProgress: 0 } : null
    );
    await uploadVideoWithProgress(attachedVideo.file, attachedVideo.previewUrl);
  };

  const handleRemoveYoutubeVideo = () => {
    setAttachedYoutubeVideo(null);
    setYoutubeInputError(null);
  };

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    if (mediaList.length + files.length > MAX_IMAGES) {
      setErrorMessage(t('maxImagesExceeded', { count: MAX_IMAGES }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setErrorMessage(null);

    // Validate each selected file
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setErrorMessage(t('unsupportedImageFormat', { name: file.name }));
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage(t('imageSizeExceeded', { name: file.name }));
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
    }

    // Process and upload each file
    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      const tempItem: UploadedMediaItem = {
        url: '',
        previewUrl,
        isUploading: true,
      };

      setMediaList((prev) => [...prev, tempItem]);

      try {
        const uploadResult = await uploadPostMediaApi(file);
        setMediaList((prev) =>
          prev.map((item) =>
            item.previewUrl === previewUrl
              ? { ...item, url: uploadResult.url, isUploading: false }
              : item
          )
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('uploadFailedGeneral');
        setMediaList((prev) =>
          prev.map((item) =>
            item.previewUrl === previewUrl
              ? { ...item, isUploading: false, error: msg }
              : item
          )
        );
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveMedia = (previewUrl: string) => {
    setMediaList((prev) => {
      const filtered = prev.filter((item) => item.previewUrl !== previewUrl);
      URL.revokeObjectURL(previewUrl);
      return filtered;
    });
  };

  const isAnyMediaUploading = mediaList.some((m) => m.isUploading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isAnyMediaUploading) {
      setErrorMessage('Please wait for all images to finish uploading.');
      return;
    }

    const failedMedia = mediaList.find((m) => m.error);
    if (failedMedia) {
      setErrorMessage('One or more images failed to upload. Please remove them before publishing.');
      return;
    }

    const validMedia: Array<{
      url: string;
      order: number;
      mediaType?: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
      thumbnail?: string;
    }> = mediaList
      .filter((m) => m.url && !m.error)
      .map((m, idx) => ({
        url: m.url,
        order: idx,
        mediaType: 'IMAGE' as const,
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

    if (validMedia.length > 4) {
      setErrorMessage('You can attach a maximum of 4 media items per post.');
      return;
    }

    const isTitleRequired = postType === PostType.ANNOUNCEMENT || postType === PostType.EVENT;
    if (isTitleRequired && !title.trim()) {
      setErrorMessage(t('titleRequiredError'));
      return;
    }
    if (title.length > 150) {
      setErrorMessage(t('titleMaxLengthError'));
      return;
    }

    const validation = createPostSchema.safeParse({
      title: title.trim() || undefined,
      content: content.trim(),
      type: postType,
      groupId: groupId || undefined,
      media: validMedia,
    });

    if (!validation.success) {
      const issue = validation.error.issues[0]?.message || t('contentOrMediaRequired');
      setErrorMessage(issue);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createPostApi(validation.data);
      setTitle('');
      setContent('');
      setPostType(PostType.GENERAL);
      // Clean up object URLs
      mediaList.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      setMediaList([]);
      if (attachedVideo) URL.revokeObjectURL(attachedVideo.previewUrl);
      setAttachedVideo(null);
      setAttachedYoutubeVideo(null);
      setYoutubeUrlInput('');
      setYoutubeInputOpen(false);
      setYoutubeInputError(null);
      onPostCreated(created);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : t('publishPostFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = 5000 - content.length;
  const isTitleRequired = postType === PostType.ANNOUNCEMENT || postType === PostType.EVENT;
  const isTitleValid = !isTitleRequired || title.trim().length > 0;
  const hasTextOrMedia =
    title.trim().length > 0 ||
    content.trim().length > 0 ||
    mediaList.length > 0 ||
    !!attachedYoutubeVideo ||
    !!attachedVideo;
  const canSubmit =
    isTitleValid &&
    hasTextOrMedia &&
    !isAnyMediaUploading &&
    !attachedVideo?.isUploading &&
    !isSubmitting;

  return (
    <Paper elevation={2} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, mb: 4 }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44, fontWeight: 'bold' }}>
          {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'M'}
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ lineHeight: 1.2 }}>
            {user?.fullName || t('composerDefaultAuthor')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('composerSubtitle')}
          </Typography>
        </Box>
      </Box>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <TextField
          fullWidth
          size="small"
          label={t('postTitleLabel')}
          placeholder={
            postType === PostType.ANNOUNCEMENT
              ? t('postTitleAnnouncementPlaceholder')
              : postType === PostType.EVENT
              ? t('postTitleEventPlaceholder')
              : t('postTitlePlaceholder')
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isSubmitting}
          required={isTitleRequired}
          inputProps={{ maxLength: 150 }}
          helperText={
            isTitleRequired
              ? `${t('postTitleRequiredHint')} · ${t('postTitleCharsLeft', { count: 150 - title.length })}`
              : `${t('postTitleOptionalHint')} · ${t('postTitleCharsLeft', { count: 150 - title.length })}`
          }
          sx={{ mb: 2 }}
        />

        <TextField
          multiline
          fullWidth
          minRows={3}
          maxRows={8}
          placeholder={t('composerPlaceholder')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isSubmitting}
          sx={{ mb: 2 }}
        />

        {/* YouTube Video URL Input Box */}
        {youtubeInputOpen && !attachedYoutubeVideo && (
          <Box
            sx={{
              p: 2,
              mb: 2,
              bgcolor: 'action.hover',
              borderRadius: 2,
              border: '1px solid',
              borderColor: youtubeInputError ? 'error.main' : 'divider',
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} mb={1} display="flex" alignItems="center" gap={0.75}>
              <YouTubeIcon sx={{ color: '#FF0000', fontSize: 20 }} />
              {t('youtubeModalTitle')}
            </Typography>
            <Box display="flex" gap={1} alignItems="flex-start">
              <TextField
                fullWidth
                size="small"
                placeholder={t('youtubeModalPlaceholder')}
                value={youtubeUrlInput}
                onChange={(e) => {
                  setYoutubeUrlInput(e.target.value);
                  if (youtubeInputError) setYoutubeInputError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddYoutubeVideo();
                  }
                }}
                disabled={isSubmitting}
                error={!!youtubeInputError}
                helperText={youtubeInputError}
              />
              <Button
                variant="contained"
                color="primary"
                size="medium"
                onClick={handleAddYoutubeVideo}
                disabled={!youtubeUrlInput.trim() || isSubmitting}
                sx={{ minWidth: 80, height: 40 }}
              >
                {t('add')}
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                size="medium"
                onClick={() => {
                  setYoutubeInputOpen(false);
                  setYoutubeInputError(null);
                }}
                sx={{ height: 40 }}
              >
                {t('common:cancel')}
              </Button>
            </Box>
          </Box>
        )}

        
        {/* Direct Uploaded Video Preview Card */}
        {attachedVideo && (
          <Box
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: attachedVideo.error ? 'error.main' : 'divider',
              bgcolor: 'background.paper',
              position: 'relative',
              boxShadow: 1,
            }}
          >
            <Box display="flex" alignItems="center" gap={2}>
              <Box
                sx={{
                  position: 'relative',
                  width: { xs: 120, sm: 160 },
                  height: { xs: 68, sm: 90 },
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  flexShrink: 0,
                  bgcolor: '#000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  component="video"
                  src={attachedVideo.previewUrl}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  preload="metadata"
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(0,0,0,0.25)',
                  }}
                >
                  <PlayCircleOutlineIcon sx={{ color: 'white', fontSize: 32 }} />
                </Box>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
                  <VideocamIcon color="primary" sx={{ fontSize: 20 }} />
                  <Typography variant="subtitle2" fontWeight={600} noWrap>
                    {t('videoAttachedTitle')}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: '80%' }}>
                  {attachedVideo.fileName}
                </Typography>
                <Box display="flex" gap={1} mt={0.5} flexWrap="wrap">
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${(attachedVideo.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                  {attachedVideo.durationSeconds !== undefined && (
                    <Chip
                      size="small"
                      variant="outlined"
                      color="info"
                      label={`${Math.floor(attachedVideo.durationSeconds / 60)}:${String(
                        attachedVideo.durationSeconds % 60
                      ).padStart(2, '0')}`}
                      sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
              </Box>

              <Tooltip title={t('removeVideoAria')}>
                <IconButton
                  size="small"
                  onClick={handleRemoveVideo}
                  disabled={isSubmitting}
                  aria-label={t('removeVideoAria')}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    bgcolor: 'action.hover',
                    '&:hover': { bgcolor: 'error.light', color: 'white' },
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Video Upload Progress Bar */}
            {attachedVideo.isUploading && (
              <Box sx={{ mt: 1.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={attachedVideo.uploadProgress}
                  sx={{ height: 6, borderRadius: 1 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {t('videoUploading', { progress: attachedVideo.uploadProgress })}
                </Typography>
              </Box>
            )}

            {/* Video Upload Error Alert & Retry */}
            {attachedVideo.error && (
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Alert severity="error" sx={{ flex: 1, py: 0.5 }}>
                  {attachedVideo.error}
                </Alert>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<RefreshIcon />}
                  onClick={handleRetryVideoUpload}
                  disabled={isSubmitting}
                >
                  {t('retryUpload')}
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* YouTube Video Preview Card */}
        {attachedYoutubeVideo && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              position: 'relative',
              boxShadow: 1,
            }}
          >
            <Box
              sx={{
                position: 'relative',
                width: { xs: 120, sm: 160 },
                height: { xs: 68, sm: 90 },
                borderRadius: 1.5,
                overflow: 'hidden',
                flexShrink: 0,
                bgcolor: '#000',
              }}
            >
              <img
                src={attachedYoutubeVideo.thumbnailUrl}
                alt="YouTube thumbnail preview"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'rgba(0,0,0,0.3)',
                }}
              >
                <PlayCircleOutlineIcon sx={{ color: 'white', fontSize: 36 }} />
              </Box>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
                <YouTubeIcon sx={{ color: '#FF0000', fontSize: 20 }} />
                <Typography variant="subtitle2" fontWeight={600} noWrap>
                  {t('composerYoutubeAttachedTitle')}
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" noWrap>
                ID: <strong>{attachedYoutubeVideo.videoId}</strong>
              </Typography>
              {attachedYoutubeVideo.startTimeSeconds !== undefined && (
                <Typography variant="caption" color="text.secondary" display="block">
                  Starts at: {attachedYoutubeVideo.startTimeSeconds}s
                </Typography>
              )}
            </Box>

            <Tooltip title={t('removeYoutubeAria')}>
              <IconButton
                size="small"
                onClick={handleRemoveYoutubeVideo}
                disabled={isSubmitting}
                aria-label={t('removeYoutubeAria')}
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'error.light', color: 'white' },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Selected Media Preview Grid */}
        {mediaList.length > 0 && (
          <Box display="flex" gap={1.5} flexWrap="wrap" mb={2}>
            {mediaList.map((item, index) => (
              <Box
                key={index}
                sx={{
                  position: 'relative',
                  width: { xs: 90, sm: 110 },
                  height: { xs: 90, sm: 110 },
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: 1,
                  borderColor: item.error ? 'error.main' : 'divider',
                  bgcolor: 'action.hover',
                }}
              >
                <img
                  src={item.previewUrl}
                  alt={t('uploadPreviewAlt', { index: index + 1 })}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {item.isUploading && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      bgcolor: 'rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CircularProgress size={24} sx={{ color: 'white' }} />
                  </Box>
                )}

                {item.error && (
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      bgcolor: 'rgba(211, 47, 47, 0.85)',
                      color: 'white',
                      fontSize: '0.65rem',
                      px: 0.5,
                      py: 0.25,
                      textAlign: 'center',
                    }}
                  >
                    {t('uploadFailed')}
                  </Box>
                )}

                <IconButton
                  size="small"
                  aria-label={t('removeMediaAria')}
                  onClick={() => handleRemoveMedia(item.previewUrl)}
                  disabled={isSubmitting}
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    bgcolor: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    p: 0.5,
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}

        <Box
          display="flex"
          flexDirection={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
          gap={1.5}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleSelectFiles}
            />

            {/* Photo Picker Button */}
            <Tooltip title={mediaList.length >= MAX_IMAGES ? t('composerMaxPhotosTooltip', { max: MAX_IMAGES }) : t('composerPhotoTooltip', { max: MAX_IMAGES })}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddPhotoAlternateIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || mediaList.length >= MAX_IMAGES || (mediaList.length + (attachedVideo || attachedYoutubeVideo ? 1 : 0) >= 4)}
                  sx={{ borderRadius: 2 }}
                >
                  {t('composerPhoto', { current: mediaList.length, max: MAX_IMAGES })}
                </Button>
              </span>
            </Tooltip>

            
            {/* Hidden native video file input */}
            <input
              type="file"
              ref={videoFileInputRef}
              style={{ display: 'none' }}
              accept="video/mp4,video/webm"
              onChange={handleSelectVideo}
            />

            {/* Direct Video Action Button */}
            <Tooltip
              title={
                attachedVideo
                  ? t('composerVideoAttachedTooltip')
                  : attachedYoutubeVideo || mediaList.length >= 4
                  ? t('composerVideoDisabledTooltip')
                  : t('composerVideoTooltip')
              }
            >
              <span>
                <Button
                  variant={attachedVideo ? 'contained' : 'outlined'}
                  color={attachedVideo ? 'secondary' : 'primary'}
                  size="small"
                  startIcon={<VideocamIcon />}
                  onClick={() => videoFileInputRef.current?.click()}
                  disabled={isSubmitting || !!attachedVideo || !!attachedYoutubeVideo || mediaList.length >= 4}
                  sx={{ borderRadius: 2 }}
                >
                  {attachedVideo ? t('composerVideoAttached') : t('composerVideo')}
                </Button>
              </span>
            </Tooltip>

            {/* YouTube Video Action Button */}
            <Tooltip title={attachedYoutubeVideo ? t('composerYoutubeAttachedTooltip') : t('composerYoutubeTooltip')}>
              <span>
                <Button
                  variant={attachedYoutubeVideo ? 'contained' : 'outlined'}
                  color={attachedYoutubeVideo ? 'secondary' : 'error'}
                  size="small"
                  startIcon={<YouTubeIcon />}
                  onClick={() => {
                    if (!attachedYoutubeVideo) {
                      setYoutubeInputOpen((prev) => !prev);
                      setYoutubeInputError(null);
                    }
                  }}
                  disabled={isSubmitting || !!attachedYoutubeVideo}
                  sx={{ borderRadius: 2 }}
                >
                  {attachedYoutubeVideo ? t('composerYoutubeAttached') : t('composerYoutube')}
                </Button>
              </span>
            </Tooltip>

            {/* Post Type Selector */}
            <TextField
              select
              size="small"
              value={postType}
              onChange={(e) => setPostType(e.target.value as PostType)}
              disabled={isSubmitting}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value={PostType.GENERAL}>
                <Box display="flex" alignItems="center" gap={1}>
                  <ForumIcon fontSize="small" color="action" />
                  <span>{t('postTypeGeneral')}</span>
                </Box>
              </MenuItem>
              <MenuItem value={PostType.EVENT}>
                <Box display="flex" alignItems="center" gap={1}>
                  <EventIcon fontSize="small" color="primary" />
                  <span>{t('postTypeEvent')}</span>
                </Box>
              </MenuItem>
              {isAdminOrMod && (
                <MenuItem value={PostType.ANNOUNCEMENT}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <CampaignIcon fontSize="small" color="warning" />
                    <span>{t('postTypeAnnouncement')}</span>
                  </Box>
                </MenuItem>
              )}
            </TextField>

            <Typography
              variant="caption"
              color={remainingChars < 200 ? 'error.main' : 'text.secondary'}
            >
              {t('charsLeft', { count: remainingChars })}
            </Typography>
          </Stack>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={!canSubmit}
            startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
            sx={{ px: 3, py: 1, borderRadius: 2, fontWeight: 600 }}
          >
            {isSubmitting ? t('publishing') : t('publishPost')}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

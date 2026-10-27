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
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import CampaignIcon from '@mui/icons-material/Campaign';
import EventIcon from '@mui/icons-material/Event';
import ForumIcon from '@mui/icons-material/Forum';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import YouTubeIcon from '@mui/icons-material/YouTube';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { PostItem, PostType, UserRole } from '@apnasamaj/shared-types';
import { createPostSchema, parseYouTubeUrl, ParsedYouTubeVideo } from '@apnasamaj/validation';
import { createPostApi, uploadPostMediaApi } from '../services/posts.service';
import { useAuth } from '../context/AuthContext';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setYoutubeInputError('Please enter a YouTube video URL.');
      return;
    }
    const parsed = parseYouTubeUrl(trimmed);
    if (!parsed) {
      setYoutubeInputError('Invalid YouTube URL. Please enter a valid watch, shorts, or youtu.be link.');
      return;
    }
    setAttachedYoutubeVideo(parsed);
    setYoutubeUrlInput('');
    setYoutubeInputOpen(false);
    setYoutubeInputError(null);
  };

  const handleRemoveYoutubeVideo = () => {
    setAttachedYoutubeVideo(null);
    setYoutubeInputError(null);
  };

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    if (mediaList.length + files.length > MAX_IMAGES) {
      setErrorMessage(`You can upload a maximum of ${MAX_IMAGES} images per post.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setErrorMessage(null);

    // Validate each selected file
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        setErrorMessage(`"${file.name}" is not a supported format. Please select JPEG, PNG, WebP, or GIF.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setErrorMessage(`"${file.name}" exceeds the 5MB size limit.`);
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
        const msg = err instanceof Error ? err.message : 'Upload failed';
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

    const validation = createPostSchema.safeParse({
      content: content.trim(),
      type: postType,
      groupId: groupId || undefined,
      media: validMedia,
    });

    if (!validation.success) {
      const issue = validation.error.issues[0]?.message || 'Please enter valid post content or attach media.';
      setErrorMessage(issue);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createPostApi(validation.data);
      setContent('');
      setPostType(PostType.GENERAL);
      // Clean up object URLs
      mediaList.forEach((m) => URL.revokeObjectURL(m.previewUrl));
      setMediaList([]);
      setAttachedYoutubeVideo(null);
      setYoutubeUrlInput('');
      setYoutubeInputOpen(false);
      setYoutubeInputError(null);
      onPostCreated(created);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = 5000 - content.length;
  const canSubmit =
    (content.trim().length > 0 || mediaList.length > 0 || !!attachedYoutubeVideo) &&
    !isAnyMediaUploading &&
    !isSubmitting;

  return (
    <Paper elevation={2} sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, mb: 4 }}>
      <Box display="flex" alignItems="center" gap={1.5} mb={2}>
        <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44, fontWeight: 'bold' }}>
          {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'M'}
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ lineHeight: 1.2 }}>
            {user?.fullName || 'Community Member'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Share updates, discussions, photos, or announcements with Apna Samaj
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
          multiline
          fullWidth
          minRows={3}
          maxRows={8}
          placeholder="What's happening in your community? Share an update, photo, or thought..."
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
              Embed YouTube Video
            </Typography>
            <Box display="flex" gap={1} alignItems="flex-start">
              <TextField
                fullWidth
                size="small"
                placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)"
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
                Add
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
                Cancel
              </Button>
            </Box>
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
                  YouTube Video Attached
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

            <Tooltip title="Remove YouTube video">
              <IconButton
                size="small"
                onClick={handleRemoveYoutubeVideo}
                disabled={isSubmitting}
                aria-label="Remove YouTube video"
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
                  alt={`Upload preview ${index + 1}`}
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
                    Failed
                  </Box>
                )}

                <IconButton
                  size="small"
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
            <Tooltip title={mediaList.length >= MAX_IMAGES ? 'Maximum 4 images reached' : 'Attach photo (up to 4)'}>
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddPhotoAlternateIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || mediaList.length >= MAX_IMAGES}
                  sx={{ borderRadius: 2 }}
                >
                  Photo ({mediaList.length}/{MAX_IMAGES})
                </Button>
              </span>
            </Tooltip>

            {/* YouTube Video Action Button */}
            <Tooltip title={attachedYoutubeVideo ? 'Only 1 video allowed per post' : 'Embed YouTube video'}>
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
                  {attachedYoutubeVideo ? 'YouTube Attached' : 'YouTube Video'}
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
                  <span>General Post</span>
                </Box>
              </MenuItem>
              <MenuItem value={PostType.EVENT}>
                <Box display="flex" alignItems="center" gap={1}>
                  <EventIcon fontSize="small" color="primary" />
                  <span>Community Event</span>
                </Box>
              </MenuItem>
              {isAdminOrMod && (
                <MenuItem value={PostType.ANNOUNCEMENT}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <CampaignIcon fontSize="small" color="warning" />
                    <span>Announcement</span>
                  </Box>
                </MenuItem>
              )}
            </TextField>

            <Typography
              variant="caption"
              color={remainingChars < 200 ? 'error.main' : 'text.secondary'}
            >
              {remainingChars} chars left
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
            {isSubmitting ? 'Publishing...' : 'Publish Post'}
          </Button>
        </Box>
      </Box>
    </Paper>
  );
};

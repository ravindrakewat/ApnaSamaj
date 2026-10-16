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
import CloseIcon from '@mui/icons-material/Close';
import { PostItem, PostType, UserRole } from '@apnasamaj/shared-types';
import { createPostSchema } from '@apnasamaj/validation';
import { createPostApi, uploadPostMediaApi } from '../services/posts.service';
import { useAuth } from '../context/AuthContext';

interface UploadedMediaItem {
  url: string;
  previewUrl: string;
  isUploading: boolean;
  error?: string;
}

interface CreatePostComposerProps {
  onPostCreated: (post: PostItem) => void;
}

const MAX_IMAGES = 4;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const CreatePostComposer: React.FC<CreatePostComposerProps> = ({ onPostCreated }) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostType>(PostType.GENERAL);
  const [mediaList, setMediaList] = useState<UploadedMediaItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdminOrMod =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.COMMUNITY_ADMIN ||
    user?.role === UserRole.MODERATOR;

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

    const validMedia = mediaList
      .filter((m) => m.url && !m.error)
      .map((m, idx) => ({
        url: m.url,
        order: idx,
      }));

    const validation = createPostSchema.safeParse({
      content: content.trim(),
      type: postType,
      media: validMedia,
    });

    if (!validation.success) {
      const issue = validation.error.issues[0]?.message || 'Please enter valid post content or attach an image.';
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
      onPostCreated(created);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to publish post.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = 5000 - content.length;
  const canSubmit = (content.trim().length > 0 || mediaList.length > 0) && !isAnyMediaUploading && !isSubmitting;

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

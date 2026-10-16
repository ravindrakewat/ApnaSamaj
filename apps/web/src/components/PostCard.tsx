import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  CardActions,
  Avatar,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Box,
  CircularProgress,
  Alert,
  Divider,
  Collapse,
  Stack,
  Tooltip,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CampaignIcon from '@mui/icons-material/Campaign';
import EventIcon from '@mui/icons-material/Event';
import ForumIcon from '@mui/icons-material/Forum';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import ShieldIcon from '@mui/icons-material/Shield';
import CloseIcon from '@mui/icons-material/Close';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import SendIcon from '@mui/icons-material/Send';
import {
  PostItem,
  PostMediaType,
  PostType,
  UserRole,
  PostMediaItem,
  CommentItem,
} from '@apnasamaj/shared-types';
import { updatePostSchema, createCommentSchema } from '@apnasamaj/validation';
import {
  updatePostApi,
  deletePostApi,
  uploadPostMediaApi,
  likePostApi,
  unlikePostApi,
  getPostCommentsApi,
  createCommentApi,
  updateCommentApi,
  deleteCommentApi,
} from '../services/posts.service';
import { useAuth } from '../context/AuthContext';

interface PostCardProps {
  post: PostItem;
  onPostUpdated: (post: PostItem) => void;
  onPostDeleted: (postId: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onPostUpdated, onPostDeleted }) => {
  const { user } = useAuth();

  // Menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(anchorEl);

  // Edit post dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editType, setEditType] = useState<PostType>(post.type);
  const [editMedia, setEditMedia] = useState<PostMediaItem[]>(post.media || []);
  const [isUploadingEditMedia, setIsUploadingEditMedia] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Delete post dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Media preview lightbox state
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Likes state
  const [isLiked, setIsLiked] = useState<boolean>(Boolean(post.isLikedByMe));
  const [likesCount, setLikesCount] = useState<number>(post.likesCount || 0);
  const [isLikePending, setIsLikePending] = useState(false);

  // Comments state
  const [isCommentsExpanded, setIsCommentsExpanded] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsCount, setCommentsCount] = useState<number>(post.commentsCount || 0);
  const [commentsPage, setCommentsPage] = useState<number>(1);
  const [hasMoreComments, setHasMoreComments] = useState<boolean>(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [hasLoadedCommentsOnce, setHasLoadedCommentsOnce] = useState(false);

  // New comment input state
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // Comment edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [isUpdatingComment, setIsUpdatingComment] = useState(false);
  const [editCommentError, setEditCommentError] = useState<string | null>(null);

  // Comment delete state
  const [commentToDelete, setCommentToDelete] = useState<CommentItem | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [deleteCommentError, setDeleteCommentError] = useState<string | null>(null);

  // Keep likes and comments count in sync if post prop updates
  useEffect(() => {
    setIsLiked(Boolean(post.isLikedByMe));
    setLikesCount(post.likesCount || 0);
    setCommentsCount(post.commentsCount || 0);
  }, [post.isLikedByMe, post.likesCount, post.commentsCount]);

  const isOwner = user?.id === post.authorId;
  const isModerator =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.COMMUNITY_ADMIN ||
    user?.role === UserRole.MODERATOR;

  const canEdit = isOwner;
  const canDelete = isOwner || isModerator;

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Likes Handler
  const handleToggleLike = async () => {
    if (isLikePending) return;

    // Optimistic UI update
    const nextIsLiked = !isLiked;
    const nextLikesCount = nextIsLiked ? likesCount + 1 : Math.max(0, likesCount - 1);
    setIsLiked(nextIsLiked);
    setLikesCount(nextLikesCount);
    setIsLikePending(true);

    try {
      if (nextIsLiked) {
        const res = await likePostApi(post.id);
        setIsLiked(res.isLikedByMe);
        setLikesCount(res.likesCount);
      } else {
        const res = await unlikePostApi(post.id);
        setIsLiked(res.isLikedByMe);
        setLikesCount(res.likesCount);
      }
    } catch (err: unknown) {
      // Revert optimistic update
      setIsLiked(!nextIsLiked);
      setLikesCount(likesCount);
      console.error('Failed to toggle like:', err);
    } finally {
      setIsLikePending(false);
    }
  };

  // Comments Toggle & Fetch
  const handleToggleComments = () => {
    const nextExpanded = !isCommentsExpanded;
    setIsCommentsExpanded(nextExpanded);

    if (nextExpanded && !hasLoadedCommentsOnce) {
      loadInitialComments();
    }
  };

  const loadInitialComments = async () => {
    setIsLoadingComments(true);
    setCommentError(null);
    try {
      const res = await getPostCommentsApi(post.id, 1, 10);
      setComments(res.comments);
      setCommentsPage(1);
      setHasMoreComments(res.pagination.hasMore);
      setCommentsCount(res.pagination.totalComments);
      setHasLoadedCommentsOnce(true);
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Failed to load comments.');
    } finally {
      setIsLoadingComments(false);
    }
  };

  const handleLoadMoreComments = async () => {
    if (isLoadingMoreComments || !hasMoreComments) return;

    setIsLoadingMoreComments(true);
    try {
      const nextPage = commentsPage + 1;
      const res = await getPostCommentsApi(post.id, nextPage, 10);
      setComments((prev) => [...prev, ...res.comments]);
      setCommentsPage(nextPage);
      setHasMoreComments(res.pagination.hasMore);
      setCommentsCount(res.pagination.totalComments);
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Failed to load more comments.');
    } finally {
      setIsLoadingMoreComments(false);
    }
  };

  // Create Comment Handler
  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCommentText.trim();
    if (!trimmed || isSubmittingComment) return;

    const validation = createCommentSchema.safeParse({ content: trimmed });
    if (!validation.success) {
      setCommentError(validation.error.issues[0]?.message || 'Invalid comment.');
      return;
    }

    setIsSubmittingComment(true);
    setCommentError(null);
    try {
      const created = await createCommentApi(post.id, { content: trimmed });
      setComments((prev) => [...prev, created]);
      setCommentsCount((prev) => prev + 1);
      setNewCommentText('');
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Edit Comment Handlers
  const handleStartEditComment = (comment: CommentItem) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.content);
    setEditCommentError(null);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText('');
    setEditCommentError(null);
  };

  const handleSaveEditComment = async (commentId: string) => {
    const trimmed = editingCommentText.trim();
    if (!trimmed || isUpdatingComment) return;

    setIsUpdatingComment(true);
    setEditCommentError(null);
    try {
      const updated = await updateCommentApi(post.id, commentId, { content: trimmed });
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingCommentId(null);
    } catch (err: unknown) {
      setEditCommentError(err instanceof Error ? err.message : 'Failed to update comment.');
    } finally {
      setIsUpdatingComment(false);
    }
  };

  // Delete Comment Handlers
  const handleConfirmDeleteComment = async () => {
    if (!commentToDelete || isDeletingComment) return;

    setIsDeletingComment(true);
    setDeleteCommentError(null);
    try {
      await deleteCommentApi(post.id, commentToDelete.id);
      setComments((prev) => prev.filter((c) => c.id !== commentToDelete.id));
      setCommentsCount((prev) => Math.max(0, prev - 1));
      setCommentToDelete(null);
    } catch (err: unknown) {
      setDeleteCommentError(err instanceof Error ? err.message : 'Failed to delete comment.');
    } finally {
      setIsDeletingComment(false);
    }
  };

  // Edit Post Handlers
  const handleOpenEdit = () => {
    setEditContent(post.content);
    setEditType(post.type);
    setEditMedia(post.media ? [...post.media] : []);
    setUpdateError(null);
    setIsEditDialogOpen(true);
    handleMenuClose();
  };

  const handleEditMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (editMedia.length + files.length > 4) {
      setUpdateError('Maximum 4 images allowed per post.');
      return;
    }

    setIsUploadingEditMedia(true);
    setUpdateError(null);

    try {
      const newItems: PostMediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File ${file.name} exceeds 5MB size limit.`);
        }
        const uploaded = await uploadPostMediaApi(file);
        newItems.push({
          id: uploaded.storagePath,
          url: uploaded.url,
          mediaType: PostMediaType.IMAGE,
          order: editMedia.length + newItems.length,
          thumbnail: uploaded.url,
        });
      }
      setEditMedia((prev) => [...prev, ...newItems]);
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setIsUploadingEditMedia(false);
      event.target.value = '';
    }
  };

  const handleRemoveEditMedia = (indexToRemove: number) => {
    setEditMedia((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveEdit = async () => {
    setUpdateError(null);

    const mediaPayload = editMedia.map((m, idx) => ({
      url: m.url,
      mediaType: m.mediaType,
      order: idx,
      thumbnail: m.thumbnail || null,
    }));

    const validation = updatePostSchema.safeParse({
      content: editContent.trim(),
      type: editType,
      media: mediaPayload,
    });

    if (!validation.success) {
      setUpdateError(validation.error.issues[0]?.message || 'Invalid post update.');
      return;
    }

    if (!editContent.trim() && mediaPayload.length === 0) {
      setUpdateError('A post must have either text content or at least one image.');
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await updatePostApi(post.id, validation.data);
      onPostUpdated(updated);
      setIsEditDialogOpen(false);
    } catch (err: unknown) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update post.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Post Handlers
  const handleOpenDelete = () => {
    setDeleteError(null);
    setIsDeleteDialogOpen(true);
    handleMenuClose();
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deletePostApi(post.id);
      setIsDeleteDialogOpen(false);
      onPostDeleted(post.id);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete post.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Post Type Badge Details
  const getPostTypeDetails = (type: PostType) => {
    switch (type) {
      case PostType.ANNOUNCEMENT:
        return {
          label: 'Announcement',
          color: 'warning' as const,
          icon: <CampaignIcon fontSize="small" />,
        };
      case PostType.EVENT:
        return {
          label: 'Event',
          color: 'info' as const,
          icon: <EventIcon fontSize="small" />,
        };
      case PostType.GENERAL:
      default:
        return {
          label: 'General',
          color: 'default' as const,
          icon: <ForumIcon fontSize="small" />,
        };
    }
  };

  const typeDetails = getPostTypeDetails(post.type);
  const locationString = [post.author.city, post.author.state].filter(Boolean).join(', ');

  const formattedDate = new Date(post.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isEdited = post.createdAt !== post.updatedAt;

  // Render Post Images Grid
  const renderMediaGrid = () => {
    if (!post.media || post.media.length === 0) return null;

    const count = post.media.length;

    if (count === 1) {
      const item = post.media[0];
      return (
        <Box sx={{ mt: 1.5, mb: 1, borderRadius: 2, overflow: 'hidden' }}>
          <Box
            component="img"
            src={item.url}
            alt="Community Post attachment"
            onClick={() => setPreviewImage(item.url)}
            sx={{
              width: '100%',
              maxHeight: 460,
              objectFit: 'cover',
              cursor: 'pointer',
              display: 'block',
              transition: 'opacity 0.2s',
              '&:hover': { opacity: 0.95 },
            }}
          />
        </Box>
      );
    }

    if (count === 2) {
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1,
            mt: 1.5,
            mb: 1,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {post.media.map((item) => (
            <Box
              key={item.id}
              component="img"
              src={item.url}
              alt="Community Post attachment"
              onClick={() => setPreviewImage(item.url)}
              sx={{
                width: '100%',
                height: 250,
                objectFit: 'cover',
                cursor: 'pointer',
                display: 'block',
                transition: 'opacity 0.2s',
                '&:hover': { opacity: 0.95 },
              }}
            />
          ))}
        </Box>
      );
    }

    if (count === 3) {
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gridTemplateRows: 'repeat(2, 140px)',
            gap: 1,
            mt: 1.5,
            mb: 1,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            component="img"
            src={post.media[0].url}
            alt="Community Post attachment"
            onClick={() => setPreviewImage(post.media[0].url)}
            sx={{
              gridRow: 'span 2',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              cursor: 'pointer',
              display: 'block',
              transition: 'opacity 0.2s',
              '&:hover': { opacity: 0.95 },
            }}
          />
          {post.media.slice(1, 3).map((item) => (
            <Box
              key={item.id}
              component="img"
              src={item.url}
              alt="Community Post attachment"
              onClick={() => setPreviewImage(item.url)}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                cursor: 'pointer',
                display: 'block',
                transition: 'opacity 0.2s',
                '&:hover': { opacity: 0.95 },
              }}
            />
          ))}
        </Box>
      );
    }

    // 4 images: 2x2 grid
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'repeat(2, 160px)',
          gap: 1,
          mt: 1.5,
          mb: 1,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        {post.media.slice(0, 4).map((item) => (
          <Box
            key={item.id}
            component="img"
            src={item.url}
            alt="Community Post attachment"
            onClick={() => setPreviewImage(item.url)}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              cursor: 'pointer',
              display: 'block',
              transition: 'opacity 0.2s',
              '&:hover': { opacity: 0.95 },
            }}
          />
        ))}
      </Box>
    );
  };

  return (
    <>
      <Card elevation={2} sx={{ borderRadius: 3, mb: 3 }}>
        <CardHeader
          avatar={
            <Avatar sx={{ bgcolor: 'primary.main', fontWeight: 'bold' }}>
              {post.author.fullName.charAt(0).toUpperCase()}
            </Avatar>
          }
          action={
            (canEdit || canDelete) && (
              <>
                <IconButton aria-label="settings" onClick={handleMenuOpen} size="small">
                  <MoreVertIcon />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={isMenuOpen}
                  onClose={handleMenuClose}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                  {canEdit && (
                    <MenuItem onClick={handleOpenEdit}>
                      <ListItemIcon>
                        <EditIcon fontSize="small" color="primary" />
                      </ListItemIcon>
                      <ListItemText>Edit Post</ListItemText>
                    </MenuItem>
                  )}
                  {canDelete && (
                    <MenuItem onClick={handleOpenDelete} sx={{ color: 'error.main' }}>
                      <ListItemIcon>
                        <DeleteIcon fontSize="small" color="error" />
                      </ListItemIcon>
                      <ListItemText>
                        {!isOwner && isModerator ? 'Moderate Delete' : 'Delete Post'}
                      </ListItemText>
                    </MenuItem>
                  )}
                </Menu>
              </>
            )
          }
          title={
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="subtitle1" fontWeight="bold">
                {post.author.fullName}
              </Typography>
              {post.author.role !== UserRole.MEMBER && (
                <Chip
                  label={post.author.role}
                  size="small"
                  color="primary"
                  variant="outlined"
                  icon={<ShieldIcon />}
                  sx={{ height: 20, fontSize: '0.65rem' }}
                />
              )}
            </Box>
          }
          subheader={
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mt={0.25}>
              <Typography variant="caption" color="text.secondary">
                {formattedDate} {isEdited && '(edited)'}
              </Typography>
              {locationString && (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <LocationOnIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    {locationString}
                  </Typography>
                </Box>
              )}
            </Box>
          }
        />

        <CardContent sx={{ pt: 0, pb: 1.5 }}>
          <Box mb={1.5}>
            <Chip
              label={typeDetails.label}
              size="small"
              color={typeDetails.color}
              icon={typeDetails.icon}
              sx={{ fontWeight: 500 }}
            />
          </Box>
          {post.content && (
            <Typography
              variant="body1"
              color="text.primary"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}
            >
              {post.content}
            </Typography>
          )}

          {/* Render Media Grid */}
          {renderMediaGrid()}
        </CardContent>

        <Divider />

        {/* Action Controls: Like and Comment */}
        <CardActions sx={{ px: 2, py: 1, justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={2}>
            {/* Like Button */}
            <Button
              size="small"
              onClick={handleToggleLike}
              disabled={isLikePending}
              startIcon={
                isLiked ? (
                  <FavoriteIcon sx={{ color: 'error.main' }} />
                ) : (
                  <FavoriteBorderIcon color="action" />
                )
              }
              sx={{
                color: isLiked ? 'error.main' : 'text.secondary',
                fontWeight: isLiked ? 600 : 500,
                textTransform: 'none',
              }}
            >
              {likesCount > 0 ? `${likesCount} ${likesCount === 1 ? 'Like' : 'Likes'}` : 'Like'}
            </Button>

            {/* Comment Toggle Button */}
            <Button
              size="small"
              onClick={handleToggleComments}
              startIcon={<ChatBubbleOutlineIcon color="action" />}
              sx={{
                color: isCommentsExpanded ? 'primary.main' : 'text.secondary',
                fontWeight: isCommentsExpanded ? 600 : 500,
                textTransform: 'none',
              }}
            >
              {commentsCount > 0
                ? `${commentsCount} ${commentsCount === 1 ? 'Comment' : 'Comments'}`
                : 'Comment'}
            </Button>
          </Box>

          {!isOwner && isModerator && (
            <Chip label="Admin Control Enabled" size="small" variant="outlined" color="secondary" />
          )}
        </CardActions>

        {/* Expandable Comments Section */}
        <Collapse in={isCommentsExpanded} timeout="auto" unmountOnExit>
          <Divider />
          <Box sx={{ p: 2, bgcolor: 'action.hover' }}>
            {/* Comment Creation Form */}
            <Box
              component="form"
              onSubmit={handleCreateComment}
              display="flex"
              gap={1.5}
              alignItems="flex-start"
              mb={2}
            >
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: 'secondary.main',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                }}
              >
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </Avatar>
              <Box flexGrow={1}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Write a comment for the community..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  disabled={isSubmittingComment}
                  multiline
                  maxRows={4}
                  error={Boolean(commentError)}
                  helperText={commentError}
                  sx={{ bgcolor: 'background.paper', borderRadius: 1 }}
                />
              </Box>
              <Button
                type="submit"
                variant="contained"
                size="medium"
                disabled={isSubmittingComment || !newCommentText.trim()}
                sx={{ minWidth: 44, height: 40, px: 2 }}
              >
                {isSubmittingComment ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <SendIcon fontSize="small" />
                )}
              </Button>
            </Box>

            {/* Comments List */}
            {isLoadingComments ? (
              <Box display="flex" justifyContent="center" py={3}>
                <CircularProgress size={24} />
              </Box>
            ) : comments.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center" py={2}>
                No comments yet. Be the first to start the conversation!
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {comments.map((comment) => {
                  const isCommentOwner = user?.id === comment.authorId;
                  const canDeleteComment = isCommentOwner || isModerator;
                  const isEditingThisComment = editingCommentId === comment.id;

                  const commentDate = new Date(comment.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <Box
                      key={comment.id}
                      sx={{
                        p: 1.5,
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        boxShadow: 1,
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box display="flex" alignItems="center" gap={1}>
                          <Avatar
                            sx={{
                              width: 28,
                              height: 28,
                              bgcolor: 'primary.light',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                            }}
                          >
                            {comment.author.fullName.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Box display="flex" alignItems="center" gap={0.75}>
                              <Typography variant="subtitle2" fontWeight="bold" fontSize="0.85rem">
                                {comment.author.fullName}
                              </Typography>
                              {comment.author.role !== UserRole.MEMBER && (
                                <Chip
                                  label={comment.author.role}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                  sx={{ height: 16, fontSize: '0.55rem' }}
                                />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {commentDate}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Comment Actions */}
                        {!isEditingThisComment && (
                          <Box display="flex" gap={0.5}>
                            {isCommentOwner && (
                              <Tooltip title="Edit comment">
                                <IconButton
                                  size="small"
                                  onClick={() => handleStartEditComment(comment)}
                                >
                                  <EditIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canDeleteComment && (
                              <Tooltip title={!isCommentOwner && isModerator ? 'Moderate delete' : 'Delete comment'}>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => setCommentToDelete(comment)}
                                >
                                  <DeleteIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </Box>

                      {/* Comment Body or Inline Editor */}
                      {isEditingThisComment ? (
                        <Box mt={1}>
                          {editCommentError && (
                            <Alert severity="error" sx={{ mb: 1, py: 0.5 }}>
                              {editCommentError}
                            </Alert>
                          )}
                          <TextField
                            fullWidth
                            size="small"
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            disabled={isUpdatingComment}
                            multiline
                            maxRows={3}
                          />
                          <Box display="flex" justifyContent="flex-end" gap={1} mt={1}>
                            <Button
                              size="small"
                              onClick={handleCancelEditComment}
                              disabled={isUpdatingComment}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handleSaveEditComment(comment.id)}
                              disabled={isUpdatingComment || !editingCommentText.trim()}
                            >
                              {isUpdatingComment ? 'Saving...' : 'Save'}
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <Typography
                          variant="body2"
                          color="text.primary"
                          sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                        >
                          {comment.content}
                        </Typography>
                      )}
                    </Box>
                  );
                })}

                {/* Load More Comments Button */}
                {hasMoreComments && (
                  <Box display="flex" justifyContent="center" pt={1}>
                    <Button
                      size="small"
                      onClick={handleLoadMoreComments}
                      disabled={isLoadingMoreComments}
                      startIcon={
                        isLoadingMoreComments ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : undefined
                      }
                    >
                      {isLoadingMoreComments ? 'Loading...' : 'Load more comments'}
                    </Button>
                  </Box>
                )}
              </Stack>
            )}
          </Box>
        </Collapse>
      </Card>

      {/* Delete Comment Confirmation Dialog */}
      <Dialog
        open={Boolean(commentToDelete)}
        onClose={() => !isDeletingComment && setCommentToDelete(null)}
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>Confirm Comment Deletion</DialogTitle>
        <DialogContent>
          {deleteCommentError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteCommentError}
            </Alert>
          )}
          <DialogContentText>
            {commentToDelete && user?.id !== commentToDelete.authorId && isModerator
              ? 'As a moderator, you are deleting this member comment. This action cannot be undone.'
              : 'Are you sure you want to delete your comment?'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setCommentToDelete(null)}
            disabled={isDeletingComment}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDeleteComment}
            color="error"
            variant="contained"
            disabled={isDeletingComment}
            startIcon={
              isDeletingComment ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <DeleteIcon />
              )
            }
          >
            {isDeletingComment ? 'Deleting...' : 'Delete Comment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onClose={() => !isUpdating && !isUploadingEditMedia && setIsEditDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>Edit Community Post</DialogTitle>
        <DialogContent dividers>
          {updateError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {updateError}
            </Alert>
          )}

          <TextField
            select
            fullWidth
            size="small"
            label="Post Type"
            value={editType}
            onChange={(e) => setEditType(e.target.value as PostType)}
            disabled={isUpdating || isUploadingEditMedia}
            sx={{ mb: 2, mt: 1 }}
          >
            <MenuItem value={PostType.GENERAL}>General Post</MenuItem>
            <MenuItem value={PostType.EVENT}>Community Event</MenuItem>
            {isModerator && <MenuItem value={PostType.ANNOUNCEMENT}>Announcement</MenuItem>}
          </TextField>

          <TextField
            fullWidth
            multiline
            minRows={4}
            maxRows={8}
            label="Post Content"
            placeholder="Share something with your community..."
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={isUpdating || isUploadingEditMedia}
          />

          {/* Edit Attached Images */}
          <Box mt={2}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Attached Images ({editMedia.length}/4)
            </Typography>

            {editMedia.length > 0 && (
              <Box display="flex" gap={1.5} flexWrap="wrap" mb={2}>
                {editMedia.map((m, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      position: 'relative',
                      width: 80,
                      height: 80,
                      borderRadius: 1.5,
                      overflow: 'hidden',
                      border: '1px solid #e0e0e0',
                    }}
                  >
                    <Box
                      component="img"
                      src={m.url}
                      alt="Thumbnail"
                      sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <IconButton
                      size="small"
                      disabled={isUpdating || isUploadingEditMedia}
                      onClick={() => handleRemoveEditMedia(idx)}
                      sx={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        bgcolor: 'rgba(0,0,0,0.6)',
                        color: 'white',
                        p: 0.3,
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            {editMedia.length < 4 && (
              <Box>
                <input
                  type="file"
                  id="edit-post-file-input"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handleEditMediaUpload}
                  disabled={isUpdating || isUploadingEditMedia}
                />
                <label htmlFor="edit-post-file-input">
                  <Button
                    component="span"
                    variant="outlined"
                    size="small"
                    startIcon={
                      isUploadingEditMedia ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <AddPhotoAlternateIcon />
                      )
                    }
                    disabled={isUpdating || isUploadingEditMedia}
                  >
                    {isUploadingEditMedia ? 'Uploading...' : 'Add Images'}
                  </Button>
                </label>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setIsEditDialogOpen(false)}
            disabled={isUpdating || isUploadingEditMedia}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            color="primary"
            disabled={isUpdating || isUploadingEditMedia || (!editContent.trim() && editMedia.length === 0)}
            startIcon={isUpdating ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Post Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onClose={() => !isDeleting && setIsDeleteDialogOpen(false)}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Confirm Deletion</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>
            {!isOwner && isModerator
              ? 'As a community administrator, you are about to delete this member post for moderation. Attached media will also be removed. This action cannot be undone.'
              : 'Are you sure you want to delete your post? Attached media will also be removed. This action cannot be undone.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelete}
            color="error"
            variant="contained"
            disabled={isDeleting}
            startIcon={isDeleting ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon />}
          >
            {isDeleting ? 'Deleting...' : 'Delete Post'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox Preview Modal */}
      <Dialog
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        maxWidth="lg"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          },
        }}
      >
        <IconButton
          onClick={() => setPreviewImage(null)}
          sx={{
            position: 'fixed',
            top: 16,
            right: 16,
            color: 'white',
            bgcolor: 'rgba(0,0,0,0.6)',
            '&:hover': { bgcolor: 'rgba(0,0,0,0.85)' },
            zIndex: 10,
          }}
        >
          <CloseIcon />
        </IconButton>
        {previewImage && (
          <Box
            component="img"
            src={previewImage}
            alt="Full size preview"
            sx={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 2,
              boxShadow: 24,
            }}
          />
        )}
      </Dialog>
    </>
  );
};

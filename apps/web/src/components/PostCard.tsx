import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Snackbar,
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
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import ShareIcon from '@mui/icons-material/Share';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import type {
  PostItem,
  PostMediaType,
  PostMediaItem,
  CommentItem,
} from '@apnasamaj/shared-types';
import {
  PostType,
  UserRole,
} from '@apnasamaj/shared-types';
import { updatePostSchema, createCommentSchema } from '@apnasamaj/validation';
import {
  updatePostApi,
  deletePostApi,
  pinPostApi,
  unpinPostApi,
  recordPostViewApi,
  getPostViewsApi,
  uploadPostMediaApi,
  likePostApi,
  unlikePostApi,
  getPostCommentsApi,
  createCommentApi,
  updateCommentApi,
  deleteCommentApi,
} from '../services/posts.service';
import { useAuth } from '../context/AuthContext';
import { buildSharePayload } from '../utils/post-sharing';

interface PostCardProps {
  post: PostItem;
  priority?: boolean;
  initialCommentsExpanded?: boolean;
  targetCommentId?: string;
  onPostUpdated: (post: PostItem) => void;
  onPostDeleted: (postId: string) => void;
}

import {
  viewedPostsSession,
  inFlightViewRequests,
  inFlightCountRequests,
  cachedPostViewCounts,
  isCardSubstantiallyVisible,
  triggerPostViewRecord,
  fetchPostViewCounts,
} from '../utils/post-view-tracking';

export {
  viewedPostsSession,
  inFlightViewRequests,
  inFlightCountRequests,
  cachedPostViewCounts,
  isCardSubstantiallyVisible,
  triggerPostViewRecord,
  fetchPostViewCounts,
};

export const PostCard: React.FC<PostCardProps> = ({
  post,
  priority = false,
  initialCommentsExpanded = false,
  targetCommentId,
  onPostUpdated,
  onPostDeleted,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

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
  const [isCommentsExpanded, setIsCommentsExpanded] = useState<boolean>(
    Boolean(initialCommentsExpanded || targetCommentId)
  );
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

  // Views analytics state - initialize with post counts or cached counts, preserving known non-zero counts
  const initialViews = post.viewsCount ?? cachedPostViewCounts.get(post.id)?.totalViews ?? 0;
  const initialMembers = post.uniqueMembersCount ?? cachedPostViewCounts.get(post.id)?.uniqueMembers ?? 0;

  const [viewsCount, setViewsCount] = useState<number>(initialViews);
  const [uniqueMembersCount, setUniqueMembersCount] = useState<number>(initialMembers);
  const cardRef = React.useRef<HTMLDivElement | null>(null);

  // Monotonic reconciliation: ensure counts never decrement or get overwritten with stale smaller numbers
  const updateCountsMonotonically = React.useCallback((totalViews: number, uniqueMembers: number) => {
    setViewsCount((prev) => Math.max(prev, totalViews));
    setUniqueMembersCount((prev) => Math.max(prev, uniqueMembers));
  }, []);

  const triggerViewRecord = React.useCallback(async () => {
    const result = await triggerPostViewRecord(post.id, user?.id, (id) => recordPostViewApi(id));
    if (result.success && result.data) {
      updateCountsMonotonically(result.data.totalViews, result.data.uniqueMembers);
    }
  }, [post.id, user?.id, updateCountsMonotonically]);

  // Keep likes, comments, and views count in sync if post prop updates (without resetting to 0)
  useEffect(() => {
    setIsLiked(Boolean(post.isLikedByMe));
    setLikesCount(post.likesCount || 0);
    setCommentsCount(post.commentsCount || 0);
    if (post.viewsCount !== undefined && post.viewsCount > 0) {
      updateCountsMonotonically(post.viewsCount, post.uniqueMembersCount ?? post.viewsCount);
    }
  }, [post.isLikedByMe, post.likesCount, post.commentsCount, post.viewsCount, post.uniqueMembersCount, updateCountsMonotonically]);

  // Retrieve aggregate counts on mount via existing GET endpoint (never records a view)
  useEffect(() => {
    let isMounted = true;
    if (!user?.id) return;

    fetchPostViewCounts(post.id, user.id, (id) => getPostViewsApi(id)).then((result) => {
      if (isMounted && result.success && result.data) {
        updateCountsMonotonically(result.data.totalViews, result.data.uniqueMembers);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [post.id, user?.id, updateCountsMonotonically]);

  // View tracking: trigger view when card is genuinely in viewport for >= 1.2s
  useEffect(() => {
    if (!user?.id || viewedPostsSession.has(post.id)) return;

    let timer: NodeJS.Timeout | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (isCardSubstantiallyVisible(entry)) {
          if (!timer) {
            timer = setTimeout(() => {
              triggerViewRecord();
            }, 1200);
          }
        } else {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: [0, 0.2, 0.5] }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [post.id, user?.id, triggerViewRecord]);

  const isOwner = user?.id === post.authorId;
  const isModerator =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.COMMUNITY_ADMIN ||
    user?.role === UserRole.MODERATOR;

  const canEdit = isOwner;
  const canDelete = isOwner || isModerator;
  const canPin = isModerator;

  // Pin / Unpin state
  const [isPinning, setIsPinning] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const handleTogglePin = async () => {
    setIsPinning(true);
    setPinError(null);
    handleMenuClose();
    try {
      const updated = post.isPinned
        ? await unpinPostApi(post.id)
        : await pinPostApi(post.id);
      onPostUpdated(updated);
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'Failed to update post pin status.');
    } finally {
      setIsPinning(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Share state & handlers
  const [shareAnchorEl, setShareAnchorEl] = useState<null | HTMLElement>(null);
  const isShareMenuOpen = Boolean(shareAnchorEl);

  const handleShareMenuClose = () => {
    setShareAnchorEl(null);
  };

  const getCanonicalPostUrl = () => {
    return `${window.location.origin}/posts/${post.id}`;
  };

  const getSharePayload = () => {
    return buildSharePayload({
      authorName: post.author.fullName,
      content: post.content,
      canonicalUrl: getCanonicalPostUrl(),
    });
  };

  const handleShareClick = async (event: React.MouseEvent<HTMLElement>) => {
    const payload = getSharePayload();

    if (navigator.share && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: payload.title,
          text: payload.nativeShareText,
          url: payload.canonicalUrl,
        });
        return;
      } catch (err: unknown) {
        // User cancelled native share sheet: do not treat as error, do not open fallback menu
        if (
          err instanceof Error &&
          (err.name === 'AbortError' ||
            err.message.toLowerCase().includes('abort') ||
            err.message.toLowerCase().includes('cancel'))
        ) {
          return;
        }
        // Fallback menu for other share failures
        setShareAnchorEl(event.currentTarget);
      }
    } else {
      setShareAnchorEl(event.currentTarget);
    }
  };

  const handleShareWhatsApp = () => {
    handleShareMenuClose();
    const payload = getSharePayload();
    window.open(payload.whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = () => {
    handleMenuClose();
    handleShareMenuClose();
    const canonicalUrl = getCanonicalPostUrl();

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(canonicalUrl)
        .then(() => {
          setCopyFeedback('Post link copied to clipboard!');
        })
        .catch(() => {
          setCopyFeedback('Failed to copy link to clipboard.');
        });
    } else {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = canonicalUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) {
          setCopyFeedback('Post link copied to clipboard!');
        } else {
          setCopyFeedback('Failed to copy link to clipboard.');
        }
      } catch {
        setCopyFeedback('Failed to copy link to clipboard.');
      }
    }
  };

  const handleViewPostDetail = () => {
    handleMenuClose();
    navigate(`/posts/${post.id}`);
  };

  // Likes Handler
  const handleToggleLike = async () => {
    if (isLikePending) return;
    triggerViewRecord();

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
    triggerViewRecord();
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

  useEffect(() => {
    if ((initialCommentsExpanded || targetCommentId) && !hasLoadedCommentsOnce) {
      loadInitialComments();
    }
  }, [initialCommentsExpanded, targetCommentId, post.id]);

  // Target comment deep-link highlighting & smooth scroll
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const hasScrolledToCommentRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (!targetCommentId || hasScrolledToCommentRef.current) return;
    const foundComment = comments.find((c) => c.id === targetCommentId);
    if (foundComment) {
      hasScrolledToCommentRef.current = true;
      setHighlightedCommentId(foundComment.id);

      setTimeout(() => {
        const el = document.getElementById(`comment-${foundComment.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);

      const timer = setTimeout(() => {
        setHighlightedCommentId(null);
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [comments, targetCommentId]);

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
          mediaType: 'IMAGE',
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

    const imageLoading = priority ? 'eager' : 'lazy';
    const imageDecoding = 'async';

    if (count === 1) {
      const item = post.media[0];
      return (
        <Box sx={{ mt: 1.5, mb: 1, borderRadius: 2, overflow: 'hidden' }}>
          <Box
            component="img"
            src={item.url}
            alt="Community Post attachment"
            loading={imageLoading}
            decoding={imageDecoding}
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
              loading={imageLoading}
              decoding={imageDecoding}
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
            loading={imageLoading}
            decoding={imageDecoding}
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
              loading={imageLoading}
              decoding={imageDecoding}
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
            loading={imageLoading}
            decoding={imageDecoding}
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
      <Card ref={cardRef} elevation={2} sx={{ borderRadius: 3, mb: 3 }}>
        <CardHeader
          avatar={
            <Avatar
              src={post.author.avatarUrl || undefined}
              alt={post.author.fullName}
              onClick={() => navigate(`/members/${post.author.id}`)}
              sx={{
                bgcolor: 'primary.main',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'transform 0.2s ease',
                '&:hover': { transform: 'scale(1.05)' },
              }}
            >
              {post.author.fullName.charAt(0).toUpperCase()}
            </Avatar>
          }
          action={
            <>
              <IconButton aria-label="post options" onClick={handleMenuOpen} size="small">
                <MoreVertIcon />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={isMenuOpen}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem onClick={handleCopyLink}>
                  <ListItemIcon>
                    <ShareIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText>Copy Link to Post</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleViewPostDetail}>
                  <ListItemIcon>
                    <OpenInNewIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText>View Post Details</ListItemText>
                </MenuItem>
                {canPin && (
                  <MenuItem onClick={handleTogglePin} disabled={isPinning}>
                    <ListItemIcon>
                      {post.isPinned ? (
                        <PushPinOutlinedIcon fontSize="small" color="primary" />
                      ) : (
                        <PushPinIcon fontSize="small" color="primary" />
                      )}
                    </ListItemIcon>
                    <ListItemText>{post.isPinned ? 'Unpin Post' : 'Pin Post'}</ListItemText>
                  </MenuItem>
                )}
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
          }
          title={
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography
                variant="subtitle1"
                fontWeight="bold"
                onClick={() => navigate(`/members/${post.author.id}`)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                }}
              >
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
              <Typography
                variant="caption"
                color="text.secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/posts/${post.id}`);
                }}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                }}
              >
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

        {pinError && (
          <Alert severity="error" onClose={() => setPinError(null)} sx={{ mx: 2, mb: 1 }}>
            {pinError}
          </Alert>
        )}

        <CardContent sx={{ pt: 0, pb: 1.5 }}>
          <Box mb={1.5} display="flex" alignItems="center" gap={1} flexWrap="wrap">
            {post.isPinned && (
              <Chip
                label="Pinned"
                size="small"
                color="secondary"
                icon={<PushPinIcon fontSize="small" />}
                sx={{ fontWeight: 'bold' }}
              />
            )}
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

        {/* Action Controls: Like, Comment, and Share */}
        <CardActions sx={{ px: 2, py: 1, justifyContent: 'space-between' }}>
          <Box display="flex" alignItems="center" gap={1.5}>
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

            {/* Share Button */}
            <Button
              size="small"
              onClick={handleShareClick}
              startIcon={<ShareOutlinedIcon color="action" />}
              sx={{
                color: isShareMenuOpen ? 'primary.main' : 'text.secondary',
                fontWeight: isShareMenuOpen ? 600 : 500,
                textTransform: 'none',
              }}
            >
              Share
            </Button>

            {/* Fallback Share Menu */}
            <Menu
              anchorEl={shareAnchorEl}
              open={isShareMenuOpen}
              onClose={handleShareMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              <MenuItem onClick={handleShareWhatsApp}>
                <ListItemIcon>
                  <WhatsAppIcon fontSize="small" sx={{ color: '#25D366' }} />
                </ListItemIcon>
                <ListItemText>Share on WhatsApp</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleCopyLink}>
                <ListItemIcon>
                  <ContentCopyIcon fontSize="small" color="action" />
                </ListItemIcon>
                <ListItemText>Copy Link</ListItemText>
              </MenuItem>
            </Menu>
          </Box>

          <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
            {/* View Analytics Indicator */}
            <Tooltip title="Verified views and unique member reach">
              <Box
                display="flex"
                alignItems="center"
                gap={0.5}
                sx={{
                  color: 'text.secondary',
                  cursor: 'default',
                  userSelect: 'none',
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                  {viewsCount} {viewsCount === 1 ? 'View' : 'Views'} · {uniqueMembersCount} {uniqueMembersCount === 1 ? 'Member' : 'Members'}
                </Typography>
              </Box>
            </Tooltip>

            {!isOwner && isModerator && (
              <Chip label="Admin Control Enabled" size="small" variant="outlined" color="secondary" />
            )}
          </Box>
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
              <Box
                sx={{
                  py: 3,
                  px: 2,
                  textAlign: 'center',
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  border: '1px dashed',
                  borderColor: 'divider',
                  mt: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No comments yet. Be the first to start the conversation!
                </Typography>
              </Box>
            ) : (
              <Stack spacing={1.5}>
                {comments.map((comment) => {
                  const isCommentOwner = user?.id === comment.authorId;
                  const canDeleteComment = isCommentOwner || isModerator;
                  const isEditingThisComment = editingCommentId === comment.id;
                  const isHighlighted = highlightedCommentId === comment.id;

                  const commentDate = new Date(comment.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <Box
                      id={`comment-${comment.id}`}
                      key={comment.id}
                      sx={{
                        p: 1.5,
                        bgcolor: isHighlighted ? 'action.selected' : 'background.paper',
                        borderRadius: 2,
                        boxShadow: 1,
                        border: '1px solid',
                        borderColor: isHighlighted ? 'primary.main' : 'transparent',
                        transition: 'background-color 0.8s ease, border-color 0.8s ease',
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
      <Snackbar
        open={Boolean(copyFeedback)}
        autoHideDuration={3000}
        onClose={() => setCopyFeedback(null)}
        message={copyFeedback}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
};

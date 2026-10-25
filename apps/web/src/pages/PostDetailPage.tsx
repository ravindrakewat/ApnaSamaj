import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Skeleton,
  Paper,
  Stack,
  Breadcrumbs,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import GroupsIcon from '@mui/icons-material/Groups';
import type { PostItem } from '@apnasamaj/shared-types';
import { getPostApi } from '../services/posts.service';
import { PostCard } from '../components/PostCard';

export const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetCommentId = searchParams.get('commentId') || undefined;

  const [post, setPost] = useState<PostItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  // Dynamic document.title with cleanup on unmount
  useEffect(() => {
    const previousTitle = document.title;
    if (post) {
      const snippet = post.content
        ? post.content.length > 50
          ? `${post.content.slice(0, 47)}...`
          : post.content
        : 'Post';
      document.title = `${post.author.fullName}: "${snippet}" | Apna Samaj`;
    }
    return () => {
      document.title = previousTitle;
    };
  }, [post]);

  const fetchPost = useCallback(async () => {
    if (!postId) {
      setIsNotFound(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsNotFound(false);

    try {
      const data = await getPostApi(postId);
      setPost(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve post.';
      // Differentiate 404 / unavailable from transient connection errors
      if (
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('unavailable') ||
        msg.toLowerCase().includes('404')
      ) {
        setIsNotFound(true);
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  const handlePostUpdated = (updatedPost: PostItem) => {
    setPost(updatedPost);
  };

  const handlePostDeleted = (_deletedPostId: string) => {
    // Navigate back to feed or group if the post was deleted
    if (post?.group?.slug) {
      navigate(`/groups/${post.group.slug}`);
    } else {
      navigate('/feed');
    }
  };

  const handleBack = () => {
    if (post?.group?.slug) {
      navigate(`/groups/${post.group.slug}`);
    } else {
      navigate('/feed');
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      {/* Top Breadcrumb & Navigation Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          mb: 3,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            sx={{
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            {post?.group ? `Back to ${post.group.name}` : 'Back to Feed'}
          </Button>

          <Breadcrumbs aria-label="breadcrumb" sx={{ display: { xs: 'none', sm: 'flex' } }}>
            <Link
              underline="hover"
              color="inherit"
              onClick={() => navigate('/feed')}
              sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <DynamicFeedIcon fontSize="inherit" />
              Feed
            </Link>
            {post?.group && (
              <Link
                underline="hover"
                color="inherit"
                onClick={() => navigate(`/groups/${post.group?.slug}`)}
                sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <GroupsIcon fontSize="inherit" />
                {post.group.name}
              </Link>
            )}
            <Typography color="text.primary" fontWeight={600}>
              Post
            </Typography>
          </Breadcrumbs>
        </Stack>

        {!isLoading && !isNotFound && (
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchPost}
            sx={{ textTransform: 'none' }}
          >
            Refresh
          </Button>
        )}
      </Box>

      {/* Loading Skeleton State */}
      {isLoading && (
        <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <Skeleton variant="circular" width={48} height={48} />
            <Box sx={{ flexGrow: 1 }}>
              <Skeleton variant="text" width="40%" height={24} />
              <Skeleton variant="text" width="25%" height={18} />
            </Box>
          </Stack>
          <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2, mb: 2 }} />
          <Skeleton variant="text" width="60%" height={20} />
          <Box display="flex" justifyContent="center" alignItems="center" py={4}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading post details...
            </Typography>
          </Box>
        </Paper>
      )}

      {/* 404 / Private / Inaccessible State */}
      {!isLoading && isNotFound && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 5 },
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              p: 2,
              borderRadius: '50%',
              bgcolor: 'action.hover',
              color: 'text.secondary',
              mb: 2,
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 48 }} />
          </Box>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Post Unavailable
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ maxWidth: 480, mx: 'auto', mb: 3 }}
          >
            This post could not be found or you may not have permission to view it.
            It may have been deleted, or belongs to a private group that requires membership.
          </Typography>
          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              onClick={() => navigate('/feed')}
              sx={{ textTransform: 'none', px: 3, borderRadius: 2 }}
            >
              Go to Community Feed
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate('/groups')}
              sx={{ textTransform: 'none', px: 3, borderRadius: 2 }}
            >
              Explore Groups
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Generic Error / Network Retry State */}
      {!isLoading && !isNotFound && errorMessage && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={fetchPost}>
              Retry
            </Button>
          }
          sx={{ borderRadius: 2, mb: 3 }}
        >
          {errorMessage}
        </Alert>
      )}

      {/* Active Post Card */}
      {!isLoading && !isNotFound && post && (
        <PostCard
          post={post}
          priority={true}
          initialCommentsExpanded={true}
          targetCommentId={targetCommentId}
          onPostUpdated={handlePostUpdated}
          onPostDeleted={handlePostDeleted}
        />
      )}
    </Container>
  );
};

export default PostDetailPage;

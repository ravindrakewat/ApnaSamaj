import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  Chip,
  Stack,
  Button,
  CircularProgress,
  Alert,
  Skeleton,
  Paper,
} from '@mui/material';
import ForumIcon from '@mui/icons-material/Forum';
import CampaignIcon from '@mui/icons-material/Campaign';
import EventIcon from '@mui/icons-material/Event';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshIcon from '@mui/icons-material/Refresh';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import { PostItem, PostType, FeedPaginationMeta } from '@apnasamaj/shared-types';
import { getFeedApi } from '../services/posts.service';
import { CreatePostComposer } from '../components/CreatePostComposer';
import { PostCard } from '../components/PostCard';

export const FeedPage: React.FC = () => {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [pagination, setPagination] = useState<FeedPaginationMeta>({
    page: 1,
    limit: 10,
    totalPosts: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [selectedType, setSelectedType] = useState<PostType | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchFeed = useCallback(
    async (pageToFetch: number = 1, typeFilter?: PostType) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await getFeedApi(pageToFetch, 10, typeFilter);
        setPosts(data.posts);
        setPagination(data.pagination);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load community feed.');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchFeed(1, selectedType);
  }, [fetchFeed, selectedType]);

  const handleTypeSelect = (type?: PostType) => {
    setSelectedType(type);
  };

  const handlePostCreated = (newPost: PostItem) => {
    // If we're on the first page and filter matches, prepend new post
    if (!selectedType || selectedType === newPost.type) {
      setPosts((prev) => [newPost, ...prev]);
      setPagination((prev) => ({
        ...prev,
        totalPosts: prev.totalPosts + 1,
      }));
    } else {
      // Switch filter to show all or the new type
      setSelectedType(undefined);
    }
  };

  const handlePostUpdated = (updatedPost: PostItem) => {
    setPosts((prev) => {
      const updatedList = prev.map((item) => (item.id === updatedPost.id ? updatedPost : item));
      return [...updatedList].sort((a, b) => {
        if (Boolean(a.isPinned) === Boolean(b.isPinned)) return 0;
        return a.isPinned ? -1 : 1;
      });
    });
  };

  const handlePostDeleted = (deletedPostId: string) => {
    setPosts((prev) => prev.filter((item) => item.id !== deletedPostId));
    setPagination((prev) => ({
      ...prev,
      totalPosts: Math.max(0, prev.totalPosts - 1),
    }));
  };

  const handlePreviousPage = () => {
    if (pagination.page > 1) {
      fetchFeed(pagination.page - 1, selectedType);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (pagination.hasMore) {
      fetchFeed(pagination.page + 1, selectedType);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Feed Page Header */}
      <Box mb={3} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Box>
          <Box display="flex" alignItems="center" gap={1.5}>
            <DynamicFeedIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              Community Feed
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Discover updates, events, and discussions from Apna Samaj members
          </Typography>
        </Box>

        <Button
          variant="outlined"
          color="primary"
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => fetchFeed(pagination.page, selectedType)}
          disabled={isLoading}
          sx={{ borderRadius: 2 }}
        >
          Refresh Feed
        </Button>
      </Box>

      {/* Post Composer Component */}
      <CreatePostComposer onPostCreated={handlePostCreated} />

      {/* Filter Chips Bar */}
      <Box mb={3} display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label="All Posts"
            clickable
            color={selectedType === undefined ? 'primary' : 'default'}
            onClick={() => handleTypeSelect(undefined)}
            sx={{ fontWeight: selectedType === undefined ? 600 : 400 }}
          />
          <Chip
            label="General"
            icon={<ForumIcon fontSize="small" />}
            clickable
            color={selectedType === PostType.GENERAL ? 'primary' : 'default'}
            onClick={() => handleTypeSelect(PostType.GENERAL)}
            sx={{ fontWeight: selectedType === PostType.GENERAL ? 600 : 400 }}
          />
          <Chip
            label="Announcements"
            icon={<CampaignIcon fontSize="small" />}
            clickable
            color={selectedType === PostType.ANNOUNCEMENT ? 'warning' : 'default'}
            onClick={() => handleTypeSelect(PostType.ANNOUNCEMENT)}
            sx={{ fontWeight: selectedType === PostType.ANNOUNCEMENT ? 600 : 400 }}
          />
          <Chip
            label="Events"
            icon={<EventIcon fontSize="small" />}
            clickable
            color={selectedType === PostType.EVENT ? 'info' : 'default'}
            onClick={() => handleTypeSelect(PostType.EVENT)}
            sx={{ fontWeight: selectedType === PostType.EVENT ? 600 : 400 }}
          />
        </Stack>

        <Typography variant="caption" color="text.secondary">
          {pagination.totalPosts} {pagination.totalPosts === 1 ? 'post' : 'posts'} total
        </Typography>
      </Box>

      {/* Error Alert */}
      {errorMessage && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => fetchFeed(pagination.page, selectedType)}>
              Retry
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      )}

      {/* Feed Content */}
      {isLoading ? (
        <Box>
          {[1, 2, 3].map((skeletonKey) => (
            <Paper key={skeletonKey} sx={{ p: 3, mb: 3, borderRadius: 3 }}>
              <Box display="flex" alignItems="center" gap={2} mb={2}>
                <Skeleton variant="circular" width={40} height={40} />
                <Box sx={{ flexGrow: 1 }}>
                  <Skeleton variant="text" width="40%" height={24} />
                  <Skeleton variant="text" width="20%" height={16} />
                </Box>
              </Box>
              <Skeleton variant="text" width="90%" height={20} />
              <Skeleton variant="text" width="80%" height={20} />
              <Skeleton variant="text" width="60%" height={20} />
            </Paper>
          ))}
        </Box>
      ) : posts.length === 0 ? (
        <Paper
          elevation={1}
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
            bgcolor: 'background.paper',
            my: 4,
          }}
        >
          <DynamicFeedIcon sx={{ fontSize: 56, color: 'text.secondary', opacity: 0.6, mb: 1.5 }} />
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            No Community Posts Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mb: 3 }}>
            {selectedType
              ? `There are currently no ${selectedType.toLowerCase()} posts in the feed. Be the first to start a conversation!`
              : 'The community feed is currently empty. Use the post composer above to share an update with the members!'}
          </Typography>
          {selectedType && (
            <Button variant="outlined" size="small" onClick={() => handleTypeSelect(undefined)}>
              View All Posts
            </Button>
          )}
        </Paper>
      ) : (
        <Box>
          {posts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              priority={index === 0}
              onPostUpdated={handlePostUpdated}
              onPostDeleted={handlePostDeleted}
            />
          ))}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mt: 4, mb: 2, px: 1 }}
            >
              <Button
                variant="outlined"
                size="small"
                startIcon={<ArrowBackIcon />}
                disabled={pagination.page <= 1}
                onClick={handlePreviousPage}
                sx={{ borderRadius: 2 }}
              >
                Previous
              </Button>

              <Typography variant="body2" color="text.secondary">
                Page {pagination.page} of {pagination.totalPages}
              </Typography>

              <Button
                variant="outlined"
                size="small"
                endIcon={<ArrowForwardIcon />}
                disabled={!pagination.hasMore}
                onClick={handleNextPage}
                sx={{ borderRadius: 2 }}
              >
                Next
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Container>
  );
};

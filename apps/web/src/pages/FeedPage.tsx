import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ForumIcon from '@mui/icons-material/Forum';
import CampaignIcon from '@mui/icons-material/Campaign';
import EventIcon from '@mui/icons-material/Event';
import RefreshIcon from '@mui/icons-material/Refresh';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import { PostItem, PostType, FeedPaginationMeta } from '@apnasamaj/shared-types';
import { getFeedApi } from '../services/posts.service';
import { CreatePostComposer } from '../components/CreatePostComposer';
import { PostCard } from '../components/PostCard';

// ---------------------------------------------------------------------------
// URL Synchronization Helpers
// ---------------------------------------------------------------------------

function getSearchFromParams(params: URLSearchParams): string {
  return (params.get('search') || '').slice(0, 100);
}

function getTypeFromParams(params: URLSearchParams): PostType | undefined {
  const typeParam = params.get('type');
  if (
    typeParam === PostType.GENERAL ||
    typeParam === PostType.ANNOUNCEMENT ||
    typeParam === PostType.EVENT
  ) {
    return typeParam as PostType;
  }
  return undefined;
}

function getPageFromParams(params: URLSearchParams): number {
  const p = parseInt(params.get('page') || '1', 10);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

export const FeedPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Initial State synchronized with URL parameters
  const [searchTerm, setSearchTerm] = useState<string>(() => getSearchFromParams(searchParams));
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() =>
    getSearchFromParams(searchParams).trim()
  );
  const [selectedType, setSelectedType] = useState<PostType | undefined>(() =>
    getTypeFromParams(searchParams)
  );
  const [page, setPage] = useState<number>(() => getPageFromParams(searchParams));

  // 2. Feed Data State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [pagination, setPagination] = useState<FeedPaginationMeta>({
    page: 1,
    limit: 10,
    totalPosts: 0,
    totalPages: 1,
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Concurrency, mount, and race condition guards
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isInitialMount = useRef(true);
  const lastSyncedParamsRef = useRef<string>(searchParams.toString());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // 4. 300ms Debounce on Search Input
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (trimmed !== debouncedSearch) {
        setDebouncedSearch(trimmed);
        setPage(1); // Reset pagination to page 1 whenever search query changes
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // 5. URL Synchronization (State -> URL parameters)
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    if (debouncedSearch.trim()) {
      nextParams.set('search', debouncedSearch.trim().slice(0, 100));
    } else {
      nextParams.delete('search');
    }

    if (selectedType) {
      nextParams.set('type', selectedType);
    } else {
      nextParams.delete('type');
    }

    if (page > 1) {
      nextParams.set('page', String(page));
    } else {
      nextParams.delete('page');
    }

    const nextStr = nextParams.toString();
    if (nextStr !== searchParams.toString()) {
      lastSyncedParamsRef.current = nextStr;
      setSearchParams(nextParams, { replace: true });
    }
  }, [debouncedSearch, selectedType, page, searchParams, setSearchParams]);

  // 6. Browser Back / Forward Synchronization (URL -> State)
  useEffect(() => {
    const currentStr = searchParams.toString();
    if (currentStr === lastSyncedParamsRef.current) {
      return; // Internal sync; do not overwrite state
    }

    lastSyncedParamsRef.current = currentStr;
    const newSearch = getSearchFromParams(searchParams);
    const newType = getTypeFromParams(searchParams);
    const newPage = getPageFromParams(searchParams);

    setSearchTerm(newSearch);
    setDebouncedSearch(newSearch.trim());
    setSelectedType(newType);
    setPage(newPage);
  }, [searchParams]);

  // 7. Core Data Fetching Function with Stale Request Protection
  const fetchFeed = useCallback(
    async (
      pageToFetch: number = 1,
      typeFilter?: PostType,
      searchQuery?: string,
      append: boolean = false
    ) => {
      if (append && inFlightRef.current) {
        return;
      }

      if (!append && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      inFlightRef.current = true;
      const currentRequestId = ++requestIdRef.current;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const cleanSearch = searchQuery && searchQuery.trim() ? searchQuery.trim().slice(0, 100) : undefined;
        const data = await getFeedApi(
          pageToFetch,
          10,
          typeFilter,
          undefined,
          cleanSearch,
          { signal: controller.signal }
        );

        if (requestIdRef.current !== currentRequestId || !isMountedRef.current) {
          return; // Ignore stale or unmounted response
        }

        if (append) {
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newPosts = data.posts.filter((p) => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        } else {
          setPosts(data.posts);
        }

        setPagination(data.pagination);
      } catch (err: unknown) {
        const isAbort =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError') ||
          (err as any)?.name === 'AbortError';

        if (isAbort) return;

        if (requestIdRef.current === currentRequestId && isMountedRef.current) {
          setErrorMessage(
            err instanceof Error ? err.message : 'कम्युनिटी फ़ीड लोड करने में समस्या हुई। कृपया पुनः प्रयास करें।'
          );
        }
      } finally {
        if (requestIdRef.current === currentRequestId && isMountedRef.current) {
          inFlightRef.current = false;
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    []
  );

  // 8. Fetch Feed whenever Debounced Search, Type Filter, or Page Changes
  useEffect(() => {
    fetchFeed(page, selectedType, debouncedSearch, page > 1);
  }, [fetchFeed, page, selectedType, debouncedSearch]);

  // 9. Interaction Handlers
  const handleTypeSelect = (type?: PostType) => {
    if (type === selectedType) return;
    setSelectedType(type);
    setPage(1); // Changing post-type filter resets to page 1
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedType(undefined);
    setPage(1);
  };

  const handleRefresh = () => {
    fetchFeed(1, selectedType, debouncedSearch, false);
  };

  const handleLoadMore = () => {
    if (pagination.hasMore && !isLoadingMore && !isLoading) {
      const nextPage = pagination.page + 1;
      setPage(nextPage);
      fetchFeed(nextPage, selectedType, debouncedSearch, true);
    }
  };

  const handlePostCreated = (newPost: PostItem) => {
    // Check if new post matches current filters
    const matchesType = !selectedType || selectedType === newPost.type;
    const matchesSearch =
      !debouncedSearch ||
      newPost.content.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      Boolean(newPost.author.fullName?.toLowerCase().includes(debouncedSearch.toLowerCase()));

    if (matchesType && matchesSearch) {
      setPosts((prev) => {
        if (prev.some((p) => p.id === newPost.id)) return prev;
        return [newPost, ...prev];
      });
      setPagination((prev) => ({
        ...prev,
        totalPosts: prev.totalPosts + 1,
      }));
    } else {
      // Clear filters so the user sees their new post
      handleClearAllFilters();
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

  const hasActiveFilters = useMemo(() => {
    return Boolean(debouncedSearch || selectedType !== undefined);
  }, [debouncedSearch, selectedType]);

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
          onClick={handleRefresh}
          disabled={isLoading || isLoadingMore}
          sx={{ borderRadius: 2 }}
          aria-label="फ़ीड रीफ़्रेश करें"
        >
          Refresh Feed
        </Button>
      </Box>

      {/* Post Composer Component */}
      <CreatePostComposer onPostCreated={handlePostCreated} />

      {/* Search and Filters Bar */}
      <Paper elevation={1} sx={{ p: 2.5, mb: 3, borderRadius: 3 }}>
        <Box display="flex" flexDirection="column" gap={2}>
          {/* Search Input Bar */}
          <TextField
            fullWidth
            size="small"
            placeholder="समाज की पोस्ट खोजें..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.slice(0, 100))}
            inputProps={{
              maxLength: 100,
              'aria-label': 'समाज की पोस्ट खोजें',
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: searchTerm ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={handleClearSearch}
                    aria-label="खोज साफ़ करें"
                    edge="end"
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />

          {/* Filter Chips Bar */}
          <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label="All Posts / सभी"
                clickable
                color={selectedType === undefined ? 'primary' : 'default'}
                onClick={() => handleTypeSelect(undefined)}
                sx={{ fontWeight: selectedType === undefined ? 600 : 400 }}
              />
              <Chip
                label="General / सामान्य"
                icon={<ForumIcon fontSize="small" />}
                clickable
                color={selectedType === PostType.GENERAL ? 'primary' : 'default'}
                onClick={() => handleTypeSelect(PostType.GENERAL)}
                sx={{ fontWeight: selectedType === PostType.GENERAL ? 600 : 400 }}
              />
              <Chip
                label="Announcements / सूचनाएं"
                icon={<CampaignIcon fontSize="small" />}
                clickable
                color={selectedType === PostType.ANNOUNCEMENT ? 'warning' : 'default'}
                onClick={() => handleTypeSelect(PostType.ANNOUNCEMENT)}
                sx={{ fontWeight: selectedType === PostType.ANNOUNCEMENT ? 600 : 400 }}
              />
              <Chip
                label="Events / आयोजन"
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
        </Box>
      </Paper>

      {/* Error Alert */}
      {errorMessage && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => fetchFeed(pagination.page, selectedType, debouncedSearch, false)}
            >
              पुनः प्रयास करें
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
            {hasActiveFilters ? 'कोई पोस्ट नहीं मिली' : 'कोई पोस्ट उपलब्ध नहीं है'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mb: 3 }}>
            {debouncedSearch
              ? `आपकी खोज "${debouncedSearch}" से मेल खाती कोई पोस्ट नहीं मिली। कृपया कोई अन्य शब्द खोजें या फ़िल्टर हटाएँ।`
              : selectedType
                ? `इस श्रेणी (${selectedType.toLowerCase()}) में अभी कोई पोस्ट नहीं है। पहली पोस्ट साझा करें!`
                : 'समाज का फ़ीड अभी खाली है। ऊपर दिए गए कंपोज़र का उपयोग करके पहली पोस्ट साझा करें!'}
          </Typography>
          <Box display="flex" justifyContent="center" gap={1.5} flexWrap="wrap">
            {debouncedSearch && (
              <Button variant="contained" size="small" onClick={handleClearSearch}>
                खोज साफ़ करें
              </Button>
            )}
            {selectedType && (
              <Button variant="outlined" size="small" onClick={() => handleTypeSelect(undefined)}>
                सभी पोस्ट देखें
              </Button>
            )}
            {hasActiveFilters && (
              <Button variant="text" size="small" onClick={handleClearAllFilters}>
                सभी फ़िल्टर साफ़ करें
              </Button>
            )}
          </Box>
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

          {/* Load More Button */}
          {pagination.hasMore && (
            <Box display="flex" justifyContent="center" sx={{ mt: 3, mb: 2 }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleLoadMore}
                disabled={isLoadingMore || isLoading}
                startIcon={isLoadingMore ? <CircularProgress size={18} color="inherit" /> : null}
                sx={{ borderRadius: 3, px: 4, py: 1 }}
              >
                {isLoadingMore ? 'पुराने पोस्ट लोड हो रहे हैं...' : 'और पोस्ट देखें'}
              </Button>
            </Box>
          )}

          {!pagination.hasMore && posts.length > 0 && (
            <Box textAlign="center" py={3}>
              <Typography variant="body2" color="text.secondary">
                {debouncedSearch
                  ? `"${debouncedSearch}" के लिए सभी परिणाम प्रदर्शित हैं।`
                  : 'आपने सभी नवीनतम पोस्ट देख ली हैं।'}
              </Typography>
            </Box>
          )}

          {/* Pagination Meta Information */}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mt: 2, mb: 2, px: 1 }}
          >
            <Typography variant="caption" color="text.secondary">
              Showing {posts.length} of {pagination.totalPosts} {pagination.totalPosts === 1 ? 'post' : 'posts'}
            </Typography>

            {pagination.totalPages > 1 && (
              <Typography variant="caption" color="text.secondary">
                Page {pagination.page} of {pagination.totalPages}
              </Typography>
            )}
          </Box>
        </Box>
      )}
    </Container>
  );
};

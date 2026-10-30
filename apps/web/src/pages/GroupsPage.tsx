import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Pagination,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Groups as GroupsIcon,
  Lock as LockIcon,
  Public as PublicIcon,
  Add as AddIcon,
  People as PeopleIcon,
  DynamicFeed as DynamicFeedIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { GroupListItem, GroupPrivacy } from '@apnasamaj/shared-types';
import { fetchGroups, createGroupApi, joinGroupApi } from '../services/groups.service';

export type PrivacyTabOption = 'ALL' | 'PUBLIC' | 'PRIVATE';

function getSearchFromParams(params: URLSearchParams): string {
  return (params.get('search') || '').slice(0, 100);
}

function getTabFromParams(params: URLSearchParams): PrivacyTabOption {
  const val = params.get('tab') || params.get('privacy');
  if (val === 'PUBLIC' || val === 'PRIVATE') {
    return val;
  }
  return 'ALL';
}

function getPageFromParams(params: URLSearchParams): number {
  const p = parseInt(params.get('page') || '1', 10);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

export const GroupsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Initial State from URL Parameters
  const [searchTerm, setSearchTerm] = useState<string>(() => getSearchFromParams(searchParams));
  const [debouncedSearch, setDebouncedSearch] = useState<string>(() => getSearchFromParams(searchParams));
  const [privacyTab, setPrivacyTab] = useState<PrivacyTabOption>(() => getTabFromParams(searchParams));
  const [page, setPage] = useState<number>(() => getPageFromParams(searchParams));
  const limit = 12;

  // 2. Data State
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalGroups, setTotalGroups] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 3. Create Group Dialog State
  const [openCreate, setOpenCreate] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createPrivacy, setCreatePrivacy] = useState<GroupPrivacy>(GroupPrivacy.PUBLIC);
  const [createCoverUrl, setCreateCoverUrl] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Joining loading state per group
  const [joiningId, setJoiningId] = useState<string | null>(null);

  // Stale request and mount management refs
  const lastSyncedParamsRef = useRef<string>(searchParams.toString());
  const isInitialMount = useRef<boolean>(true);
  const requestIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 4. 400ms Debounce on Search Input
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (searchTerm !== debouncedSearch) {
        setDebouncedSearch(searchTerm);
        setPage(1); // Reset page to 1 whenever search changes
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  // 5. Two-Way URL Synchronization: Reflect debounced filter and page in searchParams
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    // Search query: omit when empty
    if (debouncedSearch.trim()) {
      nextParams.set('search', debouncedSearch.trim());
    } else {
      nextParams.delete('search');
    }

    // Tab filter: omit when default 'ALL'
    if (privacyTab !== 'ALL') {
      nextParams.set('tab', privacyTab);
      nextParams.delete('privacy');
    } else {
      nextParams.delete('tab');
      nextParams.delete('privacy');
    }

    // Pagination: omit when page 1
    if (page > 1) {
      nextParams.set('page', page.toString());
    } else {
      nextParams.delete('page');
    }

    const nextStr = nextParams.toString();
    if (nextStr !== searchParams.toString()) {
      lastSyncedParamsRef.current = nextStr;
      setSearchParams(nextParams, { replace: true });
    }
  }, [debouncedSearch, privacyTab, page, searchParams, setSearchParams]);

  // 6. Browser Back/Forward Synchronization: Restore state when URL changes externally
  useEffect(() => {
    const currentStr = searchParams.toString();
    if (currentStr === lastSyncedParamsRef.current) {
      return;
    }

    lastSyncedParamsRef.current = currentStr;
    const newSearch = getSearchFromParams(searchParams);
    const newTab = getTabFromParams(searchParams);
    const newPage = getPageFromParams(searchParams);

    setSearchTerm(newSearch);
    setDebouncedSearch(newSearch);
    setPrivacyTab(newTab);
    setPage(newPage);
  }, [searchParams]);

  // 7. Load Groups with Stale Response Protection
  const loadGroups = useCallback(async () => {
    const currentReqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await fetchGroups({
        page,
        limit,
        search: debouncedSearch.trim() || undefined,
        privacy: privacyTab === 'ALL' ? undefined : privacyTab,
      });

      // Ignore stale responses if a newer request was dispatched or component unmounted
      if (currentReqId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }

      setGroups(data.groups);
      setTotalPages(data.pagination.totalPages);
      setTotalGroups(data.pagination.totalGroups);
    } catch (err: unknown) {
      if (currentReqId !== requestIdRef.current || !isMountedRef.current) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to load community groups.';
      setError(msg);
    } finally {
      if (currentReqId === requestIdRef.current && isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [page, limit, debouncedSearch, privacyTab]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = createName.trim();
    if (!trimmedName || trimmedName.length < 3) {
      setCreateError('Group name must be at least 3 characters.');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      const newGroup = await createGroupApi({
        name: trimmedName,
        description: createDescription.trim() || undefined,
        privacy: createPrivacy,
        coverUrl: createCoverUrl.trim() || undefined,
      });

      setOpenCreate(false);
      setCreateName('');
      setCreateDescription('');
      setCreatePrivacy(GroupPrivacy.PUBLIC);
      setCreateCoverUrl('');

      navigate(`/groups/${newGroup.slug}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create group.';
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async (e: React.MouseEvent, group: GroupListItem) => {
    e.stopPropagation();
    setJoiningId(group.id);
    try {
      await joinGroupApi(group.id);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? { ...g, isMember: true, membersCount: g.membersCount + 1 }
            : g
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join group.';
      setError(msg);
    } finally {
      setJoiningId(null);
    }
  };

  const hasActiveFilters = useMemo(() => {
    return Boolean(searchTerm.trim() || privacyTab !== 'ALL');
  }, [searchTerm, privacyTab]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setPrivacyTab('ALL');
    setPage(1);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header Banner */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 4 },
          mb: 4,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Box display="flex" alignItems="center" gap={1.5} mb={1}>
            <GroupsIcon sx={{ fontSize: 36, color: '#ffb74d' }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              Community Groups & Mandals
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 650 }}>
            Connect with regional samaj mandals, youth chapters, and specialized community interest circles.
          </Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          startIcon={<AddIcon />}
          onClick={() => setOpenCreate(true)}
          sx={{
            bgcolor: '#ff9800',
            color: '#ffffff',
            fontWeight: 'bold',
            borderRadius: 2.5,
            px: 3,
            '&:hover': { bgcolor: '#f57c00' },
            textTransform: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Create Group
        </Button>
      </Paper>

      {/* Filter and Search Bar */}
      <Paper elevation={1} sx={{ p: 2.5, mb: 4, borderRadius: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search groups by name or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value.slice(0, 100))}
              inputProps={{ maxLength: 100 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Tabs
              value={privacyTab}
              onChange={(_, val) => {
                setPrivacyTab(val as PrivacyTabOption);
                setPage(1);
              }}
              textColor="primary"
              indicatorColor="primary"
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab label="All Groups" value="ALL" sx={{ textTransform: 'none', fontWeight: 600 }} />
              <Tab label="Public Mandals" value="PUBLIC" sx={{ textTransform: 'none', fontWeight: 600 }} />
              <Tab label="Private Groups" value="PRIVATE" sx={{ textTransform: 'none', fontWeight: 600 }} />
            </Tabs>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={loadGroups} startIcon={<RefreshIcon />}>
              Retry
            </Button>
          }
          sx={{ mb: 4, borderRadius: 2 }}
        >
          {error}
        </Alert>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <Grid container spacing={3}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Card sx={{ borderRadius: 3, height: '100%', overflow: 'hidden' }}>
                <Skeleton variant="rectangular" height={140} />
                <Box p={2.5}>
                  <Skeleton variant="text" width="60%" height={28} />
                  <Skeleton variant="text" width="90%" height={20} />
                  <Skeleton variant="text" width="40%" height={20} />
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty State */}
      {!loading && !error && groups.length === 0 && (
        <Paper
          sx={{
            py: 8,
            px: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px dashed rgba(0, 0, 0, 0.15)',
          }}
        >
          <GroupsIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            No Groups Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mb: 3 }}>
            {hasActiveFilters
              ? 'No groups match your current search criteria. Try clearing search filters.'
              : 'Be the first to launch a community group or local mandal!'}
          </Typography>
          {hasActiveFilters ? (
            <Button
              variant="outlined"
              onClick={handleClearFilters}
              sx={{ textTransform: 'none' }}
            >
              Clear Filters
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setOpenCreate(true)}
              sx={{ textTransform: 'none' }}
            >
              Create Group Now
            </Button>
          )}
        </Paper>
      )}

      {/* Group Cards Grid */}
      {!loading && !error && groups.length > 0 && (
        <>
          <Grid container spacing={3}>
            {groups.map((group) => (
              <Grid item xs={12} sm={6} md={4} key={group.id}>
                <Card
                  elevation={1}
                  onClick={() => navigate(`/groups/${group.slug}`)}
                  sx={{
                    borderRadius: 3,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      boxShadow: 4,
                    },
                  }}
                >
                  <Box>
                    {/* Cover or Header Color */}
                    {group.coverUrl ? (
                      <CardMedia
                        component="img"
                        height="130"
                        image={group.coverUrl}
                        alt={group.name}
                        sx={{ bgcolor: 'grey.200' }}
                      />
                    ) : (
                      <Box
                        sx={{
                          height: 110,
                          background:
                            group.privacy === GroupPrivacy.PUBLIC
                              ? 'linear-gradient(135deg, #2e7d32 0%, #43a047 100%)'
                              : 'linear-gradient(135deg, #37474f 0%, #546e7a 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                        }}
                      >
                        <GroupsIcon sx={{ fontSize: 44, opacity: 0.8 }} />
                      </Box>
                    )}

                    <CardContent sx={{ pb: 1 }}>
                      {/* Name & Privacy Chip */}
                      <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1} mb={1}>
                        <Typography variant="h6" fontWeight="bold" noWrap title={group.name} sx={{ flex: 1 }}>
                          {group.name}
                        </Typography>
                        <Chip
                          icon={
                            group.privacy === GroupPrivacy.PUBLIC ? (
                              <PublicIcon sx={{ fontSize: '14px !important' }} />
                            ) : (
                              <LockIcon sx={{ fontSize: '14px !important' }} />
                            )
                          }
                          label={group.privacy}
                          size="small"
                          color={group.privacy === GroupPrivacy.PUBLIC ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                        />
                      </Box>

                      {/* Description */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          height: 40,
                          mb: 2,
                        }}
                      >
                        {group.description || 'No description provided.'}
                      </Typography>

                      {/* Counts / Meta */}
                      <Box display="flex" alignItems="center" gap={2} color="text.secondary">
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <PeopleIcon sx={{ fontSize: 16 }} />
                          <Typography variant="caption" fontWeight="bold">
                            {group.membersCount}
                          </Typography>
                        </Box>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <DynamicFeedIcon sx={{ fontSize: 16 }} />
                          <Typography variant="caption" fontWeight="bold">
                            {group.postsCount}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Box>

                  {/* Actions Bar */}
                  <Box p={2} pt={0} display="flex" alignItems="center" justifyContent="space-between">
                    {group.isMember ? (
                      <Chip
                        label={group.myRole ? `${group.myRole}` : 'Member'}
                        size="small"
                        color="primary"
                        sx={{ fontWeight: 'bold', fontSize: '0.75rem' }}
                      />
                    ) : group.privacy === GroupPrivacy.PUBLIC ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        disabled={joiningId === group.id}
                        onClick={(e) => handleJoin(e, group)}
                        sx={{ textTransform: 'none', borderRadius: 2 }}
                      >
                        {joiningId === group.id ? <CircularProgress size={16} /> : 'Join'}
                      </Button>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Private Group
                      </Typography>
                    )}

                    <Button size="small" color="inherit" sx={{ textTransform: 'none', fontWeight: 600 }}>
                      View &rarr;
                    </Button>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={5}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, val) => setPage(val)}
                color="primary"
                shape="rounded"
              />
            </Box>
          )}
        </>
      )}

      {/* Create Group Dialog */}
      <Dialog
        open={openCreate}
        onClose={() => !createLoading && setOpenCreate(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle fontWeight="bold">Create New Group</DialogTitle>
        <DialogContent dividers>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}
          <Box component="form" onSubmit={handleCreateGroup} display="flex" flexDirection="column" gap={2.5} pt={1}>
            <TextField
              label="Group Name"
              placeholder="e.g. Pune Youth Samaj Circle"
              value={createName}
              onChange={(e) => setCreateName(e.target.value.slice(0, 100))}
              fullWidth
              required
              helperText={`${createName.length}/100 characters`}
              disabled={createLoading}
              inputProps={{ maxLength: 100 }}
            />

            <TextField
              label="Description"
              placeholder="What is the objective or community chapter for this group?"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value.slice(0, 1000))}
              fullWidth
              multiline
              rows={3}
              helperText={`${createDescription.length}/1000 characters`}
              disabled={createLoading}
              inputProps={{ maxLength: 1000 }}
            />

            <FormControl fullWidth size="small">
              <InputLabel id="create-privacy-label">Privacy</InputLabel>
              <Select
                labelId="create-privacy-label"
                value={createPrivacy}
                label="Privacy"
                onChange={(e) => setCreatePrivacy(e.target.value as GroupPrivacy)}
                disabled={createLoading}
              >
                <MenuItem value={GroupPrivacy.PUBLIC}>Public (Anyone in Samaj can join & view)</MenuItem>
                <MenuItem value={GroupPrivacy.PRIVATE}>Private (Invite or approval only)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Cover Image URL (Optional)"
              placeholder="https://example.com/banner.jpg"
              value={createCoverUrl}
              onChange={(e) => setCreateCoverUrl(e.target.value)}
              fullWidth
              disabled={createLoading}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpenCreate(false)} disabled={createLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateGroup}
            disabled={createLoading || !createName.trim() || createName.trim().length < 3}
            sx={{ textTransform: 'none', px: 3, fontWeight: 'bold' }}
          >
            {createLoading ? <CircularProgress size={20} color="inherit" /> : 'Create Group'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default GroupsPage;

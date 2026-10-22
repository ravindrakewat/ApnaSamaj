import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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

export const GroupsPage: React.FC = () => {
  const navigate = useNavigate();

  // Query & Filter state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [privacyTab, setPrivacyTab] = useState<'ALL' | 'PUBLIC' | 'PRIVATE'>('ALL');
  const [page, setPage] = useState<number>(1);
  const limit = 12;

  // Data state
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalGroups, setTotalGroups] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [openCreate, setOpenCreate] = useState<boolean>(false);
  const [createName, setCreateName] = useState<string>('');
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createPrivacy, setCreatePrivacy] = useState<GroupPrivacy>(GroupPrivacy.PUBLIC);
  const [createCoverUrl, setCreateCoverUrl] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Joining loading state per group
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGroups({
        page,
        limit,
        search: debouncedSearch.trim() || undefined,
        privacy: privacyTab === 'ALL' ? undefined : privacyTab,
      });

      setGroups(data.groups);
      setTotalPages(data.pagination.totalPages);
      setTotalGroups(data.pagination.totalGroups);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load community groups.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, privacyTab]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || createName.trim().length < 3) {
      setCreateError('Group name must be at least 3 characters.');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);
    try {
      const newGroup = await createGroupApi({
        name: createName.trim(),
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
    return Boolean(searchTerm || privacyTab !== 'ALL');
  }, [searchTerm, privacyTab]);

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
              onChange={(e) => setSearchTerm(e.target.value)}
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
                setPrivacyTab(val);
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
              onClick={() => {
                setSearchTerm('');
                setPrivacyTab('ALL');
                setPage(1);
              }}
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
                          sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600 }}
                        />
                      </Box>

                      {/* Description */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 2,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minHeight: 40,
                        }}
                      >
                        {group.description || 'No description provided for this group.'}
                      </Typography>

                      {/* Stats */}
                      <Box display="flex" alignItems="center" gap={2} mb={1}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <PeopleIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            {group.membersCount} member{group.membersCount === 1 ? '' : 's'}
                          </Typography>
                        </Box>

                        <Box display="flex" alignItems="center" gap={0.5}>
                          <DynamicFeedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary" fontWeight="bold">
                            {group.postsCount} post{group.postsCount === 1 ? '' : 's'}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Box>

                  {/* Card Action Footer */}
                  <Box px={2} pb={2} pt={0} display="flex" justifyContent="flex-end">
                    {group.isMember ? (
                      <Chip
                        label="Joined"
                        color="primary"
                        variant="filled"
                        size="small"
                        sx={{ fontWeight: 'bold' }}
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
                        {joiningId === group.id ? <CircularProgress size={16} /> : 'Join Group'}
                      </Button>
                    ) : (
                      <Chip
                        icon={<LockIcon sx={{ fontSize: '13px !important' }} />}
                        label="Private"
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={4} mb={2}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, val) => setPage(val)}
                color="primary"
                shape="rounded"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}

      {/* Create Group Modal Dialog */}
      <Dialog open={openCreate} onClose={() => !createLoading && setOpenCreate(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreateGroup}>
          <DialogTitle fontWeight="bold">Create New Samaj Group / Mandal</DialogTitle>
          <DialogContent>
            {createError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {createError}
              </Alert>
            )}

            <TextField
              autoFocus
              fullWidth
              label="Group / Mandal Name"
              required
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              margin="normal"
              placeholder="e.g. Mumbai Kewat Samaj Mandal"
              helperText="Minimum 3 characters"
            />

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              margin="normal"
              placeholder="What is this group about? Who should join?"
            />

            <FormControl fullWidth margin="normal">
              <InputLabel id="privacy-select-label">Privacy Level</InputLabel>
              <Select
                labelId="privacy-select-label"
                value={createPrivacy}
                label="Privacy Level"
                onChange={(e) => setCreatePrivacy(e.target.value as GroupPrivacy)}
              >
                <MenuItem value={GroupPrivacy.PUBLIC}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <PublicIcon fontSize="small" color="success" />
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Public Group
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Visible in directory. Any verified member can view and join.
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
                <MenuItem value={GroupPrivacy.PRIVATE}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <LockIcon fontSize="small" color="warning" />
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        Private Group
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Restricted. Discussions & roster only accessible to members.
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Cover Image URL (Optional)"
              value={createCoverUrl}
              onChange={(e) => setCreateCoverUrl(e.target.value)}
              margin="normal"
              placeholder="https://example.com/cover.jpg"
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button disabled={createLoading} onClick={() => setOpenCreate(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createLoading || !createName.trim()}
              sx={{ textTransform: 'none', px: 3 }}
            >
              {createLoading ? <CircularProgress size={20} color="inherit" /> : 'Create Group'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
};

export default GroupsPage;

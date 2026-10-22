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
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Pagination,
  Skeleton,
  Alert,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  LocationOn as LocationIcon,
  Verified as VerifiedIcon,
  CalendarToday as CalendarIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  AccountCircle as AccountCircleIcon,
  AutoStories as GotraIcon,
} from '@mui/icons-material';
import { PublicDirectoryMember } from '@apnasamaj/shared-types';
import { fetchDirectory } from '../services/directory.service';

export const DirectoryPage: React.FC = () => {
  const navigate = useNavigate();

  // Query parameters state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [gotraFilter, setGotraFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const limit = 12;

  // Data fetching state
  const [members, setMembers] = useState<PublicDirectoryMember[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Debounced search trigger
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDirectory({
        page,
        limit,
        search: debouncedSearch.trim() || undefined,
        city: cityFilter.trim() || undefined,
        state: stateFilter.trim() || undefined,
        gotra: gotraFilter.trim() || undefined,
      });

      setMembers(data.members);
      setTotalPages(data.pagination.totalPages);
      setTotalMembers(data.pagination.totalMembers);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load community directory.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, cityFilter, stateFilter, gotraFilter]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setCityFilter('');
    setStateFilter('');
    setGotraFilter('');
    setPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return Boolean(searchTerm || cityFilter || stateFilter || gotraFilter);
  }, [searchTerm, cityFilter, stateFilter, gotraFilter]);

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
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
          background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Box display="flex" alignItems="center" gap={1.5} mb={1}>
            <PeopleIcon sx={{ fontSize: 36, color: '#ff9800' }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              Community Member Directory
            </Typography>
          </Box>
          <Typography variant="body1" sx={{ opacity: 0.9, maxWidth: 650 }}>
            Connect with verified Apna Samaj community members. Discover families, locate local mandals, and explore roots across cities and gotras.
          </Typography>
        </Box>

        <Box sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}>
          <Chip
            icon={<VerifiedIcon style={{ color: '#ffffff' }} />}
            label={`${totalMembers} Verified Member${totalMembers === 1 ? '' : 's'}`}
            sx={{
              bgcolor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              fontWeight: 'bold',
              px: 1,
              py: 0.5,
              backdropFilter: 'blur(4px)',
            }}
          />
        </Box>
      </Paper>

      {/* Search and Filters Section */}
      <Paper elevation={1} sx={{ p: 3, mb: 4, borderRadius: 2.5 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Text Search Field */}
          <Grid item xs={12} md={5}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by name, gotra, city, or sub-caste..."
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

          {/* City Filter */}
          <Grid item xs={12} sm={4} md={2.5}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by city..."
              value={cityFilter}
              onChange={(e) => {
                setCityFilter(e.target.value);
                setPage(1);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LocationIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* State Filter */}
          <Grid item xs={12} sm={4} md={2.5}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by state..."
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value);
                setPage(1);
              }}
            />
          </Grid>

          {/* Gotra Filter */}
          <Grid item xs={12} sm={4} md={2}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by gotra..."
              value={gotraFilter}
              onChange={(e) => {
                setGotraFilter(e.target.value);
                setPage(1);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <GotraIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        {hasActiveFilters && (
          <Box display="flex" alignItems="center" justifyContent="space-between" mt={2} pt={1.5} borderTop="1px solid rgba(0, 0, 0, 0.08)">
            <Typography variant="body2" color="text.secondary">
              Active filters applied. Showing matching community members.
            </Typography>
            <Button
              size="small"
              color="primary"
              onClick={handleClearFilters}
              startIcon={<ClearIcon />}
              sx={{ textTransform: 'none' }}
            >
              Reset Filters
            </Button>
          </Box>
        )}
      </Paper>

      {/* Error State */}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={loadMembers} startIcon={<RefreshIcon />}>
              Retry
            </Button>
          }
          sx={{ mb: 4, borderRadius: 2 }}
        >
          {error}
        </Alert>
      )}

      {/* Loading State Skeletons */}
      {loading && (
        <Grid container spacing={3}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Skeleton variant="circular" width={56} height={56} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="70%" height={28} />
                    <Skeleton variant="text" width="40%" height={20} />
                  </Box>
                </Box>
                <Skeleton variant="rectangular" height={36} sx={{ borderRadius: 1.5, mb: 1.5 }} />
                <Skeleton variant="text" width="90%" />
                <Skeleton variant="text" width="60%" />
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty State */}
      {!loading && !error && members.length === 0 && (
        <Paper
          sx={{
            py: 8,
            px: 4,
            textAlign: 'center',
            borderRadius: 3,
            bgcolor: 'background.paper',
            border: '1px dashed rgba(0, 0, 0, 0.15)',
          }}
        >
          <AccountCircleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2, opacity: 0.5 }} />
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            No Community Members Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mb: 3 }}>
            {hasActiveFilters
              ? 'No active members match your current filter criteria. Try clearing search filters or broadening location terms.'
              : 'There are currently no verified active members registered in the community directory.'}
          </Typography>
          {hasActiveFilters && (
            <Button variant="outlined" color="primary" onClick={handleClearFilters} sx={{ textTransform: 'none' }}>
              Clear All Filters
            </Button>
          )}
        </Paper>
      )}

      {/* Member Cards Grid */}
      {!loading && !error && members.length > 0 && (
        <>
          <Grid container spacing={3}>
            {members.map((member) => (
              <Grid item xs={12} sm={6} md={4} key={member.id}>
                <Card
                  elevation={1}
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 3,
                    },
                  }}
                >
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    {/* Member Header */}
                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                      <Avatar
                        src={member.avatarUrl || undefined}
                        alt={member.fullName}
                        onClick={() => navigate(`/members/${member.id}`)}
                        sx={{
                          width: 54,
                          height: 54,
                          bgcolor: 'primary.main',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          fontSize: '1.25rem',
                          cursor: 'pointer',
                          transition: 'transform 0.2s ease',
                          '&:hover': { transform: 'scale(1.05)' },
                        }}
                      >
                        {member.fullName.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="subtitle1"
                          fontWeight="bold"
                          noWrap
                          title={member.fullName}
                          onClick={() => navigate(`/members/${member.id}`)}
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                          }}
                        >
                          {member.fullName}
                        </Typography>
                        <Chip
                          icon={<VerifiedIcon sx={{ fontSize: '14px !important', color: '#2e7d32 !important' }} />}
                          label="Verified Member"
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            bgcolor: 'rgba(46, 125, 50, 0.08)',
                            color: '#2e7d32',
                            border: '1px solid rgba(46, 125, 50, 0.2)',
                          }}
                        />
                      </Box>
                    </Box>

                    {/* Member Details Chips */}
                    <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
                      {(member.city || member.state) && (
                        <Chip
                          icon={<LocationIcon fontSize="small" />}
                          label={[member.city, member.state].filter(Boolean).join(', ')}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem', borderColor: 'divider' }}
                        />
                      )}

                      {member.gotra && (
                        <Chip
                          icon={<GotraIcon fontSize="small" />}
                          label={`Gotra: ${member.gotra}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                      )}

                      {member.subCaste && (
                        <Chip
                          label={member.subCaste}
                          size="small"
                          color="secondary"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                      )}
                    </Box>

                    {/* Member Bio (if available) */}
                    {member.bio && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 2,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontStyle: 'italic',
                        }}
                      >
                        "{member.bio}"
                      </Typography>
                    )}
                  </CardContent>

                  {/* Card Footer: Joined Date */}
                  <Box>
                    <Divider sx={{ my: 1.5 }} />
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Box display="flex" alignItems="center" gap={0.75}>
                        <CalendarIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          Joined {formatDate(member.joinedAt)}
                        </Typography>
                      </Box>
                      {member.gender && (
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                          {member.gender.toLowerCase()}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={4} mb={2}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, newPage) => setPage(newPage)}
                color="primary"
                shape="rounded"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}
    </Container>
  );
};

export default DirectoryPage;

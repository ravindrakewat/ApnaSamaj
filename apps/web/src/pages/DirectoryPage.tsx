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

interface FilterState {
  search: string;
  city: string;
  state: string;
  gotra: string;
  subCaste: string;
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  city: '',
  state: '',
  gotra: '',
  subCaste: '',
};

function getFiltersFromParams(params: URLSearchParams): FilterState {
  return {
    search: (params.get('search') || '').slice(0, 100),
    city: (params.get('city') || '').slice(0, 100),
    state: (params.get('state') || '').slice(0, 100),
    gotra: (params.get('gotra') || '').slice(0, 100),
    subCaste: (params.get('subCaste') || '').slice(0, 100),
  };
}

function getPageFromParams(params: URLSearchParams): number {
  const p = parseInt(params.get('page') || '1', 10);
  return Number.isFinite(p) && p > 0 ? p : 1;
}

export const DirectoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 1. Initial State from URL Parameters
  const [inputs, setInputs] = useState<FilterState>(() => getFiltersFromParams(searchParams));
  const [debouncedFilters, setDebouncedFilters] = useState<FilterState>(() => getFiltersFromParams(searchParams));
  const [page, setPage] = useState<number>(() => getPageFromParams(searchParams));
  const limit = 12;

  // 2. Data fetching state
  const [members, setMembers] = useState<PublicDirectoryMember[]>([]);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // References for synchronization and stale request cancellation
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

  // 3. Unified 400ms Debounce across all five text filters
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const hasChanged =
        inputs.search !== debouncedFilters.search ||
        inputs.city !== debouncedFilters.city ||
        inputs.state !== debouncedFilters.state ||
        inputs.gotra !== debouncedFilters.gotra ||
        inputs.subCaste !== debouncedFilters.subCaste;

      if (hasChanged) {
        setDebouncedFilters(inputs);
        setPage(1); // Changing any filter resets pagination to page 1
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [inputs, debouncedFilters]);

  // 4. URL Synchronization: push debounced filter and page state into searchParams
  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);

    // Synchronize each filter parameter (omitting empty values)
    if (debouncedFilters.search.trim()) {
      nextParams.set('search', debouncedFilters.search.trim());
    } else {
      nextParams.delete('search');
    }

    if (debouncedFilters.city.trim()) {
      nextParams.set('city', debouncedFilters.city.trim());
    } else {
      nextParams.delete('city');
    }

    if (debouncedFilters.state.trim()) {
      nextParams.set('state', debouncedFilters.state.trim());
    } else {
      nextParams.delete('state');
    }

    if (debouncedFilters.gotra.trim()) {
      nextParams.set('gotra', debouncedFilters.gotra.trim());
    } else {
      nextParams.delete('gotra');
    }

    if (debouncedFilters.subCaste.trim()) {
      nextParams.set('subCaste', debouncedFilters.subCaste.trim());
    } else {
      nextParams.delete('subCaste');
    }

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
  }, [debouncedFilters, page, searchParams, setSearchParams]);

  // 5. Browser Back / Forward Synchronization: restore state when URL changes externally
  useEffect(() => {
    const currentStr = searchParams.toString();
    if (currentStr === lastSyncedParamsRef.current) {
      return; // Change originated from internal state sync
    }

    lastSyncedParamsRef.current = currentStr;
    const newFilters = getFiltersFromParams(searchParams);
    const newPage = getPageFromParams(searchParams);

    setInputs(newFilters);
    setDebouncedFilters(newFilters);
    setPage(newPage);
  }, [searchParams]);

  // 6. Data Loading with Request Sequencing (Anti-Race & Stale Protection)
  const loadMembers = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const data = await fetchDirectory({
        page,
        limit,
        search: debouncedFilters.search.trim() || undefined,
        city: debouncedFilters.city.trim() || undefined,
        state: debouncedFilters.state.trim() || undefined,
        gotra: debouncedFilters.gotra.trim() || undefined,
        subCaste: debouncedFilters.subCaste.trim() || undefined,
      });

      if (!isMountedRef.current || currentRequestId !== requestIdRef.current) {
        return; // Discard stale response
      }

      setMembers(data.members);
      setTotalPages(data.pagination.totalPages);
      setTotalMembers(data.pagination.totalMembers);
    } catch (err: unknown) {
      if (!isMountedRef.current || currentRequestId !== requestIdRef.current) {
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to load community directory.';
      setError(msg);
    } finally {
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [page, limit, debouncedFilters]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // 7. Input Handlers
  const handleInputChange = (field: keyof FilterState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.slice(0, 100);
    setInputs((prev) => ({ ...prev, [field]: val }));
  };

  const handleInputClear = (field: keyof FilterState) => () => {
    setInputs((prev) => ({ ...prev, [field]: '' }));
    setDebouncedFilters((prev) => ({ ...prev, [field]: '' }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setInputs(DEFAULT_FILTERS);
    setDebouncedFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      inputs.search.trim() ||
      inputs.city.trim() ||
      inputs.state.trim() ||
      inputs.gotra.trim() ||
      inputs.subCaste.trim()
    );
  }, [inputs]);

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
            Connect with verified Apna Samaj community members. Discover families, locate local mandals, and explore roots across cities, gotras, and sub-castes.
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

      {/* Two-Tier Search and Filters Section */}
      <Paper elevation={1} sx={{ p: 3, mb: 4, borderRadius: 2.5 }}>
        {/* Tier 1: Search Text & Reset Action */}
        <Box
          display="flex"
          flexDirection={{ xs: 'column', sm: 'row' }}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          gap={2}
          mb={2.5}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name, gotra, city, or sub-caste..."
            aria-label="Search members by name, gotra, city, or sub-caste"
            value={inputs.search}
            onChange={handleInputChange('search')}
            inputProps={{ maxLength: 100 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
              endAdornment: inputs.search ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search text"
                    onClick={handleInputClear('search')}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {hasActiveFilters && (
            <Button
              size="small"
              color="primary"
              variant="outlined"
              onClick={handleClearFilters}
              startIcon={<ClearIcon />}
              sx={{ textTransform: 'none', whiteSpace: 'nowrap', height: 40, minWidth: 130 }}
            >
              Reset Filters
            </Button>
          )}
        </Box>

        {/* Tier 2: 4-Column Location & Lineage Filters */}
        <Grid container spacing={2}>
          {/* City Filter */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by city..."
              aria-label="Filter by city"
              value={inputs.city}
              onChange={handleInputChange('city')}
              inputProps={{ maxLength: 100 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LocationIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: inputs.city ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear city filter"
                      onClick={handleInputClear('city')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          {/* State Filter */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by state..."
              aria-label="Filter by state"
              value={inputs.state}
              onChange={handleInputChange('state')}
              inputProps={{ maxLength: 100 }}
              InputProps={{
                endAdornment: inputs.state ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear state filter"
                      onClick={handleInputClear('state')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          {/* Sub-Caste Filter */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by sub-caste..."
              aria-label="Filter by sub-caste"
              value={inputs.subCaste}
              onChange={handleInputChange('subCaste')}
              inputProps={{ maxLength: 100 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PeopleIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: inputs.subCaste ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear sub-caste filter"
                      onClick={handleInputClear('subCaste')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>

          {/* Gotra Filter */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter by gotra..."
              aria-label="Filter by gotra"
              value={inputs.gotra}
              onChange={handleInputChange('gotra')}
              inputProps={{ maxLength: 100 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <GotraIcon color="action" fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: inputs.gotra ? (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear gotra filter"
                      onClick={handleInputClear('gotra')}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>
        </Grid>

        {hasActiveFilters && (
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            mt={2.5}
            pt={1.5}
            borderTop="1px solid rgba(0, 0, 0, 0.08)"
          >
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
            <Button
              color="inherit"
              size="small"
              onClick={loadMembers}
              startIcon={<RefreshIcon />}
              aria-label="Retry loading directory"
            >
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
            <Button
              variant="outlined"
              color="primary"
              onClick={handleClearFilters}
              sx={{ textTransform: 'none' }}
              aria-label="Clear all directory filters"
            >
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
                aria-label="Community directory member pagination"
              />
            </Box>
          )}
        </>
      )}
    </Container>
  );
};

export default DirectoryPage;

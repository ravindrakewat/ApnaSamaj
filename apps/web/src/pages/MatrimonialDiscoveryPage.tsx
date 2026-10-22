import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  TextField,
  MenuItem,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Pagination,
  IconButton,
  Tooltip,
  Drawer,
  Divider,
  InputAdornment,
  Avatar,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterListIcon,
  RestartAlt as RestartAltIcon,
  Person as PersonIcon,
  School as SchoolIcon,
  Work as WorkIcon,
  LocationOn as LocationOnIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Favorite as FavoriteIcon,
  Info as InfoIcon,
  Clear as ClearIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import {
  PublicMatrimonialProfileListItem,
  MaritalStatus,
  ManglikStatus,
  DietType,
  Gender,
} from '@apnasamaj/shared-types';
import {
  listDiscoveryProfilesApi,
  MatrimonialApiError,
} from '../services/matrimonial.service';

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Genders' },
  { value: 'FEMALE', label: 'Female (Brides)' },
  { value: 'MALE', label: 'Male (Grooms)' },
  { value: 'OTHER', label: 'Other' },
];

const MARITAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any Marital Status' },
  { value: 'NEVER_MARRIED', label: 'Never Married' },
  { value: 'DIVORCED', label: 'Divorced' },
  { value: 'WIDOWED', label: 'Widowed' },
  { value: 'AWAITING_DIVORCE', label: 'Awaiting Divorce' },
];

const MANGLIK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any Manglik Status' },
  { value: 'NON_MANGLIK', label: 'Non-Manglik' },
  { value: 'MANGLIK', label: 'Manglik' },
  { value: 'ANSHIK', label: 'Anshik' },
  { value: 'DONT_KNOW', label: "Don't Know" },
];

const DIET_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any Diet' },
  { value: 'VEGETARIAN', label: 'Vegetarian' },
  { value: 'NON_VEGETARIAN', label: 'Non-Vegetarian' },
  { value: 'EGGETARIAN', label: 'Eggetarian' },
  { value: 'JAIN', label: 'Jain' },
];

export const MatrimonialDiscoveryPage: React.FC = () => {
  const navigate = useNavigate();

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [minAge, setMinAge] = useState<string>('');
  const [maxAge, setMaxAge] = useState<string>('');
  const [minHeightCm, setMinHeightCm] = useState<string>('');
  const [maxHeightCm, setMaxHeightCm] = useState<string>('');
  const [maritalStatus, setMaritalStatus] = useState<string>('');
  const [manglik, setManglik] = useState<string>('');
  const [diet, setDiet] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [state, setState] = useState<string>('');
  const [subCaste, setSubCaste] = useState<string>('');
  const [gotra, setGotra] = useState<string>('');
  const [education, setEducation] = useState<string>('');
  const [occupation, setOccupation] = useState<string>('');

  // Mobile filters drawer
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);

  // Pagination & query results
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(12);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [profiles, setProfiles] = useState<PublicMatrimonialProfileListItem[]>([]);

  // Page lifecycle
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Debounce free-text search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (gender) count++;
    if (minAge || maxAge) count++;
    if (minHeightCm || maxHeightCm) count++;
    if (maritalStatus) count++;
    if (manglik) count++;
    if (diet) count++;
    if (city) count++;
    if (state) count++;
    if (subCaste) count++;
    if (gotra) count++;
    if (education) count++;
    if (occupation) count++;
    return count;
  }, [
    gender,
    minAge,
    maxAge,
    minHeightCm,
    maxHeightCm,
    maritalStatus,
    manglik,
    diet,
    city,
    state,
    subCaste,
    gotra,
    education,
    occupation,
  ]);

  const resetFilters = () => {
    setSearchTerm('');
    setGender('');
    setMinAge('');
    setMaxAge('');
    setMinHeightCm('');
    setMaxHeightCm('');
    setMaritalStatus('');
    setManglik('');
    setDiet('');
    setCity('');
    setState('');
    setSubCaste('');
    setGotra('');
    setEducation('');
    setOccupation('');
    setPage(1);
  };

  const fetchProfiles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsMigrationPending(false);

    try {
      const result = await listDiscoveryProfilesApi({
        page,
        limit,
        gender: gender ? (gender as Gender) : undefined,
        minAge: minAge ? Number(minAge) : undefined,
        maxAge: maxAge ? Number(maxAge) : undefined,
        minHeightCm: minHeightCm ? Number(minHeightCm) : undefined,
        maxHeightCm: maxHeightCm ? Number(maxHeightCm) : undefined,
        maritalStatus: maritalStatus ? (maritalStatus as MaritalStatus) : undefined,
        manglik: manglik ? (manglik as ManglikStatus) : undefined,
        diet: diet ? (diet as DietType) : undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        subCaste: subCaste.trim() || undefined,
        gotra: gotra.trim() || undefined,
        education: (education || debouncedSearch).trim() || undefined,
        occupation: occupation.trim() || undefined,
      });

      setProfiles(result.profiles);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to load discovery profiles.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    page,
    limit,
    gender,
    minAge,
    maxAge,
    minHeightCm,
    maxHeightCm,
    maritalStatus,
    manglik,
    diet,
    city,
    state,
    subCaste,
    gotra,
    education,
    occupation,
    debouncedSearch,
  ]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const renderFilterPanel = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="subtitle1" fontWeight="bold">
          Filter Profiles
        </Typography>
        {activeFilterCount > 0 && (
          <Button
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={resetFilters}
            color="inherit"
          >
            Reset
          </Button>
        )}
      </Box>

      {/* Gender */}
      <TextField
        select
        size="small"
        fullWidth
        label="Looking For"
        value={gender}
        onChange={(e) => {
          setGender(e.target.value);
          setPage(1);
        }}
      >
        {GENDER_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {/* Marital Status */}
      <TextField
        select
        size="small"
        fullWidth
        label="Marital Status"
        value={maritalStatus}
        onChange={(e) => {
          setMaritalStatus(e.target.value);
          setPage(1);
        }}
      >
        {MARITAL_STATUS_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {/* Age Range */}
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Age Range (Years)
        </Typography>
        <Grid container spacing={1} sx={{ mt: 0.2 }}>
          <Grid item xs={6}>
            <TextField
              size="small"
              type="number"
              placeholder="Min"
              value={minAge}
              onChange={(e) => {
                setMinAge(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size="small"
              type="number"
              placeholder="Max"
              value={maxAge}
              onChange={(e) => {
                setMaxAge(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Height Range */}
      <Box>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Height Range (cm)
        </Typography>
        <Grid container spacing={1} sx={{ mt: 0.2 }}>
          <Grid item xs={6}>
            <TextField
              size="small"
              type="number"
              placeholder="Min cm"
              value={minHeightCm}
              onChange={(e) => {
                setMinHeightCm(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              size="small"
              type="number"
              placeholder="Max cm"
              value={maxHeightCm}
              onChange={(e) => {
                setMaxHeightCm(e.target.value);
                setPage(1);
              }}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Manglik */}
      <TextField
        select
        size="small"
        fullWidth
        label="Manglik Dosha"
        value={manglik}
        onChange={(e) => {
          setManglik(e.target.value);
          setPage(1);
        }}
      >
        {MANGLIK_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {/* Diet */}
      <TextField
        select
        size="small"
        fullWidth
        label="Dietary Preference"
        value={diet}
        onChange={(e) => {
          setDiet(e.target.value);
          setPage(1);
        }}
      >
        {DIET_OPTIONS.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </TextField>

      {/* Location */}
      <TextField
        size="small"
        fullWidth
        label="City"
        value={city}
        onChange={(e) => {
          setCity(e.target.value);
          setPage(1);
        }}
        placeholder="e.g. Indore, Bhopal"
      />

      <TextField
        size="small"
        fullWidth
        label="State"
        value={state}
        onChange={(e) => {
          setState(e.target.value);
          setPage(1);
        }}
        placeholder="e.g. Madhya Pradesh"
      />

      {/* Community Specifics */}
      <TextField
        size="small"
        fullWidth
        label="Sub-Caste"
        value={subCaste}
        onChange={(e) => {
          setSubCaste(e.target.value);
          setPage(1);
        }}
      />

      <TextField
        size="small"
        fullWidth
        label="Gotra"
        value={gotra}
        onChange={(e) => {
          setGotra(e.target.value);
          setPage(1);
        }}
      />

      {/* Profession */}
      <TextField
        size="small"
        fullWidth
        label="Occupation"
        value={occupation}
        onChange={(e) => {
          setOccupation(e.target.value);
          setPage(1);
        }}
        placeholder="e.g. Engineer, Business"
      />

      <TextField
        size="small"
        fullWidth
        label="Education"
        value={education}
        onChange={(e) => {
          setEducation(e.target.value);
          setPage(1);
        }}
        placeholder="e.g. B.Tech, MBA"
      />
    </Box>
  );

  // Migration pending fallback
  if (isMigrationPending) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper
          elevation={2}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: 1,
            borderColor: 'warning.light',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <InfoIcon sx={{ fontSize: 56, color: 'warning.main' }} />
          </Box>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Matrimonial Service Unavailable
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}>
            Matrimonial service is not available yet; database setup is pending. Our community engineering team
            is preparing the matrimonial database tables. Please check back shortly.
          </Typography>
          <Button variant="outlined" color="primary" onClick={fetchProfiles}>
            Retry Connection
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Page Header */}
      <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="text.primary">
            Samaj Matrimony Discovery
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Browse approved community matrimonial profiles with verified Samaj membership.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          color="primary"
          startIcon={<PersonIcon />}
          onClick={() => navigate('/matrimonial/me')}
          sx={{ fontWeight: 600 }}
        >
          My Profile & Preferences
        </Button>
      </Box>

      {/* Top Search & Filter Bar */}
      <Paper elevation={1} sx={{ p: 2, mb: 4, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={8} md={9}>
            <TextField
              fullWidth
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Quick search by city, education, occupation, or gotra..."
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

          <Grid item xs={12} sm={4} md={3} sx={{ display: 'flex', gap: 1 }}>
            {/* Mobile Filter Button */}
            <Button
              fullWidth
              variant="contained"
              color={activeFilterCount > 0 ? 'secondary' : 'inherit'}
              startIcon={<FilterListIcon />}
              onClick={() => setIsFilterDrawerOpen(true)}
              sx={{ display: { md: 'none' } }}
            >
              Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Main Content Layout */}
      <Grid container spacing={4}>
        {/* Desktop Left Filter Sidebar */}
        <Grid item md={3} sx={{ display: { xs: 'none', md: 'block' } }}>
          <Paper elevation={1} sx={{ p: 3, borderRadius: 2, position: 'sticky', top: 88 }}>
            {renderFilterPanel()}
          </Paper>
        </Grid>

        {/* Profiles Grid */}
        <Grid item xs={12} md={9}>
          {errorMessage && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {errorMessage}
            </Alert>
          )}

          {/* Results Summary Bar */}
          <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Showing <strong>{profiles.length}</strong> of <strong>{total}</strong> approved profiles
            </Typography>

            {activeFilterCount > 0 && (
              <Chip
                label={`${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`}
                size="small"
                color="primary"
                onDelete={resetFilters}
              />
            )}
          </Box>

          {/* Loading Indicator */}
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 12 }}>
              <CircularProgress size={44} />
            </Box>
          ) : profiles.length === 0 ? (
            /* Empty State */
            <Paper
              elevation={0}
              sx={{
                p: 6,
                textAlign: 'center',
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 3,
                bgcolor: 'background.paper',
              }}
            >
              <GroupIcon sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" fontWeight="bold">
                No Matrimonial Matches Found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 450, mx: 'auto', mt: 1, mb: 3 }}>
                We couldn't find any approved profiles matching your current search filters. Try widening your age,
                height, or location criteria.
              </Typography>
              <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={resetFilters}>
                Clear All Filters
              </Button>
            </Paper>
          ) : (
            /* Profiles Cards Grid */
            <Grid container spacing={3}>
              {profiles.map((p) => {
                const primaryPhotoUrl = p.avatarUrl; // public avatar or primary photo
                return (
                  <Grid item xs={12} sm={6} lg={4} key={p.id}>
                    <Card
                      elevation={2}
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 2.5,
                        overflow: 'hidden',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: 4,
                        },
                      }}
                    >
                      {/* Photo Thumbnail */}
                      <Box sx={{ position: 'relative', height: 220, bgcolor: 'action.hover' }}>
                        {primaryPhotoUrl ? (
                          <CardMedia
                            component="img"
                            height="220"
                            image={primaryPhotoUrl}
                            alt={p.fullName}
                            sx={{ objectFit: 'cover' }}
                          />
                        ) : (
                          <Box
                            sx={{
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Avatar sx={{ width: 80, height: 80, bgcolor: 'primary.light' }}>
                              <PersonIcon sx={{ fontSize: 48 }} />
                            </Avatar>
                          </Box>
                        )}

                        {/* Photos count pill */}
                        {p.photosCount > 0 && (
                          <Box sx={{ position: 'absolute', bottom: 10, right: 10 }}>
                            <Chip
                              icon={<PhotoLibraryIcon fontSize="small" />}
                              label={p.photosCount}
                              size="small"
                              sx={{ bgcolor: 'rgba(0, 0, 0, 0.65)', color: 'white', fontWeight: 'bold' }}
                            />
                          </Box>
                        )}

                        {/* Existing connection status badge */}
                        {p.interestStatus && (
                          <Box sx={{ position: 'absolute', top: 10, left: 10 }}>
                            <Chip
                              size="small"
                              label={
                                p.interestStatus === 'ACCEPTED'
                                  ? 'Connected'
                                  : p.interestStatus === 'PENDING'
                                  ? 'Interest Pending'
                                  : p.interestStatus
                              }
                              color={
                                p.interestStatus === 'ACCEPTED'
                                  ? 'success'
                                  : p.interestStatus === 'PENDING'
                                  ? 'warning'
                                  : 'default'
                              }
                              icon={
                                p.interestStatus === 'ACCEPTED' ? (
                                  <CheckCircleIcon fontSize="small" />
                                ) : (
                                  <HourglassEmptyIcon fontSize="small" />
                                )
                              }
                              sx={{ fontWeight: 'bold' }}
                            />
                          </Box>
                        )}
                      </Box>

                      {/* Card Information */}
                      <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
                        <Typography variant="h6" fontWeight="bold" noWrap>
                          {p.fullName}
                        </Typography>

                        {/* Key Attributes Chips */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, mb: 1.5 }}>
                          {p.age !== null && (
                            <Chip label={`${p.age} yrs`} size="small" variant="outlined" />
                          )}
                          <Chip label={`${p.heightCm} cm`} size="small" variant="outlined" />
                          <Chip
                            label={
                              p.maritalStatus === 'NEVER_MARRIED'
                                ? 'Never Married'
                                : p.maritalStatus.replace('_', ' ')
                            }
                            size="small"
                            variant="outlined"
                          />
                          {p.manglik !== 'DONT_KNOW' && (
                            <Chip label={p.manglik.replace('_', ' ')} size="small" variant="outlined" />
                          )}
                        </Box>

                        {/* Career & Education */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <WorkIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {p.occupation}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <SchoolIcon fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {p.highestEducation}
                          </Typography>
                        </Box>

                        {/* Location */}
                        {(p.city || p.state) && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <LocationOnIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {[p.city, p.state].filter(Boolean).join(', ')}
                            </Typography>
                          </Box>
                        )}

                        {/* Sub-caste / Gotra */}
                        {(p.subCaste || p.gotra) && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                            {[p.subCaste && `Sub-caste: ${p.subCaste}`, p.gotra && `Gotra: ${p.gotra}`]
                              .filter(Boolean)
                              .join(' • ')}
                          </Typography>
                        )}
                      </CardContent>

                      {/* Card Action */}
                      <CardActions sx={{ p: 2, pt: 0 }}>
                        <Button
                          fullWidth
                          variant="contained"
                          color="primary"
                          onClick={() => navigate(`/matrimonial/profiles/${p.id}`)}
                          sx={{ fontWeight: 600 }}
                        >
                          View Full Profile
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}

          {/* Bounded Pagination Controls */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5, mb: 2 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, val) => {
                  setPage(val);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                color="primary"
                size="large"
              />
            </Box>
          )}
        </Grid>
      </Grid>

      {/* Mobile Filters Drawer */}
      <Drawer
        anchor="right"
        open={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: '85%', sm: 360 }, p: 3 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            Filters
          </Typography>
          <IconButton onClick={() => setIsFilterDrawerOpen(false)}>
            <ClearIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />
        {renderFilterPanel()}
        <Button
          fullWidth
          variant="contained"
          sx={{ mt: 3 }}
          onClick={() => setIsFilterDrawerOpen(false)}
        >
          Apply Filters
        </Button>
      </Drawer>
    </Container>
  );
};

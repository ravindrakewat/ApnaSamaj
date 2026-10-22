import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Drawer,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Divider,
  Snackbar,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Visibility as VisibilityIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Close as CloseIcon,
  Warning as WarningIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Person as PersonIcon,
  Work as WorkIcon,
  FamilyRestroom as FamilyRestroomIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';
import {
  AdminMatrimonialProfileListItem,
  AdminMatrimonialProfileDetail,
  MatrimonialProfileStatus,
} from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  fetchAdminMatrimonialProfiles,
  fetchAdminMatrimonialProfileDetails,
  moderateAdminMatrimonialProfile,
  moderateAdminMatrimonialPhoto,
  AdminMatrimonialApiError,
} from '../services/admin.matrimonial.service';

export const MatrimonialModerationPage: React.FC = () => {
  const { user: currentAdmin } = useAuth();

  // Status Filter: 0: PENDING_APPROVAL, 1: APPROVED, 2: REJECTED, 3: ALL
  const [activeTab, setActiveTab] = useState<number>(0);
  const [profiles, setProfiles] = useState<AdminMatrimonialProfileListItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Pagination
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Review Drawer & Inspection Modal
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileDetails, setProfileDetails] = useState<AdminMatrimonialProfileDetail | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  // Moderation Dialogs
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState<boolean>(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmittingModeration, setIsSubmittingModeration] = useState<boolean>(false);

  // Photo Preview Lightbox
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const getStatusQuery = (tabIndex: number): string => {
    switch (tabIndex) {
      case 0:
        return 'PENDING_APPROVAL';
      case 1:
        return 'APPROVED';
      case 2:
        return 'REJECTED';
      case 3:
        return 'ALL';
      default:
        return 'PENDING_APPROVAL';
    }
  };

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsMigrationPending(false);

    try {
      const response = await fetchAdminMatrimonialProfiles({
        status: getStatusQuery(activeTab),
        page,
        limit: 10,
        search: searchTerm.trim() || undefined,
      });

      setProfiles(response.profiles);
      setPage(response.pagination.page);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to fetch matrimonial profiles queue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page, searchTerm]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleOpenReview = async (profileId: string) => {
    setSelectedProfileId(profileId);
    setIsLoadingDetails(true);
    setProfileDetails(null);

    try {
      const details = await fetchAdminMatrimonialProfileDetails(profileId);
      setProfileDetails(details);
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to load profile details.');
      }
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!selectedProfileId) return;

    setIsSubmittingModeration(true);
    setErrorMessage(null);

    try {
      await moderateAdminMatrimonialProfile(selectedProfileId, 'APPROVED');
      setSuccessMessage('Matrimonial profile approved successfully! Member is now visible in discovery.');
      setIsApproveDialogOpen(false);
      setSelectedProfileId(null);
      await loadProfiles();
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to approve matrimonial profile.');
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!selectedProfileId) return;
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      setErrorMessage('Please provide a specific rejection reason of at least 5 characters.');
      return;
    }

    setIsSubmittingModeration(true);
    setErrorMessage(null);

    try {
      await moderateAdminMatrimonialProfile(selectedProfileId, 'REJECTED', rejectionReason.trim());
      setSuccessMessage('Matrimonial profile rejected with feedback sent to member.');
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedProfileId(null);
      await loadProfiles();
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to reject matrimonial profile.');
    } finally {
      setIsSubmittingModeration(false);
    }
  };

  const handleTogglePhotoApproval = async (photoId: string, currentApproved: boolean) => {
    try {
      const updated = await moderateAdminMatrimonialPhoto(photoId, !currentApproved);
      if (profileDetails) {
        setProfileDetails({
          ...profileDetails,
          photos: profileDetails.photos.map((ph) =>
            ph.id === photoId ? { ...ph, isApproved: updated.isApproved } : ph
          ),
        });
      }
      setSuccessMessage(
        `Photo visibility ${updated.isApproved ? 'approved' : 'hidden'} successfully.`
      );
    } catch (err: unknown) {
      const apiErr = err as AdminMatrimonialApiError;
      setErrorMessage(apiErr.message || 'Failed to update photo visibility.');
    }
  };

  const renderStatusBadge = (status: MatrimonialProfileStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return (
          <Chip
            size="small"
            icon={<HourglassEmptyIcon fontSize="small" />}
            label="Pending Review"
            color="warning"
            sx={{ fontWeight: 600 }}
          />
        );
      case 'APPROVED':
        return (
          <Chip
            size="small"
            icon={<CheckCircleIcon fontSize="small" />}
            label="Approved"
            color="success"
            sx={{ fontWeight: 600 }}
          />
        );
      case 'REJECTED':
        return (
          <Chip
            size="small"
            icon={<CancelIcon fontSize="small" />}
            label="Changes Requested"
            color="error"
            sx={{ fontWeight: 600 }}
          />
        );
      case 'DRAFT':
        return <Chip size="small" label="Draft" variant="outlined" sx={{ fontWeight: 600 }} />;
      case 'HIDDEN':
        return <Chip size="small" label="Hidden" variant="outlined" sx={{ fontWeight: 600 }} />;
      default:
        return null;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const isSelfProfile =
    Boolean(profileDetails && currentAdmin && profileDetails.userId === currentAdmin.id);

  if (isMigrationPending) {
    return (
      <Paper elevation={0} sx={{ p: 6, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
        <HourglassEmptyIcon sx={{ fontSize: 60, color: 'warning.main', mb: 2 }} />
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Matrimonial Database Tables Pending
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 580, mx: 'auto', mb: 3 }}>
          The Matrimonial module schema migration (Batch 12A) has not been applied to the database yet. The admin
          moderation queue will automatically become active once the database tables are migrated.
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadProfiles}>
          Retry Connection
        </Button>
      </Paper>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          Matrimonial Profile Moderation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review community matrimonial registrations, verify background credentials, inspect submitted gallery photos, and approve profiles before discovery publication.
        </Typography>
      </Box>

      {/* Error alert */}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Filter Tabs & Search Controls */}
      <Paper elevation={1} sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, val) => {
            setActiveTab(val);
            setPage(1);
          }}
          indicatorColor="secondary"
          textColor="secondary"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label="Pending Approval" />
          <Tab label="Approved Profiles" />
          <Tab label="Rejected / Needs Changes" />
          <Tab label="All Profiles" />
        </Tabs>

        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search by name, phone, city, occupation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                loadProfiles();
              }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 320 }}
          />

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Total: <strong>{totalCount}</strong>
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={isLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={loadProfiles}
              disabled={isLoading}
            >
              Refresh Queue
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Profile Queue Table */}
      <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Member Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Contact Phone</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Details</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Career & Location</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Photos</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Submitted</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Action
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={36} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Loading profiles queue...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : profiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      No Profiles Found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      There are no matrimonial profiles matching the current filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="bold">
                        {item.fullName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.gender || 'Unknown'} • {item.age ? `${item.age} yrs` : 'Age N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.phone}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {item.maritalStatus.replace('_', ' ')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.highestEducation}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{item.occupation}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[item.city, item.state].filter(Boolean).join(', ')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={<PhotoLibraryIcon fontSize="small" />}
                        label={`${item.photosCount} photos`}
                        color={item.unapprovedPhotosCount > 0 ? 'warning' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{renderStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(item.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        color="secondary"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleOpenReview(item.id)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, val) => setPage(val)}
              color="secondary"
              shape="rounded"
            />
          </Box>
        )}
      </Paper>

      {/* Review Drawer / Modal */}
      <Drawer
        anchor="right"
        open={Boolean(selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
        PaperProps={{
          sx: { width: { xs: '100%', sm: 600, md: 720 }, p: 3 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight="bold">
            Profile Review & Moderation
          </Typography>
          <IconButton onClick={() => setSelectedProfileId(null)}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 2.5 }} />

        {isLoadingDetails ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Loading complete profile details...
            </Typography>
          </Box>
        ) : profileDetails ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 4 }}>
            {/* Top Applicant Header */}
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    {profileDetails.user.profile?.fullName || 'Community Member'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Phone: <strong>{profileDetails.user.phone}</strong> • User Status: {profileDetails.user.status}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Submitted on: {formatDate(profileDetails.createdAt)}
                  </Typography>
                </Box>
                <Box>{renderStatusBadge(profileDetails.status)}</Box>
              </Box>

              {profileDetails.status === 'REJECTED' && profileDetails.rejectionReason && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  <strong>Previous Rejection Reason:</strong> {profileDetails.rejectionReason}
                </Alert>
              )}

              {isSelfProfile && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  <strong>Self-Approval Restriction:</strong> This is your own matrimonial profile. Samaj governance rules prohibit administrators from moderating or approving their own profile.
                </Alert>
              )}
            </Paper>

            {/* Submitted Photo Gallery */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PhotoLibraryIcon color="secondary" />
                Submitted Photos ({profileDetails.photos.length})
              </Typography>

              {profileDetails.photos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No photos uploaded by this member.
                </Typography>
              ) : (
                <Grid container spacing={2}>
                  {profileDetails.photos.map((photo) => (
                    <Grid item xs={6} sm={4} key={photo.id}>
                      <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <CardMedia
                          component="img"
                          height="140"
                          image={photo.url}
                          alt="Matrimonial Photo"
                          sx={{ cursor: 'pointer', objectFit: 'cover' }}
                          onClick={() => setPreviewPhotoUrl(photo.url)}
                        />
                        <CardContent sx={{ p: 1, pb: 0 }}>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {photo.isPrimary && (
                              <Chip size="small" label="Primary" color="primary" sx={{ height: 20, fontSize: '0.65rem' }} />
                            )}
                            <Chip
                              size="small"
                              label={photo.isApproved ? 'Visible' : 'Hidden'}
                              color={photo.isApproved ? 'success' : 'default'}
                              sx={{ height: 20, fontSize: '0.65rem' }}
                            />
                          </Box>
                        </CardContent>
                        <CardActions sx={{ p: 1 }}>
                          <Button
                            size="small"
                            fullWidth
                            variant="outlined"
                            color={photo.isApproved ? 'warning' : 'success'}
                            startIcon={photo.isApproved ? <ThumbDownIcon /> : <ThumbUpIcon />}
                            onClick={() => handleTogglePhotoApproval(photo.id, photo.isApproved)}
                          >
                            {photo.isApproved ? 'Hide Photo' : 'Approve'}
                          </Button>
                        </CardActions>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>

            {/* Section: Personal & Astrological Details */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon color="secondary" />
                Personal Background & Astrology
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Height / Weight</Typography>
                  <Typography variant="body2">{profileDetails.heightCm} cm {profileDetails.weightKg ? `/ ${profileDetails.weightKg} kg` : ''}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Marital Status</Typography>
                  <Typography variant="body2">{profileDetails.maritalStatus.replace('_', ' ')}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Sub-caste & Gotra</Typography>
                  <Typography variant="body2">{profileDetails.subCaste || '—'} / {profileDetails.gotra || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Manglik</Typography>
                  <Typography variant="body2">{profileDetails.manglik.replace('_', ' ')}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Rashi / Nakshatra</Typography>
                  <Typography variant="body2">{profileDetails.rashi || '—'} / {profileDetails.nakshatra || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Mother Tongue & Religion</Typography>
                  <Typography variant="body2">{profileDetails.motherTongue} / {profileDetails.religion}</Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Section: Career & Education */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WorkIcon color="secondary" />
                Education & Career
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Highest Education</Typography>
                  <Typography variant="body2">{profileDetails.highestEducation}</Typography>
                  {profileDetails.educationDetails && (
                    <Typography variant="caption" color="text.secondary">{profileDetails.educationDetails}</Typography>
                  )}
                </Grid>
                <Grid item xs={6} sm={6}>
                  <Typography variant="caption" color="text.secondary">Occupation & Sector</Typography>
                  <Typography variant="body2">{profileDetails.occupation} ({profileDetails.employedIn.replace('_', ' ')})</Typography>
                </Grid>
                <Grid item xs={6} sm={6}>
                  <Typography variant="caption" color="text.secondary">Annual Income</Typography>
                  <Typography variant="body2">{profileDetails.annualIncome}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Work Location</Typography>
                  <Typography variant="body2">{[profileDetails.workCity, profileDetails.workState, profileDetails.workCountry].filter(Boolean).join(', ')}</Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Section: Family & Lifestyle */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FamilyRestroomIcon color="secondary" />
                Family & Lifestyle
              </Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Family Type & Values</Typography>
                  <Typography variant="body2">{profileDetails.familyType} / {profileDetails.familyValues}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Father & Mother</Typography>
                  <Typography variant="body2">{profileDetails.fatherName || '—'} / {profileDetails.motherName || '—'}</Typography>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <Typography variant="caption" color="text.secondary">Diet & Habits</Typography>
                  <Typography variant="body2">{profileDetails.diet} (Smoking: {profileDetails.smoking}, Drinking: {profileDetails.drinking})</Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Section: About Me */}
            {profileDetails.aboutMe && (
              <Box>
                <Typography variant="subtitle2" fontWeight="bold">About Candidate</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  &ldquo;{profileDetails.aboutMe}&rdquo;
                </Typography>
              </Box>
            )}

            {/* Moderation Actions Footer */}
            <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 2 }}>
              <Tooltip title={isSelfProfile ? 'You cannot moderate your own profile' : ''}>
                <span>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<CancelIcon />}
                    disabled={isSelfProfile}
                    onClick={() => setIsRejectDialogOpen(true)}
                  >
                    Reject with Feedback
                  </Button>
                </span>
              </Tooltip>

              <Tooltip title={isSelfProfile ? 'You cannot moderate your own profile' : ''}>
                <span>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    disabled={isSelfProfile || profileDetails.status === 'APPROVED'}
                    onClick={() => setIsApproveDialogOpen(true)}
                  >
                    Approve Profile
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
        ) : null}
      </Drawer>

      {/* Confirmation Dialog: Approve Profile */}
      <Dialog
        open={isApproveDialogOpen}
        onClose={() => setIsApproveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle fontWeight="bold">Approve Matrimonial Profile?</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">
            Are you sure you want to approve this matrimonial profile? It will become active and visible to eligible members in matrimonial discovery.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setIsApproveDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmApprove}
            color="success"
            variant="contained"
            disabled={isSubmittingModeration}
          >
            {isSubmittingModeration ? <CircularProgress size={18} color="inherit" /> : 'Confirm Approval'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rejection Dialog with Required Reason */}
      <Dialog
        open={isRejectDialogOpen}
        onClose={() => setIsRejectDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle fontWeight="bold">Reject Matrimonial Profile</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2" sx={{ mb: 2 }}>
            Provide constructive feedback explaining what information or photos need correction before approval. The member will receive this reason.
          </DialogContentText>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Specific Rejection Reason (Required)"
            placeholder="e.g. Please upload clear facial photos and complete the partner expectation details..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            helperText={`${rejectionReason.length}/500 characters (min 5)`}
            error={rejectionReason.length > 0 && rejectionReason.trim().length < 5}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setIsRejectDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmReject}
            color="error"
            variant="contained"
            disabled={isSubmittingModeration || rejectionReason.trim().length < 5}
          >
            {isSubmittingModeration ? <CircularProgress size={18} color="inherit" /> : 'Reject Profile'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Size Photo Preview Dialog */}
      <Dialog
        open={Boolean(previewPhotoUrl)}
        onClose={() => setPreviewPhotoUrl(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 1, display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
          {previewPhotoUrl && (
            <Box
              component="img"
              src={previewPhotoUrl}
              alt="Matrimonial Photo"
              sx={{ maxHeight: '80vh', maxWidth: '100%', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewPhotoUrl(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Success / Error Snackbars */}
      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={4000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

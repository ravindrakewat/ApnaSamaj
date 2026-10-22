import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  Divider,
  CardMedia,
  Card,
  Avatar,
  Snackbar,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Favorite as FavoriteIcon,
  Phone as PhoneIcon,
  Lock as LockIcon,
  Person as PersonIcon,
  School as SchoolIcon,
  Work as WorkIcon,
  FamilyRestroom as FamilyRestroomIcon,
  Tune as TuneIcon,
  LocationOn as LocationOnIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassEmptyIcon,
  Cancel as CancelIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Info as InfoIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { PublicMatrimonialProfileDetail } from '@apnasamaj/shared-types';
import {
  getDiscoveryProfileByIdApi,
  sendMatrimonialInterestApi,
  MatrimonialApiError,
} from '../services/matrimonial.service';
import { useAuth } from '../context/AuthContext';

export const MatrimonialProfileDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicMatrimonialProfileDetail | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);

  // Interest Dialog states
  const [isInterestDialogOpen, setIsInterestDialogOpen] = useState<boolean>(false);
  const [interestMessage, setInterestMessage] = useState<string>('');
  const [isSubmittingInterest, setIsSubmittingInterest] = useState<boolean>(false);
  const [interestError, setInterestError] = useState<string | null>(null);

  // Page lifecycle states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMigrationPending, setIsMigrationPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);
    setIsMigrationPending(false);

    try {
      const data = await getDiscoveryProfileByIdApi(id);
      setProfile(data);
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isMigrationPending) {
        setIsMigrationPending(true);
      } else {
        setErrorMessage(apiErr.message || 'Failed to load matrimonial profile.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSendInterest = async () => {
    if (!profile) return;
    setIsSubmittingInterest(true);
    setInterestError(null);

    try {
      await sendMatrimonialInterestApi({
        receiverId: profile.userId,
        message: interestMessage.trim() || undefined,
      });

      // Update local profile state to reflect interest sent
      setProfile({
        ...profile,
        interestStatus: 'PENDING',
      });

      setIsInterestDialogOpen(false);
      setInterestMessage('');
      setSuccessMessage('Interest request sent successfully! You will be notified when they respond.');
    } catch (err: unknown) {
      const apiErr = err as MatrimonialApiError;
      if (apiErr.isConflict) {
        setInterestError('You have already sent an interest request to this member.');
      } else if (apiErr.isMigrationPending) {
        setInterestError('Matrimonial service is temporarily offline (migration pending).');
      } else {
        setInterestError(apiErr.message || 'Failed to send interest request.');
      }
    } finally {
      setIsSubmittingInterest(false);
    }
  };

  const isOwnProfile = user?.id === profile?.userId;

  // Migration pending state
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
            Matrimonial service is not available yet; database setup is pending. Please check back shortly.
          </Typography>
          <Button variant="outlined" color="primary" onClick={fetchProfile}>
            Retry Connection
          </Button>
        </Paper>
      </Container>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={44} />
          <Typography variant="body1" color="text.secondary">
            Loading profile details...
          </Typography>
        </Box>
      </Container>
    );
  }

  // Error state
  if (errorMessage || !profile) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorMessage || 'Matrimonial profile not found.'}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/matrimonial')}>
          Back to Discovery
        </Button>
      </Container>
    );
  }

  const photos = profile.photos || [];
  const activePhoto = photos[selectedPhotoIndex] || null;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Top Navigation & Back Action */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/matrimonial')}
          sx={{ color: 'text.secondary' }}
        >
          Back to Matches
        </Button>

        {isOwnProfile ? (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => navigate('/matrimonial/me')}
          >
            Edit My Profile
          </Button>
        ) : profile.interestStatus === 'ACCEPTED' ? (
          <Chip
            icon={<CheckCircleIcon />}
            label="Interest Connected & Accepted"
            color="success"
            sx={{ fontWeight: 'bold' }}
          />
        ) : profile.interestStatus === 'PENDING' ? (
          <Chip
            icon={<HourglassEmptyIcon />}
            label="Interest Request Pending"
            color="warning"
            sx={{ fontWeight: 'bold' }}
          />
        ) : profile.interestStatus === 'DECLINED' ? (
          <Chip
            icon={<CancelIcon />}
            label="Interest Declined"
            color="default"
          />
        ) : (
          <Button
            variant="contained"
            color="primary"
            startIcon={<FavoriteIcon />}
            onClick={() => setIsInterestDialogOpen(true)}
            sx={{ fontWeight: 'bold', px: 3 }}
          >
            Send Interest
          </Button>
        )}
      </Box>

      {/* Main Grid: Left Photos & Contact Info, Right Profile Details */}
      <Grid container spacing={4}>
        {/* ========================================================= */}
        {/* LEFT COLUMN: PHOTOS & VERIFIED CONTACT PANEL */}
        {/* ========================================================= */}
        <Grid item xs={12} md={4.5}>
          {/* Main Photo Card */}
          <Paper elevation={2} sx={{ borderRadius: 3, overflow: 'hidden', mb: 3 }}>
            {activePhoto ? (
              <CardMedia
                component="img"
                height="420"
                image={activePhoto.url}
                alt={profile.fullName}
                sx={{ objectFit: 'cover', cursor: 'pointer' }}
                onClick={() => setIsPreviewModalOpen(true)}
              />
            ) : profile.avatarUrl ? (
              <CardMedia
                component="img"
                height="420"
                image={profile.avatarUrl}
                alt={profile.fullName}
                sx={{ objectFit: 'cover' }}
              />
            ) : (
              <Box
                sx={{
                  height: 380,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.hover',
                }}
              >
                <Avatar sx={{ width: 100, height: 100, bgcolor: 'primary.light' }}>
                  <PersonIcon sx={{ fontSize: 60 }} />
                </Avatar>
              </Box>
            )}

            {/* Gallery Thumbnails Strip */}
            {photos.length > 1 && (
              <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, overflowX: 'auto', bgcolor: 'background.paper' }}>
                {photos.map((p, idx) => (
                  <Box
                    key={p.id}
                    component="img"
                    src={p.url}
                    alt={`Thumbnail ${idx + 1}`}
                    onClick={() => setSelectedPhotoIndex(idx)}
                    sx={{
                      width: 64,
                      height: 64,
                      objectFit: 'cover',
                      borderRadius: 1.5,
                      cursor: 'pointer',
                      border: 2,
                      borderColor: selectedPhotoIndex === idx ? 'primary.main' : 'transparent',
                      transition: 'border-color 0.2s',
                    }}
                  />
                ))}
              </Box>
            )}
          </Paper>

          {/* Contact Details Panel (Privacy Gatekept) */}
          <Paper elevation={1} sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1.5 }}>
              Contact Information
            </Typography>

            {profile.unlockedContact && profile.unlockedContact.isMutualAccepted ? (
              <Alert severity="success" icon={<PhoneIcon fontSize="inherit" />} sx={{ borderRadius: 2 }}>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                  Contact Unlocked (Mutually Connected)
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  {profile.unlockedContact.phone}
                </Typography>
              </Alert>
            ) : isOwnProfile ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                <Typography variant="caption" sx={{ display: 'block' }}>
                  Your own profile contact details are private in public discovery.
                </Typography>
              </Alert>
            ) : (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'action.hover',
                  borderRadius: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LockIcon color="action" fontSize="small" />
                  <Typography variant="subtitle2" fontWeight="bold">
                    Phone & Contact Locked
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  To safeguard member privacy, phone numbers are shared automatically only after both members
                  mutually accept an interest request.
                </Typography>
              </Box>
            )}
          </Paper>

          {/* Quick Details Card */}
          <Paper elevation={1} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" gutterBottom>
              Profile Overview
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Age</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {profile.age !== null ? `${profile.age} Years` : 'Not specified'}
                </Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Height</Typography>
                <Typography variant="body2" fontWeight={600}>{profile.heightCm} cm</Typography>
              </Box>
              {profile.weightKg && (
                <>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Weight</Typography>
                    <Typography variant="body2" fontWeight={600}>{profile.weightKg} kg</Typography>
                  </Box>
                </>
              )}
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Marital Status</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {profile.maritalStatus === 'NEVER_MARRIED'
                    ? 'Never Married'
                    : profile.maritalStatus.replace('_', ' ')}
                </Typography>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Community</Typography>
                <Typography variant="body2" fontWeight={600}>{profile.caste || 'Kewat'}</Typography>
              </Box>
              {profile.subCaste && (
                <>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Sub-Caste</Typography>
                    <Typography variant="body2" fontWeight={600}>{profile.subCaste}</Typography>
                  </Box>
                </>
              )}
              {profile.gotra && (
                <>
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Gotra</Typography>
                    <Typography variant="body2" fontWeight={600}>{profile.gotra}</Typography>
                  </Box>
                </>
              )}
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Location</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {[profile.city, profile.state].filter(Boolean).join(', ') || 'Not specified'}
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: DETAILED SECTIONS */}
        {/* ========================================================= */}
        <Grid item xs={12} md={7.5}>
          {/* Main Title & Bio Card */}
          <Paper elevation={1} sx={{ p: 4, borderRadius: 3, mb: 3 }}>
            <Typography variant="h4" fontWeight="bold" gutterBottom>
              {profile.fullName}
            </Typography>

            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
              {profile.age !== null && (
                <Chip label={`${profile.age} Yrs`} color="primary" variant="outlined" />
              )}
              <Chip label={`${profile.heightCm} cm`} variant="outlined" />
              <Chip
                label={profile.employedIn.replace('_', ' ')}
                color="secondary"
                variant="outlined"
              />
              <Chip label={profile.diet} variant="outlined" />
              {profile.manglik !== 'DONT_KNOW' && (
                <Chip label={profile.manglik.replace('_', ' ')} variant="outlined" />
              )}
            </Box>

            {profile.aboutMe ? (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold" color="text.secondary" gutterBottom>
                  About Me
                </Typography>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}>
                  {profile.aboutMe}
                </Typography>
              </Box>
            ) : null}
          </Paper>

          {/* Education & Career */}
          <Paper elevation={1} sx={{ p: 4, borderRadius: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <WorkIcon color="primary" />
              <Typography variant="h6" fontWeight="bold">
                Education & Professional Career
              </Typography>
            </Box>

            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Highest Education</Typography>
                <Typography variant="body1" fontWeight={600}>{profile.highestEducation}</Typography>
              </Grid>

              {profile.educationDetails && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Education Details</Typography>
                  <Typography variant="body1">{profile.educationDetails}</Typography>
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Occupation</Typography>
                <Typography variant="body1" fontWeight={600}>{profile.occupation}</Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Employment Sector</Typography>
                <Typography variant="body1">{profile.employedIn.replace('_', ' ')}</Typography>
              </Grid>

              {profile.companyName && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Company / Organization</Typography>
                  <Typography variant="body1">{profile.companyName}</Typography>
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Annual Income</Typography>
                <Typography variant="body1" fontWeight={600}>{profile.annualIncome}</Typography>
              </Grid>

              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Work Location</Typography>
                <Typography variant="body1">
                  {[profile.workCity, profile.workState, profile.workCountry].filter(Boolean).join(', ')}
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Family Background */}
          <Paper elevation={1} sx={{ p: 4, borderRadius: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <FamilyRestroomIcon color="primary" />
              <Typography variant="h6" fontWeight="bold">
                Family Background
              </Typography>
            </Box>

            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Family Type</Typography>
                <Typography variant="body1">{profile.familyType} Family</Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Family Values</Typography>
                <Typography variant="body1">{profile.familyValues}</Typography>
              </Grid>

              {profile.fatherName && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Father's Name & Occupation</Typography>
                  <Typography variant="body1">
                    {[profile.fatherName, profile.fatherOccupation && `(${profile.fatherOccupation})`]
                      .filter(Boolean)
                      .join(' ')}
                  </Typography>
                </Grid>
              )}

              {profile.motherName && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Mother's Name & Occupation</Typography>
                  <Typography variant="body1">
                    {[profile.motherName, profile.motherOccupation && `(${profile.motherOccupation})`]
                      .filter(Boolean)
                      .join(' ')}
                  </Typography>
                </Grid>
              )}

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Brothers</Typography>
                <Typography variant="body1">
                  {profile.brothersCount} total ({profile.brothersMarried} married)
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Sisters</Typography>
                <Typography variant="body1">
                  {profile.sistersCount} total ({profile.sistersMarried} married)
                </Typography>
              </Grid>

              {profile.familyNativePlace && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Ancestral Native Place</Typography>
                  <Typography variant="body1">{profile.familyNativePlace}</Typography>
                </Grid>
              )}

              {profile.aboutFamily && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">About Family</Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
                    {profile.aboutFamily}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </Paper>

          {/* Astrological & Lifestyle Details */}
          <Paper elevation={1} sx={{ p: 4, borderRadius: 3, mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2.5 }}>
              Astrology & Lifestyle
            </Typography>

            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">Manglik Status</Typography>
                <Typography variant="body1">{profile.manglik.replace('_', ' ')}</Typography>
              </Grid>

              {profile.birthTime && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary">Birth Time</Typography>
                  <Typography variant="body1">{profile.birthTime}</Typography>
                </Grid>
              )}

              {profile.birthCity && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary">Birth City</Typography>
                  <Typography variant="body1">{profile.birthCity}</Typography>
                </Grid>
              )}

              {profile.rashi && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary">Rashi</Typography>
                  <Typography variant="body1">{profile.rashi}</Typography>
                </Grid>
              )}

              {profile.nakshatra && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary">Nakshatra</Typography>
                  <Typography variant="body1">{profile.nakshatra}</Typography>
                </Grid>
              )}

              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">Diet</Typography>
                <Typography variant="body1">{profile.diet}</Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">Smoking</Typography>
                <Typography variant="body1">{profile.smoking}</Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary">Drinking</Typography>
                <Typography variant="body1">{profile.drinking}</Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Partner Expectations */}
          {(profile.partnerExpectations || profile.partnerPreference) && (
            <Paper elevation={1} sx={{ p: 4, borderRadius: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <TuneIcon color="primary" />
                <Typography variant="h6" fontWeight="bold">
                  Partner Expectations & Preferences
                </Typography>
              </Box>

              {profile.partnerExpectations && (
                <Box sx={{ mb: 2.5 }}>
                  <Typography variant="caption" color="text.secondary">Expectations Summary</Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line', mt: 0.5 }}>
                    {profile.partnerExpectations}
                  </Typography>
                </Box>
              )}

              {profile.partnerPreference && (
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Preferred Age</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {profile.partnerPreference.minAge} - {profile.partnerPreference.maxAge} Years
                    </Typography>
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Preferred Height</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {profile.partnerPreference.minHeightCm} - {profile.partnerPreference.maxHeightCm} cm
                    </Typography>
                  </Grid>

                  {profile.partnerPreference.preferredCities &&
                    profile.partnerPreference.preferredCities.length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="caption" color="text.secondary">Preferred Cities</Typography>
                        <Typography variant="body2">
                          {profile.partnerPreference.preferredCities.join(', ')}
                        </Typography>
                      </Grid>
                    )}

                  {profile.partnerPreference.notes && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Notes</Typography>
                      <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                        "{profile.partnerPreference.notes}"
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Send Interest Modal Dialog */}
      <Dialog
        open={isInterestDialogOpen}
        onClose={() => !isSubmittingInterest && setIsInterestDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          Send Matrimonial Interest
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            You are sending an interest request to <strong>{profile.fullName}</strong>.
            If they accept your request, verified contact details will be unlocked for both of you.
          </DialogContentText>

          {interestError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {interestError}
            </Alert>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label="Personalized Message (optional)"
            placeholder="Add a polite introduction, mutual family references, or reasons for connecting..."
            value={interestMessage}
            onChange={(e) => setInterestMessage(e.target.value)}
            disabled={isSubmittingInterest}
            helperText={`${interestMessage.length}/500 characters`}
            error={interestMessage.length > 500}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setIsInterestDialogOpen(false)}
            color="inherit"
            disabled={isSubmittingInterest}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSendInterest}
            disabled={isSubmittingInterest || interestMessage.length > 500}
            startIcon={
              isSubmittingInterest ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <FavoriteIcon />
              )
            }
          >
            {isSubmittingInterest ? 'Sending...' : 'Confirm & Send Interest'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Photo Modal */}
      <Dialog
        open={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 1, display: 'flex', justifyContent: 'center', bgcolor: 'black' }}>
          {activePhoto && (
            <Box
              component="img"
              src={activePhoto.url}
              alt="Profile photo preview"
              sx={{ maxHeight: '82vh', maxWidth: '100%', objectFit: 'contain' }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ bgcolor: 'background.paper' }}>
          <Button onClick={() => setIsPreviewModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Success Feedback Snackbar */}
      <Snackbar
        open={Boolean(successMessage)}
        autoHideDuration={5000}
        onClose={() => setSuccessMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage(null)} sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Box,
  Typography,
  Grid,
  Chip,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Card,
  CardContent,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonIcon from '@mui/icons-material/Person';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PhoneIcon from '@mui/icons-material/Phone';
import ShieldIcon from '@mui/icons-material/Shield';
import { CurrentMemberProfile, UserStatus } from '@apnasamaj/shared-types';
import { updateProfileSchema, UpdateProfileInput } from '@apnasamaj/validation';
import { getMyProfileApi, updateMyProfileApi } from '../services/users.service';
import { useAuth } from '../context/AuthContext';

export const ProfilePage: React.FC = () => {
  const { setUser } = useAuth();

  const [profileData, setProfileData] = useState<CurrentMemberProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Edit dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    fullName: '',
    gender: '',
    dateOfBirth: '',
    bio: '',
    city: '',
    state: '',
    subCaste: '',
    gotra: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadProfile = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await getMyProfileApi();
      setProfileData(data);
      // Sync form state
      setEditForm({
        fullName: data.profile?.fullName || '',
        gender: data.profile?.gender || '',
        dateOfBirth: data.profile?.dateOfBirth ? data.profile.dateOfBirth.split('T')[0] : '',
        bio: data.profile?.bio || '',
        city: data.profile?.city || '',
        state: data.profile?.state || '',
        subCaste: data.profile?.subCaste || '',
        gotra: data.profile?.gotra || '',
      });
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleOpenEdit = () => {
    if (profileData) {
      setEditForm({
        fullName: profileData.profile?.fullName || '',
        gender: profileData.profile?.gender || '',
        dateOfBirth: profileData.profile?.dateOfBirth ? profileData.profile.dateOfBirth.split('T')[0] : '',
        bio: profileData.profile?.bio || '',
        city: profileData.profile?.city || '',
        state: profileData.profile?.state || '',
        subCaste: profileData.profile?.subCaste || '',
        gotra: profileData.profile?.gotra || '',
      });
    }
    setFieldErrors({});
    setSaveError(null);
    setIsEditDialogOpen(true);
  };

  const handleCloseEdit = () => {
    if (!isSaving) {
      setIsEditDialogOpen(false);
    }
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const updated = { ...prev };
        delete updated[name];
        return updated;
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setFieldErrors({});

    const payload: UpdateProfileInput = {
      fullName: editForm.fullName.trim() || undefined,
      gender: editForm.gender ? (editForm.gender as 'MALE' | 'FEMALE' | 'OTHER') : null,
      dateOfBirth: editForm.dateOfBirth ? new Date(editForm.dateOfBirth).toISOString() : null,
      bio: editForm.bio.trim() || null,
      city: editForm.city.trim() || null,
      state: editForm.state.trim() || null,
      subCaste: editForm.subCaste.trim() || null,
      gotra: editForm.gotra.trim() || null,
    };

    const validation = updateProfileSchema.safeParse(payload);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const field = issue.path[0]?.toString() || 'form';
        if (!errors[field]) errors[field] = issue.message;
      });
      setFieldErrors(errors);
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updateMyProfileApi(validation.data);
      setProfileData(updated);
      // Sync AuthContext user name
      if (updated.profile?.fullName) {
        setUser((prev) => (prev ? { ...prev, fullName: updated.profile!.fullName } : null));
      }
      setIsEditDialogOpen(false);
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading your member profile...
        </Typography>
      </Container>
    );
  }

  if (fetchError || !profileData) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Alert severity="error" action={<Button color="inherit" onClick={loadProfile}>Retry</Button>}>
          {fetchError || 'Unable to display profile.'}
        </Alert>
      </Container>
    );
  }

  const p = profileData.profile;
  const isPending = profileData.status === UserStatus.PENDING;

  return (
    <Container maxWidth="md" sx={{ py: 5 }}>
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {isPending && (
        <Alert
          severity="info"
          icon={<WarningAmberIcon />}
          sx={{ mb: 3 }}
        >
          <strong>Account Status: PENDING</strong> — Your member account is registered and awaiting community verification. You may complete your profile details below.
        </Alert>
      )}

      {/* Main Profile Card */}
      <Paper elevation={2} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, mb: 4 }}>
        <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={2} mb={3}>
          <Box display="flex" alignItems="center" gap={2}>
            <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 28 }}>
              {p?.fullName ? p.fullName.charAt(0).toUpperCase() : <PersonIcon />}
            </Avatar>
            <Box>
              <Typography variant="h5" component="h1" fontWeight="bold">
                {p?.fullName || 'Community Member'}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
                <Chip
                  label={profileData.role}
                  size="small"
                  color="primary"
                  variant="outlined"
                  icon={<ShieldIcon />}
                />
                <Chip
                  label={profileData.status}
                  size="small"
                  color={profileData.status === 'ACTIVE' ? 'success' : 'warning'}
                />
                <Chip
                  label={profileData.isPhoneVerified ? 'Phone Verified' : 'Phone Unverified'}
                  size="small"
                  color={profileData.isPhoneVerified ? 'success' : 'default'}
                  icon={profileData.isPhoneVerified ? <VerifiedUserIcon /> : undefined}
                />
              </Box>
            </Box>
          </Box>

          <Button
            variant="outlined"
            color="primary"
            startIcon={<EditIcon />}
            onClick={handleOpenEdit}
            sx={{ borderRadius: 2 }}
          >
            Edit Profile
          </Button>
        </Box>

        <Divider sx={{ my: 2.5 }} />

        {/* Profile Information Grid */}
        <Grid container spacing={3}>
          {/* Account Details (Protected / Read-only) */}
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
                  Account Information (Read-Only)
                </Typography>
                <Box display="flex" alignItems="center" gap={1} my={1}>
                  <PhoneIcon color="action" fontSize="small" />
                  <Typography variant="body2">
                    <strong>Phone:</strong> {profileData.phone}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1} my={1}>
                  <CalendarTodayIcon color="action" fontSize="small" />
                  <Typography variant="body2">
                    <strong>Joined:</strong> {new Date(profileData.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Role, phone number, and account verification can only be modified by community administrators.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Community & Cultural Background */}
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
                  Community Background
                </Typography>
                <Box my={1}>
                  <Typography variant="body2">
                    <strong>Sub-Caste:</strong> {p?.subCaste || <em>Not specified</em>}
                  </Typography>
                </Box>
                <Box my={1}>
                  <Typography variant="body2">
                    <strong>Gotra:</strong> {p?.gotra || <em>Not specified</em>}
                  </Typography>
                </Box>
                <Box my={1}>
                  <Typography variant="body2">
                    <strong>Gender:</strong> {p?.gender || <em>Not specified</em>}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Location & Bio */}
          <Grid item xs={12}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" color="primary" fontWeight="bold" gutterBottom>
                  Personal Details & Location
                </Typography>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={12} sm={6}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <LocationOnIcon color="action" fontSize="small" />
                      <Typography variant="body2">
                        <strong>Location:</strong> {[p?.city, p?.state].filter(Boolean).join(', ') || <em>Not specified</em>}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <CalendarTodayIcon color="action" fontSize="small" />
                      <Typography variant="body2">
                        <strong>Date of Birth:</strong> {p?.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString('en-IN') : <em>Not specified</em>}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      <strong>About Me:</strong>
                    </Typography>
                    <Typography variant="body2" color={p?.bio ? 'text.primary' : 'text.secondary'} sx={{ mt: 0.5, fontStyle: p?.bio ? 'normal' : 'italic' }}>
                      {p?.bio || 'No bio provided yet. Click Edit Profile to tell the community about yourself.'}
                    </Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onClose={handleCloseEdit} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 'bold' }}>Edit Member Profile</DialogTitle>
        <DialogContent dividers>
          {saveError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {saveError}
            </Alert>
          )}

          <Box component="form" id="edit-profile-form" onSubmit={handleSaveProfile} noValidate sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              {/* Full Name */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  id="edit-fullName"
                  name="fullName"
                  label="Full Name"
                  value={editForm.fullName}
                  onChange={handleEditChange}
                  error={!!fieldErrors.fullName}
                  helperText={fieldErrors.fullName}
                  disabled={isSaving}
                />
              </Grid>

              {/* Gender */}
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  fullWidth
                  id="edit-gender"
                  name="gender"
                  label="Gender"
                  value={editForm.gender}
                  onChange={handleEditChange}
                  disabled={isSaving}
                >
                  <MenuItem value="">
                    <em>Not specified</em>
                  </MenuItem>
                  <MenuItem value="MALE">Male</MenuItem>
                  <MenuItem value="FEMALE">Female</MenuItem>
                  <MenuItem value="OTHER">Other</MenuItem>
                </TextField>
              </Grid>

              {/* Date of Birth */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  id="edit-dateOfBirth"
                  name="dateOfBirth"
                  label="Date of Birth"
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={handleEditChange}
                  InputLabelProps={{ shrink: true }}
                  disabled={isSaving}
                />
              </Grid>

              {/* City */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  id="edit-city"
                  name="city"
                  label="City"
                  value={editForm.city}
                  onChange={handleEditChange}
                  disabled={isSaving}
                />
              </Grid>

              {/* State */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  id="edit-state"
                  name="state"
                  label="State"
                  value={editForm.state}
                  onChange={handleEditChange}
                  disabled={isSaving}
                />
              </Grid>

              {/* Sub-Caste */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  id="edit-subCaste"
                  name="subCaste"
                  label="Sub-Caste"
                  value={editForm.subCaste}
                  onChange={handleEditChange}
                  disabled={isSaving}
                />
              </Grid>

              {/* Gotra */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  id="edit-gotra"
                  name="gotra"
                  label="Gotra"
                  value={editForm.gotra}
                  onChange={handleEditChange}
                  disabled={isSaving}
                />
              </Grid>

              {/* Bio */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  id="edit-bio"
                  name="bio"
                  label="About / Bio"
                  placeholder="Share a short bio with the community..."
                  value={editForm.bio}
                  onChange={handleEditChange}
                  disabled={isSaving}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseEdit} disabled={isSaving} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-profile-form"
            variant="contained"
            color="primary"
            disabled={isSaving}
            startIcon={isSaving ? <CircularProgress size={18} color="inherit" /> : undefined}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

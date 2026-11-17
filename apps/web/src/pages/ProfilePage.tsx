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
  LinearProgress,
  Switch,
  FormControlLabel,
  Stack,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PersonIcon from '@mui/icons-material/Person';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PhoneIcon from '@mui/icons-material/Phone';
import ShieldIcon from '@mui/icons-material/Shield';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { CurrentMemberProfile, UserStatus } from '@apnasamaj/shared-types';
import { updateProfileSchema, UpdateProfileInput } from '@apnasamaj/validation';
import { getMyProfileApi, updateMyProfileApi, uploadAvatarApi } from '../services/users.service';
import {
  fetchNotificationPreferences,
  updateNotificationPreferencesApi,
  NotificationPreferencesItem,
} from '../services/notifications.service';
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

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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

  // Notification Preferences State
  const [notifPreferences, setNotifPreferences] = useState<NotificationPreferencesItem>({
    personalMessages: true,
    groupMessages: true,
    matrimonial: true,
    likes: true,
    comments: true,
    announcements: true,
  });
  const [loadingNotifs, setLoadingNotifs] = useState<boolean>(true);
  const [updatingNotifKey, setUpdatingNotifKey] = useState<string | null>(null);

  const calculateProfileCompletion = () => {
    if (!profileData?.profile) return { percentage: 20, hint: 'प्रोफ़ाइल विवरण भरें' };
    const prof = profileData.profile;
    let score = 0;
    if (prof.fullName) score += 15;
    if (prof.avatarUrl) score += 15;
    if (profileData.isPhoneVerified) score += 15;
    if (prof.gender) score += 10;
    if (prof.dateOfBirth) score += 10;
    if (prof.city || prof.state) score += 15;
    if (prof.subCaste || prof.gotra) score += 10;
    if (prof.bio && prof.bio.length > 10) score += 10;

    let hint = '';
    if (!prof.avatarUrl) hint = 'प्रोफ़ाइल फ़ोटो अपलोड करें (+15%)';
    else if (!prof.bio) hint = 'अपने बारे में संक्षिप्त परिचय (Bio) लिखें (+10%)';
    else if (!prof.subCaste || !prof.gotra) hint = 'उप-जाति एवं गोत्र दर्ज करें (+10%)';
    else if (!prof.city) hint = 'अपना शहर व राज्य जोड़ें (+15%)';
    else hint = 'आपकी प्रोफ़ाइल पूर्ण एवं सुसज्जित है!';

    return { percentage: Math.min(score, 100), hint };
  };

  const handleTogglePreference = async (key: keyof NotificationPreferencesItem) => {
    const updatedVal = !notifPreferences[key];
    setNotifPreferences((prev) => ({ ...prev, [key]: updatedVal }));
    setUpdatingNotifKey(key);
    try {
      await updateNotificationPreferencesApi({ [key]: updatedVal });
    } catch {
      setNotifPreferences((prev) => ({ ...prev, [key]: !updatedVal }));
    } finally {
      setUpdatingNotifKey(null);
    }
  };

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
      // Load notification preferences in parallel
      fetchNotificationPreferences()
        .then((prefs) => setNotifPreferences(prefs))
        .catch(() => {})
        .finally(() => setLoadingNotifs(false));
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

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Avatar image must not exceed 5MB.');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarError(null);
    try {
      const newAvatarUrl = await uploadAvatarApi(file);
      setProfileData((prev) =>
        prev
          ? {
              ...prev,
              profile: prev.profile
                ? { ...prev.profile, avatarUrl: newAvatarUrl }
                : { fullName: 'Member', avatarUrl: newAvatarUrl },
            }
          : null
      );
      setSuccessMessage('Profile avatar updated successfully.');
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload profile avatar.');
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
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

      {avatarError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setAvatarError(null)}>
          {avatarError}
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
          <Box display="flex" alignItems="center" gap={2.5}>
            <Box position="relative">
              <Avatar
                src={p?.avatarUrl || undefined}
                sx={{
                  width: 80,
                  height: 80,
                  bgcolor: 'primary.main',
                  fontSize: 32,
                  fontWeight: 'bold',
                  boxShadow: 2,
                  border: '2px solid #ffffff',
                }}
              >
                {p?.fullName ? p.fullName.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 40 }} />}
              </Avatar>
              <Button
                component="label"
                size="small"
                variant="contained"
                disabled={isUploadingAvatar}
                title="Change Avatar"
                sx={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  minWidth: 32,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  p: 0,
                  boxShadow: 2,
                }}
              >
                {isUploadingAvatar ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <PhotoCameraIcon sx={{ fontSize: 16 }} />
                )}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarFileSelect}
                />
              </Button>
            </Box>
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

        {/* Profile Completion Progress Bar */}
        {(() => {
          const { percentage, hint } = calculateProfileCompletion();
          return (
            <Box sx={{ my: 2.5, p: 2, bgcolor: '#f8fafc', borderRadius: 2.5, border: '1px solid #e2e8f0' }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" fontWeight={700}>
                  प्रोफ़ाइल पूर्णता / Profile Completion
                </Typography>
                <Chip
                  label={`${percentage}% पूर्ण`}
                  size="small"
                  color={percentage >= 80 ? 'success' : percentage >= 50 ? 'primary' : 'warning'}
                  sx={{ fontWeight: 700 }}
                />
              </Box>
              <LinearProgress
                variant="determinate"
                value={percentage}
                color={percentage >= 80 ? 'success' : 'primary'}
                sx={{ height: 8, borderRadius: 2 }}
              />
              {hint && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  💡 सुझाव: {hint}
                </Typography>
              )}
            </Box>
          );
        })()}

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

      {/* Notification Preferences Card */}
      <Paper elevation={2} sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, mb: 4 }}>
        <Box display="flex" alignItems="center" gap={1.5} mb={1}>
          <NotificationsActiveIcon color="primary" sx={{ fontSize: 28 }} />
          <Typography variant="h6" fontWeight="bold">
            सूचना प्राथमिकताएं / Notification Preferences
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          चुनें कि आप किस प्रकार की इन-ऐप व पुश सूचनाएं प्राप्त करना चाहते हैं।
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifPreferences.personalMessages}
                    onChange={() => handleTogglePreference('personalMessages')}
                    disabled={updatingNotifKey === 'personalMessages'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      व्यक्तिगत संदेश / Personal Chat
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      नए डायरेक्ट संदेश व उत्तर प्राप्त करें
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
              />
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifPreferences.groupMessages}
                    onChange={() => handleTogglePreference('groupMessages')}
                    disabled={updatingNotifKey === 'groupMessages'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      समूह संदेश / Group Chat
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      समूहों में नए संदेशों की सूचना
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
              />
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifPreferences.matrimonial}
                    onChange={() => handleTogglePreference('matrimonial')}
                    disabled={updatingNotifKey === 'matrimonial'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      वैवाहिक सूचनाएं / Matrimonial
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      रुचि (Interests) एवं प्रोफाइल सत्यापन
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
              />
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifPreferences.likes}
                    onChange={() => handleTogglePreference('likes')}
                    disabled={updatingNotifKey === 'likes'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      पसंद / Post Likes
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      आपकी पोस्ट पर किसी के लाइक करने पर
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
              />
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifPreferences.comments}
                    onChange={() => handleTogglePreference('comments')}
                    disabled={updatingNotifKey === 'comments'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      टिप्पणियां / Comments
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      आपकी पोस्ट पर नई टिप्पणियों की सूचना
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
              />
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card variant="outlined" sx={{ borderRadius: 2, p: 1.5 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={notifPreferences.announcements}
                    onChange={() => handleTogglePreference('announcements')}
                    disabled={updatingNotifKey === 'announcements'}
                  />
                }
                label={
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      घोषणाएं / Announcements
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      समाज प्रमुखों द्वारा जारी महत्वपूर्ण सूचनाएं
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
              />
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

              {/* Gender Chips */}
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                  लिंग / Gender
                </Typography>
                <Stack direction="row" spacing={1}>
                  {[
                    { key: 'MALE', label: 'पुरुष / Male' },
                    { key: 'FEMALE', label: 'महिला / Female' },
                    { key: 'OTHER', label: 'अन्य / Other' },
                  ].map((g) => (
                    <Chip
                      key={g.key}
                      label={g.label}
                      clickable
                      color={editForm.gender === g.key ? 'primary' : 'default'}
                      variant={editForm.gender === g.key ? 'filled' : 'outlined'}
                      onClick={() => setEditForm((prev) => ({ ...prev, gender: g.key }))}
                      disabled={isSaving}
                      sx={{ fontWeight: editForm.gender === g.key ? 600 : 400 }}
                    />
                  ))}
                </Stack>
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

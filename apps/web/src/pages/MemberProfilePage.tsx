import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  Grid,
  Chip,
  Button,
  CircularProgress,
  Divider,
  Avatar,
  Card,
  CardContent,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  Shield as ShieldIcon,
  AccountTree as GotraIcon,
  Wc as GenderIcon,
  Verified as VerifiedIcon,
  Refresh as RefreshIcon,
  PersonOff as PersonOffIcon,
} from '@mui/icons-material';
import { PublicMemberProfile, UserRole } from '@apnasamaj/shared-types';
import { getPublicProfileApi } from '../services/users.service';

export const MemberProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [member, setMember] = useState<PublicMemberProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadMemberProfile = useCallback(async () => {
    if (!id || !id.trim()) {
      setError('Member ID is required to view a profile.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await getPublicProfileApi(id.trim());
      setMember(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Member profile not found or unavailable.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadMemberProfile();
  }, [loadMemberProfile]);

  if (isLoading) {
    return (
      <Container maxWidth="md" sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CircularProgress size={44} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading member profile...
        </Typography>
      </Container>
    );
  }

  if (error || !member) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper
          elevation={1}
          sx={{
            py: 6,
            px: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px dashed rgba(0, 0, 0, 0.15)',
          }}
        >
          <PersonOffIcon sx={{ fontSize: 56, color: 'text.secondary', mb: 2, opacity: 0.6 }} />
          <Typography variant="h5" component="h1" fontWeight="bold" gutterBottom>
            Member Profile Unavailable
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 480, mx: 'auto', mb: 3 }}>
            {error || 'This member profile could not be found or is not currently available in this community.'}
          </Typography>
          <Box display="flex" justifyContent="center" gap={2} flexWrap="wrap">
            <Button
              variant="contained"
              color="primary"
              onClick={() => navigate('/directory')}
              startIcon={<ArrowBackIcon />}
              sx={{ textTransform: 'none', px: 3 }}
              aria-label="Return to community directory"
            >
              Back to Directory
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={loadMemberProfile}
              startIcon={<RefreshIcon />}
              sx={{ textTransform: 'none', px: 2.5 }}
              aria-label="Retry loading member profile"
            >
              Retry
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  const joinedFormatted = new Date(member.joinedAt).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate(-1)}
        sx={{ mb: 2.5, textTransform: 'none' }}
        color="inherit"
        aria-label="Go back to previous page"
      >
        Back
      </Button>

      {/* Main Member Profile Card */}
      <Paper
        elevation={2}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
          mb: 4,
          border: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        {/* Decorative Header Banner */}
        <Box
          sx={{
            height: 120,
            background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
          }}
        />

        <Box sx={{ px: { xs: 2.5, sm: 4 }, pb: { xs: 3, sm: 4 }, mt: -7 }}>
          {/* Avatar and Primary Details */}
          <Box
            display="flex"
            flexDirection={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'flex-start', sm: 'flex-end' }}
            justifyContent="space-between"
            gap={2}
            mb={3}
          >
            <Box display="flex" alignItems="flex-end" gap={2.5}>
              <Avatar
                src={member.avatarUrl || undefined}
                alt={member.fullName}
                sx={{
                  width: 96,
                  height: 96,
                  bgcolor: 'primary.main',
                  fontSize: 38,
                  fontWeight: 'bold',
                  border: '4px solid #ffffff',
                  boxShadow: 3,
                }}
              >
                {member.fullName.charAt(0).toUpperCase()}
              </Avatar>
              <Box mb={0.5}>
                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography variant="h4" component="h1" fontWeight="bold">
                    {member.fullName}
                  </Typography>
                  <Chip
                    icon={<VerifiedIcon sx={{ fontSize: '15px !important', color: '#2e7d32 !important' }} />}
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
                <Box display="flex" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
                  {member.role !== UserRole.MEMBER && (
                    <Chip
                      icon={<ShieldIcon sx={{ fontSize: '14px !important' }} />}
                      label={member.role}
                      color="primary"
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 'bold', height: 22 }}
                    />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Member since {joinedFormatted}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Member Bio (if present) */}
          {member.bio && (
            <Box
              sx={{
                p: 2.5,
                mb: 3,
                borderRadius: 2,
                bgcolor: 'rgba(0,0,0,0.02)',
                borderLeft: '4px solid',
                borderColor: 'primary.main',
              }}
            >
              <Typography variant="body1" color="text.secondary" sx={{ fontStyle: 'italic', lineHeight: 1.6 }}>
                "{member.bio}"
              </Typography>
            </Box>
          )}

          <Divider sx={{ my: 3 }} />

          {/* Details Section */}
          <Typography variant="h6" component="h2" fontWeight="bold" gutterBottom sx={{ mb: 2 }}>
            Community Information
          </Typography>

          <Grid container spacing={2}>
            {/* Location */}
            <Grid item xs={12} sm={6}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                  <Avatar sx={{ bgcolor: 'rgba(25, 118, 210, 0.08)', color: 'primary.main', width: 40, height: 40 }}>
                    <LocationIcon fontSize="small" />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Location
                    </Typography>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {[member.city, member.state].filter(Boolean).join(', ') || 'Not specified'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Gotra */}
            <Grid item xs={12} sm={6}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                  <Avatar sx={{ bgcolor: 'rgba(156, 39, 176, 0.08)', color: 'secondary.main', width: 40, height: 40 }}>
                    <GotraIcon fontSize="small" />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Gotra
                    </Typography>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {member.gotra || 'Not specified'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Sub-Caste */}
            <Grid item xs={12} sm={6}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                  <Avatar sx={{ bgcolor: 'rgba(237, 108, 2, 0.08)', color: 'warning.main', width: 40, height: 40 }}>
                    <PersonIcon fontSize="small" />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Sub-Caste
                    </Typography>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {member.subCaste || 'Not specified'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Gender */}
            <Grid item xs={12} sm={6}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                  <Avatar sx={{ bgcolor: 'rgba(46, 125, 50, 0.08)', color: 'success.main', width: 40, height: 40 }}>
                    <GenderIcon fontSize="small" />
                  </Avatar>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Gender
                    </Typography>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {member.gender || 'Not specified'}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
};

export default MemberProfilePage;

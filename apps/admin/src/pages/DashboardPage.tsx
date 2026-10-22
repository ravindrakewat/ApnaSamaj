import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Paper,
  Box,
  Chip,
  Grid,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  AdminPanelSettings,
  VerifiedUserOutlined,
  PhoneOutlined,
  BadgeOutlined,
  PeopleAltOutlined,
  ArrowForward,
  CheckCircleOutline,
  HourglassEmptyOutlined,
  DynamicFeedOutlined,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { AdminMetrics } from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import { fetchAdminMetrics } from '../services/admin.metrics.service';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminMetrics();
      setMetrics(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load administrative metrics.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  return (
    <Box>
      <Paper
        elevation={2}
        sx={{
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          borderLeft: '6px solid #9c27b0',
          mb: 4,
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2} mb={2}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight="bold">
              Welcome, {user?.fullName || 'Administrator'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Apna Samaj Administrative Control Center. Monitor live metrics, manage members, and configure platform settings.
            </Typography>
          </Box>
          <Chip
            icon={<VerifiedUserOutlined />}
            label={`Status: ${user?.status || 'ACTIVE'}`}
            color={user?.status === 'ACTIVE' ? 'success' : 'warning'}
            variant="filled"
            sx={{ fontWeight: 'bold' }}
          />
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Section: Platform Live KPI Metrics */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" color="secondary">
              Community Health & Platform Metrics
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Aggregated real-time platform statistics
            </Typography>
          </Box>
          <Tooltip title="Refresh metrics">
            <span>
              <IconButton onClick={loadMetrics} disabled={loading} size="small" color="secondary">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={loadMetrics}>
                Retry
              </Button>
            }
            sx={{ mb: 3, borderRadius: 2 }}
          >
            {error}
          </Alert>
        )}

        <Grid container spacing={2.5} sx={{ mb: 4 }}>
          {/* KPI 1: Total Registered Members */}
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                borderColor: 'primary.light',
                bgcolor: 'rgba(25, 118, 210, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="caption" fontWeight="bold" color="primary">
                  TOTAL MEMBERS
                </Typography>
                <PeopleAltOutlined color="primary" fontSize="small" />
              </Box>
              <Box my={1}>
                {loading ? (
                  <CircularProgress size={24} color="primary" />
                ) : (
                  <Typography variant="h4" fontWeight="bold" color="text.primary">
                    {metrics?.totalUsers ?? 0}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Registered user accounts in system
              </Typography>
            </Paper>
          </Grid>

          {/* KPI 2: Active Verified Members */}
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                borderColor: 'success.light',
                bgcolor: 'rgba(46, 125, 50, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="caption" fontWeight="bold" color="success.main">
                  ACTIVE MEMBERS
                </Typography>
                <CheckCircleOutline color="success" fontSize="small" />
              </Box>
              <Box my={1}>
                {loading ? (
                  <CircularProgress size={24} color="success" />
                ) : (
                  <Typography variant="h4" fontWeight="bold" color="text.primary">
                    {metrics?.activeUsers ?? 0}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Verified accounts with community access
              </Typography>
            </Paper>
          </Grid>

          {/* KPI 3: Pending Approvals */}
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                borderColor: 'warning.light',
                bgcolor: 'rgba(237, 108, 2, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="caption" fontWeight="bold" color="warning.main">
                  PENDING APPROVAL
                </Typography>
                <HourglassEmptyOutlined color="warning" fontSize="small" />
              </Box>
              <Box my={1}>
                {loading ? (
                  <CircularProgress size={24} color="warning" />
                ) : (
                  <Typography variant="h4" fontWeight="bold" color="text.primary">
                    {metrics?.pendingUsers ?? 0}
                  </Typography>
                )}
              </Box>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">
                  Awaiting administrator review
                </Typography>
                {metrics && metrics.pendingUsers > 0 && (
                  <Button
                    size="small"
                    color="warning"
                    onClick={() => navigate('/members')}
                    sx={{ p: 0, minWidth: 'auto', fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    Review &rarr;
                  </Button>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* KPI 4: Total Feed Posts */}
          <Grid item xs={12} sm={6} md={3}>
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 2.5,
                borderColor: 'secondary.light',
                bgcolor: 'rgba(156, 39, 176, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="caption" fontWeight="bold" color="secondary.main">
                  COMMUNITY POSTS
                </Typography>
                <DynamicFeedOutlined color="secondary" fontSize="small" />
              </Box>
              <Box my={1}>
                {loading ? (
                  <CircularProgress size={24} color="secondary" />
                ) : (
                  <Typography variant="h4" fontWeight="bold" color="text.primary">
                    {metrics?.totalPosts ?? 0}
                  </Typography>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Total discussions & announcements published
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3 }} />

        {/* User Account Verification Details */}
        <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="secondary">
          Administrator Security Profile
        </Typography>

        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <BadgeOutlined color="secondary" fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Role Privilege
                </Typography>
              </Box>
              <Typography variant="body1" fontWeight="bold">
                {user?.role}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <PhoneOutlined color="secondary" fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Verified Phone
                </Typography>
              </Box>
              <Typography variant="body1" fontWeight="bold">
                {user?.phone}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <AdminPanelSettings color="secondary" fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  User UUID (Database Subject)
                </Typography>
              </Box>
              <Typography
                variant="body2"
                sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
              >
                {user?.id}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* Quick Link Card to Member Management */}
        <Paper
          sx={{
            mt: 4,
            p: 3,
            borderRadius: 2,
            bgcolor: 'rgba(156, 39, 176, 0.05)',
            border: '1px solid rgba(156, 39, 176, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                bgcolor: 'secondary.main',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PeopleAltOutlined />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight="bold">
                Member Management Foundation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Search, filter, inspect profiles, and manage member activation/suspension states.
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            color="secondary"
            endIcon={<ArrowForward />}
            onClick={() => navigate('/members')}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Go to Members
          </Button>
        </Paper>
      </Paper>
    </Box>
  );
};

export default DashboardPage;

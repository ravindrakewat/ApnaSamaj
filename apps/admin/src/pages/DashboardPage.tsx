import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Button,
  Paper,
  Box,
  Chip,
  Grid,
  Divider,
} from '@mui/material';
import {
  AdminPanelSettings,
  VerifiedUserOutlined,
  PhoneOutlined,
  BadgeOutlined,
  PeopleAltOutlined,
  ArrowForward,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

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
              Apna Samaj Administrative Control Center. Manage members, groups, and platform settings.
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

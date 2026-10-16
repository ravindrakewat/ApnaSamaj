import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import GroupsIcon from '@mui/icons-material/Groups';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <AppBar position="sticky" color="inherit" elevation={1} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', minHeight: 64 }}>
          {/* Logo / Brand */}
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }}
            onClick={() => navigate('/')}
          >
            <GroupsIcon color="primary" sx={{ fontSize: 32 }} />
            <Box>
              <Typography variant="h6" fontWeight="bold" color="primary" sx={{ lineHeight: 1.2 }}>
                Apna Samaj
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Member Community
              </Typography>
            </Box>
          </Box>

          {/* Nav Links & Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button
              color={location.pathname === '/' ? 'primary' : 'inherit'}
              onClick={() => navigate('/')}
              sx={{ fontWeight: location.pathname === '/' ? 600 : 400 }}
            >
              Home
            </Button>

            {user ? (
              <>
                <Button
                  color={location.pathname === '/feed' ? 'primary' : 'inherit'}
                  onClick={() => navigate('/feed')}
                  startIcon={<DynamicFeedIcon />}
                  sx={{ fontWeight: location.pathname === '/feed' ? 600 : 400 }}
                >
                  Feed
                </Button>

                <Button
                  color={location.pathname === '/profile' ? 'primary' : 'inherit'}
                  onClick={() => navigate('/profile')}
                  startIcon={<AccountCircleIcon />}
                  sx={{ fontWeight: location.pathname === '/profile' ? 600 : 400 }}
                >
                  My Profile
                </Button>

                <Chip
                  label={user.fullName || user.phone}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ ml: 1, display: { xs: 'none', sm: 'inline-flex' } }}
                />

                <Tooltip title="Log out">
                  <IconButton color="default" onClick={handleLogout} size="small" sx={{ ml: 0.5 }}>
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <>
                <Button
                  variant={location.pathname === '/login' ? 'contained' : 'text'}
                  color="primary"
                  onClick={() => navigate('/login')}
                  size="small"
                >
                  Login
                </Button>
                <Button
                  variant={location.pathname === '/register' ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => navigate('/register')}
                  size="small"
                >
                  Register
                </Button>
              </>
            )}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

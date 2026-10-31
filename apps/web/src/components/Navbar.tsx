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
import PeopleIcon from '@mui/icons-material/People';
import FavoriteIcon from '@mui/icons-material/Favorite';
import GavelIcon from '@mui/icons-material/Gavel';
import { useTranslation } from '@apnasamaj/i18n';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { LanguageSelector } from './LanguageSelector';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('nav');

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
                {t('brandSubtitle')}
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
              {t('home')}
            </Button>

            {user ? (
              <>
                <Button
                  color={location.pathname === '/feed' ? 'primary' : 'inherit'}
                  onClick={() => navigate('/feed')}
                  startIcon={<DynamicFeedIcon />}
                  sx={{ fontWeight: location.pathname === '/feed' ? 600 : 400 }}
                >
                  {t('feed')}
                </Button>

                <Button
                  color={location.pathname.startsWith('/groups') ? 'primary' : 'inherit'}
                  onClick={() => navigate('/groups')}
                  startIcon={<GroupsIcon />}
                  sx={{ fontWeight: location.pathname.startsWith('/groups') ? 600 : 400 }}
                >
                  {t('groups')}
                </Button>

                <Button
                  color={location.pathname === '/directory' ? 'primary' : 'inherit'}
                  onClick={() => navigate('/directory')}
                  startIcon={<PeopleIcon />}
                  sx={{ fontWeight: location.pathname === '/directory' ? 600 : 400 }}
                >
                  {t('directory')}
                </Button>

                <Button
                  color={location.pathname.startsWith('/matrimonial') ? 'primary' : 'inherit'}
                  onClick={() => navigate('/matrimonial')}
                  startIcon={<FavoriteIcon />}
                  sx={{ fontWeight: location.pathname.startsWith('/matrimonial') ? 600 : 400 }}
                >
                  {t('matrimonial')}
                </Button>

                <Button
                  color={location.pathname === '/profile' ? 'primary' : 'inherit'}
                  onClick={() => navigate('/profile')}
                  startIcon={<AccountCircleIcon />}
                  sx={{ fontWeight: location.pathname === '/profile' ? 600 : 400 }}
                >
                  {t('profile')}
                </Button>

                <Button
                  color={location.pathname === '/appeals' ? 'primary' : 'inherit'}
                  onClick={() => navigate('/appeals')}
                  startIcon={<GavelIcon />}
                  sx={{ fontWeight: location.pathname === '/appeals' ? 600 : 400 }}
                >
                  {t('appeals')}
                </Button>

                <LanguageSelector />

                <NotificationBell />

                <Chip
                  label={user.fullName || user.phone}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline-flex' } }}
                />

                <Tooltip title={t('logout')}>
                  <IconButton color="default" onClick={handleLogout} size="small" sx={{ ml: 0.5 }}>
                    <LogoutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <>
                <LanguageSelector />

                <Button
                  variant={location.pathname === '/login' ? 'contained' : 'text'}
                  color="primary"
                  onClick={() => navigate('/login')}
                  size="small"
                >
                  {t('login')}
                </Button>
                <Button
                  variant={location.pathname === '/register' ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => navigate('/register')}
                  size="small"
                >
                  {t('register')}
                </Button>
              </>
            )}
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};

import React, { useState } from 'react';
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
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Avatar,
  Badge,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import HomeIcon from '@mui/icons-material/Home';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import GroupsIcon from '@mui/icons-material/Groups';
import DynamicFeedIcon from '@mui/icons-material/DynamicFeed';
import PeopleIcon from '@mui/icons-material/People';
import FavoriteIcon from '@mui/icons-material/Favorite';
import GavelIcon from '@mui/icons-material/Gavel';
import ChatIcon from '@mui/icons-material/Chat';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LoginIcon from '@mui/icons-material/Login';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { useTranslation } from '@apnasamaj/i18n';
import { useAuth } from '../context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { LanguageSelector } from './LanguageSelector';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('nav');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleLogout = async () => {
    setMobileDrawerOpen(false);
    await logout();
    navigate('/login');
  };

  const handleNavClick = (path: string) => {
    setMobileDrawerOpen(false);
    navigate(path);
  };

  const navLinks = [
    { label: t('home'), path: '/', icon: <HomeIcon fontSize="small" />, authOnly: false },
    { label: t('feed'), path: '/feed', icon: <DynamicFeedIcon fontSize="small" />, authOnly: true },
    { label: t('chat'), path: '/chat', icon: <ChatIcon fontSize="small" />, authOnly: true },
    { label: t('groups'), path: '/groups', icon: <GroupsIcon fontSize="small" />, authOnly: true },
    { label: t('directory'), path: '/directory', icon: <PeopleIcon fontSize="small" />, authOnly: true },
    { label: t('matrimonial'), path: '/matrimonial', icon: <FavoriteIcon fontSize="small" />, authOnly: true },
    { label: t('employment'), path: '/employment', icon: <WorkOutlineIcon fontSize="small" />, authOnly: true },
    { label: t('schemes'), path: '/government-schemes', icon: <AccountBalanceIcon fontSize="small" />, authOnly: true },
    { label: t('notifications'), path: '/notifications', icon: <NotificationsIcon fontSize="small" />, authOnly: true },
    { label: t('profile'), path: '/profile', icon: <AccountCircleIcon fontSize="small" />, authOnly: true },
    { label: t('appeals'), path: '/appeals', icon: <GavelIcon fontSize="small" />, authOnly: true },
  ];

  return (
    <>
      <AppBar position="sticky" color="inherit" elevation={1} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Container maxWidth="xl">
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

            {/* Desktop Navigation Links (Visible on md and up) */}
            <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 0.5 }}>
              <Button
                size="small"
                color={location.pathname === '/' ? 'primary' : 'inherit'}
                onClick={() => navigate('/')}
                sx={{ fontWeight: location.pathname === '/' ? 600 : 400 }}
              >
                {t('home')}
              </Button>

              {user ? (
                <>
                  <Button
                    size="small"
                    color={location.pathname === '/feed' ? 'primary' : 'inherit'}
                    onClick={() => navigate('/feed')}
                    startIcon={<DynamicFeedIcon />}
                    sx={{ fontWeight: location.pathname === '/feed' ? 600 : 400 }}
                  >
                    {t('feed')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname.startsWith('/chat') ? 'primary' : 'inherit'}
                    onClick={() => navigate('/chat')}
                    startIcon={<ChatIcon />}
                    sx={{ fontWeight: location.pathname.startsWith('/chat') ? 600 : 400 }}
                  >
                    {t('chat')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname.startsWith('/groups') ? 'primary' : 'inherit'}
                    onClick={() => navigate('/groups')}
                    startIcon={<GroupsIcon />}
                    sx={{ fontWeight: location.pathname.startsWith('/groups') ? 600 : 400 }}
                  >
                    {t('groups')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname === '/directory' ? 'primary' : 'inherit'}
                    onClick={() => navigate('/directory')}
                    startIcon={<PeopleIcon />}
                    sx={{ fontWeight: location.pathname === '/directory' ? 600 : 400 }}
                  >
                    {t('directory')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname.startsWith('/matrimonial') ? 'primary' : 'inherit'}
                    onClick={() => navigate('/matrimonial')}
                    startIcon={<FavoriteIcon />}
                    sx={{ fontWeight: location.pathname.startsWith('/matrimonial') ? 600 : 400 }}
                  >
                    {t('matrimonial')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname.startsWith('/employment') ? 'primary' : 'inherit'}
                    onClick={() => navigate('/employment')}
                    startIcon={<WorkOutlineIcon />}
                    sx={{ fontWeight: location.pathname.startsWith('/employment') ? 600 : 400 }}
                  >
                    {t('employment')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname.startsWith('/government-schemes') ? 'primary' : 'inherit'}
                    onClick={() => navigate('/government-schemes')}
                    startIcon={<AccountBalanceIcon />}
                    sx={{ fontWeight: location.pathname.startsWith('/government-schemes') ? 600 : 400 }}
                  >
                    {t('schemes')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname === '/profile' ? 'primary' : 'inherit'}
                    onClick={() => navigate('/profile')}
                    startIcon={<AccountCircleIcon />}
                    sx={{ fontWeight: location.pathname === '/profile' ? 600 : 400 }}
                  >
                    {t('profile')}
                  </Button>

                  <Button
                    size="small"
                    color={location.pathname === '/appeals' ? 'primary' : 'inherit'}
                    onClick={() => navigate('/appeals')}
                    startIcon={<GavelIcon />}
                    sx={{ fontWeight: location.pathname === '/appeals' ? 600 : 400 }}
                  >
                    {t('appeals')}
                  </Button>
                </>
              ) : null}
            </Box>

            {/* Right Side Icons & Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LanguageSelector />

              {user ? (
                <>
                  <NotificationBell />

                  <Chip
                    label={user.fullName || user.phone}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ display: { xs: 'none', md: 'inline-flex' } }}
                  />

                  <Tooltip title={t('logout')}>
                    <IconButton
                      color="default"
                      onClick={handleLogout}
                      size="small"
                      sx={{ display: { xs: 'none', lg: 'inline-flex' } }}
                    >
                      <LogoutIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              ) : (
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1 }}>
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
                </Box>
              )}

              {/* Mobile Hamburger Menu Button (Visible below lg) */}
              <IconButton
                color="inherit"
                aria-label="open navigation menu"
                onClick={() => setMobileDrawerOpen(true)}
                sx={{ display: { xs: 'inline-flex', lg: 'none' } }}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Responsive Mobile Drawer */}
      <Drawer
        anchor="right"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        PaperProps={{
          sx: { width: { xs: '80%', sm: 320 }, boxSizing: 'border-box' },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GroupsIcon color="primary" />
            <Typography variant="subtitle1" fontWeight="bold">
              Apna Samaj
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setMobileDrawerOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {user && (
          <Box sx={{ p: 2, bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 40, height: 40 }}>
                {(user.fullName || user.phone || 'U').charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ overflow: 'hidden' }}>
                <Typography variant="subtitle2" fontWeight="bold" noWrap>
                  {user.fullName || 'Member'}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {user.phone}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        <List sx={{ pt: 1, pb: 1, flexGrow: 1 }}>
          {navLinks
            .filter((item) => (item.authOnly ? Boolean(user) : true))
            .map((item) => {
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
              return (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    selected={isActive}
                    onClick={() => handleNavClick(item.path)}
                    sx={{
                      borderRadius: 1,
                      mx: 1,
                      mb: 0.5,
                      '&.Mui-selected': {
                        bgcolor: 'primary.light',
                        color: 'primary.contrastText',
                        '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 36,
                        color: isActive ? 'inherit' : 'action.active',
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.9rem',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
        </List>

        <Divider />

        <Box sx={{ p: 2 }}>
          {user ? (
            <Button
              fullWidth
              variant="outlined"
              color="error"
              startIcon={<LogoutIcon />}
              onClick={handleLogout}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {t('logout')}
            </Button>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={<LoginIcon />}
                onClick={() => handleNavClick('/login')}
                sx={{ textTransform: 'none' }}
              >
                {t('login')}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<HowToRegIcon />}
                onClick={() => handleNavClick('/register')}
                sx={{ textTransform: 'none' }}
              >
                {t('register')}
              </Button>
            </Box>
          )}
        </Box>
      </Drawer>
    </>
  );
};

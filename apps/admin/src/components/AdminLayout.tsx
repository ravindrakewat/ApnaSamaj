import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Chip,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Logout as LogoutIcon,
  AdminPanelSettings,
  HistoryEdu as HistoryEduIcon,
  Favorite as FavoriteIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const DRAWER_WIDTH = 260;

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } catch {
      // Handled in context
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navItems = [
    { text: 'Dashboard', path: '/', icon: <DashboardIcon /> },
    { text: 'Member Management', path: '/members', icon: <PeopleIcon /> },
    { text: 'Matrimonial Moderation', path: '/matrimonial', icon: <FavoriteIcon /> },
    { text: 'Audit Logs', path: '/audit-logs', icon: <HistoryEduIcon /> },
  ];

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Drawer Branding Header */}
      <Box
        sx={{
          p: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: 'secondary.main',
          color: 'secondary.contrastText',
        }}
      >
        <AdminPanelSettings fontSize="large" />
        <Box>
          <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
            Apna Samaj
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            Control Center
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Navigation List */}
      <List sx={{ px: 1.5, py: 2, flexGrow: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => {
                  navigate(item.path);
                  if (isMobile) setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  bgcolor: isActive ? 'rgba(156, 39, 176, 0.12)' : 'transparent',
                  color: isActive ? 'secondary.main' : 'text.primary',
                  fontWeight: isActive ? 'bold' : 'normal',
                  '&:hover': {
                    bgcolor: 'rgba(156, 39, 176, 0.08)',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isActive ? 'secondary.main' : 'text.secondary',
                    minWidth: 40,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontSize: '0.925rem',
                    fontWeight: isActive ? 'bold' : 'medium',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      {/* User Information in Drawer Footer */}
      {user && (
        <Box sx={{ p: 2, bgcolor: 'background.default' }}>
          <Typography variant="subtitle2" fontWeight="bold" noWrap>
            {user.fullName}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" noWrap>
            {user.phone}
          </Typography>
          <Chip
            label={user.role}
            size="small"
            color="secondary"
            variant="outlined"
            sx={{ mt: 1, fontSize: '0.7rem', height: 20 }}
          />
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Top Application Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            {location.pathname === '/members'
              ? 'Member Management'
              : location.pathname.startsWith('/matrimonial')
              ? 'Matrimonial Moderation'
              : location.pathname === '/audit-logs'
              ? 'System Audit Logs'
              : 'Admin Overview'}
          </Typography>

          {user && (
            <Box display="flex" alignItems="center" gap={2}>
              <Chip
                label={user.role}
                size="small"
                color="secondary"
                sx={{ display: { xs: 'none', sm: 'inline-flex' }, fontWeight: 'bold' }}
              />
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                onClick={handleLogout}
                disabled={isLoggingOut}
                startIcon={isLoggingOut ? <CircularProgress size={16} color="inherit" /> : <LogoutIcon />}
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                {isLoggingOut ? 'Signing out...' : 'Sign Out'}
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Side Navigation Drawers */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
        aria-label="navigation menu"
      >
        {/* Mobile Temporary Drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Desktop Permanent Drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid #e2e8f0',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content Viewport */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 4 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: '64px', // Space for AppBar
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default AdminLayout;

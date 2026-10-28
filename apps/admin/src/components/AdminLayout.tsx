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
  Select,
  MenuItem,
  FormControl,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Logout as LogoutIcon,
  AdminPanelSettings,
  HistoryEdu as HistoryEduIcon,
  Favorite as FavoriteIcon,
  AccountBalance as CommunityIcon,
  Shield as ShieldIcon,
  Assessment as AssessmentIcon,
  Gavel as GavelIcon,
} from '@mui/icons-material';
import { UserRole } from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import { getActiveCommunitySlug, setActiveCommunitySlug } from '../services/api.client';

const DRAWER_WIDTH = 260;

const COMMUNITIES = [
  { slug: 'kewat', name: 'Kewat Samaj' },
  { slug: 'gupta', name: 'Gupta Samaj' },
];

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<string>(
    () => getActiveCommunitySlug() || 'kewat'
  );

  const handleCommunityChange = (newSlug: string) => {
    setSelectedCommunity(newSlug);
    setActiveCommunitySlug(newSlug);
    // Reload page to refresh all active queries, caches, and tenant context
    window.location.reload();
  };

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

  const allNavItems = [
    { text: 'Dashboard', path: '/', icon: <DashboardIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN] },
    { text: 'Member Management', path: '/members', icon: <PeopleIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN] },
    { text: 'Moderator Management', path: '/moderators', icon: <AdminPanelSettings />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN] },
    { text: 'Moderation Queue', path: '/moderation', icon: <ShieldIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR] },
    { text: 'Moderation Analytics', path: '/moderation/analytics', icon: <AssessmentIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN] },
    { text: 'Member Appeals', path: '/moderation/appeals', icon: <GavelIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN, UserRole.MODERATOR] },
    { text: 'Matrimonial Moderation', path: '/matrimonial', icon: <FavoriteIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN] },
    { text: 'Audit Logs', path: '/audit-logs', icon: <HistoryEduIcon />, roles: [UserRole.SUPER_ADMIN, UserRole.COMMUNITY_ADMIN] },
  ];

  const navItems = user
    ? allNavItems.filter((item) => item.roles.includes(user.role))
    : [];


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
              : location.pathname === '/moderators'
              ? 'Moderator Management'
              : location.pathname === '/moderation'
              ? 'Moderation Queue'
              : 'Admin Overview'}
          </Typography>

          {user && (
            <Box display="flex" alignItems="center" gap={1.5}>
              {user.role === UserRole.SUPER_ADMIN ? (
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={selectedCommunity}
                    onChange={(e) => handleCommunityChange(e.target.value as string)}
                    size="small"
                    sx={{
                      height: 34,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      bgcolor: 'background.default',
                      borderRadius: 1.5,
                      '& .MuiSelect-select': {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        py: 0.5,
                      },
                    }}
                  >
                    {COMMUNITIES.map((c) => (
                      <MenuItem key={c.slug} value={c.slug} sx={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        🏛️ {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <Chip
                  icon={<CommunityIcon fontSize="small" />}
                  label={user.communitySlug ? `${user.communitySlug.toUpperCase()} Samaj` : 'Community'}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 'bold' }}
                />
              )}

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

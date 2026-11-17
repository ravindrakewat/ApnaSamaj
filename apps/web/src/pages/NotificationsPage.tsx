import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  Tabs,
  Tab,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  IconButton,
  CircularProgress,
  Alert,
  Divider,
  Chip,
  Stack,
  Tooltip,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import GroupsIcon from '@mui/icons-material/Groups';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import GavelIcon from '@mui/icons-material/Gavel';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { NotificationItem } from '@apnasamaj/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../services/notifications.service';
import { connectAppSocket } from '../services/chat.socket';
import {
  resolveNotificationTarget,
  formatRelativeTime,
  getNotificationTypeMeta,
} from '../utils/notifications';

function NotificationTypeIcon({ type }: { type: string }) {
  const meta = getNotificationTypeMeta(type);
  const iconProps = { sx: { fontSize: 13, color: '#ffffff' } };

  let iconNode = null;
  switch (meta.iconType) {
    case 'like':
      iconNode = <FavoriteIcon {...iconProps} />;
      break;
    case 'comment':
      iconNode = <ChatBubbleIcon {...iconProps} />;
      break;
    case 'group':
      iconNode = <GroupsIcon {...iconProps} />;
      break;
    case 'security':
      iconNode = <VerifiedUserIcon {...iconProps} />;
      break;
    case 'matrimonial':
      iconNode = <VolunteerActivismIcon {...iconProps} />;
      break;
    case 'moderation':
      iconNode = <GavelIcon {...iconProps} />;
      break;
    default:
      if (type.toLowerCase().includes('employment') || type.toLowerCase().includes('job')) {
        iconNode = <WorkOutlineIcon {...iconProps} />;
      } else if (type.toLowerCase().includes('scheme')) {
        iconNode = <AccountBalanceIcon {...iconProps} />;
      } else {
        iconNode = <NotificationsIcon {...iconProps} />;
      }
  }

  return (
    <Box
      sx={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        bgcolor: meta.color || 'primary.main',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #ffffff',
        position: 'absolute',
        bottom: -2,
        right: -2,
        boxShadow: 1,
      }}
    >
      {iconNode}
    </Box>
  );
}

export const NotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(
    async (pageToLoad: number = 1, append: boolean = false, tab: 'all' | 'unread' = activeTab) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const [notifData, countData] = await Promise.all([
          fetchNotifications({
            page: pageToLoad,
            limit: 20,
            unreadOnly: tab === 'unread',
          }),
          fetchUnreadCount().catch(() => ({ unreadCount: 0 })),
        ]);

        if (append) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const fresh = notifData.notifications.filter((n) => !existingIds.has(n.id));
            return [...prev, ...fresh];
          });
        } else {
          setNotifications(notifData.notifications);
        }

        setUnreadCount(countData.unreadCount);
        setPage(pageToLoad);
        setHasMore(notifData.pagination?.hasMore ?? (notifData.notifications.length >= 20));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'सूचनाएं लोड करने में विफल / Failed to load notifications');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab]
  );

  useEffect(() => {
    loadNotifications(1, false, activeTab);
  }, [loadNotifications, activeTab]);

  // Real-time Socket.IO notification listener
  useEffect(() => {
    const socket = connectAppSocket();
    if (!socket) return;

    const handleNewNotification = (notif: NotificationItem) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnreadCount((prev) => prev + 1);
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:created', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:created', handleNewNotification);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      if (activeTab === 'unread') {
        setNotifications([]);
      }
    } catch (err: unknown) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      markNotificationAsRead(item.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    const targetUrl = resolveNotificationTarget(item);
    if (targetUrl) {
      navigate(targetUrl);
    }
  };

  const handleMarkReadSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Mark read failed:', err);
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Delete notification failed:', err);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      {/* Top Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(-1)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            वापस / Back
          </Button>
          <Box display="flex" alignItems="center" gap={1}>
            <NotificationsIcon color="primary" sx={{ fontSize: 32 }} />
            <Typography variant="h4" component="h1" fontWeight="bold">
              सूचनाएं / Notifications
            </Typography>
            {unreadCount > 0 && (
              <Chip
                label={`${unreadCount} नई`}
                color="error"
                size="small"
                sx={{ fontWeight: 700, borderRadius: 2 }}
              />
            )}
          </Box>
        </Box>

        <Stack direction="row" spacing={1}>
          {unreadCount > 0 && (
            <Button
              variant="outlined"
              color="primary"
              size="small"
              startIcon={<DoneAllIcon />}
              onClick={handleMarkAllRead}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              सभी पढ़ी मार्क करें / Mark All Read
            </Button>
          )}

          <Button
            variant="text"
            color="inherit"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => loadNotifications(1, false, activeTab)}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            रिफ्रेश / Refresh
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, val) => setActiveTab(val)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="all" label="सभी सूचनाएं / All" sx={{ textTransform: 'none', fontWeight: 600 }} />
        <Tab
          value="unread"
          label={`अपठित / Unread (${unreadCount})`}
          sx={{ textTransform: 'none', fontWeight: 600 }}
        />
      </Tabs>

      {/* Error Alert */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => loadNotifications(1, false, activeTab)}>
              पुनः प्रयास करें / Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Main Notifications Inbox List */}
      <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {loading && (
          <Box textAlign="center" py={8}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              सूचनाएं लोड हो रही हैं...
            </Typography>
          </Box>
        )}

        {!loading && notifications.length === 0 && (
          <Box textAlign="center" py={8} px={3}>
            <NotificationsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" fontWeight={600} color="text.secondary">
              {activeTab === 'unread' ? 'कोई अपठित सूचना नहीं है' : 'कोई सूचनाएं उपलब्ध नहीं हैं'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              जब भी आपकी पोस्ट, संदेश या समाज से संबंधित कोई गतिविधि होगी, वह यहां दिखाई देगी।
            </Typography>
          </Box>
        )}

        {!loading && notifications.length > 0 && (
          <List disablePadding>
            {notifications.map((item, index) => {
              const sender = item.actor?.fullName || (item as any).data?.senderName || (item as any).data?.authorName;
              return (
                <React.Fragment key={item.id}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem
                    button
                    onClick={() => handleItemClick(item)}
                    sx={{
                      px: { xs: 2, sm: 3 },
                      py: 2,
                      bgcolor: item.isRead ? 'background.paper' : 'rgba(25, 118, 210, 0.04)',
                      transition: 'background-color 0.15s ease-in-out',
                      '&:hover': {
                        bgcolor: item.isRead ? 'action.hover' : 'rgba(25, 118, 210, 0.08)',
                      },
                    }}
                  >
                    {/* Left Indicator & Avatar */}
                    <Box display="flex" alignItems="center" gap={1.5} mr={1.5}>
                      {!item.isRead ? (
                        <FiberManualRecordIcon color="primary" sx={{ fontSize: 10 }} />
                      ) : (
                        <Box sx={{ width: 10 }} />
                      )}
                      <Box position="relative">
                        <Avatar
                          src={item.actor?.avatarUrl || (item as any).data?.senderAvatarUrl || (item as any).data?.avatarUrl || undefined}
                          sx={{ width: 44, height: 44, bgcolor: 'primary.light', color: 'primary.main', fontWeight: 'bold' }}
                        >
                          {sender ? sender.charAt(0).toUpperCase() : <NotificationsIcon fontSize="small" />}
                        </Avatar>
                        <NotificationTypeIcon type={item.type} />
                      </Box>
                    </Box>

                    {/* Content */}
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                          <Typography
                            variant="subtitle2"
                            fontWeight={item.isRead ? 600 : 700}
                            color={item.isRead ? 'text.primary' : 'primary.dark'}
                          >
                            {item.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {formatRelativeTime(item.createdAt, 'hi')}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            mt: 0.5,
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.message}
                        </Typography>
                      }
                    />

                    {/* Quick Action Icons */}
                    <Stack direction="row" spacing={0.5} ml={1}>
                      {!item.isRead && (
                        <Tooltip title="पढ़ा मार्क करें / Mark Read">
                          <IconButton size="small" onClick={(e) => handleMarkReadSingle(e, item.id)}>
                            <CheckCircleOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="हटाएं / Delete">
                        <IconButton size="small" color="error" onClick={(e) => handleDeleteSingle(e, item.id)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        )}

        {/* Load More Button */}
        {hasMore && !loading && (
          <Box p={2} textAlign="center" borderTop="1px solid" borderColor="divider">
            <Button
              variant="outlined"
              size="small"
              onClick={() => loadNotifications(page + 1, true, activeTab)}
              disabled={loadingMore}
              startIcon={loadingMore ? <CircularProgress size={16} /> : null}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {loadingMore ? 'लोड हो रहा है...' : 'और पुरानी सूचनाएं देखें / Load More'}
            </Button>
          </Box>
        )}
      </Paper>
    </Container>
  );
};

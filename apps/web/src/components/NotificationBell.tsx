import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton,
  Badge,
  Tooltip,
  Popover,
  Box,
  Typography,
  Button,
  Divider,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import GroupsIcon from '@mui/icons-material/Groups';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import GavelIcon from '@mui/icons-material/Gavel';
import RefreshIcon from '@mui/icons-material/Refresh';
import { NotificationItem } from '@apnasamaj/shared-types';
import { useTranslation } from '@apnasamaj/i18n';
import { useAuth } from '../context/AuthContext';
import {
  fetchUnreadCount,
  fetchNotifications,
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

export { resolveNotificationTarget, formatRelativeTime, getNotificationTypeMeta };

function NotificationTypeBadgeIcon({ type }: { type: string }) {
  const meta = getNotificationTypeMeta(type);
  const iconProps = { sx: { fontSize: 10, color: '#ffffff' } };

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
      iconNode = null;
  }

  if (!iconNode) return null;

  return (
    <Box
      sx={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        bgcolor: meta.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1.5px solid #ffffff',
        boxShadow: 1,
      }}
    >
      {iconNode}
    </Box>
  );
}

export const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('notifications');

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchUnreadCount();
      if (isMountedRef.current) {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Gracefully silence badge fetch errors (e.g. if DB migration unapplied or network offline)
    }
  }, [user]);

  // Initial fetch and lifecycle listeners (window focus, periodic polling)
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setNotifications([]);
      setAnchorEl(null);
      return;
    }

    loadUnreadCount();

    const onFocus = () => {
      loadUnreadCount();
    };
    window.addEventListener('focus', onFocus);

    // Modest polling interval of 60 seconds
    const interval = setInterval(() => {
      loadUnreadCount();
    }, 60000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [user, loadUnreadCount]);

  // Real-time notification updates via Socket.IO
  useEffect(() => {
    if (!user) return;

    let socket: any = null;
    try {
      socket = connectAppSocket();
    } catch (err) {
      console.warn('[NotificationBell] Could not initialize real-time socket:', err);
      return;
    }

    const handleNewNotification = (data: { notification: NotificationItem }) => {
      if (!data?.notification || !isMountedRef.current) return;
      const newNotif = data.notification;

      setNotifications((prev) => {
        // Prevent duplicate entries after reconnects or repeated events
        if (prev.some((n) => n.id === newNotif.id)) {
          return prev;
        }
        return [newNotif, ...prev];
      });

      if (!newNotif.isRead) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleUnreadCount = (data: { unreadCount: number }) => {
      if (typeof data?.unreadCount === 'number' && isMountedRef.current) {
        setUnreadCount(data.unreadCount);
      }
    };

    const handleConnect = () => {
      // Re-synchronize unread count on reconnect to guarantee state consistency
      loadUnreadCount();
      if (anchorEl) {
        loadNotifications(1, false, activeTab);
      }
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:unread-count', handleUnreadCount);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:unread-count', handleUnreadCount);
      socket.off('connect', handleConnect);
    };
  }, [user, anchorEl, activeTab, loadUnreadCount]);

  const loadNotifications = async (
    pageNum: number = 1,
    append: boolean = false,
    tabOverride?: 'all' | 'unread'
  ) => {
    const targetTab = tabOverride ?? activeTab;
    const isUnreadOnly = targetTab === 'unread';

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingList(true);
      setError(null);
    }

    try {
      const data = await fetchNotifications({
        page: pageNum,
        limit: 15,
        unreadOnly: isUnreadOnly ? true : undefined,
      });
      if (!isMountedRef.current) return;

      if (append) {
        setNotifications((prev) => [...prev, ...data.notifications]);
      } else {
        setNotifications(data.notifications);
      }

      setUnreadCount(data.unreadCount);
      setPage(data.pagination.page);
      setHasMore(data.pagination.hasMore);
    } catch (err: unknown) {
      if (isMountedRef.current) {
        const msg = err instanceof Error ? err.message : t('errorLoad');
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoadingList(false);
        setIsLoadingMore(false);
      }
    }
  };

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    loadNotifications(1, false, activeTab);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newTab: 'all' | 'unread') => {
    if (!newTab || newTab === activeTab) return;
    setActiveTab(newTab);
    loadNotifications(1, false, newTab);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleMarkAsRead = async (item: NotificationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (item.isRead) return;

    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markNotificationAsRead(item.id);
    } catch (err) {
      console.warn('[NotificationBell] Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);

    // Optimistic UI update
    const previous = [...notifications];
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead();
    } catch (err) {
      console.warn('[NotificationBell] Failed to mark all as read:', err);
      // Revert if call completely failed
      if (isMountedRef.current) {
        setNotifications(previous);
        loadUnreadCount();
      }
    } finally {
      if (isMountedRef.current) {
        setIsMarkingAll(false);
      }
    }
  };

  const handleDelete = async (id: string, wasUnread: boolean, e: React.MouseEvent) => {
    e.stopPropagation();

    // Optimistic UI update
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await deleteNotification(id);
    } catch (err) {
      console.warn('[NotificationBell] Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      await handleMarkAsRead(item);
    }

    const target = resolveNotificationTarget(item);
    handleClose();

    if (target) {
      navigate(target);
    }
  };

  const handleActorClick = (actorId?: string | null, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (actorId) {
      handleClose();
      navigate(`/members/${actorId}`);
    }
  };

  if (!user) {
    return null;
  }

  const isOpen = Boolean(anchorEl);
  const bellLabel = unreadCount > 0 ? t('unreadBadge', { count: unreadCount }) : t('title');

  return (
    <>
      <Tooltip title={t('title')}>
        <IconButton
          id="notification-bell-button"
          color="inherit"
          onClick={handleOpen}
          aria-label={bellLabel}
          aria-haspopup="true"
          aria-expanded={isOpen}
          size="medium"
          sx={{ ml: 0.5 }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            max={99}
            invisible={unreadCount === 0}
            overlap="circular"
          >
            {unreadCount > 0 ? (
              <NotificationsIcon color="primary" />
            ) : (
              <NotificationsNoneIcon color="action" />
            )}
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: { xs: 'calc(100vw - 20px)', sm: 380 },
            maxWidth: 420,
            maxHeight: { xs: 'calc(100vh - 80px)', sm: 540 },
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            borderRadius: 2,
            mt: 1,
            overflow: 'hidden',
          },
        }}
      >
        {/* Header */}
        <Box
          sx={{
            p: 1.5,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {t('title')}
            </Typography>
            {unreadCount > 0 && (
              <Badge
                badgeContent={unreadCount}
                color="primary"
                max={99}
                sx={{ ml: 1, '& .MuiBadge-badge': { position: 'static', transform: 'none' } }}
              />
            )}
          </Box>

          <Button
            size="small"
            variant="text"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0 || isMarkingAll}
            startIcon={isMarkingAll ? <CircularProgress size={14} /> : <DoneAllIcon fontSize="small" />}
            sx={{ fontSize: '0.75rem', textTransform: 'none', fontWeight: 600 }}
          >
            {t('markAllRead')}
          </Button>
        </Box>

        {/* All vs Unread Filter Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
            sx={{
              minHeight: { xs: 44, sm: 38 },
              '& .MuiTab-root': {
                minHeight: { xs: 44, sm: 38 },
                py: { xs: 1, sm: 0.5 },
                fontSize: '0.825rem',
                textTransform: 'none',
                fontWeight: 600,
              },
            }}
          >
            <Tab label={t('all')} value="all" id="notification-tab-all" />
            <Tab
              label={unreadCount > 0 ? t('unreadWithCount', { count: unreadCount }) : t('unread')}
              value="unread"
              id="notification-tab-unread"
            />
          </Tabs>
        </Box>

        {/* Content Body */}
        <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
          {isLoadingList ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
              <CircularProgress size={28} />
            </Box>
          ) : error ? (
            <Box sx={{ p: 2 }}>
              <Alert
                severity="warning"
                sx={{ fontSize: '0.85rem' }}
                action={
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<RefreshIcon fontSize="small" />}
                    onClick={() => loadNotifications(1, false, activeTab)}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    {t('retry')}
                  </Button>
                }
              >
                {error}
              </Alert>
            </Box>
          ) : notifications.length === 0 ? (
            <Box sx={{ py: 6, px: 2, textAlign: 'center' }}>
              <NotificationsNoneIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {activeTab === 'unread' ? t('emptyUnread') : t('emptyAll')}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                {activeTab === 'unread' ? t('allCaughtUp') : t('emptyDescription')}
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {notifications.map((item, index) => {
                const hasTarget = Boolean(resolveNotificationTarget(item));
                return (
                  <React.Fragment key={item.id}>
                    {index > 0 && <Divider component="li" />}
                    <ListItem
                      alignItems="flex-start"
                      onClick={() => handleNotificationClick(item)}
                      sx={{
                        px: 2,
                        py: 1.25,
                        cursor: hasTarget ? 'pointer' : 'default',
                        borderLeft: '3px solid',
                        borderColor: item.isRead ? 'transparent' : 'primary.main',
                        bgcolor: item.isRead
                          ? 'transparent'
                          : (theme) =>
                              theme.palette.mode === 'dark'
                                ? 'rgba(25, 118, 210, 0.08)'
                                : 'rgba(25, 118, 210, 0.04)',
                        transition: 'background-color 0.2s ease, border-color 0.2s ease',
                        '&:hover': {
                          bgcolor: item.isRead
                            ? 'action.hover'
                            : (theme) =>
                                theme.palette.mode === 'dark'
                                  ? 'rgba(25, 118, 210, 0.14)'
                                  : 'rgba(25, 118, 210, 0.08)',
                        },
                      }}
                      secondaryAction={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          {!item.isRead && (
                            <Tooltip title={t('markRead')}>
                              <IconButton
                                size="small"
                                edge="end"
                                onClick={(e) => handleMarkAsRead(item, e)}
                                aria-label={t('markRead')}
                                sx={{ color: 'text.secondary', p: { xs: 1, sm: 0.75 } }}
                              >
                                <CheckCircleOutlineIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title={t('delete')}>
                            <IconButton
                              size="small"
                              edge="end"
                              onClick={(e) => handleDelete(item.id, !item.isRead, e)}
                              aria-label={t('delete')}
                              sx={{ color: 'text.secondary', p: { xs: 1, sm: 0.75 } }}
                            >
                              <DeleteOutlineIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      }
                    >
                      <ListItemAvatar sx={{ minWidth: 48, mt: 0.25 }}>
                        <Badge
                          overlap="circular"
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                          badgeContent={<NotificationTypeBadgeIcon type={item.type} />}
                        >
                          <Avatar
                            src={item.actor?.avatarUrl || undefined}
                            alt={item.actor?.fullName || 'User'}
                            onClick={(e) => handleActorClick(item.actorId, e)}
                            sx={{
                              width: 36,
                              height: 36,
                              cursor: item.actorId ? 'pointer' : 'default',
                              bgcolor: 'primary.light',
                              fontSize: '0.875rem',
                            }}
                          >
                            {(item.actor?.fullName || item.title || 'U').charAt(0).toUpperCase()}
                          </Avatar>
                        </Badge>
                      </ListItemAvatar>

                      <ListItemText
                        sx={{ my: 0, pr: 5, overflow: 'hidden' }}
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                            {!item.isRead && (
                              <FiberManualRecordIcon
                                color="primary"
                                sx={{ fontSize: 8, flexShrink: 0 }}
                              />
                            )}
                            <Typography
                              variant="body2"
                              fontWeight={item.isRead ? 500 : 700}
                              color="text.primary"
                              noWrap
                              sx={{ fontSize: '0.85rem', wordBreak: 'break-word' }}
                            >
                              {item.title}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box component="span" sx={{ display: 'block' }}>
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                fontSize: '0.8rem',
                                lineHeight: 1.35,
                                mb: 0.5,
                                wordBreak: 'break-word',
                              }}
                            >
                              {item.message}
                            </Typography>
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.disabled"
                              sx={{ fontSize: '0.7rem' }}
                            >
                              {formatRelativeTime(item.createdAt, i18n.language)}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                );
              })}
            </List>
          )}

          {/* Load More Button */}
          {hasMore && !isLoadingList && (
            <Box sx={{ p: 1, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
              <Button
                size="small"
                onClick={() => loadNotifications(page + 1, true, activeTab)}
                disabled={isLoadingMore}
                startIcon={isLoadingMore ? <CircularProgress size={14} /> : undefined}
                sx={{ fontSize: '0.75rem', textTransform: 'none', fontWeight: 600 }}
              >
                {isLoadingMore ? t('loading') : t('loadOlder')}
              </Button>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
};

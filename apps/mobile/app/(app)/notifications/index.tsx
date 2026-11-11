import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { NotificationItem, NotificationsResponseData } from '@apnasamaj/shared-types';
import {
  AppHeader,
  Typography,
  NotificationCard,
  ConfirmationDialog,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { notificationsApi } from '../../../src/api/notifications.api';
import { resolveNotificationRoute } from '../../../src/services/notifications/notification-handler.service';
import { getChatSocket } from '../../../src/services/socket.service';

type FilterTab = 'all' | 'unread';

export default function NotificationsInboxScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { language } = useLocalization();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Deletion Confirmation Dialog State
  const [deleteTarget, setDeleteTarget] = useState<NotificationItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);

  /**
   * Fetches notifications from backend API with pagination and filter support.
   */
  const loadNotifications = useCallback(
    async (targetPage: number = 1, isRefresh: boolean = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (isRefresh) {
        setIsRefreshing(true);
      } else if (targetPage === 1) {
        setIsLoading(true);
      } else {
        setIsFetchingMore(true);
      }
      setError(null);

      try {
        const response: NotificationsResponseData = await notificationsApi.getNotifications({
          page: targetPage,
          limit: 20,
          unreadOnly: activeTab === 'unread',
        });

        if (targetPage === 1) {
          setNotifications(response.notifications);
        } else {
          setNotifications((prev) => [...prev, ...response.notifications]);
        }

        setUnreadCount(response.unreadCount);
        setPage(response.pagination.page);
        setHasMore(response.pagination.hasMore);
      } catch (err: any) {
        console.warn('[NotificationsInbox] Failed to load notifications:', err);
        setError(
          err?.message ||
            (language === 'hi'
              ? 'सूचनाएं लोड करने में विफल।'
              : 'Failed to load notifications.')
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
        isFetchingRef.current = false;
      }
    },
    [activeTab, language]
  );

  // Initial load and tab switch reload
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadNotifications(1, false);
  }, [activeTab, loadNotifications]);

  // Real-time Socket.IO Listeners
  useEffect(() => {
    const socket = getChatSocket();

    const handleNewNotification = ({
      notification,
      unreadCount: newCount,
    }: {
      notification: NotificationItem;
      unreadCount?: number;
    }) => {
      if (typeof newCount === 'number') {
        setUnreadCount(newCount);
      } else {
        setUnreadCount((prev) => prev + 1);
      }

      setNotifications((prev) => {
        // Avoid duplicate insertion
        if (prev.some((n) => n.id === notification.id)) {
          return prev;
        }
        if (activeTab === 'unread' && notification.isRead) {
          return prev;
        }
        return [notification, ...prev];
      });
    };

    const handleUnreadCount = ({ unreadCount: newCount }: { unreadCount: number }) => {
      setUnreadCount(newCount);
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:unread-count', handleUnreadCount);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:unread-count', handleUnreadCount);
    };
  }, [activeTab]);

  /**
   * Handles user tapping on a notification item.
   * Optimistically marks as read, calls API, and routes to deep-link target.
   */
  const handleNotificationPress = async (item: NotificationItem) => {
    if (!item.isRead) {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // Background API sync
      notificationsApi.markAsRead(item.id).catch((err) => {
        console.warn('[NotificationsInbox] markAsRead error:', err);
      });
    }

    // Resolve target route and navigate
    const targetRoute = resolveNotificationRoute(item as any);
    if (targetRoute) {
      router.push(targetRoute as any);
    }
  };

  /**
   * Marks all notifications as read across the active tenant.
   */
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await notificationsApi.markAllAsRead();
    } catch (err) {
      console.warn('[NotificationsInbox] markAllAsRead error:', err);
      loadNotifications(1, false);
    }
  };

  /**
   * Confirm and delete an individual notification.
   */
  const confirmDeleteNotification = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);

    try {
      await notificationsApi.deleteNotification(deleteTarget.id);
      setNotifications((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      if (!deleteTarget.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err: any) {
      Alert.alert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        err?.message || (language === 'hi' ? 'सूचना हटाने में विफल।' : 'Failed to delete notification.')
      );
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleEndReached = () => {
    if (!isLoading && !isFetchingMore && hasMore) {
      loadNotifications(page + 1, false);
    }
  };

  const renderEmptyComponent = () => {
    if (isLoading) return null;

    const emptyTitle =
      activeTab === 'unread'
        ? language === 'hi'
          ? 'कोई अपठित सूचना नहीं है'
          : 'No unread notifications'
        : language === 'hi'
        ? 'कोई सूचना नहीं है'
        : 'No notifications yet';

    const emptyDesc =
      activeTab === 'unread'
        ? language === 'hi'
          ? 'आपकी सभी सूचनाएं पढ़ी जा चुकी हैं।'
          : 'All caught up! You have read all notifications.'
        : language === 'hi'
        ? 'जब भी कोई नई गतिविधि होगी, आपको यहाँ सूचित किया जाएगा।'
        : 'You will receive notifications here when there is activity.';

    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconCircle, { backgroundColor: theme.colors.primaryLight }]}>
          <Typography variant="lg">🔔</Typography>
        </View>
        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.emptyTitle}>
          {emptyTitle}
        </Typography>
        <Typography variant="xs" color={theme.colors.textSecondary} style={styles.emptyDesc}>
          {emptyDesc}
        </Typography>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isFetchingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* 1. App Header */}
      <AppHeader
        mode="detail"
        title={language === 'hi' ? 'सूचनाएँ' : 'Notifications'}
        showBackButton={true}
        onBackPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(app)');
          }
        }}
        rightAccessory={
          unreadCount > 0 ? (
            <Pressable
              onPress={handleMarkAllAsRead}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={language === 'hi' ? 'सभी पढ़ा हुआ चिह्नित करें' : 'Mark all as read'}
              style={styles.markAllButton}
            >
              <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
                {language === 'hi' ? 'सब पढ़ें' : 'Mark all read'}
              </Typography>
            </Pressable>
          ) : null
        }
      />

      {/* 2. Filter Tabs (All vs Unread) */}
      <View style={[styles.tabBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Pressable
          onPress={() => setActiveTab('all')}
          style={[
            styles.tabItem,
            activeTab === 'all' && [styles.activeTabItem, { borderBottomColor: theme.colors.primary }],
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'all' }}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'all' ? 'bold' : 'regular'}
            color={activeTab === 'all' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {language === 'hi' ? 'सभी' : 'All'}
          </Typography>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('unread')}
          style={[
            styles.tabItem,
            activeTab === 'unread' && [styles.activeTabItem, { borderBottomColor: theme.colors.primary }],
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'unread' }}
        >
          <View style={styles.tabContentWithBadge}>
            <Typography
              variant="sm"
              weight={activeTab === 'unread' ? 'bold' : 'regular'}
              color={activeTab === 'unread' ? theme.colors.primary : theme.colors.textSecondary}
            >
              {language === 'hi' ? 'अपठित' : 'Unread'}
            </Typography>
            {unreadCount > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: theme.colors.primary }]}>
                <Typography variant="xs" weight="bold" color="#FFFFFF" style={styles.tabBadgeText}>
                  {unreadCount > 99 ? '99+' : String(unreadCount)}
                </Typography>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* 3. Error Banner */}
      {error && (
        <View style={[styles.errorBanner, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
          <Typography variant="xs" color="#B91C1C" style={{ flex: 1 }}>
            {error}
          </Typography>
          <Pressable onPress={() => loadNotifications(1, false)} hitSlop={6}>
            <Typography variant="xs" weight="bold" color="#B91C1C">
              {language === 'hi' ? 'पुनः प्रयास' : 'Retry'}
            </Typography>
          </Pressable>
        </View>
      )}

      {/* 4. Notifications FlatList */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="xs" color={theme.colors.textSecondary} style={{ marginTop: 10 }}>
            {language === 'hi' ? 'सूचनाएं लोड हो रही हैं...' : 'Loading notifications...'}
          </Typography>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationCard
              notification={item}
              onPress={handleNotificationPress}
              onDelete={(notif) => setDeleteTarget(notif)}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadNotifications(1, true)}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={renderEmptyComponent}
          ListFooterComponent={renderFooter}
          contentContainerStyle={notifications.length === 0 ? styles.emptyListContent : undefined}
        />
      )}

      {/* 5. Delete Notification Confirmation Dialog */}
      <ConfirmationDialog
        visible={Boolean(deleteTarget)}
        title={language === 'hi' ? 'सूचना हटाएं' : 'Delete Notification'}
        message={
          language === 'hi'
            ? 'क्या आप वाकई इस सूचना को हटाना चाहते हैं?'
            : 'Are you sure you want to delete this notification?'
        }
        confirmLabel={language === 'hi' ? 'हटाएं' : 'Delete'}
        cancelLabel={language === 'hi' ? 'रद्द करें' : 'Cancel'}
        variant="danger"
        loading={isDeleting}
        onConfirm={confirmDeleteNotification}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  markAllButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabItem: {
    borderBottomWidth: 2,
  },
  tabContentWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 9,
    lineHeight: 12,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    marginHorizontal: 14,
    marginTop: 8,
    borderRadius: 8,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyDesc: {
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

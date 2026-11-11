import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostItem, PostType, PostMediaItem } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
  Input,
  PostCard,
  BottomNavigation,
} from '../../src/components';
import { useTheme } from '../../src/hooks/useTheme';
import { useLocalization } from '../../src/hooks/useLocalization';
import { useAuth } from '../../src/hooks/useAuth';
import { postsApi } from '../../src/api/posts.api';
import { notificationsApi } from '../../src/api/notifications.api';
import { getChatSocket } from '../../src/services/socket.service';
import { APP_CONFIG } from '../../src/constants/config';

export default function SocialFeedHomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLocalization();
  const { user, communitySlug, switchCommunity, logout } = useAuth();

  // Feed State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [selectedType, setSelectedType] = useState<PostType | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSearch, setActiveSearch] = useState<string>('');

  // Facebook-Style Inline Video Playback State (Only 1 active video across entire feed)
  const [activePlayingPostId, setActivePlayingPostId] = useState<string | null>(null);
  const activePlayingPostIdRef = useRef<string | null>(null);

  useEffect(() => {
    activePlayingPostIdRef.current = activePlayingPostId;
  }, [activePlayingPostId]);

  // Pause & release decoder resources when the playing post scrolls out of visible viewport
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: PostItem }> }) => {
    if (activePlayingPostIdRef.current) {
      const isStillVisible = viewableItems.some((v) => v.item?.id === activePlayingPostIdRef.current);
      if (!isStillVisible) {
        setActivePlayingPostId(null);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 40,
  }).current;

  // Unread Notification Count State
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await notificationsApi.getUnreadCount();
      setUnreadNotificationsCount(count);
    } catch {
      // Non-blocking fallback
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUnreadCount();
    }, [loadUnreadCount])
  );

  useEffect(() => {
    const socket = getChatSocket();
    const handleUnreadCount = ({ unreadCount }: { unreadCount: number }) => {
      setUnreadNotificationsCount(unreadCount);
    };
    const handleNewNotif = () => {
      setUnreadNotificationsCount((prev) => prev + 1);
    };

    socket.on('notification:unread-count', handleUnreadCount);
    socket.on('notification:new', handleNewNotif);

    return () => {
      socket.off('notification:unread-count', handleUnreadCount);
      socket.off('notification:new', handleNewNotif);
    };
  }, []);

  // Profile Drawer Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [tenantInput, setTenantInput] = useState<string>(communitySlug);
  const [tenantSuccess, setTenantSuccess] = useState<boolean>(false);

  const isFetchingRef = useRef(false);

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  /**
   * Fetches posts with pagination, type filter, and search query.
   */
  const loadPosts = useCallback(
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
        const result = await postsApi.getFeed({
          page: targetPage,
          limit: 10,
          type: selectedType,
          search: activeSearch || undefined,
        });

        if (targetPage === 1) {
          setPosts(result.posts);
        } else {
          // Append unique posts
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newPosts = result.posts.filter((p) => !existingIds.has(p.id));
            return [...prev, ...newPosts];
          });
        }

        setPage(targetPage);
        setHasMore(result.pagination.hasMore);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : language === 'hi'
            ? 'फ़ीड लोड करने में असमर्थ। कृपया पुनः प्रयास करें।'
            : 'Failed to load community feed. Please try again.';
        setError(msg);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    },
    [selectedType, activeSearch, language]
  );

  // Reload feed whenever category filter or committed search changes
  useEffect(() => {
    loadPosts(1);
  }, [loadPosts]);

  const isFirstMountRef = useRef(true);

  // Automatically refresh feed when screen regains focus (e.g. returning from create post)
  useFocusEffect(
    useCallback(() => {
      if (isFirstMountRef.current) {
        isFirstMountRef.current = false;
        return;
      }
      loadPosts(1);
    }, [loadPosts])
  );

  const handleRefresh = () => {
    setActivePlayingPostId(null);
    loadPosts(1, true);
  };

  const handleLoadMore = () => {
    if (!hasMore || isFetchingMore || isLoading || isRefreshing) return;
    loadPosts(page + 1);
  };

  const handleToggleLike = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    if (post.isLikedByMe) {
      const res = await postsApi.unlikePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikedByMe: false, likesCount: res.likesCount } : p
        )
      );
    } else {
      const res = await postsApi.likePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikedByMe: true, likesCount: res.likesCount } : p
        )
      );
    }
  };

  const handleSearchSubmit = () => {
    setActiveSearch(searchQuery.trim());
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearch('');
  };

  const handleSwitchCommunity = async () => {
    if (tenantInput.trim() && tenantInput.trim().toLowerCase() !== communitySlug) {
      await switchCommunity(tenantInput.trim());
      setTenantSuccess(true);
      setTimeout(() => {
        setTenantSuccess(false);
        setIsProfileModalOpen(false);
      }, 1500);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      language === 'hi' ? 'लॉग आउट' : 'Log Out',
      language === 'hi'
        ? 'क्या आप सचमुच अपने खाते से लॉग आउट करना चाहते हैं?'
        : 'Are you sure you want to log out?',
      [
        { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: language === 'hi' ? 'लॉग आउट' : 'Log Out',
          style: 'destructive',
          onPress: async () => {
            setIsProfileModalOpen(false);
            await logout();
          },
        },
      ]
    );
  };

  // Header Component for FlatList
  const renderListHeader = () => (
    <View style={styles.listHeaderContainer}>
      {/* 1. Facebook-Style "What's on your mind?" Composer Box */}
      <View style={[styles.createPromptCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={[styles.promptAvatar, { backgroundColor: theme.colors.primaryLight }]}>
          <Typography variant="sm" weight="bold" color={theme.colors.primaryDark}>
            {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
          </Typography>
        </View>

        <Pressable
          onPress={() => router.push('/(app)/post/create')}
          style={styles.promptInputPill}
          accessibilityRole="button"
          accessibilityLabel="Create a new post"
        >
          <Typography variant="xs" color={theme.colors.textMuted} numberOfLines={1}>
            {language === 'hi'
              ? 'अपने समाज से कुछ नया साझा करें...'
              : "What's on your mind? Share with community..."}
          </Typography>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(app)/post/create')}
          style={styles.promptMediaButton}
          accessibilityRole="button"
          accessibilityLabel="Add photos or video"
          hitSlop={8}
        >
          <Typography variant="md">📷</Typography>
        </Pressable>
      </View>

      {/* 2. Category Filter Pills Carousel */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: undefined, hi: 'सभी', en: 'All', icon: '📰' },
            { key: 'GENERAL' as PostType, hi: 'सामान्य', en: 'General', icon: '💬' },
            { key: 'ANNOUNCEMENT' as PostType, hi: 'सूचनाएं', en: 'Notices', icon: '📢' },
            { key: 'EVENT' as PostType, hi: 'आयोजन', en: 'Events', icon: '📅' },
            { key: 'EMPLOYMENT_NAV' as any, hi: 'रोजगार', en: 'Jobs', icon: '💼' },
            { key: 'SCHEMES_NAV' as any, hi: 'सरकारी योजनाएँ', en: 'Schemes', icon: '🏛️' },
          ]}
          keyExtractor={(item) => (item.key as string) || 'ALL'}
          contentContainerStyle={styles.filterScroll}
          renderItem={({ item }) => {
            const isEmp = item.key === 'EMPLOYMENT_NAV';
            const isScheme = item.key === 'SCHEMES_NAV';
            const isNav = isEmp || isScheme;
            const isSelected = !isNav && selectedType === item.key;
            return (
              <Pressable
                onPress={() => {
                  if (isEmp) {
                    router.push('/(app)/employment' as any);
                    return;
                  }
                  if (isScheme) {
                    router.push('/(app)/government-schemes' as any);
                    return;
                  }
                  setSelectedType(item.key as PostType | undefined);
                }}
                style={[
                  styles.filterChip,
                  {
                    borderColor: isSelected
                      ? theme.colors.primary
                      : isEmp
                        ? '#BFDBFE'
                        : isScheme
                          ? '#99F6E4'
                          : theme.colors.border,
                    backgroundColor: isSelected
                      ? theme.colors.primary
                      : isEmp
                        ? '#EFF6FF'
                        : isScheme
                          ? '#F0FDFA'
                          : theme.colors.surface,
                    borderWidth: isSelected || isNav ? 1.5 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Typography variant="xs" style={{ marginRight: 5 }}>
                  {item.icon}
                </Typography>
                <Typography
                  variant="xs"
                  weight={isSelected ? 'bold' : 'semibold'}
                  color={
                    isSelected
                      ? theme.colors.textInverse
                      : isEmp
                        ? '#1D4ED8'
                        : isScheme
                          ? '#0F766E'
                          : theme.colors.textPrimary
                  }
                >
                  {language === 'hi' ? item.hi : item.en}
                </Typography>
              </Pressable>
            );
          }}
        />
      </View>

      {/* 3. Modern Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Typography variant="sm" color={theme.colors.textMuted} style={styles.searchIcon}>
          🔍
        </Typography>

        <TextInput
          placeholder={language === 'hi' ? 'समाज की पोस्ट खोजें...' : 'Search posts...'}
          placeholderTextColor={theme.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          style={[styles.searchInputField, { color: theme.colors.textPrimary }]}
        />

        {searchQuery.length > 0 && (
          <Pressable
            onPress={handleClearSearch}
            style={styles.clearSearchBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Typography variant="xs" weight="bold" color={theme.colors.textMuted}>
              ✕
            </Typography>
          </Pressable>
        )}

        <Pressable
          onPress={handleSearchSubmit}
          style={[styles.searchActionBtn, { backgroundColor: theme.colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Typography variant="xs" weight="bold" color="#FFFFFF">
            {language === 'hi' ? 'खोजें' : 'Search'}
          </Typography>
        </Pressable>
      </View>

      {/* Active Search Result Tag */}
      {activeSearch.length > 0 && (
        <View style={styles.activeSearchResultRow}>
          <Typography variant="xs" color={theme.colors.textSecondary}>
            {language === 'hi' ? `खोज परिणाम: "${activeSearch}"` : `Results for: "${activeSearch}"`}
          </Typography>
          <Pressable onPress={handleClearSearch} hitSlop={6}>
            <Typography variant="xs" weight="bold" color={theme.colors.primary}>
              {language === 'hi' ? 'हटाएं' : 'Clear'}
            </Typography>
          </Pressable>
        </View>
      )}
    </View>
  );

  // Footer Component for FlatList
  const renderListFooter = () => {
    if (isFetchingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Typography variant="xs" color={theme.colors.textMuted} style={styles.loadingMoreText}>
            {language === 'hi' ? 'और पोस्ट लोड हो रही हैं...' : 'Loading more posts...'}
          </Typography>
        </View>
      );
    }
    if (!hasMore && posts.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi' ? '• आप सभी नवीनतम पोस्ट देख चुके हैं •' : '• You have viewed all recent posts •'}
          </Typography>
        </View>
      );
    }
    return null;
  };

  // Empty State Component
  const renderEmptyComponent = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textSecondary} style={styles.stateText}>
            {language === 'hi' ? 'समाज फ़ीड लोड हो रही है...' : 'Loading community feed...'}
          </Typography>
        </View>
      );
    }

    if (error) {
      return (
        <Card style={styles.stateCard}>
          <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
            {language === 'hi' ? 'फ़ीड लोड नहीं हो सकी' : 'Unable to Load Feed'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorDesc}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            onPress={() => loadPosts(1)}
            style={styles.retryBtn}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
          {language === 'hi' ? 'कोई पोस्ट नहीं मिली' : 'No Posts Found'}
        </Typography>
        <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.emptyDesc}>
          {activeSearch
            ? language === 'hi'
              ? 'आपकी खोज से मेल खाने वाली कोई पोस्ट नहीं मिली।'
              : 'No posts match your search criteria.'
            : language === 'hi'
            ? 'इस श्रेणी में अभी कोई पोस्ट नहीं है।'
            : 'No posts published in this category yet.'}
        </Typography>
        <Button
          title={language === 'hi' ? 'रीफ़्रेश करें' : 'Refresh'}
          variant="outline"
          onPress={handleRefresh}
          style={styles.retryBtn}
        />
      </Card>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* 1. Modern Top Header Bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            paddingTop: Math.max(insets.top, 10),
          },
        ]}
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandIcon, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="md" weight="bold" color={theme.colors.textInverse}>
              अ
            </Typography>
          </View>
          <View style={styles.brandTextCol}>
            <Typography variant="md" weight="bold" color={theme.colors.primary} style={styles.brandTitle}>
              {language === 'hi' ? 'अपना समाज' : 'Apna Samaj'}
            </Typography>
            <View style={styles.communitySlugPill}>
              <Typography variant="xs" weight="bold" color="#0369A1" style={{ fontSize: 10 }}>
                {communitySlug}
              </Typography>
            </View>
          </View>
        </View>

        <View style={styles.topActions}>
          {/* Notification Bell with Badge */}
          <Pressable
            onPress={() => router.push('/(app)/notifications' as any)}
            style={[styles.bellButton, { backgroundColor: '#F1F5F9' }]}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'सूचनाएँ' : 'Notifications'}
            hitSlop={8}
          >
            <Typography variant="md" style={styles.bellEmoji}>
              🔔
            </Typography>
            {unreadNotificationsCount > 0 && (
              <View style={styles.unreadBadge}>
                <Typography variant="xs" weight="bold" color="#FFFFFF" style={styles.unreadBadgeText}>
                  {unreadNotificationsCount > 99 ? '99+' : String(unreadNotificationsCount)}
                </Typography>
              </View>
            )}
          </Pressable>

          {/* Language Switcher Pill */}
          <Pressable
            onPress={toggleLanguage}
            style={[styles.langPill, { borderColor: theme.colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            hitSlop={8}
          >
            <Typography variant="xs" weight="bold" color={theme.colors.primary}>
              {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>

          {/* User Profile Avatar */}
          <Pressable
            onPress={() => router.push('/(app)/profile' as any)}
            style={[styles.profileAvatar, { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={8}
          >
            <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
            </Typography>
          </Pressable>
        </View>
      </View>

      {/* 2. Main Social Feed FlatList */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            communitySlug={communitySlug}
            isPlayingInline={activePlayingPostId === item.id}
            onPlayInline={(postId) => setActivePlayingPostId(postId)}
            onPauseInline={() => setActivePlayingPostId(null)}
            onPressPost={(postId) => {
              const targetPost = posts.find((p) => p.id === postId);
              if (
                targetPost &&
                (targetPost.title?.startsWith('[सरकारी') ||
                  targetPost.title?.startsWith('[Govt Scheme') ||
                  targetPost.title?.toLowerCase().includes('योजना'))
              ) {
                router.push({
                  pathname: '/(app)/government-schemes/[id]',
                  params: { id: postId },
                } as any);
                return;
              }
              if (
                targetPost &&
                (targetPost.title?.startsWith('[रोजगार') ||
                  targetPost.title?.startsWith('[Employment'))
              ) {
                router.push({
                  pathname: '/(app)/employment/[id]',
                  params: { id: postId },
                } as any);
                return;
              }
              router.push({
                pathname: '/(app)/post/[id]',
                params: { id: postId },
              });
            }}
            onPressComments={(postId) =>
              router.push({
                pathname: '/(app)/post/[id]',
                params: { id: postId },
              })
            }
            onToggleLike={handleToggleLike}
          />
        )}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 70 },
        ]}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
      />

      {/* 3. Floating Action Button (FAB) - Create Post */}
      <Pressable
        style={[
          styles.fab,
          {
            backgroundColor: theme.colors.primary,
            bottom: Math.max(insets.bottom, 12) + 64,
          },
        ]}
        onPress={() => router.push('/(app)/post/create')}
        accessibilityRole="button"
        accessibilityLabel={language === 'hi' ? 'नई पोस्ट लिखें' : 'Create new post'}
      >
        <Typography variant="md" weight="bold" color={theme.colors.textInverse} style={styles.fabIcon}>
          ✍️
        </Typography>
        <Typography variant="xs" weight="bold" color={theme.colors.textInverse} style={styles.fabText}>
          {language === 'hi' ? 'पोस्ट लिखें' : 'Post'}
        </Typography>
      </Pressable>

      {/* 4. Bottom Navigation Tabs */}
      <BottomNavigation activeTab="feed" />

      {/* 5. Member Profile & Tenant Switcher Modal */}
      <Modal
        visible={isProfileModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsProfileModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
                {language === 'hi' ? 'सदस्य प्रोफ़ाइल एवं सेटिंग्स' : 'Profile & Settings'}
              </Typography>
              <Pressable
                onPress={() => setIsProfileModalOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Typography variant="md" color={theme.colors.textMuted}>
                  ✕
                </Typography>
              </Pressable>
            </View>

            {/* Profile Info */}
            <View style={styles.profileBox}>
              <Typography variant="md" weight="bold">
                {user?.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
              </Typography>
              <Typography variant="xs" color={theme.colors.textSecondary}>
                {user?.phone || ''}
              </Typography>
              <View style={styles.badgeRow}>
                <Badge label={user?.role || 'MEMBER'} variant="info" size="sm" />
                <Badge label={communitySlug} variant="default" size="sm" />
              </View>
            </View>

            {/* Switch Tenant */}
            <View style={styles.tenantSection}>
              <Input
                label={language === 'hi' ? 'समुदाय बदलें (Community Slug)' : 'Switch Community'}
                value={tenantInput}
                onChangeText={setTenantInput}
                placeholder="e.g. demo"
                helperText={
                  tenantSuccess
                    ? language === 'hi'
                      ? 'समुदाय अपडेट हो रहा है...'
                      : 'Switching community...'
                    : undefined
                }
              />
              <Button
                title={language === 'hi' ? 'समुदाय बदलें' : 'Switch Community'}
                size="sm"
                variant="outline"
                onPress={handleSwitchCommunity}
              />
            </View>

            {/* Logout Action */}
            <Button
              title={language === 'hi' ? 'लॉग आउट करें' : 'Log Out'}
              variant="outline"
              onPress={handleLogout}
              style={styles.modalLogoutBtn}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTextCol: {
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  communitySlugPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellButton: {
    position: 'relative',
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellEmoji: {
    fontSize: 16,
    lineHeight: 20,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  unreadBadgeText: {
    fontSize: 9,
    lineHeight: 12,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#F8FAFC',
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 12,
  },
  listHeaderContainer: {
    paddingTop: 10,
    marginBottom: 6,
  },
  createPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  promptAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptInputPill: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  promptMediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  filterSection: {
    marginBottom: 10,
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 10,
    paddingRight: 4,
    height: 42,
    marginBottom: 6,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInputField: {
    flex: 1,
    height: '100%',
    fontSize: 13,
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 6,
    marginRight: 4,
  },
  searchActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  activeSearchResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginBottom: 6,
  },
  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 24,
    elevation: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    gap: 6,
    zIndex: 10,
  },
  fabIcon: {
    fontSize: 16,
  },
  fabText: {
    letterSpacing: 0.2,
  },
  footerLoader: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  loadingMoreText: {
    marginTop: 4,
  },
  footerDone: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  centerContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  stateText: {
    marginTop: 8,
  },
  stateCard: {
    padding: 24,
    marginTop: 16,
    alignItems: 'center',
  },
  errorDesc: {
    marginTop: 6,
    marginBottom: 16,
  },
  emptyDesc: {
    marginTop: 6,
    marginBottom: 16,
  },
  retryBtn: {
    minWidth: 140,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileBox: {
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  tenantSection: {
    marginBottom: 20,
  },
  modalLogoutBtn: {
    marginTop: 8,
    marginBottom: 12,
  },
});

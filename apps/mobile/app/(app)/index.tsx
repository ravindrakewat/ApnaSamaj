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
  VideoModal,
  BottomNavigation,
} from '../../src/components';
import { useTheme } from '../../src/hooks/useTheme';
import { useLocalization } from '../../src/hooks/useLocalization';
import { useAuth } from '../../src/hooks/useAuth';
import { postsApi } from '../../src/api/posts.api';
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

  // Media Modal
  const [activeVideo, setActiveVideo] = useState<PostMediaItem | null>(null);

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
      {/* Category Filter Chips */}
      <View style={styles.filterRow}>
        {(
          [
            { key: undefined, hi: 'सभी', en: 'All' },
            { key: 'GENERAL' as PostType, hi: 'सामान्य', en: 'General' },
            { key: 'ANNOUNCEMENT' as PostType, hi: 'सूचनाएं', en: 'Announcements' },
            { key: 'EVENT' as PostType, hi: 'आयोजन', en: 'Events' },
          ] as const
        ).map((item) => {
          const isSelected = selectedType === item.key;
          return (
            <Pressable
              key={item.key || 'ALL'}
              onPress={() => setSelectedType(item.key)}
              style={[
                styles.filterChip,
                {
                  borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                },
              ]}
              accessibilityRole="button"
            >
              <Typography
                variant="xs"
                weight="semibold"
                color={isSelected ? theme.colors.textInverse : theme.colors.textPrimary}
              >
                {language === 'hi' ? item.hi : item.en}
              </Typography>
            </Pressable>
          );
        })}
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchRow}>
        <Input
          placeholder={language === 'hi' ? 'समाज की पोस्ट खोजें...' : 'Search posts...'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
          containerStyle={styles.searchInput}
          rightAccessory={
            searchQuery ? (
              <Pressable
                onPress={handleClearSearch}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Typography variant="xs" weight="bold" color={theme.colors.textMuted}>
                  ✕
                </Typography>
              </Pressable>
            ) : null
          }
        />
        <Button
          title={language === 'hi' ? 'खोजें' : 'Search'}
          size="sm"
          onPress={handleSearchSubmit}
          style={styles.searchBtn}
        />
      </View>
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
            {language === 'hi' ? 'सभी पोस्ट लोड हो चुकी हैं' : 'All posts loaded'}
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
      {/* Top Navbar */}
      <View style={[styles.topBar, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border, paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.brandRow}>
          <View style={[styles.brandIcon, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="sm" weight="bold" color={theme.colors.textInverse}>
              अ
            </Typography>
          </View>
          <View>
            <Typography variant="md" weight="bold" color={theme.colors.primary}>
              {language === 'hi' ? 'अपना समाज' : 'Apna Samaj'}
            </Typography>
            <Typography variant="xs" color={theme.colors.textMuted}>
              {communitySlug}
            </Typography>
          </View>
        </View>

        <View style={styles.topActions}>
          {/* Language Toggle Pill */}
          <Pressable
            onPress={toggleLanguage}
            style={[styles.langPill, { borderColor: theme.colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
          >
            <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
              {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>

          {/* User Profile Avatar / Drawer Trigger */}
          <Pressable
            onPress={() => setIsProfileModalOpen(true)}
            style={[styles.profileAvatar, { backgroundColor: theme.colors.primaryLight }]}
            accessibilityRole="button"
            accessibilityLabel="Open profile options"
          >
            <Typography variant="xs" weight="bold" color={theme.colors.primaryDark}>
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
            </Typography>
          </Pressable>
        </View>
      </View>

      {/* Main Social Feed List */}
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            communitySlug={communitySlug}
            onPressPost={(postId) =>
              router.push({
                pathname: '/(app)/post/[id]',
                params: { id: postId },
              })
            }
            onPressComments={(postId) =>
              router.push({
                pathname: '/(app)/post/[id]',
                params: { id: postId },
              })
            }
            onToggleLike={handleToggleLike}
            onPlayVideo={(media) => setActiveVideo(media)}
          />
        )}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={styles.listContent}
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

      {/* Floating Action Button (FAB) - Create Post */}
      <Pressable
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: 64 + Math.max(insets.bottom, 10) }]}
        onPress={() => router.push('/(app)/post/create')}
        accessibilityRole="button"
        accessibilityLabel={language === 'hi' ? 'नई पोस्ट लिखें' : 'Create new post'}
      >
        <Typography variant="md" weight="bold" color={theme.colors.textInverse} style={styles.fabIcon}>
          +
        </Typography>
        <Typography variant="xs" weight="bold" color={theme.colors.textInverse} style={styles.fabText}>
          {language === 'hi' ? 'पोस्ट लिखें' : 'Post'}
        </Typography>
      </Pressable>

      {/* Bottom Navigation Tabs */}
      <BottomNavigation activeTab="feed" />

      {/* Video Modal Player (Autoplay Disabled) */}
      <VideoModal
        visible={Boolean(activeVideo)}
        media={activeVideo}
        onClose={() => setActiveVideo(null)}
      />

      {/* Member Profile & Tenant Switcher Modal */}
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 72,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
    gap: 6,
    zIndex: 10,
  },
  fabIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  fabText: {
    letterSpacing: 0.3,
  },
  listHeaderContainer: {
    paddingTop: 12,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  searchBtn: {
    height: 48,
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

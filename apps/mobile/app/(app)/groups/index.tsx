import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GroupListItem, GroupPrivacy } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  GroupCard,
  AppHeader,
  SearchBar,
  BottomNavigation,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { groupsApi } from '../../../src/api/groups.api';

type GroupFilterTab = 'ALL' | 'MY' | 'PUBLIC' | 'PRIVATE';

export default function GroupsDiscoveryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState<GroupFilterTab>('ALL');

  // Groups Data State
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalGroups, setTotalGroups] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFetchingRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search query (400ms)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchInput]);

  /**
   * Fetches community groups matching the active filters.
   */
  const loadGroups = useCallback(
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
        const privacyQuery =
          selectedTab === 'PUBLIC'
            ? 'PUBLIC'
            : selectedTab === 'PRIVATE'
            ? 'PRIVATE'
            : undefined;

        const result = await groupsApi.listGroups({
          page: targetPage,
          limit: 12,
          search: debouncedSearch || undefined,
          privacy: privacyQuery,
        });

        // If 'MY' tab is active, filter client-side for member groups
        let filteredGroups = result.groups;
        if (selectedTab === 'MY') {
          filteredGroups = filteredGroups.filter((g) => g.isMember);
        }

        if (targetPage === 1) {
          setGroups(filteredGroups);
        } else {
          setGroups((prev) => {
            const existingIds = new Set(prev.map((g) => g.id));
            const newGroups = filteredGroups.filter((g) => !existingIds.has(g.id));
            return [...prev, ...newGroups];
          });
        }

        setPage(targetPage);
        setTotalPages(result.pagination.totalPages);
        setTotalGroups(selectedTab === 'MY' ? filteredGroups.length : result.pagination.totalGroups);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : language === 'hi'
            ? 'समुदाय समूह लोड करने में समस्या हुई।'
            : 'Failed to load community groups.';
        setError(msg);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    },
    [debouncedSearch, selectedTab, language]
  );

  useEffect(() => {
    loadGroups(1);
  }, [loadGroups]);

  const handleRefresh = () => {
    loadGroups(1, true);
  };

  const handleLoadMore = () => {
    if (page >= totalPages || isFetchingMore || isLoading || isRefreshing) return;
    loadGroups(page + 1);
  };

  const handleSelectGroup = (slug: string) => {
    router.push({
      pathname: '/(app)/group/[slug]' as any,
      params: { slug },
    });
  };

  const handleJoinGroup = async (groupId: string) => {
    if (joiningGroupId) return;
    setJoiningGroupId(groupId);

    try {
      const res = await groupsApi.joinGroup(groupId);
      // Optimistic update of local group item
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? { ...g, isMember: true, myRole: res.role, membersCount: g.membersCount + 1 }
            : g
        )
      );
      Alert.alert(
        language === 'hi' ? 'सफल' : 'Success',
        res.message || (language === 'hi' ? 'समूह में सफलतापूर्वक शामिल हुए!' : 'Joined group successfully!')
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join group.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setJoiningGroupId(null);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const handleResetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedTab('ALL');
  };

  // Filter tabs definition
  const filterTabs: Array<{ key: GroupFilterTab; hi: string; en: string; icon: string }> = [
    { key: 'ALL', hi: 'सभी समूह', en: 'All Groups', icon: '🏛️' },
    { key: 'MY', hi: 'मेरे समूह', en: 'My Groups', icon: '⭐' },
    { key: 'PUBLIC', hi: 'सार्वजनिक', en: 'Public', icon: '🌐' },
    { key: 'PRIVATE', hi: 'निजी', en: 'Private', icon: '🔒' },
  ];

  // Header Component for FlatList
  const renderListHeader = () => (
    <View style={styles.headerContainer}>
      {/* 1. Reusable SearchBar */}
      <View style={styles.searchSection}>
        <SearchBar
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder={
            language === 'hi'
              ? 'समूह का नाम या विवरण खोजें...'
              : 'Search groups by name or topic...'
          }
          loading={isLoading && !isRefreshing && page === 1}
        />
      </View>

      {/* 2. Horizontal Filter Tabs Carousel */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filterTabs}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterScroll}
          renderItem={({ item }) => {
            const isSelected = selectedTab === item.key;
            return (
              <Pressable
                onPress={() => setSelectedTab(item.key)}
                style={[
                  styles.filterChip,
                  isSelected ? styles.filterChipSelected : styles.filterChipUnselected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                hitSlop={4}
              >
                <Typography variant="xs" style={styles.filterChipIcon}>
                  {item.icon}
                </Typography>
                <Typography
                  variant="xs"
                  weight={isSelected ? 'bold' : 'semibold'}
                  color={isSelected ? '#FFFFFF' : '#334155'}
                >
                  {language === 'hi' ? item.hi : item.en}
                </Typography>
              </Pressable>
            );
          }}
        />
      </View>

      {/* 3. Results Count Banner */}
      {!isLoading && !error && groups.length > 0 ? (
        <View style={styles.countRow}>
          <View style={styles.countLeft}>
            <View style={styles.blueIndicatorDot} />
            <Typography variant="xs" weight="semibold" color="#475569">
              {language === 'hi'
                ? `${totalGroups} समुदाय समूह मिले`
                : `${totalGroups} community groups found`}
            </Typography>
          </View>

          {(debouncedSearch || selectedTab !== 'ALL') && (
            <Pressable onPress={handleResetFilters} hitSlop={6}>
              <Typography variant="xs" color="#1976D2" weight="bold">
                {language === 'hi' ? 'रीसेट करें' : 'Reset'}
              </Typography>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );

  // Footer Component for FlatList
  const renderListFooter = () => {
    if (isFetchingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#1976D2" />
          <Typography variant="xs" color="#64748B" style={styles.loadingMoreText}>
            {language === 'hi' ? 'और समूह लोड हो रहे हैं...' : 'Loading more groups...'}
          </Typography>
        </View>
      );
    }
    if (page >= totalPages && groups.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color="#94A3B8">
            {language === 'hi' ? '• सभी समूह लोड हो चुके हैं •' : '• All groups loaded •'}
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
          <ActivityIndicator size="large" color="#1976D2" />
          <Typography variant="sm" color="#475569" style={styles.stateText}>
            {language === 'hi' ? 'समुदाय समूह लोड हो रहे हैं...' : 'Loading community groups...'}
          </Typography>
        </View>
      );
    }

    if (error) {
      return (
        <Card style={styles.stateCard}>
          <View style={styles.stateIconCircle}>
            <Typography variant="lg">⚠️</Typography>
          </View>
          <Typography variant="md" weight="bold" color="#DC2626" align="center" style={styles.stateTitle}>
            {language === 'hi' ? 'समूह लोड नहीं हो सके' : 'Unable to Load Groups'}
          </Typography>
          <Typography variant="sm" color="#64748B" align="center" style={styles.stateDesc}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            onPress={() => loadGroups(1)}
            style={styles.stateActionBtn}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <View style={styles.stateIconCircle}>
          <Typography variant="lg">{debouncedSearch ? '🔍' : '🏛️'}</Typography>
        </View>
        <Typography variant="md" weight="bold" color="#0F172A" align="center" style={styles.stateTitle}>
          {language === 'hi' ? 'कोई समूह नहीं मिला' : 'No Groups Found'}
        </Typography>
        <Typography variant="sm" color="#64748B" align="center" style={styles.stateDesc}>
          {debouncedSearch
            ? language === 'hi'
              ? 'आपकी खोज से मेल खाने वाला कोई समूह नहीं मिला।'
              : 'No community groups match your search criteria.'
            : selectedTab === 'MY'
            ? language === 'hi'
              ? 'आप अभी तक किसी समूह के सदस्य नहीं हैं। नीचे सार्वजनिक समूहों में शामिल हों।'
              : "You haven't joined any groups yet. Explore public groups to join."
            : language === 'hi'
            ? 'इस श्रेणी में अभी कोई समूह उपलब्ध नहीं है।'
            : 'No community groups available in this category.'}
        </Typography>
        {debouncedSearch || selectedTab !== 'ALL' ? (
          <Button
            title={language === 'hi' ? 'सभी समूह देखें' : 'View All Groups'}
            variant="outline"
            onPress={handleResetFilters}
            style={styles.stateActionBtn}
          />
        ) : (
          <Button
            title={language === 'hi' ? 'रीफ़्रेश करें' : 'Refresh'}
            variant="outline"
            onPress={handleRefresh}
            style={styles.stateActionBtn}
          />
        )}
      </Card>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: '#F8FAFC' }]}>
      {/* 1. Unified AppHeader in Brand Mode */}
      <AppHeader
        mode="brand"
        icon="🏛️"
        title={language === 'hi' ? 'समाज समूह' : 'Community Groups'}
        communitySlug={communitySlug}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
        showProfileAvatar={true}
        avatarInitial={user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
      />

      {/* 2. Groups FlatList */}
      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GroupCard
            group={item}
            onPress={handleSelectGroup}
            onJoin={handleJoinGroup}
            isJoining={joiningGroupId === item.id}
          />
        )}
        ListHeaderComponent={renderListHeader}
        ListFooterComponent={renderListFooter}
        ListEmptyComponent={renderEmptyComponent}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 72 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#1976D2']}
            tintColor="#1976D2"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
      />

      {/* 3. Bottom Navigation */}
      <BottomNavigation activeTab="groups" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerContainer: {
    paddingTop: 10,
    marginBottom: 6,
  },
  searchSection: {
    marginBottom: 10,
  },
  filterSection: {
    marginBottom: 10,
  },
  filterScroll: {
    gap: 8,
    paddingHorizontal: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    minHeight: 36,
  },
  filterChipSelected: {
    backgroundColor: '#1976D2',
    borderWidth: 1.5,
    borderColor: '#1976D2',
    elevation: 2,
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  filterChipUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginBottom: 4,
  },
  countLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  blueIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1976D2',
  },
  listContent: {
    paddingHorizontal: 12,
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
    paddingVertical: 18,
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
    borderRadius: 16,
    borderColor: '#E2E8F0',
  },
  stateIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  stateTitle: {
    marginBottom: 6,
  },
  stateDesc: {
    marginBottom: 16,
    lineHeight: 18,
  },
  stateActionBtn: {
    minWidth: 140,
  },
});

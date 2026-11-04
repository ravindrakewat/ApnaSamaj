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
  Input,
  GroupCard,
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
  const { communitySlug } = useAuth();

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

        if (targetPage === 1) {
          setGroups(result.groups);
        } else {
          setGroups((prev) => {
            const existingIds = new Set(prev.map((g) => g.id));
            const newGroups = result.groups.filter((g) => !existingIds.has(g.id));
            return [...prev, ...newGroups];
          });
        }

        setPage(targetPage);
        setTotalPages(result.pagination.totalPages);
        setTotalGroups(result.pagination.totalGroups);
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

  // Filter groups in memory if 'MY' tab is selected
  const displayedGroups =
    selectedTab === 'MY' ? groups.filter((g) => g.isMember) : groups;

  // Filter chips definitions
  const filterTabs: Array<{ key: GroupFilterTab; labelHi: string; labelEn: string }> = [
    { key: 'ALL', labelHi: 'सभी समूह', labelEn: 'All Groups' },
    { key: 'MY', labelHi: 'मेरे समूह', labelEn: 'My Groups' },
    { key: 'PUBLIC', labelHi: 'सार्वजनिक', labelEn: 'Public' },
    { key: 'PRIVATE', labelHi: 'निजी', labelEn: 'Private' },
  ];

  // Header Component for FlatList
  const renderListHeader = () => (
    <View style={styles.headerContainer}>
      {/* Category Filter Chips */}
      <View style={styles.filterRow}>
        {filterTabs.map((tab) => {
          const isSelected = selectedTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setSelectedTab(tab.key)}
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
                {language === 'hi' ? tab.labelHi : tab.labelEn}
              </Typography>
            </Pressable>
          );
        })}
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchRow}>
        <Input
          placeholder={
            language === 'hi'
              ? 'नाम या विवरण से समूह खोजें...'
              : 'Search by group name or description...'
          }
          value={searchInput}
          onChangeText={setSearchInput}
          containerStyle={styles.searchInput}
          rightAccessory={
            searchInput ? (
              <Pressable
                onPress={() => setSearchInput('')}
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
      </View>

      {/* Results Count Banner */}
      {!isLoading && !error && displayedGroups.length > 0 ? (
        <View style={styles.countRow}>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi'
              ? `${displayedGroups.length} समूह दिखाए जा रहे हैं`
              : `Showing ${displayedGroups.length} groups`}
          </Typography>
          {debouncedSearch ? (
            <Pressable onPress={() => setSearchInput('')}>
              <Typography variant="xs" color={theme.colors.primary} weight="semibold">
                {language === 'hi' ? 'खोज साफ़ करें' : 'Clear search'}
              </Typography>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  // Footer Component for FlatList
  const renderListFooter = () => {
    if (isFetchingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Typography variant="xs" color={theme.colors.textMuted} style={styles.loadingMoreText}>
            {language === 'hi' ? 'और समूह लोड हो रहे हैं...' : 'Loading more groups...'}
          </Typography>
        </View>
      );
    }
    if (page >= totalPages && displayedGroups.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi' ? 'सभी समूह लोड हो चुके हैं' : 'All groups loaded'}
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
            {language === 'hi' ? 'समुदाय समूह लोड हो रहे हैं...' : 'Loading community groups...'}
          </Typography>
        </View>
      );
    }

    if (error) {
      return (
        <Card style={styles.stateCard}>
          <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
            {language === 'hi' ? 'समूह लोड नहीं हो सके' : 'Unable to Load Groups'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorDesc}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            onPress={() => loadGroups(1)}
            style={styles.retryBtn}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
          {language === 'hi' ? 'कोई समूह नहीं मिला' : 'No Groups Found'}
        </Typography>
        <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.emptyDesc}>
          {selectedTab === 'MY'
            ? language === 'hi'
              ? 'आप अभी तक किसी समूह से नहीं जुड़े हैं। सार्वजनिक समूहों में शामिल हों!'
              : 'You have not joined any groups yet. Explore public groups to join!'
            : debouncedSearch
            ? language === 'hi'
              ? 'आपकी खोज से मेल खाने वाला कोई समूह नहीं मिला।'
              : 'No groups match your search criteria.'
            : language === 'hi'
            ? 'समुदाय में अभी कोई समूह पंजीकृत नहीं है।'
            : 'No groups registered in this community yet.'}
        </Typography>
        {debouncedSearch || selectedTab !== 'ALL' ? (
          <Button
            title={language === 'hi' ? 'फ़िल्टर हटाएं' : 'Reset Filters'}
            variant="outline"
            onPress={() => {
              setSearchInput('');
              setSelectedTab('ALL');
            }}
            style={styles.retryBtn}
          />
        ) : (
          <Button
            title={language === 'hi' ? 'रीफ़्रेश करें' : 'Refresh'}
            variant="outline"
            onPress={handleRefresh}
            style={styles.retryBtn}
          />
        )}
      </Card>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Navbar */}
      <View
        style={[
          styles.topBar,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border, paddingTop: Math.max(insets.top, 12) },
        ]}
      >
        <View style={styles.brandRow}>
          <View style={[styles.brandIcon, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="sm" weight="bold" color={theme.colors.textInverse}>
              🏛️
            </Typography>
          </View>
          <View>
            <Typography variant="md" weight="bold" color={theme.colors.primary}>
              {language === 'hi' ? 'समाज समूह' : 'Community Groups'}
            </Typography>
            <Typography variant="xs" color={theme.colors.textMuted}>
              {communitySlug}
            </Typography>
          </View>
        </View>

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
      </View>

      {/* Groups List */}
      <FlatList
        data={displayedGroups}
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

      {/* Bottom Navigation */}
      <BottomNavigation activeTab="groups" />
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
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  headerContainer: {
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
    marginBottom: 8,
  },
  searchInput: {
    marginBottom: 0,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
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
});


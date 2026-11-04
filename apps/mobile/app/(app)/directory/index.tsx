import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicDirectoryMember } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Input,
  MemberCard,
  BottomNavigation,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { usersApi } from '../../../src/api/users.api';

export default function MemberDirectoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLocalization();
  const { communitySlug } = useAuth();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [gotraFilter, setGotraFilter] = useState<string>('');
  const [subCasteFilter, setSubCasteFilter] = useState<string>('');
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);

  // Directory Data State
  const [members, setMembers] = useState<PublicDirectoryMember[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalMembers, setTotalMembers] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
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

  const hasActiveFilters = Boolean(
    debouncedSearch || cityFilter.trim() || stateFilter.trim() || gotraFilter.trim() || subCasteFilter.trim()
  );

  const handleClearAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setCityFilter('');
    setStateFilter('');
    setGotraFilter('');
    setSubCasteFilter('');
  };

  /**
   * Loads directory members from API with current filters and pagination.
   */
  const loadDirectory = useCallback(
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
        const result = await usersApi.getDirectory({
          page: targetPage,
          limit: 12,
          search: debouncedSearch || undefined,
          city: cityFilter.trim() || undefined,
          state: stateFilter.trim() || undefined,
          gotra: gotraFilter.trim() || undefined,
          subCaste: subCasteFilter.trim() || undefined,
        });

        if (targetPage === 1) {
          setMembers(result.members);
        } else {
          setMembers((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMembers = result.members.filter((m) => !existingIds.has(m.id));
            return [...prev, ...newMembers];
          });
        }

        setPage(targetPage);
        setTotalPages(result.pagination.totalPages);
        setTotalMembers(result.pagination.totalMembers);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : language === 'hi'
            ? 'समुदाय निर्देशिका लोड करने में समस्या हुई।'
            : 'Failed to load community directory.';
        setError(msg);
      } finally {
        isFetchingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
      }
    },
    [debouncedSearch, cityFilter, stateFilter, gotraFilter, subCasteFilter, language]
  );

  // Trigger search whenever debounced search or filter changes
  useEffect(() => {
    loadDirectory(1);
  }, [loadDirectory]);

  const handleRefresh = () => {
    loadDirectory(1, true);
  };

  const handleLoadMore = () => {
    if (page >= totalPages || isFetchingMore || isLoading || isRefreshing) return;
    loadDirectory(page + 1);
  };

  const handleSelectMember = (memberId: string) => {
    router.push({
      pathname: '/(app)/directory/[id]' as any,
      params: { id: memberId },
    });
  };

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  // Header Component for FlatList
  const renderListHeader = () => (
    <View style={styles.headerContainer}>
      {/* Search Input Bar */}
      <View style={styles.searchRow}>
        <Input
          placeholder={
            language === 'hi'
              ? 'नाम, गोत्र, शहर या उप-जाति से खोजें...'
              : 'Search by name, gotra, city, or sub-caste...'
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
        <Button
          title={isFilterExpanded ? '▲' : '▼ फ़िल्टर'}
          size="sm"
          variant={hasActiveFilters ? 'primary' : 'outline'}
          onPress={() => setIsFilterExpanded(!isFilterExpanded)}
          style={styles.filterToggleBtn}
        />
      </View>

      {/* Expandable Location & Roots Filters */}
      {isFilterExpanded ? (
        <Card style={styles.filterCard}>
          <Typography variant="xs" weight="bold" color={theme.colors.textPrimary} style={styles.filterTitle}>
            {language === 'hi' ? 'विस्तृत फ़िल्टर' : 'Detailed Filters'}
          </Typography>
          <View style={styles.filterInputsGrid}>
            <Input
              placeholder={language === 'hi' ? 'शहर (City)' : 'City'}
              value={cityFilter}
              onChangeText={setCityFilter}
              containerStyle={styles.filterInputItem}
            />
            <Input
              placeholder={language === 'hi' ? 'राज्य (State)' : 'State'}
              value={stateFilter}
              onChangeText={setStateFilter}
              containerStyle={styles.filterInputItem}
            />
            <Input
              placeholder={language === 'hi' ? 'गोत्र (Gotra)' : 'Gotra'}
              value={gotraFilter}
              onChangeText={setGotraFilter}
              containerStyle={styles.filterInputItem}
            />
            <Input
              placeholder={language === 'hi' ? 'उप-जाति (Sub-Caste)' : 'Sub-Caste'}
              value={subCasteFilter}
              onChangeText={setSubCasteFilter}
              containerStyle={styles.filterInputItem}
            />
          </View>
          {hasActiveFilters ? (
            <Button
              title={language === 'hi' ? 'सभी फ़िल्टर साफ़ करें' : 'Clear All Filters'}
              variant="outline"
              size="sm"
              onPress={handleClearAllFilters}
              style={styles.clearFiltersBtn}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Results Count Banner */}
      {!isLoading && !error && members.length > 0 ? (
        <View style={styles.countRow}>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi'
              ? `${totalMembers} सत्यापित सदस्य मिले`
              : `${totalMembers} verified members found`}
          </Typography>
          {hasActiveFilters ? (
            <Pressable onPress={handleClearAllFilters}>
              <Typography variant="xs" color={theme.colors.primary} weight="semibold">
                {language === 'hi' ? 'फ़िल्टर हटाएं' : 'Reset'}
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
            {language === 'hi' ? 'और सदस्य लोड हो रहे हैं...' : 'Loading more members...'}
          </Typography>
        </View>
      );
    }
    if (page >= totalPages && members.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color={theme.colors.textMuted}>
            {language === 'hi' ? 'सभी सदस्य लोड हो चुके हैं' : 'All members loaded'}
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
            {language === 'hi' ? 'सदस्य निर्देशिका लोड हो रही है...' : 'Loading member directory...'}
          </Typography>
        </View>
      );
    }

    if (error) {
      return (
        <Card style={styles.stateCard}>
          <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
            {language === 'hi' ? 'निर्देशिका लोड नहीं हो सकी' : 'Unable to Load Directory'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorDesc}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            onPress={() => loadDirectory(1)}
            style={styles.retryBtn}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
          {language === 'hi' ? 'कोई सदस्य नहीं मिला' : 'No Members Found'}
        </Typography>
        <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.emptyDesc}>
          {hasActiveFilters
            ? language === 'hi'
              ? 'आपके वर्तमान फ़िल्टर से कोई सक्रिय सदस्य मेल नहीं खाता। कृपया खोज फ़िल्टर बदलें।'
              : 'No active members match your filter criteria. Try clearing search filters.'
            : language === 'hi'
            ? 'समुदाय निर्देशिका में अभी कोई सत्यापित सक्रिय सदस्य पंजीकृत नहीं है।'
            : 'No verified active members registered in this community yet.'}
        </Typography>
        {hasActiveFilters ? (
          <Button
            title={language === 'hi' ? 'फ़िल्टर साफ़ करें' : 'Clear Filters'}
            variant="outline"
            onPress={handleClearAllFilters}
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
              👥
            </Typography>
          </View>
          <View>
            <Typography variant="md" weight="bold" color={theme.colors.primary}>
              {language === 'hi' ? 'सदस्य निर्देशिका' : 'Member Directory'}
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

      {/* Member Directory List */}
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberCard member={item} onPress={handleSelectMember} />
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
      <BottomNavigation activeTab="directory" />
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    marginBottom: 0,
  },
  filterToggleBtn: {
    height: 48,
    minWidth: 84,
  },
  filterCard: {
    padding: 12,
    marginBottom: 10,
  },
  filterTitle: {
    marginBottom: 8,
  },
  filterInputsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterInputItem: {
    width: '48%',
    marginBottom: 4,
  },
  clearFiltersBtn: {
    marginTop: 8,
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

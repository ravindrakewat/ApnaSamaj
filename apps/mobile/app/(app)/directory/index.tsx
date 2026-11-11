import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PublicDirectoryMember } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  MemberCard,
  BottomNavigation,
  BottomSheet,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { usersApi } from '../../../src/api/users.api';

export default function MemberDirectoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  // Search & Filter State
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [gotraFilter, setGotraFilter] = useState<string>('');
  const [subCasteFilter, setSubCasteFilter] = useState<string>('');

  // Filter Modal / Dialog State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);
  const [draftCity, setDraftCity] = useState<string>('');
  const [draftState, setDraftState] = useState<string>('');
  const [draftGotra, setDraftGotra] = useState<string>('');
  const [draftSubCaste, setDraftSubCaste] = useState<string>('');

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

  // Compute active filters
  const activeDetailedFilterCount = [
    cityFilter.trim(),
    stateFilter.trim(),
    gotraFilter.trim(),
    subCasteFilter.trim(),
  ].filter(Boolean).length;

  const hasActiveFilters = Boolean(
    debouncedSearch || activeDetailedFilterCount > 0
  );

  const handleClearAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setCityFilter('');
    setStateFilter('');
    setGotraFilter('');
    setSubCasteFilter('');
  };

  const handleRemoveFilter = (key: 'search' | 'city' | 'state' | 'gotra' | 'subCaste') => {
    switch (key) {
      case 'search':
        setSearchInput('');
        setDebouncedSearch('');
        break;
      case 'city':
        setCityFilter('');
        break;
      case 'state':
        setStateFilter('');
        break;
      case 'gotra':
        setGotraFilter('');
        break;
      case 'subCaste':
        setSubCasteFilter('');
        break;
    }
  };

  const handleOpenFilterModal = () => {
    setDraftCity(cityFilter);
    setDraftState(stateFilter);
    setDraftGotra(gotraFilter);
    setDraftSubCaste(subCasteFilter);
    setIsFilterModalOpen(true);
  };

  const handleApplyFilterModal = () => {
    setCityFilter(draftCity.trim());
    setStateFilter(draftState.trim());
    setGotraFilter(draftGotra.trim());
    setSubCasteFilter(draftSubCaste.trim());
    setIsFilterModalOpen(false);
  };

  const handleClearFilterModalDraft = () => {
    setDraftCity('');
    setDraftState('');
    setDraftGotra('');
    setDraftSubCaste('');
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
      {/* 1. Modern Search & Filter Trigger Bar */}
      <View style={styles.searchFilterRow}>
        <View style={styles.searchBar}>
          <Typography variant="sm" color="#64748B" style={styles.searchIcon}>
            🔍
          </Typography>
          <TextInput
            placeholder={
              language === 'hi'
                ? 'नाम, गोत्र, शहर या उप-जाति खोजें...'
                : 'Search name, gotra, city, sub-caste...'
            }
            placeholderTextColor="#94A3B8"
            value={searchInput}
            onChangeText={setSearchInput}
            style={styles.searchInputText}
            returnKeyType="search"
            accessibilityRole="search"
            accessibilityLabel="Search directory"
          />
          {searchInput ? (
            <Pressable
              onPress={() => setSearchInput('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search input"
              style={styles.clearSearchBtn}
            >
              <Typography variant="xs" weight="bold" color="#64748B">
                ✕
              </Typography>
            </Pressable>
          ) : null}
        </View>

        {/* Filter Button */}
        <Pressable
          onPress={handleOpenFilterModal}
          style={[
            styles.filterTriggerBtn,
            activeDetailedFilterCount > 0 && styles.filterTriggerBtnActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open filter options"
          hitSlop={4}
        >
          <Typography
            variant="xs"
            weight="bold"
            color={activeDetailedFilterCount > 0 ? '#FFFFFF' : '#1976D2'}
          >
            🎛️ {language === 'hi' ? 'फ़िल्टर' : 'Filter'}
          </Typography>
          {activeDetailedFilterCount > 0 && (
            <View style={styles.activeFilterBadge}>
              <Typography variant="xs" weight="bold" color="#1976D2" style={styles.activeFilterBadgeText}>
                {activeDetailedFilterCount}
              </Typography>
            </View>
          )}
        </Pressable>
      </View>

      {/* 2. Active Filters Chip Bar */}
      {hasActiveFilters && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeChipsContainer}
        >
          {debouncedSearch ? (
            <Pressable
              onPress={() => handleRemoveFilter('search')}
              style={styles.activeChipPill}
              hitSlop={4}
            >
              <Typography variant="xs" color="#0369A1" numberOfLines={1}>
                🔍 "{debouncedSearch}"
              </Typography>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.chipClose}>
                ✕
              </Typography>
            </Pressable>
          ) : null}

          {gotraFilter ? (
            <Pressable
              onPress={() => handleRemoveFilter('gotra')}
              style={styles.activeChipPill}
              hitSlop={4}
            >
              <Typography variant="xs" color="#0369A1" numberOfLines={1}>
                🏛️ {language === 'hi' ? `गोत्र: ${gotraFilter}` : `Gotra: ${gotraFilter}`}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.chipClose}>
                ✕
              </Typography>
            </Pressable>
          ) : null}

          {stateFilter ? (
            <Pressable
              onPress={() => handleRemoveFilter('state')}
              style={styles.activeChipPill}
              hitSlop={4}
            >
              <Typography variant="xs" color="#0369A1" numberOfLines={1}>
                📍 {language === 'hi' ? `राज्य: ${stateFilter}` : `State: ${stateFilter}`}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.chipClose}>
                ✕
              </Typography>
            </Pressable>
          ) : null}

          {cityFilter ? (
            <Pressable
              onPress={() => handleRemoveFilter('city')}
              style={styles.activeChipPill}
              hitSlop={4}
            >
              <Typography variant="xs" color="#0369A1" numberOfLines={1}>
                🏙️ {language === 'hi' ? `शहर: ${cityFilter}` : `City: ${cityFilter}`}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.chipClose}>
                ✕
              </Typography>
            </Pressable>
          ) : null}

          {subCasteFilter ? (
            <Pressable
              onPress={() => handleRemoveFilter('subCaste')}
              style={styles.activeChipPill}
              hitSlop={4}
            >
              <Typography variant="xs" color="#0369A1" numberOfLines={1}>
                🏷️ {language === 'hi' ? `उप-जाति: ${subCasteFilter}` : `Sub-Caste: ${subCasteFilter}`}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.chipClose}>
                ✕
              </Typography>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleClearAllFilters}
            style={styles.clearAllChip}
            hitSlop={4}
          >
            <Typography variant="xs" weight="bold" color="#DC2626">
              ✕ {language === 'hi' ? 'सब साफ़ करें' : 'Clear All'}
            </Typography>
          </Pressable>
        </ScrollView>
      )}

      {/* 3. Results Count Banner */}
      {!isLoading && !error && members.length > 0 ? (
        <View style={styles.countRow}>
          <View style={styles.countLeft}>
            <View style={styles.blueIndicatorDot} />
            <Typography variant="xs" weight="semibold" color="#475569">
              {language === 'hi'
                ? `${totalMembers} सत्यापित सदस्य मिले`
                : `${totalMembers} verified members found`}
            </Typography>
          </View>
          {hasActiveFilters ? (
            <Pressable onPress={handleClearAllFilters} hitSlop={6}>
              <Typography variant="xs" color="#1976D2" weight="bold">
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
          <ActivityIndicator size="small" color="#1976D2" />
          <Typography variant="xs" color="#64748B" style={styles.loadingMoreText}>
            {language === 'hi' ? 'और सदस्य लोड हो रहे हैं...' : 'Loading more members...'}
          </Typography>
        </View>
      );
    }
    if (page >= totalPages && members.length > 0) {
      return (
        <View style={styles.footerDone}>
          <Typography variant="xs" color="#94A3B8">
            {language === 'hi' ? '• सभी सत्यापित सदस्य लोड हो चुके हैं •' : '• All verified members loaded •'}
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
            {language === 'hi' ? 'सदस्य निर्देशिका लोड हो रही है...' : 'Loading member directory...'}
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
            {language === 'hi' ? 'निर्देशिका लोड नहीं हो सकी' : 'Unable to Load Directory'}
          </Typography>
          <Typography variant="sm" color="#64748B" align="center" style={styles.stateDesc}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            onPress={() => loadDirectory(1)}
            style={styles.stateActionBtn}
          />
        </Card>
      );
    }

    return (
      <Card style={styles.stateCard}>
        <View style={styles.stateIconCircle}>
          <Typography variant="lg">{hasActiveFilters ? '🔍' : '👥'}</Typography>
        </View>
        <Typography variant="md" weight="bold" color="#0F172A" align="center" style={styles.stateTitle}>
          {language === 'hi' ? 'कोई सदस्य नहीं मिला' : 'No Members Found'}
        </Typography>
        <Typography variant="sm" color="#64748B" align="center" style={styles.stateDesc}>
          {hasActiveFilters
            ? language === 'hi'
              ? 'आपके वर्तमान फ़िल्टर से कोई सक्रिय सदस्य मेल नहीं खाता। कृपया फ़िल्टर बदलें या साफ़ करें।'
              : 'No active members match your filter criteria. Try adjusting or clearing filters.'
            : language === 'hi'
            ? 'समुदाय निर्देशिका में अभी कोई सत्यापित सक्रिय सदस्य पंजीकृत नहीं है।'
            : 'No verified active members registered in this community yet.'}
        </Typography>
        {hasActiveFilters ? (
          <Button
            title={language === 'hi' ? 'सभी फ़िल्टर साफ़ करें' : 'Clear All Filters'}
            variant="outline"
            onPress={handleClearAllFilters}
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
      {/* 1. Modern Top Header Navbar */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: Math.max(insets.top, 10),
          },
        ]}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Typography variant="sm" weight="bold" color="#FFFFFF">
              👥
            </Typography>
          </View>
          <View style={styles.brandTextCol}>
            <Typography variant="md" weight="bold" color="#1976D2" style={styles.brandTitle}>
              {language === 'hi' ? 'सदस्य निर्देशिका' : 'Member Directory'}
            </Typography>
            <View style={styles.communitySlugPill}>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.communitySlugText}>
                {communitySlug}
              </Typography>
            </View>
          </View>
        </View>

        <View style={styles.topActions}>
          {/* Language Switcher Pill */}
          <Pressable
            onPress={toggleLanguage}
            style={styles.langPill}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            hitSlop={8}
          >
            <Typography variant="xs" weight="bold" color="#1976D2">
              {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>

          {/* User Profile Avatar Button */}
          <Pressable
            onPress={() => router.push('/(app)/profile' as any)}
            style={styles.profileAvatar}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={8}
          >
            <Typography variant="xs" weight="bold" color="#0369A1">
              {user?.fullName ? user.fullName.charAt(0).toUpperCase() : 'स'}
            </Typography>
          </Pressable>
        </View>
      </View>

      {/* 2. Member Directory FlatList */}
      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberCard member={item} onPress={handleSelectMember} />
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

      {/* 3. Standardized Detailed Filters Bottom Sheet */}
      <BottomSheet
        visible={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        title={language === 'hi' ? 'विस्तृत खोज फ़िल्टर' : 'Detailed Search Filters'}
        icon="🎛️"
        footer={
          <View style={styles.modalActionRow}>
            <Button
              title={language === 'hi' ? 'साफ़ करें' : 'Clear'}
              variant="outline"
              size="md"
              onPress={handleClearFilterModalDraft}
              style={styles.modalClearBtn}
            />
            <Button
              title={language === 'hi' ? 'फ़िल्टर लागू करें' : 'Apply Filters'}
              variant="primary"
              size="md"
              onPress={handleApplyFilterModal}
              style={styles.modalApplyBtn}
            />
          </View>
        }
      >
        <View style={styles.filterField}>
          <Typography variant="xs" weight="bold" color="#475569" style={styles.fieldLabel}>
            🏛️ {language === 'hi' ? 'गोत्र (Gotra)' : 'Gotra'}
          </Typography>
          <TextInput
            placeholder={language === 'hi' ? 'उदा. कश्यप, भारद्वाज...' : 'e.g. Kashyap, Bharadwaj...'}
            placeholderTextColor="#94A3B8"
            value={draftGotra}
            onChangeText={setDraftGotra}
            style={styles.modalInput}
          />
        </View>

        <View style={styles.filterField}>
          <Typography variant="xs" weight="bold" color="#475569" style={styles.fieldLabel}>
            📍 {language === 'hi' ? 'राज्य (State)' : 'State'}
          </Typography>
          <TextInput
            placeholder={language === 'hi' ? 'उदा. मध्य प्रदेश, उत्तर प्रदेश...' : 'e.g. Madhya Pradesh...'}
            placeholderTextColor="#94A3B8"
            value={draftState}
            onChangeText={setDraftState}
            style={styles.modalInput}
          />
        </View>

        <View style={styles.filterField}>
          <Typography variant="xs" weight="bold" color="#475569" style={styles.fieldLabel}>
            🏙️ {language === 'hi' ? 'शहर (City)' : 'City'}
          </Typography>
          <TextInput
            placeholder={language === 'hi' ? 'उदा. ग्वालियर, इंदौर, भोपाल...' : 'e.g. Gwalior, Indore...'}
            placeholderTextColor="#94A3B8"
            value={draftCity}
            onChangeText={setDraftCity}
            style={styles.modalInput}
          />
        </View>

        <View style={styles.filterField}>
          <Typography variant="xs" weight="bold" color="#475569" style={styles.fieldLabel}>
            🏷️ {language === 'hi' ? 'उप-जाति (Sub-Caste)' : 'Sub-Caste'}
          </Typography>
          <TextInput
            placeholder={language === 'hi' ? 'उदा. केवट, मल्लाह, कश्यप...' : 'e.g. Kewat, Mallah...'}
            placeholderTextColor="#94A3B8"
            value={draftSubCaste}
            onChangeText={setDraftSubCaste}
            style={styles.modalInput}
          />
        </View>
      </BottomSheet>

      {/* 4. Bottom Navigation */}
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
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    zIndex: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  brandTextCol: {
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 16.5,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  communitySlugPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  communitySlugText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    borderWidth: 1.5,
    borderColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingTop: 10,
    marginBottom: 6,
  },
  searchFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  searchInputText: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    paddingVertical: 0,
    height: '100%',
  },
  clearSearchBtn: {
    padding: 4,
  },
  filterTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTriggerBtnActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  activeFilterBadge: {
    backgroundColor: '#FFFFFF',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  activeFilterBadgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
  activeChipsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  activeChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipClose: {
    fontSize: 11,
    marginLeft: 2,
  },
  clearAllChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalDismissArea: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalFormScroll: {
    maxHeight: 340,
  },
  filterField: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 6,
    fontSize: 12,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalClearBtn: {
    flex: 1,
  },
  modalApplyBtn: {
    flex: 2,
  },
});

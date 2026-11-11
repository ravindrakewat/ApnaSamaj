import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PublicMatrimonialProfileListItem,
  MatrimonialInterestItem,
} from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Input,
  Badge,
  MatrimonialCard,
  AppHeader,
  SearchBar,
  ProfileAvatar,
  BottomSheet,
  BottomNavigation,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { matrimonialApi, MatrimonialFilterParams } from '../../../src/api/matrimonial.api';

type MatrimonialViewTab = 'profiles' | 'interests';
type InterestsSubTab = 'received' | 'sent';

export default function MatrimonialDiscoveryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  // Primary Tab state: 'profiles' | 'interests'
  const [activeTab, setActiveTab] = useState<MatrimonialViewTab>('profiles');

  // Search keyword state (local filter / subCaste / city / name)
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Supported API Filter States
  const [genderFilter, setGenderFilter] = useState<'MALE' | 'FEMALE' | undefined>(undefined);
  const [maritalStatusFilter, setMaritalStatusFilter] = useState<string | undefined>(undefined);
  const [manglikFilter, setManglikFilter] = useState<string | undefined>(undefined);
  const [subCasteFilter, setSubCasteFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [isFilterSheetVisible, setIsFilterSheetVisible] = useState<boolean>(false);

  // Draft filters inside bottom sheet
  const [draftGender, setDraftGender] = useState<'MALE' | 'FEMALE' | undefined>(undefined);
  const [draftMaritalStatus, setDraftMaritalStatus] = useState<string | undefined>(undefined);
  const [draftManglik, setDraftManglik] = useState<string | undefined>(undefined);
  const [draftSubCaste, setDraftSubCaste] = useState<string>('');
  const [draftCity, setDraftCity] = useState<string>('');

  // Profiles Discovery State
  const [profiles, setProfiles] = useState<PublicMatrimonialProfileListItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Send Interest Modal State
  const [interestTarget, setInterestTarget] = useState<PublicMatrimonialProfileListItem | null>(null);
  const [interestMessage, setInterestMessage] = useState<string>('');
  const [isSubmittingInterest, setIsSubmittingInterest] = useState<boolean>(false);
  const [interestError, setInterestError] = useState<string | null>(null);
  const [interestSuccess, setInterestSuccess] = useState<string | null>(null);

  // Interests Tab State
  const [interestsSubTab, setInterestsSubTab] = useState<InterestsSubTab>('received');
  const [interestsList, setInterestsList] = useState<MatrimonialInterestItem[]>([]);
  const [isLoadingInterests, setIsLoadingInterests] = useState<boolean>(false);
  const [isRespondingId, setIsRespondingId] = useState<string | null>(null);

  const isFetchingRef = useRef<boolean>(false);

  // Count active filters
  const activeFilterCount = [
    genderFilter,
    maritalStatusFilter,
    manglikFilter,
    subCasteFilter.trim(),
    cityFilter.trim(),
  ].filter(Boolean).length;

  const handleOpenFilterSheet = () => {
    setDraftGender(genderFilter);
    setDraftMaritalStatus(maritalStatusFilter);
    setDraftManglik(manglikFilter);
    setDraftSubCaste(subCasteFilter);
    setDraftCity(cityFilter);
    setIsFilterSheetVisible(true);
  };

  const handleApplyFilters = () => {
    setGenderFilter(draftGender);
    setMaritalStatusFilter(draftMaritalStatus);
    setManglikFilter(draftManglik);
    setSubCasteFilter(draftSubCaste);
    setCityFilter(draftCity);
    setIsFilterSheetVisible(false);
  };

  const handleClearFilters = () => {
    setGenderFilter(undefined);
    setMaritalStatusFilter(undefined);
    setManglikFilter(undefined);
    setSubCasteFilter('');
    setCityFilter('');
    setDraftGender(undefined);
    setDraftMaritalStatus(undefined);
    setDraftManglik(undefined);
    setDraftSubCaste('');
    setDraftCity('');
  };

  /**
   * Load Profiles from backend
   */
  const loadProfiles = useCallback(
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
        const params: MatrimonialFilterParams = {
          page: targetPage,
          limit: 12,
        };

        if (genderFilter) params.gender = genderFilter;
        if (maritalStatusFilter) params.maritalStatus = maritalStatusFilter;
        if (manglikFilter) params.manglik = manglikFilter;
        if (subCasteFilter.trim()) params.subCaste = subCasteFilter.trim();
        if (cityFilter.trim()) params.city = cityFilter.trim();

        const data = await matrimonialApi.listProfiles(params);

        if (targetPage === 1) {
          setProfiles(data.profiles || []);
        } else {
          setProfiles((prev) => [...prev, ...(data.profiles || [])]);
        }

        setPage(data.pagination?.page || targetPage);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'विवाह प्रोफ़ाइल लोड करने में विफल।';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsFetchingMore(false);
        isFetchingRef.current = false;
      }
    },
    [genderFilter, maritalStatusFilter, manglikFilter, subCasteFilter, cityFilter]
  );

  useEffect(() => {
    if (activeTab === 'profiles') {
      loadProfiles(1, false);
    }
  }, [loadProfiles, activeTab]);

  /**
   * Load Interests (Received or Sent)
   */
  const loadInterests = useCallback(async () => {
    setIsLoadingInterests(true);
    try {
      if (interestsSubTab === 'received') {
        const data = await matrimonialApi.listReceivedInterests(1, 30);
        setInterestsList(data.interests || []);
      } else {
        const data = await matrimonialApi.listSentInterests(1, 30);
        setInterestsList(data.interests || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'रुचियाँ लोड करने में असमर्थ।';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsLoadingInterests(false);
    }
  }, [interestsSubTab, language]);

  useEffect(() => {
    if (activeTab === 'interests') {
      loadInterests();
    }
  }, [loadInterests, activeTab]);

  const handleRefresh = () => {
    if (activeTab === 'profiles') {
      loadProfiles(1, true);
    } else {
      loadInterests();
    }
  };

  const handleEndReached = () => {
    if (!isFetchingMore && !isLoading && page < totalPages && activeTab === 'profiles') {
      loadProfiles(page + 1, false);
    }
  };

  const handleCardPress = (profileId: string) => {
    router.push(`/(app)/matrimonial/${profileId}` as any);
  };

  /**
   * Send Interest Flow
   */
  const handleOpenSendInterest = (profile: PublicMatrimonialProfileListItem) => {
    setInterestTarget(profile);
    setInterestMessage('');
    setInterestError(null);
    setInterestSuccess(null);
  };

  const handleConfirmSendInterest = async () => {
    if (!interestTarget) return;
    setIsSubmittingInterest(true);
    setInterestError(null);

    try {
      await matrimonialApi.sendInterest({
        receiverId: interestTarget.userId,
        message: interestMessage.trim() || undefined,
      });

      // Update local profile state
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === interestTarget.id ? { ...p, interestStatus: 'PENDING' } : p
        )
      );

      setInterestSuccess(
        language === 'hi'
          ? 'रुचि सफलतापूर्वक भेजी गई!'
          : 'Interest request sent successfully!'
      );

      setTimeout(() => {
        setInterestTarget(null);
        setInterestSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'रुचि भेजने में विफल। कृपया पुनः प्रयास करें।';
      setInterestError(msg);
    } finally {
      setIsSubmittingInterest(false);
    }
  };

  /**
   * Respond to Interest (Accept / Decline)
   */
  const handleRespondInterest = async (interestId: string, status: 'ACCEPTED' | 'DECLINED') => {
    setIsRespondingId(interestId);
    try {
      await matrimonialApi.respondInterest(interestId, status);
      setInterestsList((prev) =>
        prev.map((item) => (item.id === interestId ? { ...item, status } : item))
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'प्रतिक्रिया दर्ज करने में त्रुटि।';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsRespondingId(null);
    }
  };

  // Filter client-side by searchQuery across name, subCaste, city, occupation
  const displayedProfiles = profiles.filter((p) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return (
      p.fullName?.toLowerCase().includes(query) ||
      p.subCaste?.toLowerCase().includes(query) ||
      p.city?.toLowerCase().includes(query) ||
      p.occupation?.toLowerCase().includes(query) ||
      p.gotra?.toLowerCase().includes(query)
    );
  });

  return (
    <View style={styles.screen}>
      {/* 1. Unified Brand AppHeader */}
      <AppHeader
        mode="brand"
        icon="💍"
        title={language === 'hi' ? 'विवाह परिचय' : 'Matrimonial Profiles'}
        communitySlug={communitySlug}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
        rightAccessory={
          <Pressable
            onPress={() => router.push('/(app)/matrimonial/manage' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'मेरा विवाह बायोडाटा' : 'My Matrimonial Profile'}
            style={styles.myProfileHeaderBtn}
          >
            <Typography variant="xs" weight="bold" color="#1976D2">
              {language === 'hi' ? '📝 मेरा बायोडाटा' : '📝 My Profile'}
            </Typography>
          </Pressable>
        }
      />

      {/* 2. Primary View Switcher: Profiles vs Interests */}
      <View style={styles.segmentedContainer}>
        <View style={styles.segmentedControl}>
          <Pressable
            onPress={() => setActiveTab('profiles')}
            style={[
              styles.segmentBtn,
              activeTab === 'profiles' && styles.segmentBtnActive,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'profiles' }}
          >
            <Typography
              variant="xs"
              weight={activeTab === 'profiles' ? 'bold' : 'medium'}
              color={activeTab === 'profiles' ? '#1976D2' : '#64748B'}
            >
              💍 {language === 'hi' ? 'प्रोफ़ाइलें' : 'Profiles'} {totalCount > 0 ? `(${totalCount})` : ''}
            </Typography>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('interests')}
            style={[
              styles.segmentBtn,
              activeTab === 'interests' && styles.segmentBtnActive,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'interests' }}
          >
            <Typography
              variant="xs"
              weight={activeTab === 'interests' ? 'bold' : 'medium'}
              color={activeTab === 'interests' ? '#1976D2' : '#64748B'}
            >
              💌 {language === 'hi' ? 'रुचियाँ' : 'Interests'}
            </Typography>
          </Pressable>
        </View>
      </View>

      {/* 3. Main Content: Profiles or Interests */}
      {activeTab === 'profiles' ? (
        <View style={styles.profilesWrapper}>
          {/* SearchBar with Filter Button */}
          <View style={styles.searchBarContainer}>
            <SearchBar
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={
                language === 'hi'
                  ? 'नाम, उपजाति या शहर से खोजें...'
                  : 'Search by name, sub-caste, city...'
              }
              showFilterButton={true}
              activeFilterCount={activeFilterCount}
              onFilterPress={handleOpenFilterSheet}
              onClear={() => setSearchQuery('')}
            />
          </View>

          {/* Active Filter Chips Carousel */}
          {activeFilterCount > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeChipsContainer}
            >
              {genderFilter ? (
                <Pressable
                  onPress={() => setGenderFilter(undefined)}
                  style={styles.activeChipPill}
                >
                  <Typography variant="xs" weight="medium" color="#1976D2">
                    {genderFilter === 'FEMALE'
                      ? language === 'hi' ? '👰 वधू' : 'Brides'
                      : language === 'hi' ? '🤵 वर' : 'Grooms'}{' '}
                    ✕
                  </Typography>
                </Pressable>
              ) : null}

              {maritalStatusFilter ? (
                <Pressable
                  onPress={() => setMaritalStatusFilter(undefined)}
                  style={styles.activeChipPill}
                >
                  <Typography variant="xs" weight="medium" color="#1976D2">
                    {maritalStatusFilter === 'NEVER_MARRIED'
                      ? language === 'hi' ? 'अविवाहित' : 'Never Married'
                      : maritalStatusFilter === 'DIVORCED'
                      ? language === 'hi' ? 'तलाकशुदा' : 'Divorced'
                      : language === 'hi' ? 'विधवा/विधुर' : 'Widowed'}{' '}
                    ✕
                  </Typography>
                </Pressable>
              ) : null}

              {manglikFilter ? (
                <Pressable
                  onPress={() => setManglikFilter(undefined)}
                  style={styles.activeChipPill}
                >
                  <Typography variant="xs" weight="medium" color="#1976D2">
                    {manglikFilter === 'NON_MANGLIK'
                      ? language === 'hi' ? 'अमांगलिक' : 'Non-Manglik'
                      : manglikFilter === 'MANGLIK'
                      ? language === 'hi' ? 'मांगलिक' : 'Manglik'
                      : language === 'hi' ? 'आंशिक मांगलिक' : 'Anshik'}{' '}
                    ✕
                  </Typography>
                </Pressable>
              ) : null}

              {subCasteFilter.trim() ? (
                <Pressable
                  onPress={() => setSubCasteFilter('')}
                  style={styles.activeChipPill}
                >
                  <Typography variant="xs" weight="medium" color="#1976D2">
                    {language === 'hi' ? `उपजाति: ${subCasteFilter}` : `Sub-caste: ${subCasteFilter}`}{' '}
                    ✕
                  </Typography>
                </Pressable>
              ) : null}

              {cityFilter.trim() ? (
                <Pressable
                  onPress={() => setCityFilter('')}
                  style={styles.activeChipPill}
                >
                  <Typography variant="xs" weight="medium" color="#1976D2">
                    {language === 'hi' ? `शहर: ${cityFilter}` : `City: ${cityFilter}`}{' '}
                    ✕
                  </Typography>
                </Pressable>
              ) : null}

              <Pressable onPress={handleClearFilters} style={styles.clearAllChip}>
                <Typography variant="xs" weight="bold" color="#DC2626">
                  {language === 'hi' ? 'सभी साफ़ करें' : 'Clear All'}
                </Typography>
              </Pressable>
            </ScrollView>
          ) : null}

          {/* Results Count Banner */}
          <View style={styles.countBanner}>
            <Typography variant="xs" color="#64748B" weight="medium">
              {language === 'hi'
                ? `💍 ${displayedProfiles.length} विवाह प्रोफ़ाइलें उपलब्ध`
                : `💍 ${displayedProfiles.length} Matrimonial profiles found`}
            </Typography>

            {activeFilterCount > 0 || searchQuery.trim() ? (
              <Pressable
                onPress={() => {
                  handleClearFilters();
                  setSearchQuery('');
                }}
                hitSlop={6}
              >
                <Typography variant="xs" color="#1976D2" weight="bold">
                  {language === 'hi' ? 'सभी दिखाएं' : 'Show All'}
                </Typography>
              </Pressable>
            ) : null}
          </View>

          {/* Profiles FlatList */}
          <FlatList
            data={displayedProfiles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MatrimonialCard
                profile={item}
                onPress={handleCardPress}
                onSendInterest={handleOpenSendInterest}
                isOwnProfile={user?.id === item.userId}
              />
            )}
            contentContainerStyle={[
              styles.listContent,
              displayedProfiles.length === 0 && styles.listContentEmpty,
              { paddingBottom: Math.max(insets.bottom + 90, 110) },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#1976D2"
                colors={['#1976D2']}
              />
            }
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isFetchingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color="#1976D2" />
                  <Typography variant="xs" color="#64748B" style={styles.footerLoaderText}>
                    {language === 'hi' ? 'और प्रोफ़ाइलें लोड हो रही हैं...' : 'Loading more profiles...'}
                  </Typography>
                </View>
              ) : null
            }
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.emptyContainer}>
                  <ActivityIndicator size="large" color="#1976D2" />
                  <Typography variant="sm" color="#64748B" style={styles.emptySubText}>
                    {language === 'hi'
                      ? 'विवाह प्रोफ़ाइलें खोजी जा रही हैं...'
                      : 'Searching matrimonial profiles...'}
                  </Typography>
                </View>
              ) : error ? (
                <Card style={styles.errorCard}>
                  <Typography variant="md" weight="bold" color="#DC2626" align="center">
                    ⚠️ {language === 'hi' ? 'लोड करने में समस्या' : 'Failed to Load'}
                  </Typography>
                  <Typography variant="sm" color="#475569" align="center" style={styles.errorMsg}>
                    {error}
                  </Typography>
                  <Button
                    title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
                    onPress={() => loadProfiles(1, false)}
                    variant="outline"
                    size="sm"
                  />
                </Card>
              ) : (
                <Card style={styles.emptyCard}>
                  <Typography variant="lg" align="center" style={styles.emptyIcon}>
                    💍
                  </Typography>
                  <Typography variant="md" weight="bold" color="#0F172A" align="center">
                    {language === 'hi' ? 'कोई प्रोफ़ाइल नहीं मिली' : 'No Profiles Found'}
                  </Typography>
                  <Typography variant="xs" color="#64748B" align="center" style={styles.emptySubText}>
                    {activeFilterCount > 0 || searchQuery.trim()
                      ? language === 'hi'
                        ? 'वर्तमान फ़िल्टर या खोज के अनुसार कोई स्वीकृत प्रोफ़ाइल नहीं है। फ़िल्टर बदल कर देखें।'
                        : 'No approved profiles match the selected filters or search query.'
                      : language === 'hi'
                      ? 'वर्तमान में इस समुदाय में कोई सक्रिय विवाह प्रोफ़ाइल उपलब्ध नहीं है।'
                      : 'No approved matrimonial profiles are currently available in this community.'}
                  </Typography>
                  {activeFilterCount > 0 || searchQuery.trim() ? (
                    <Button
                      title={language === 'hi' ? 'फ़िल्टर हटाएं' : 'Clear Filters'}
                      onPress={() => {
                        handleClearFilters();
                        setSearchQuery('');
                      }}
                      variant="outline"
                      size="sm"
                      style={styles.clearFiltersBtn}
                    />
                  ) : null}
                </Card>
              )
            }
          />
        </View>
      ) : (
        /* Interests Tab Content */
        <View style={styles.interestsContainer}>
          {/* Sub-tabs: Received vs Sent */}
          <View style={styles.interestsSubTabs}>
            <Pressable
              onPress={() => setInterestsSubTab('received')}
              style={[
                styles.subTabBtn,
                interestsSubTab === 'received' && styles.subTabBtnActive,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: interestsSubTab === 'received' }}
            >
              <Typography
                variant="sm"
                weight={interestsSubTab === 'received' ? 'bold' : 'medium'}
                color={interestsSubTab === 'received' ? '#1976D2' : '#64748B'}
              >
                📥 {language === 'hi' ? 'प्राप्त रुचियाँ' : 'Received Requests'}
              </Typography>
            </Pressable>

            <Pressable
              onPress={() => setInterestsSubTab('sent')}
              style={[
                styles.subTabBtn,
                interestsSubTab === 'sent' && styles.subTabBtnActive,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: interestsSubTab === 'sent' }}
            >
              <Typography
                variant="sm"
                weight={interestsSubTab === 'sent' ? 'bold' : 'medium'}
                color={interestsSubTab === 'sent' ? '#1976D2' : '#64748B'}
              >
                📤 {language === 'hi' ? 'भेजी गई रुचियाँ' : 'Sent Requests'}
              </Typography>
            </Pressable>
          </View>

          {isLoadingInterests ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Typography variant="sm" color="#64748B" style={styles.emptySubText}>
                {language === 'hi' ? 'रुचियाँ लोड हो रही हैं...' : 'Loading interests...'}
              </Typography>
            </View>
          ) : interestsList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Typography variant="lg" align="center" style={styles.emptyIcon}>
                💌
              </Typography>
              <Typography variant="md" weight="bold" color="#0F172A" align="center">
                {interestsSubTab === 'received'
                  ? language === 'hi'
                    ? 'कोई प्राप्त रुचि नहीं'
                    : 'No Received Interests'
                  : language === 'hi'
                  ? 'कोई भेजी गई रुचि नहीं'
                  : 'No Sent Interests'}
              </Typography>
              <Typography variant="xs" color="#64748B" align="center" style={styles.emptySubText}>
                {interestsSubTab === 'received'
                  ? language === 'hi'
                    ? 'अन्य सदस्यों से प्राप्त विवाह संबंध अनुरोध यहाँ दिखाई देंगे।'
                    : 'Incoming matrimonial connection requests from other members will appear here.'
                  : language === 'hi'
                  ? 'आपके द्वारा भेजे गए विवाह संबंध अनुरोध यहाँ दिखाई देंगे।'
                  : 'Matrimonial connection requests sent by you will appear here.'}
              </Typography>
            </Card>
          ) : (
            <FlatList
              data={interestsList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom + 90, 110) },
              ]}
              renderItem={({ item }) => {
                const other = item.otherPartyProfile;
                const isReceived = interestsSubTab === 'received';
                const isPending = item.status === 'PENDING';
                const initialChar = other?.fullName ? other.fullName.trim().charAt(0).toUpperCase() : 'वि';

                return (
                  <Card style={styles.interestCard}>
                    <View style={styles.interestHeader}>
                      {/* Avatar / Initial Fallback */}
                      <View style={styles.interestAvatarBox}>
                        <Typography variant="md" weight="bold" color="#0369A1">
                          {initialChar}
                        </Typography>
                      </View>

                      <View style={styles.interestProfileInfo}>
                        <Typography variant="sm" weight="bold" color="#0F172A">
                          {other?.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
                        </Typography>
                        <Typography variant="xs" color="#64748B">
                          {[
                            other?.age ? `${other.age} ${language === 'hi' ? 'वर्ष' : 'yrs'}` : null,
                            other?.occupation,
                            other?.city,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                        </Typography>
                      </View>

                      {/* Status Badge */}
                      <View
                        style={[
                          styles.statusBadgePill,
                          item.status === 'ACCEPTED'
                            ? styles.statusBadgeAccepted
                            : item.status === 'DECLINED'
                            ? styles.statusBadgeDeclined
                            : styles.statusBadgePending,
                        ]}
                      >
                        <Typography
                          variant="xs"
                          weight="bold"
                          color={
                            item.status === 'ACCEPTED'
                              ? '#15803D'
                              : item.status === 'DECLINED'
                              ? '#B91C1C'
                              : '#C2410C'
                          }
                        >
                          {item.status === 'ACCEPTED'
                            ? language === 'hi' ? '💖 स्वीकृत' : 'Connected'
                            : item.status === 'DECLINED'
                            ? language === 'hi' ? '✕ अस्वीकृत' : 'Declined'
                            : language === 'hi' ? '⏳ प्रतीक्षारत' : 'Pending'}
                        </Typography>
                      </View>
                    </View>

                    {item.message ? (
                      <View style={styles.messageBox}>
                        <Typography variant="xs" color="#334155">
                          "{item.message}"
                        </Typography>
                      </View>
                    ) : null}

                    {/* Received Pending Action Buttons */}
                    {isReceived && isPending ? (
                      <View style={styles.actionButtonsRow}>
                        <Button
                          title={language === 'hi' ? 'स्वीकार करें' : 'Accept'}
                          onPress={() => handleRespondInterest(item.id, 'ACCEPTED')}
                          loading={isRespondingId === item.id}
                          size="sm"
                          variant="primary"
                          style={styles.actionBtn}
                        />
                        <Button
                          title={language === 'hi' ? 'अस्वीकार करें' : 'Decline'}
                          onPress={() => handleRespondInterest(item.id, 'DECLINED')}
                          loading={isRespondingId === item.id}
                          size="sm"
                          variant="outline"
                          style={styles.actionBtn}
                        />
                      </View>
                    ) : null}

                    {/* View Profile Link */}
                    {other?.id ? (
                      <Pressable
                        onPress={() => handleCardPress(other.id)}
                        style={styles.viewProfileBtn}
                        hitSlop={4}
                      >
                        <Typography variant="xs" weight="bold" color="#1976D2">
                          {language === 'hi' ? 'प्रोफ़ाइल देखें →' : 'View Profile →'}
                        </Typography>
                      </Pressable>
                    ) : null}
                  </Card>
                );
              }}
            />
          )}
        </View>
      )}

      {/* 4. Slide-up Filter Bottom Sheet */}
      <BottomSheet
        visible={isFilterSheetVisible}
        onClose={() => setIsFilterSheetVisible(false)}
        title={language === 'hi' ? 'विवाह फ़िल्टर' : 'Filter Matrimonial Profiles'}
        icon="🎛️"
        headerAccessory={
          <Pressable
            onPress={() => {
              setDraftGender(undefined);
              setDraftMaritalStatus(undefined);
              setDraftManglik(undefined);
              setDraftSubCaste('');
              setDraftCity('');
            }}
            hitSlop={8}
            style={{ marginRight: 8 }}
          >
            <Typography variant="xs" weight="bold" color="#DC2626">
              {language === 'hi' ? 'साफ़ करें' : 'Reset'}
            </Typography>
          </Pressable>
        }
        footer={
          <View style={styles.sheetActionsRow}>
            <Button
              title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
              onPress={() => setIsFilterSheetVisible(false)}
              variant="outline"
              size="md"
              style={styles.sheetActionBtn}
            />
            <Button
              title={language === 'hi' ? 'फ़िल्टर लागू करें' : 'Apply Filters'}
              onPress={handleApplyFilters}
              variant="primary"
              size="md"
              style={styles.sheetActionBtn}
            />
          </View>
        }
      >
        {/* Gender Filter */}
        <View style={styles.filterSection}>
          <Typography variant="xs" weight="bold" color="#0F172A" style={styles.filterSectionTitle}>
            {language === 'hi' ? 'लिंग / अपेक्षा:' : 'Looking For:'}
          </Typography>
          <View style={styles.filterRow}>
            {[
              { key: undefined, hi: 'सभी', en: 'All' },
              { key: 'FEMALE', hi: '👰 वधू', en: 'Brides' },
              { key: 'MALE', hi: '🤵 वर', en: 'Grooms' },
            ].map((item) => {
              const isSelected = draftGender === item.key;
              return (
                <Pressable
                  key={item.en}
                  onPress={() => setDraftGender(item.key as any)}
                  style={[
                    styles.filterSelectChip,
                    isSelected && styles.filterSelectChipActive,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={isSelected ? 'bold' : 'medium'}
                    color={isSelected ? '#1976D2' : '#475569'}
                  >
                    {language === 'hi' ? item.hi : item.en}
                  </Typography>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Marital Status Filter */}
        <View style={styles.filterSection}>
          <Typography variant="xs" weight="bold" color="#0F172A" style={styles.filterSectionTitle}>
            {language === 'hi' ? 'वैवाहिक स्थिति:' : 'Marital Status:'}
          </Typography>
          <View style={styles.filterRow}>
            {[
              { key: undefined, hi: 'सभी', en: 'All' },
              { key: 'NEVER_MARRIED', hi: 'अविवाहित', en: 'Never Married' },
              { key: 'DIVORCED', hi: 'तलाकशुदा', en: 'Divorced' },
              { key: 'WIDOWED', hi: 'विधवा/विधुर', en: 'Widowed' },
            ].map((item) => {
              const isSelected = draftMaritalStatus === item.key;
              return (
                <Pressable
                  key={item.en}
                  onPress={() => setDraftMaritalStatus(item.key)}
                  style={[
                    styles.filterSelectChip,
                    isSelected && styles.filterSelectChipActive,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={isSelected ? 'bold' : 'medium'}
                    color={isSelected ? '#1976D2' : '#475569'}
                  >
                    {language === 'hi' ? item.hi : item.en}
                  </Typography>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Manglik Filter */}
        <View style={styles.filterSection}>
          <Typography variant="xs" weight="bold" color="#0F172A" style={styles.filterSectionTitle}>
            {language === 'hi' ? 'मांगलिक स्थिति:' : 'Manglik Status:'}
          </Typography>
          <View style={styles.filterRow}>
            {[
              { key: undefined, hi: 'सभी', en: 'All' },
              { key: 'NON_MANGLIK', hi: 'अमांगलिक', en: 'Non-Manglik' },
              { key: 'MANGLIK', hi: 'मांगलिक', en: 'Manglik' },
              { key: 'ANSHIK', hi: 'आंशिक', en: 'Anshik' },
            ].map((item) => {
              const isSelected = draftManglik === item.key;
              return (
                <Pressable
                  key={item.en}
                  onPress={() => setDraftManglik(item.key)}
                  style={[
                    styles.filterSelectChip,
                    isSelected && styles.filterSelectChipActive,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={isSelected ? 'bold' : 'medium'}
                    color={isSelected ? '#1976D2' : '#475569'}
                  >
                    {language === 'hi' ? item.hi : item.en}
                  </Typography>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sub-caste Input */}
        <View style={styles.inputSection}>
          <Input
            label={language === 'hi' ? 'उपजाति (Sub-caste)' : 'Sub-caste'}
            value={draftSubCaste}
            onChangeText={setDraftSubCaste}
            placeholder="उदा. केवट / मल्लाह / कश्यप"
          />
        </View>

        {/* City Input */}
        <View style={styles.inputSection}>
          <Input
            label={language === 'hi' ? 'शहर (City)' : 'City'}
            value={draftCity}
            onChangeText={setDraftCity}
            placeholder="उदा. भोपाल, इंदौर, ग्वालियर"
          />
        </View>
      </BottomSheet>

      {/* 5. Express Interest Bottom Sheet */}
      <BottomSheet
        visible={Boolean(interestTarget)}
        onClose={() => {
          if (!isSubmittingInterest) setInterestTarget(null);
        }}
        title={language === 'hi' ? 'विवाह संबंध रुचि भेजें' : 'Express Matrimonial Interest'}
        icon="💌"
        preventDismiss={isSubmittingInterest}
        footer={
          <View style={styles.modalActionsRow}>
            <Button
              title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
              onPress={() => setInterestTarget(null)}
              variant="outline"
              size="md"
              disabled={isSubmittingInterest}
              style={styles.modalActionBtn}
            />
            <Button
              title={language === 'hi' ? 'रुचि भेजें' : 'Send Interest'}
              onPress={handleConfirmSendInterest}
              loading={isSubmittingInterest}
              disabled={isSubmittingInterest}
              size="md"
              variant="primary"
              style={styles.modalActionBtn}
            />
          </View>
        }
      >
        {interestTarget ? (
          <View style={styles.targetInfoBox}>
            <Typography variant="sm" weight="bold" color="#0F172A">
              {interestTarget.fullName}
            </Typography>
            <Typography variant="xs" color="#64748B">
              {[
                interestTarget.age ? `${interestTarget.age} ${language === 'hi' ? 'वर्ष' : 'yrs'}` : null,
                interestTarget.occupation,
                interestTarget.city,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Typography>
          </View>
        ) : null}

        <Input
          label={language === 'hi' ? 'संदेश (वैकल्पिक)' : 'Message (Optional)'}
          value={interestMessage}
          onChangeText={setInterestMessage}
          placeholder={
            language === 'hi'
              ? 'नमस्ते, आपकी प्रोफ़ाइल हमारे परिवार को उपयुक्त लगी...'
              : 'Namaste, we found your profile suitable...'
          }
          maxLength={500}
          multiline
          numberOfLines={3}
          helperText={`${interestMessage.length} / 500`}
        />

        {interestError ? (
          <View style={styles.errorBox}>
            <Typography variant="xs" color="#DC2626">
              {interestError}
            </Typography>
          </View>
        ) : null}

        {interestSuccess ? (
          <View style={styles.successBox}>
            <Typography variant="xs" weight="bold" color="#16A34A">
              ✓ {interestSuccess}
            </Typography>
          </View>
        ) : null}
      </BottomSheet>

      {/* 6. Shared Bottom Navigation */}
      <BottomNavigation activeTab="matrimonial" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  myProfileHeaderBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  segmentedContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  profilesWrapper: {
    flex: 1,
  },
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  activeChipsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
    alignItems: 'center',
  },
  activeChipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  clearAllChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
  },
  countBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  footerLoaderText: {
    fontSize: 12,
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptySubText: {
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  clearFiltersBtn: {
    minWidth: 140,
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorMsg: {
    marginTop: 6,
    marginBottom: 16,
  },
  interestsContainer: {
    flex: 1,
  },
  interestsSubTabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabBtnActive: {
    borderBottomColor: '#1976D2',
  },
  interestCard: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  interestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  interestAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  interestProfileInfo: {
    flex: 1,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeAccepted: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  statusBadgeDeclined: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  statusBadgePending: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  messageBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
  },
  viewProfileBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
  },
  // Sheet Styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetScroll: {
    marginTop: 12,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterSectionTitle: {
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterSelectChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1976D2',
  },
  inputSection: {
    marginBottom: 12,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sheetActionBtn: {
    flex: 1,
  },
  modalTitle: {
    marginBottom: 12,
  },
  targetInfoBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  errorBox: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    marginTop: 8,
  },
  successBox: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    marginTop: 8,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalActionBtn: {
    flex: 1,
  },
});

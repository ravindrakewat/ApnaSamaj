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
  BottomNavigation,
  MatrimonialCard,
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
  const { language } = useLocalization();
  const { user, communitySlug } = useAuth();

  // Primary Tab state: 'profiles' | 'interests'
  const [activeTab, setActiveTab] = useState<MatrimonialViewTab>('profiles');

  // Filter States
  const [genderFilter, setGenderFilter] = useState<'MALE' | 'FEMALE' | undefined>(undefined);
  const [maritalStatusFilter, setMaritalStatusFilter] = useState<string | undefined>(undefined);
  const [manglikFilter, setManglikFilter] = useState<string | undefined>(undefined);
  const [subCasteFilter, setSubCasteFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);

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

  const handleClearFilters = () => {
    setGenderFilter(undefined);
    setMaritalStatusFilter(undefined);
    setManglikFilter(undefined);
    setSubCasteFilter('');
    setCityFilter('');
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

  // Load profiles when filters change
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
      // Update local list
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.headerContainer,
          {
            paddingTop: Math.max(insets.top + 8, 16),
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.titleColumn}>
            <View style={styles.titleBadgeRow}>
              <Typography variant="lg" weight="bold" color={theme.colors.textPrimary}>
                {language === 'hi' ? 'विवाह परिचय' : 'Matrimonial Profiles'}
              </Typography>
              {communitySlug ? (
                <Badge label={communitySlug} variant="info" size="sm" />
              ) : null}
            </View>
            <Typography variant="xs" color={theme.colors.textMuted}>
              {language === 'hi'
                ? 'सत्यापित समाज सदस्य प्रोफ़ाइल खोजें'
                : 'Discover verified community matrimonial profiles'}
            </Typography>
          </View>

          {/* Filter toggle button */}
          {activeTab === 'profiles' ? (
            <Pressable
              onPress={() => setIsFilterExpanded((prev) => !prev)}
              style={[
                styles.filterToggleBtn,
                {
                  backgroundColor:
                    activeFilterCount > 0 ? theme.colors.primaryLight : theme.colors.background,
                  borderColor:
                    activeFilterCount > 0 ? theme.colors.primary : theme.colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Toggle filters"
            >
              <Typography variant="sm">
                🔍 {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </Typography>
            </Pressable>
          ) : null}
        </View>

        {/* Primary Segmented Tabs: Profiles | Interests */}
        <View style={[styles.segmentedControl, { backgroundColor: theme.colors.background }]}>
          <Pressable
            onPress={() => setActiveTab('profiles')}
            style={[
              styles.segmentBtn,
              activeTab === 'profiles' && {
                backgroundColor: theme.colors.surface,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 2,
                elevation: 2,
              },
            ]}
          >
            <Typography
              variant="xs"
              weight={activeTab === 'profiles' ? 'bold' : 'medium'}
              color={activeTab === 'profiles' ? theme.colors.primary : theme.colors.textMuted}
            >
              💍 {language === 'hi' ? 'प्रोफ़ाइलें' : 'Profiles'}{' '}
              {totalCount > 0 ? `(${totalCount})` : ''}
            </Typography>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('interests')}
            style={[
              styles.segmentBtn,
              activeTab === 'interests' && {
                backgroundColor: theme.colors.surface,
                shadowColor: '#000',
                shadowOpacity: 0.08,
                shadowRadius: 2,
                elevation: 2,
              },
            ]}
          >
            <Typography
              variant="xs"
              weight={activeTab === 'interests' ? 'bold' : 'medium'}
              color={activeTab === 'interests' ? theme.colors.primary : theme.colors.textMuted}
            >
              💌 {language === 'hi' ? 'रुचियाँ' : 'Interests'}
            </Typography>
          </Pressable>
        </View>

        {/* Collapsible Filter Panel (Profiles Mode) */}
        {activeTab === 'profiles' && isFilterExpanded ? (
          <View style={[styles.filterPanel, { borderTopColor: theme.colors.border }]}>
            {/* Gender Filter Chips */}
            <View style={styles.filterSection}>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary} style={styles.filterLabel}>
                {language === 'hi' ? 'लिंग (Gender):' : 'Looking For:'}
              </Typography>
              <View style={styles.chipRow}>
                {[
                  { key: undefined, hi: 'सभी', en: 'All' },
                  { key: 'FEMALE', hi: 'वधू (Brides)', en: 'Brides' },
                  { key: 'MALE', hi: 'वर (Grooms)', en: 'Grooms' },
                ].map((item) => {
                  const isSelected = genderFilter === item.key;
                  return (
                    <Pressable
                      key={item.en}
                      onPress={() => setGenderFilter(item.key as any)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.background,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Typography
                        variant="xs"
                        weight={isSelected ? 'bold' : 'regular'}
                        color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        {language === 'hi' ? item.hi : item.en}
                      </Typography>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Marital Status Chips */}
            <View style={styles.filterSection}>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary} style={styles.filterLabel}>
                {language === 'hi' ? 'वैवाहिक स्थिति:' : 'Marital Status:'}
              </Typography>
              <View style={styles.chipRow}>
                {[
                  { key: undefined, hi: 'सभी', en: 'All' },
                  { key: 'NEVER_MARRIED', hi: 'अविवाहित', en: 'Never Married' },
                  { key: 'DIVORCED', hi: 'तलाकशुदा', en: 'Divorced' },
                  { key: 'WIDOWED', hi: 'विधवा/विधुर', en: 'Widowed' },
                ].map((item) => {
                  const isSelected = maritalStatusFilter === item.key;
                  return (
                    <Pressable
                      key={item.en}
                      onPress={() => setMaritalStatusFilter(item.key)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.background,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Typography
                        variant="xs"
                        weight={isSelected ? 'bold' : 'regular'}
                        color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        {language === 'hi' ? item.hi : item.en}
                      </Typography>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Manglik Chips */}
            <View style={styles.filterSection}>
              <Typography variant="xs" weight="bold" color={theme.colors.textPrimary} style={styles.filterLabel}>
                {language === 'hi' ? 'मांगलिक स्थिति:' : 'Manglik:'}
              </Typography>
              <View style={styles.chipRow}>
                {[
                  { key: undefined, hi: 'सभी', en: 'All' },
                  { key: 'NON_MANGLIK', hi: 'अमांगलिक', en: 'Non-Manglik' },
                  { key: 'MANGLIK', hi: 'मांगलिक', en: 'Manglik' },
                  { key: 'ANSHIK', hi: 'आंशिक', en: 'Anshik' },
                ].map((item) => {
                  const isSelected = manglikFilter === item.key;
                  return (
                    <Pressable
                      key={item.en}
                      onPress={() => setManglikFilter(item.key)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? theme.colors.primary : theme.colors.background,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Typography
                        variant="xs"
                        weight={isSelected ? 'bold' : 'regular'}
                        color={isSelected ? '#FFFFFF' : theme.colors.textSecondary}
                      >
                        {language === 'hi' ? item.hi : item.en}
                      </Typography>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Sub-caste & City Inputs */}
            <View style={styles.inputsRow}>
              <View style={styles.inputFlex}>
                <Input
                  label={language === 'hi' ? 'उपजाति (Sub-caste)' : 'Sub-caste'}
                  value={subCasteFilter}
                  onChangeText={setSubCasteFilter}
                  placeholder="उदा. केवट / मल्लाह"
                />
              </View>
              <View style={styles.inputFlex}>
                <Input
                  label={language === 'hi' ? 'शहर (City)' : 'City'}
                  value={cityFilter}
                  onChangeText={setCityFilter}
                  placeholder="उदा. भोपाल"
                />
              </View>
            </View>

            {/* Reset Filters Action */}
            {activeFilterCount > 0 ? (
              <View style={styles.resetRow}>
                <Pressable onPress={handleClearFilters} style={styles.resetBtn}>
                  <Typography variant="xs" weight="bold" color={theme.colors.error}>
                    ↺ {language === 'hi' ? 'सभी फ़िल्टर साफ़ करें' : 'Reset All Filters'}
                  </Typography>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Main Content Area */}
      {activeTab === 'profiles' ? (
        <FlatList
          data={profiles}
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
            profiles.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isFetchingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Typography variant="xs" color={theme.colors.textMuted} style={styles.footerLoaderText}>
                  {language === 'hi' ? 'और प्रोफ़ाइलें लोड हो रही हैं...' : 'Loading more profiles...'}
                </Typography>
              </View>
            ) : null
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Typography variant="sm" color={theme.colors.textMuted} style={styles.emptySubText}>
                  {language === 'hi' ? 'विवाह प्रोफ़ाइलें खोजी जा रही हैं...' : 'Searching matrimonial profiles...'}
                </Typography>
              </View>
            ) : error ? (
              <Card style={styles.errorCard}>
                <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
                  ⚠️ {language === 'hi' ? 'लोड करने में समस्या' : 'Failed to Load'}
                </Typography>
                <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorMsg}>
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
                <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
                  {language === 'hi' ? 'कोई प्रोफ़ाइल नहीं मिली' : 'No Profiles Found'}
                </Typography>
                <Typography variant="xs" color={theme.colors.textMuted} align="center" style={styles.emptySubText}>
                  {activeFilterCount > 0
                    ? language === 'hi'
                      ? 'वर्तमान फ़िल्टर के अनुसार कोई स्वीकृत प्रोफ़ाइल नहीं है। फ़िल्टर बदल कर देखें।'
                      : 'No approved profiles match the selected filters.'
                    : language === 'hi'
                    ? 'वर्तमान में इस समुदाय में कोई सक्रिय विवाह प्रोफ़ाइल उपलब्ध नहीं है।'
                    : 'No approved matrimonial profiles are currently available in this community.'}
                </Typography>
                {activeFilterCount > 0 ? (
                  <Button
                    title={language === 'hi' ? 'फ़िल्टर हटाएं' : 'Clear Filters'}
                    onPress={handleClearFilters}
                    variant="outline"
                    size="sm"
                    style={styles.clearFiltersBtn}
                  />
                ) : null}
              </Card>
            )
          }
        />
      ) : (
        /* Interests Tab Content */
        <View style={styles.interestsContainer}>
          {/* Sub-toggle: Received vs Sent */}
          <View style={[styles.interestsSubTabs, { backgroundColor: theme.colors.surface }]}>
            <Pressable
              onPress={() => setInterestsSubTab('received')}
              style={[
                styles.subTabBtn,
                interestsSubTab === 'received' && {
                  borderBottomColor: theme.colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
            >
              <Typography
                variant="sm"
                weight={interestsSubTab === 'received' ? 'bold' : 'medium'}
                color={interestsSubTab === 'received' ? theme.colors.primary : theme.colors.textMuted}
              >
                📥 {language === 'hi' ? 'प्राप्त रुचियाँ' : 'Received Requests'}
              </Typography>
            </Pressable>

            <Pressable
              onPress={() => setInterestsSubTab('sent')}
              style={[
                styles.subTabBtn,
                interestsSubTab === 'sent' && {
                  borderBottomColor: theme.colors.primary,
                  borderBottomWidth: 2,
                },
              ]}
            >
              <Typography
                variant="sm"
                weight={interestsSubTab === 'sent' ? 'bold' : 'medium'}
                color={interestsSubTab === 'sent' ? theme.colors.primary : theme.colors.textMuted}
              >
                📤 {language === 'hi' ? 'भेजी गई रुचियाँ' : 'Sent Requests'}
              </Typography>
            </Pressable>
          </View>

          {isLoadingInterests ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Typography variant="sm" color={theme.colors.textMuted} style={styles.emptySubText}>
                {language === 'hi' ? 'रुचियाँ लोड हो रही हैं...' : 'Loading interests...'}
              </Typography>
            </View>
          ) : interestsList.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Typography variant="lg" align="center" style={styles.emptyIcon}>
                💌
              </Typography>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary} align="center">
                {interestsSubTab === 'received'
                  ? language === 'hi'
                    ? 'कोई प्राप्त रुचि नहीं'
                    : 'No Received Interests'
                  : language === 'hi'
                  ? 'कोई भेजी गई रुचि नहीं'
                  : 'No Sent Interests'}
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted} align="center" style={styles.emptySubText}>
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
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const other = item.otherPartyProfile;
                const isReceived = interestsSubTab === 'received';
                const isPending = item.status === 'PENDING';

                return (
                  <Card style={styles.interestCard}>
                    <View style={styles.interestHeader}>
                      <View style={styles.interestProfileInfo}>
                        <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
                          {other?.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member')}
                        </Typography>
                        <Typography variant="xs" color={theme.colors.textSecondary}>
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
                      <Badge
                        label={
                          item.status === 'ACCEPTED'
                            ? language === 'hi'
                              ? '💖 स्वीकृत'
                              : 'Connected'
                            : item.status === 'DECLINED'
                            ? language === 'hi'
                              ? '✕ अस्वीकृत'
                              : 'Declined'
                            : language === 'hi'
                            ? '⏳ प्रतीक्षारत'
                            : 'Pending'
                        }
                        variant={
                          item.status === 'ACCEPTED'
                            ? 'success'
                            : item.status === 'DECLINED'
                            ? 'error'
                            : 'warning'
                        }
                        size="sm"
                      />
                    </View>

                    {item.message ? (
                      <View style={[styles.messageBox, { backgroundColor: theme.colors.background }]}>
                        <Typography variant="xs" color={theme.colors.textSecondary}>
                          "{item.message}"
                        </Typography>
                      </View>
                    ) : null}

                    {/* Received Actions */}
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
                      >
                        <Typography variant="xs" weight="bold" color={theme.colors.primary}>
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

      {/* Express Interest Modal */}
      <Modal
        visible={Boolean(interestTarget)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingInterest) setInterestTarget(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.modalTitle}>
              💌 {language === 'hi' ? 'विवाह संबंध रुचि भेजें' : 'Express Matrimonial Interest'}
            </Typography>

            {interestTarget ? (
              <View style={[styles.targetInfoBox, { backgroundColor: theme.colors.background }]}>
                <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
                  {interestTarget.fullName}
                </Typography>
                <Typography variant="xs" color={theme.colors.textSecondary}>
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
              <View style={[styles.errorBox, { backgroundColor: '#FFEBEE' }]}>
                <Typography variant="xs" color="#C62828">
                  {interestError}
                </Typography>
              </View>
            ) : null}

            {interestSuccess ? (
              <View style={[styles.successBox, { backgroundColor: '#E8F5E9' }]}>
                <Typography variant="xs" weight="bold" color="#2E7D32">
                  ✓ {interestSuccess}
                </Typography>
              </View>
            ) : null}

            <View style={styles.modalActionsRow}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                onPress={() => setInterestTarget(null)}
                variant="outline"
                size="sm"
                disabled={isSubmittingInterest}
                style={styles.modalActionBtn}
              />
              <Button
                title={language === 'hi' ? 'रुचि भेजें' : 'Send Interest'}
                onPress={handleConfirmSendInterest}
                loading={isSubmittingInterest}
                size="sm"
                variant="primary"
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNavigation activeTab="matrimonial" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleColumn: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  filterToggleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    marginTop: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  filterPanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  filterSection: {
    marginBottom: 8,
  },
  filterLabel: {
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  inputFlex: {
    flex: 1,
  },
  resetRow: {
    alignItems: 'flex-end',
    marginTop: 4,
    marginBottom: 4,
  },
  resetBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  footerLoaderText: {
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  errorCard: {
    padding: 20,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  emptySubText: {
    marginTop: 6,
    lineHeight: 18,
  },
  errorMsg: {
    marginVertical: 8,
  },
  clearFiltersBtn: {
    marginTop: 12,
  },
  interestsContainer: {
    flex: 1,
  },
  interestsSubTabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestCard: {
    padding: 14,
    marginBottom: 10,
  },
  interestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  interestProfileInfo: {
    flex: 1,
    marginRight: 8,
  },
  messageBox: {
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
  },
  viewProfileBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    marginBottom: 12,
  },
  targetInfoBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBox: {
    padding: 8,
    borderRadius: 6,
    marginVertical: 6,
  },
  successBox: {
    padding: 8,
    borderRadius: 6,
    marginVertical: 6,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalActionBtn: {
    flex: 1,
  },
});


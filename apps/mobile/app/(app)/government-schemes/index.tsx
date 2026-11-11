import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Typography,
  Card,
  Button,
  Badge,
  AppHeader,
  SearchBar,
  BottomNavigation,
  SchemeCard,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import {
  governmentSchemesApi,
  ParsedGovernmentScheme,
  SCHEME_CATEGORIES,
  SCHEME_LOCATIONS,
  validateOfficialUrl,
} from '../../../src/api/government-schemes.api';

export default function GovernmentSchemesHomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();
  const isHindi = language === 'hi';

  const toggleLanguage = () => {
    setLanguage(isHindi ? 'en' : 'hi');
  };

  // State
  const [schemes, setSchemes] = useState<ParsedGovernmentScheme[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'MY_SCHEMES'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  /**
   * Load government scheme posts from community feed
   */
  const loadSchemes = useCallback(async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await governmentSchemesApi.listSchemes({
        page: 1,
        limit: 50,
      });
      setSchemes(response.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'योजनाएं लोड करने में विफल / Failed to load schemes.';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSchemes();
  }, [loadSchemes]);

  /**
   * Filtered Schemes
   */
  const filteredSchemes = useMemo(() => {
    let list = [...schemes];

    // Tab Filter (All vs My Posted Schemes)
    if (activeTab === 'MY_SCHEMES' && user?.id) {
      list = list.filter((s) => s.authorId === user.id);
    }

    // Category Filter
    if (selectedCategory !== 'ALL') {
      list = list.filter((s) => s.category === selectedCategory);
    }

    // Location / State Filter
    if (selectedLocation !== 'ALL') {
      const loc = selectedLocation.toLowerCase();
      list = list.filter(
        (s) =>
          s.locationState.toLowerCase().includes(loc) ||
          (s.authorCity && s.authorCity.toLowerCase().includes(loc))
      );
    }

    // Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.department.toLowerCase().includes(q) ||
          s.benefits.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.locationState.toLowerCase().includes(q) ||
          s.targetBeneficiaries.toLowerCase().includes(q)
      );
    }

    return list;
  }, [schemes, activeTab, selectedCategory, selectedLocation, searchQuery, user?.id]);

  /**
   * Navigate to Scheme Details
   */
  const handleSchemePress = (scheme: ParsedGovernmentScheme) => {
    router.push({
      pathname: '/(app)/government-schemes/[id]',
      params: { id: scheme.id },
    } as any);
  };

  /**
   * Open Official Website in Browser
   */
  const handleOpenOfficialWebsite = (url: string) => {
    const validated = validateOfficialUrl(url);
    if (!validated.isValid) {
      Alert.alert(
        isHindi ? 'अमान्य लिंक' : 'Invalid Link',
        isHindi ? 'यह वेबसाइट लिंक अमान्य या असुरक्षित है।' : 'This website URL is invalid or malformed.'
      );
      return;
    }

    Alert.alert(
      isHindi ? 'बाहरी सरकारी पोर्टल' : 'Official Government Portal',
      isHindi
        ? `क्या आप आधिकारिक पोर्टल (${validated.normalizedUrl}) पर जाना चाहते हैं?`
        : `Do you want to visit the official website (${validated.normalizedUrl})?`,
      [
        { text: isHindi ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: isHindi ? 'खोलें' : 'Open',
          onPress: () => Linking.openURL(validated.normalizedUrl).catch(() => {}),
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* 1. App Header */}
      <AppHeader
        mode="detail"
        title={isHindi ? 'सरकारी योजनाएँ' : 'Government Schemes'}
        subtitle={isHindi ? 'जनकल्याणकारी योजनाएं व पात्रता' : 'Welfare Schemes & Eligibility'}
        showBackButton
        onBackPress={() => router.back()}
        showLanguageSwitcher
        language={language}
        onLanguageToggle={toggleLanguage}
        rightAccessory={
          <Pressable
            onPress={() => router.push('/(app)/post/create')}
            style={styles.postSchemeHeaderBtn}
            accessibilityRole="button"
            accessibilityLabel="Post Government Scheme"
          >
            <Typography variant="xs" weight="bold" color="#115E59">
              {isHindi ? '+ योजना पोस्ट' : '+ Post Scheme'}
            </Typography>
          </Pressable>
        }
      />

      {/* 2. Community Disclaimer Notice */}
      <View style={styles.disclaimerContainer}>
        <View style={styles.disclaimerBox}>
          <Typography variant="xs" color="#0F766E" style={styles.disclaimerText}>
            ℹ️{' '}
            {isHindi
              ? 'यह जानकारी समाज सदस्यों द्वारा साझा की गई है। आवेदन से पूर्व आधिकारिक पोर्टल पर पुष्टि अवश्य करें।'
              : 'Information shared by community members. Please verify with official portals before applying.'}
          </Typography>
        </View>
      </View>

      {/* 3. Search Bar */}
      <View style={styles.searchContainer}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={isHindi ? 'योजना का नाम, विभाग या लाभ खोजें...' : 'Search scheme, department or benefits...'}
          onClear={() => setSearchQuery('')}
        />
      </View>

      {/* 4. Segmented Tabs (All vs My Posted Schemes) */}
      <View style={[styles.tabsRow, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => setActiveTab('ALL')}
          style={[styles.tabButton, activeTab === 'ALL' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'ALL' }}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'ALL' ? 'bold' : 'regular'}
            color={activeTab === 'ALL' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {isHindi ? 'सभी योजनाएं' : 'All Schemes'}
          </Typography>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('MY_SCHEMES')}
          style={[styles.tabButton, activeTab === 'MY_SCHEMES' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'MY_SCHEMES' }}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'MY_SCHEMES' ? 'bold' : 'regular'}
            color={activeTab === 'MY_SCHEMES' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {isHindi ? 'मेरी पोस्ट की गई योजनाएं' : 'My Posted Schemes'}
          </Typography>
        </Pressable>
      </View>

      {/* 5. Category Filters Carousel */}
      <View style={[styles.categoriesFilterBar, { backgroundColor: theme.colors.surface }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {SCHEME_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.key;
            return (
              <Pressable
                key={cat.key}
                onPress={() => setSelectedCategory(cat.key)}
                style={[
                  styles.filterChip,
                  isSelected && [styles.filterChipSelected, { backgroundColor: '#F0FDFA', borderColor: '#0D9488' }],
                ]}
              >
                <Typography
                  variant="xs"
                  weight={isSelected ? 'bold' : 'medium'}
                  color={isSelected ? '#0F766E' : '#475569'}
                >
                  {isHindi ? cat.labelHi : cat.labelEn}
                </Typography>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 6. State / Location Filters Carousel */}
      <View style={[styles.locationsFilterBar, { backgroundColor: theme.colors.surface }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {SCHEME_LOCATIONS.map((loc) => {
            const isSelected = selectedLocation === loc.key;
            return (
              <Pressable
                key={loc.key}
                onPress={() => setSelectedLocation(loc.key)}
                style={[
                  styles.locationChip,
                  isSelected && [styles.locationChipSelected, { backgroundColor: '#EFF6FF', borderColor: theme.colors.primary }],
                ]}
              >
                <Typography
                  variant="xs"
                  weight={isSelected ? 'bold' : 'medium'}
                  color={isSelected ? theme.colors.primary : '#475569'}
                >
                  {isHindi ? loc.labelHi : loc.labelEn}
                </Typography>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 7. Schemes Feed List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color="#64748B" style={{ marginTop: 12 }}>
            {isHindi ? 'सरकारी योजनाएं लोड हो रही हैं...' : 'Loading government schemes...'}
          </Typography>
        </View>
      ) : error && filteredSchemes.length === 0 ? (
        <View style={styles.centerContainer}>
          <Typography variant="md" weight="bold" color="#EF4444" align="center" style={{ marginBottom: 8 }}>
            ⚠️ {error}
          </Typography>
          <Button
            title={isHindi ? 'पुनः प्रयास करें' : 'Retry'}
            onPress={() => loadSchemes()}
            variant="outline"
            size="sm"
          />
        </View>
      ) : (
        <FlatList
          data={filteredSchemes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SchemeCard
              scheme={item}
              onPress={handleSchemePress}
              onPressWebsite={handleOpenOfficialWebsite}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom + 100, 120) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadSchemes(true)}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <Card style={styles.emptyCard}>
              <Typography variant="lg" align="center" style={{ marginBottom: 8 }}>
                🏛️
              </Typography>
              <Typography variant="md" weight="bold" color="#0F172A" align="center" style={{ marginBottom: 4 }}>
                {activeTab === 'MY_SCHEMES'
                  ? isHindi
                    ? 'आपने कोई सरकारी योजना पोस्ट नहीं की है'
                    : 'You have not posted any schemes yet'
                  : isHindi
                    ? 'कोई योजना नहीं मिली'
                    : 'No Government Schemes Found'}
              </Typography>
              <Typography variant="xs" color="#64748B" align="center" style={{ marginBottom: 16 }}>
                {isHindi
                  ? 'समाज के सदस्यों के लाभ हेतु छात्रवृत्ति, रोजगार अथवा कृषि योजनाओं की जानकारी साझा करें।'
                  : 'Share welfare, scholarship or agriculture schemes to assist community members.'}
              </Typography>
              <Button
                title={isHindi ? '🏛️ + योजना पोस्ट करें' : '🏛️ + Post Scheme'}
                onPress={() => router.push('/(app)/post/create')}
                variant="primary"
                size="sm"
              />
            </Card>
          }
        />
      )}

      {/* 8. Floating Action Button (FAB) */}
      <Pressable
        onPress={() => router.push('/(app)/post/create')}
        style={[styles.floatingActionBtn, { backgroundColor: '#0D9488', bottom: Math.max(insets.bottom + 65, 80) }]}
        accessibilityRole="button"
        accessibilityLabel="Post a government scheme"
      >
        <Typography variant="xs" weight="bold" color="#FFFFFF">
          🏛️ + {isHindi ? 'योजना पोस्ट करें' : 'Post Scheme'}
        </Typography>
      </Pressable>

      {/* 9. Bottom Navigation */}
      <BottomNavigation activeTab="feed" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  postSchemeHeaderBtn: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  disclaimerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  disclaimerBox: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  disclaimerText: {
    lineHeight: 16,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
  },
  categoriesFilterBar: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  locationsFilterBar: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipSelected: {
    borderWidth: 1.5,
  },
  locationChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  locationChipSelected: {
    borderWidth: 1.5,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyCard: {
    marginTop: 24,
    padding: 24,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  floatingActionBtn: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 99,
  },
});

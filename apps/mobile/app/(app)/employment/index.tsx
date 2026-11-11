import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Typography,
  Card,
  Button,
  Badge,
  Input,
  SearchBar,
  AppHeader,
  JobCard,
  BottomSheet,
  BottomNavigation,
  ProfileAvatar,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { employmentApi, ParsedJobListing } from '../../../src/api/employment.api';

type EmploymentTab = 'ALL' | 'MY_JOBS';

export default function EmploymentHomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const [activeTab, setActiveTab] = useState<EmploymentTab>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  const [jobs, setJobs] = useState<ParsedJobListing[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Application / Contact Modal State
  const [selectedJobForApply, setSelectedJobForApply] = useState<ParsedJobListing | null>(null);
  const [coverNote, setCoverNote] = useState<string>('');
  const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);

  /**
   * Load jobs from community feed
   */
  const loadJobs = useCallback(async () => {
    setError(null);
    try {
      const data = await employmentApi.listJobs({
        search: searchQuery.trim() || undefined,
        location: selectedLocation !== 'ALL' ? selectedLocation : undefined,
        authorId: activeTab === 'MY_JOBS' ? user?.id : undefined,
        limit: 50,
      });
      setJobs(data.jobs || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'रोजगार सूची लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchQuery, selectedLocation, activeTab, user?.id]);

  useEffect(() => {
    setIsLoading(true);
    loadJobs();
  }, [loadJobs]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadJobs();
  };

  /**
   * Filter jobs locally by search query and location
   */
  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (activeTab === 'MY_JOBS') {
      list = list.filter((j) => j.authorId === user?.id);
    }
    if (selectedLocation !== 'ALL') {
      const loc = selectedLocation.toLowerCase();
      list = list.filter(
        (j) =>
          j.location.toLowerCase().includes(loc) ||
          (j.authorCity && j.authorCity.toLowerCase().includes(loc))
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.location.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, activeTab, selectedLocation, searchQuery, user?.id]);

  /**
   * Navigate to Job Details
   */
  const handleJobCardPress = (job: ParsedJobListing) => {
    router.push({
      pathname: '/(app)/employment/[id]',
      params: { id: job.id },
    } as any);
  };

  /**
   * Apply / Contact employer action
   */
  const handleOpenApplyModal = (job: ParsedJobListing) => {
    setSelectedJobForApply(job);
    setCoverNote(
      language === 'hi'
        ? `नमस्ते ${job.authorName}, मैंने अपना समाज पोर्टल पर आपकी नौकरी रिक्ति (${job.title}) देखी। मैं इस अवसर हेतु आवेदन करना चाहता हूँ।`
        : `Hello ${job.authorName}, I saw your job posting for "${job.title}" on Apna Samaj. I would like to apply for this opportunity.`
    );
  };

  const handleDirectChatWithEmployer = () => {
    if (!selectedJobForApply) return;
    const authorId = selectedJobForApply.authorId;
    const authorName = selectedJobForApply.authorName;
    const authorAvatar = selectedJobForApply.authorAvatarUrl || '';

    setSelectedJobForApply(null);
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: authorId,
        name: authorName,
        avatar: authorAvatar,
      },
    } as any);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* 1. Modern AppHeader */}
      <AppHeader
        mode="brand"
        icon="💼"
        title={language === 'hi' ? 'रोजगार व भर्ती अवसर' : 'Jobs & Careers'}
        communitySlug={communitySlug}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
        rightAccessory={
          <Pressable
            onPress={() => router.push('/(app)/post/create' as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'नौकरी पोस्ट करें' : 'Post a Job'}
            style={styles.postJobHeaderBtn}
          >
            <Typography variant="xs" weight="bold" color="#1976D2">
              {language === 'hi' ? '+ नौकरी पोस्ट करें' : '+ Post Job'}
            </Typography>
          </Pressable>
        }
      />

      {/* 2. SearchBar with Clear */}
      <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={
            language === 'hi'
              ? 'पद, कंपनी या कौशल से खोजें...'
              : 'Search jobs by role, company, skill...'
          }
          onClear={() => setSearchQuery('')}
        />
      </View>

      {/* 3. Segmented Tab Switcher (All vs My Posted Jobs) */}
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
            {language === 'hi' ? 'सभी अवसर' : 'All Jobs'}
          </Typography>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('MY_JOBS')}
          style={[styles.tabButton, activeTab === 'MY_JOBS' && [styles.activeTab, { borderBottomColor: theme.colors.primary }]]}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'MY_JOBS' }}
        >
          <Typography
            variant="sm"
            weight={activeTab === 'MY_JOBS' ? 'bold' : 'regular'}
            color={activeTab === 'MY_JOBS' ? theme.colors.primary : theme.colors.textSecondary}
          >
            {language === 'hi' ? 'मेरी पोस्ट की गई नौकरियां' : 'My Posted Jobs'}
          </Typography>
        </Pressable>
      </View>

      {/* 4. Quick Location Filters Carousel */}
      <View style={[styles.locationsFilterBar, { backgroundColor: theme.colors.surface }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.locationsScrollContent}
        >
          {[
            { key: 'ALL', labelHi: 'सभी स्थान', labelEn: 'All Locations' },
            { key: 'Indore', labelHi: 'इंदौर (Indore)', labelEn: 'Indore' },
            { key: 'Bhopal', labelHi: 'भोपाल (Bhopal)', labelEn: 'Bhopal' },
            { key: 'Jabalpur', labelHi: 'जबलपुर (Jabalpur)', labelEn: 'Jabalpur' },
            { key: 'Rewa', labelHi: 'रीवा (Rewa)', labelEn: 'Rewa' },
            { key: 'Remote', labelHi: 'घर से कार्य (Remote)', labelEn: 'Remote' },
          ].map((loc) => {
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
                  {language === 'hi' ? loc.labelHi : loc.labelEn}
                </Typography>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 5. Main Jobs Feed List */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color="#64748B" style={{ marginTop: 12 }}>
            {language === 'hi' ? 'अवसर लोड हो रहे हैं...' : 'Loading job opportunities...'}
          </Typography>
        </View>
      ) : error && filteredJobs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Typography variant="sm" color={theme.colors.error} align="center" style={{ marginBottom: 12 }}>
            {error}
          </Typography>
          <Button
            title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
            variant="outline"
            size="sm"
            onPress={loadJobs}
          />
        </View>
      ) : filteredJobs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Typography variant="lg" style={{ fontSize: 44, marginBottom: 8 }}>
            💼
          </Typography>
          <Typography variant="md" weight="bold" color="#0F172A" align="center">
            {language === 'hi' ? 'कोई नौकरी रिक्ति नहीं मिली' : 'No Job Openings Found'}
          </Typography>
          <Typography variant="xs" color="#64748B" align="center" style={styles.emptySubtitle}>
            {activeTab === 'MY_JOBS'
              ? language === 'hi'
                ? 'आपने अभी तक कोई रोजगार अवसर पोस्ट नहीं किया है। समाज के युवाओं हेतु अवसर साझा करें।'
                : 'You have not posted any job openings yet. Share opportunities with community members.'
              : language === 'hi'
                ? 'वर्तमान फ़िल्टर या खोज के अनुसार कोई अवसर उपलब्ध नहीं है।'
                : 'No job openings match the selected filters or search query.'}
          </Typography>

          <Button
            title={language === 'hi' ? '+ नया रोजगार अवसर पोस्ट करें' : '+ Post Job Opening'}
            onPress={() => router.push('/(app)/post/create' as any)}
            variant="primary"
            size="sm"
            style={{ marginTop: 8 }}
          />
        </View>
      ) : (
        <FlatList
          data={filteredJobs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <JobCard
              job={item}
              onPress={() => handleJobCardPress(item)}
              onApplyPress={() => handleOpenApplyModal(item)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom + 64, 80) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 6. Apply / Contact Recruiter BottomSheet */}
      <BottomSheet
        visible={Boolean(selectedJobForApply)}
        onClose={() => setSelectedJobForApply(null)}
        title={language === 'hi' ? 'नौकरी हेतु आवेदन व संपर्क' : 'Apply for Job'}
        subtitle={selectedJobForApply ? `${selectedJobForApply.title} • ${selectedJobForApply.company}` : undefined}
      >
        {selectedJobForApply && (
          <View style={styles.applyModalContent}>
            {/* Recruiter Profile Header */}
            <View style={styles.recruiterBox}>
              <ProfileAvatar
                uri={selectedJobForApply.authorAvatarUrl}
                name={selectedJobForApply.authorName}
                size="sm"
              />
              <View style={styles.recruiterDetails}>
                <Typography variant="sm" weight="bold" color="#0F172A">
                  {selectedJobForApply.authorName}
                </Typography>
                <Typography variant="xs" color="#64748B">
                  {language === 'hi' ? 'नियोक्ता / भर्तीकर्ता' : 'Recruiter / Employer'}
                </Typography>
              </View>
            </View>

            {/* Direct Contact Info from Listing */}
            {selectedJobForApply.contactInfo ? (
              <View style={styles.contactDetailsBox}>
                <Typography variant="xs" weight="bold" color="#1E3A8A">
                  📞 {language === 'hi' ? 'सीधा संपर्क विवरण:' : 'Direct Contact Info:'}
                </Typography>
                <Typography variant="xs" color="#334155" style={{ marginTop: 4 }}>
                  {selectedJobForApply.contactInfo}
                </Typography>
              </View>
            ) : null}

            {/* Cover Note Field */}
            <Typography variant="xs" weight="semibold" color="#475569" style={{ marginBottom: 6, marginTop: 8 }}>
              {language === 'hi' ? 'संदेश / परिचय:' : 'Cover Message:'}
            </Typography>
            <Input
              value={coverNote}
              onChangeText={setCoverNote}
              placeholder={language === 'hi' ? 'अपना परिचय और अनुभव लिखें...' : 'Write a brief cover note...'}
              multiline
              numberOfLines={3}
              containerStyle={{ marginBottom: 16 }}
            />

            {/* Direct Message CTA */}
            <Button
              title={
                language === 'hi'
                  ? '💬 समाज चैट पर संदेश भेजें'
                  : '💬 Message Employer on Samaj Chat'
              }
              onPress={handleDirectChatWithEmployer}
              variant="primary"
            />
          </View>
        )}
      </BottomSheet>

      {/* 7. Bottom Navigation */}
      <BottomNavigation activeTab="feed" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  postJobHeaderBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
    borderBottomWidth: 2.5,
  },
  locationsFilterBar: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  locationsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  locationChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  locationChipSelected: {
    borderWidth: 1.5,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptySubtitle: {
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
    maxWidth: 280,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  applyModalContent: {
    paddingVertical: 12,
  },
  recruiterBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  recruiterDetails: {
    flex: 1,
  },
  contactDetailsBox: {
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 12,
  },
});


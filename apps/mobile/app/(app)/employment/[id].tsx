import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Typography,
  Card,
  Button,
  Badge,
  AppHeader,
  ProfileAvatar,
  ConfirmationDialog,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { employmentApi, ParsedJobListing } from '../../../src/api/employment.api';
import { formatJobTime } from '../../../src/components/JobCard';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const [job, setJob] = useState<ParsedJobListing | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const loadJob = useCallback(async () => {
    if (!id || !id.trim()) {
      setError(language === 'hi' ? 'आईडी आवश्यक है।' : 'Job ID is required.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await employmentApi.getJobById(id.trim());
      setJob(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'नौकरी विवरण लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id, language]);

  useEffect(() => {
    loadJob();
  }, [loadJob]);

  const isOwner = Boolean(job && user && job.authorId === user.id);

  const handleDeleteJob = async () => {
    if (!job) return;
    setIsDeleting(true);
    try {
      await employmentApi.deleteJob(job.id);
      setShowDeleteConfirm(false);
      Alert.alert(
        language === 'hi' ? 'सफल' : 'Success',
        language === 'hi'
          ? 'नौकरी रिक्ति सफलतापूर्वक हटा दी गई।'
          : 'Job opening deleted successfully.',
        [
          {
            text: language === 'hi' ? 'ठीक है' : 'OK',
            onPress: () => router.replace('/(app)/employment' as any),
          },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete job.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMessageEmployer = () => {
    if (!job) return;
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: job.authorId,
        name: job.authorName,
        avatar: job.authorAvatarUrl || '',
      },
    } as any);
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Typography variant="sm" color="#64748B" style={{ marginTop: 12 }}>
          {language === 'hi' ? 'नौकरी विवरण लोड हो रहा है...' : 'Loading job details...'}
        </Typography>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View style={styles.screen}>
        <AppHeader
          mode="detail"
          title={language === 'hi' ? 'नौकरी विवरण' : 'Job Details'}
          communitySlug={communitySlug}
          showBackButton={true}
        />
        <View style={styles.centerContainer}>
          <Typography variant="md" weight="bold" color="#EF4444" align="center" style={{ marginBottom: 12 }}>
            ⚠️ {error || (language === 'hi' ? 'अवसर नहीं मिला' : 'Job not found')}
          </Typography>
          <Button
            title={language === 'hi' ? 'वापस जाएँ' : 'Go Back'}
            onPress={() => router.back()}
            variant="outline"
            size="sm"
          />
        </View>
      </View>
    );
  }

  const formattedTime = formatJobTime(job.createdAt, language as 'en' | 'hi');

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* 1. Header */}
      <AppHeader
        mode="detail"
        title={job.title}
        communitySlug={communitySlug}
        showBackButton={true}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
        rightAccessory={
          isOwner ? (
            <Pressable
              onPress={() => setShowDeleteConfirm(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Delete Job"
              style={styles.deleteHeaderBtn}
            >
              <Typography variant="xs" weight="bold" color="#EF4444">
                🗑️ {language === 'hi' ? 'हटाएं' : 'Delete'}
              </Typography>
            </Pressable>
          ) : undefined
        }
      />

      {/* 2. Main Scroll Content */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 80, 100) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroTitleRow}>
            <View style={styles.heroText}>
              <Typography variant="md" weight="bold" color="#0F172A" style={styles.jobTitle}>
                {job.title}
              </Typography>
              <Typography variant="sm" weight="semibold" color="#2563EB" style={styles.companyName}>
                🏢 {job.company}
              </Typography>
            </View>
            <Badge label={job.employmentType} variant="info" size="sm" />
          </View>

          {/* Key Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Typography variant="xs" color="#64748B">
                {language === 'hi' ? 'स्थान' : 'Location'}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0F172A" style={{ marginTop: 2 }}>
                📍 {job.location}
              </Typography>
            </View>

            <View style={styles.metricItem}>
              <Typography variant="xs" color="#64748B">
                {language === 'hi' ? 'वेतन' : 'Salary'}
              </Typography>
              <Typography variant="xs" weight="bold" color="#16A34A" style={{ marginTop: 2 }}>
                💰 {job.salary}
              </Typography>
            </View>

            <View style={styles.metricItem}>
              <Typography variant="xs" color="#64748B">
                {language === 'hi' ? 'अनुभव' : 'Experience'}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0F172A" style={{ marginTop: 2 }}>
                💼 {job.experience}
              </Typography>
            </View>

            <View style={styles.metricItem}>
              <Typography variant="xs" color="#64748B">
                {language === 'hi' ? 'पोस्ट तिथि' : 'Posted'}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0F172A" style={{ marginTop: 2 }}>
                🕒 {formattedTime || 'Recent'}
              </Typography>
            </View>
          </View>
        </Card>

        {/* Contact Info Box if available */}
        {job.contactInfo ? (
          <Card style={styles.contactCard}>
            <Typography variant="xs" weight="bold" color="#1E3A8A" style={{ marginBottom: 4 }}>
              📞 {language === 'hi' ? 'संपर्क व आवेदन निर्देश:' : 'Contact & Application Instructions:'}
            </Typography>
            <Typography variant="xs" color="#334155" style={{ lineHeight: 18 }}>
              {job.contactInfo}
            </Typography>
          </Card>
        ) : null}

        {/* Detailed Job Description Card */}
        <Card style={styles.descriptionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            📄 {language === 'hi' ? 'नौकरी विवरण व शर्तें' : 'Job Description & Requirements'}
          </Typography>
          <Typography variant="xs" color="#334155" style={styles.descriptionText}>
            {job.description}
          </Typography>
        </Card>

        {/* Media / Attachment Images if available */}
        {job.mediaUrls && job.mediaUrls.length > 0 ? (
          <Card style={styles.mediaCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              🖼️ {language === 'hi' ? 'संलग्न दस्तावेज़ व चित्र' : 'Attachments & Flyers'}
            </Typography>
            <View style={styles.mediaGrid}>
              {job.mediaUrls.map((url, idx) => (
                <View key={idx} style={styles.mediaItem}>
                  <Image source={{ uri: url }} style={styles.mediaImage} resizeMode="cover" />
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Recruiter / Employer Profile Card */}
        <Card style={styles.recruiterCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            👤 {language === 'hi' ? 'नियोक्ता / भर्तीकर्ता परिचय' : 'Posted by Community Member'}
          </Typography>
          <View style={styles.recruiterRow}>
            <ProfileAvatar
              uri={job.authorAvatarUrl}
              name={job.authorName}
              size="md"
            />
            <View style={styles.recruiterInfo}>
              <Typography variant="sm" weight="bold" color="#0F172A">
                {job.authorName}
              </Typography>
              <Typography variant="xs" color="#64748B">
                {job.authorCity ? `📍 ${job.authorCity}` : 'Apna Samaj Member'}
              </Typography>
            </View>
          </View>
        </Card>
      </ScrollView>

      {/* 3. Bottom Sticky Action Bar */}
      <View
        style={[
          styles.bottomStickyBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Button
          title={
            language === 'hi'
              ? '💬 नियोक्ता को सीधा संदेश भेजें'
              : '💬 Message Employer on Samaj Chat'
          }
          onPress={handleMessageEmployer}
          variant="primary"
          style={styles.fullWidthBtn}
        />
      </View>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        visible={showDeleteConfirm}
        title={language === 'hi' ? 'नौकरी रिक्ति हटाएं?' : 'Delete Job Opening?'}
        message={
          language === 'hi'
            ? 'क्या आप वाकई इस रोजगार अवसर को हटाना चाहते हैं?'
            : 'Are you sure you want to delete this job posting?'
        }
        confirmLabel={language === 'hi' ? 'हटाएं' : 'Delete'}
        cancelLabel={language === 'hi' ? 'रद्द करें' : 'Cancel'}
        variant="danger"
        loading={isDeleting}
        onConfirm={handleDeleteJob}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  deleteHeaderBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  heroCard: {
    padding: 16,
    borderRadius: 14,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  heroText: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
  },
  companyName: {
    fontSize: 13,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  metricItem: {
    width: '46%',
  },
  contactCard: {
    padding: 14,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
  },
  descriptionCard: {
    padding: 16,
    borderRadius: 14,
  },
  sectionHeader: {
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  descriptionText: {
    lineHeight: 20,
  },
  mediaCard: {
    padding: 16,
    borderRadius: 14,
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaItem: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  recruiterCard: {
    padding: 16,
    borderRadius: 14,
  },
  recruiterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recruiterInfo: {
    flex: 1,
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  fullWidthBtn: {
    width: '100%',
  },
});


import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
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
import {
  governmentSchemesApi,
  ParsedGovernmentScheme,
  validateOfficialUrl,
} from '../../../src/api/government-schemes.api';
import { formatSchemeTime } from '../../../src/components/SchemeCard';

export default function GovernmentSchemeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();
  const isHindi = language === 'hi';

  const toggleLanguage = () => {
    setLanguage(isHindi ? 'en' : 'hi');
  };

  const [scheme, setScheme] = useState<ParsedGovernmentScheme | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  const loadScheme = useCallback(async () => {
    if (!id || !id.trim()) {
      setError(isHindi ? 'योजना आईडी आवश्यक है।' : 'Scheme ID is required.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await governmentSchemesApi.getSchemeById(id.trim());
      setScheme(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'योजना विवरण लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id, isHindi]);

  useEffect(() => {
    loadScheme();
  }, [loadScheme]);

  const isOwner = Boolean(scheme && user && scheme.authorId === user.id);

  const handleDeleteScheme = async () => {
    if (!scheme) return;
    setIsDeleting(true);
    try {
      await governmentSchemesApi.deleteScheme(scheme.id);
      setShowDeleteConfirm(false);
      Alert.alert(
        isHindi ? 'सफल' : 'Success',
        isHindi
          ? 'सरकारी योजना पोस्ट सफलतापूर्वक हटा दी गई।'
          : 'Government scheme post deleted successfully.',
        [
          {
            text: isHindi ? 'ठीक है' : 'OK',
            onPress: () => router.replace('/(app)/government-schemes' as any),
          },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete scheme post.';
      Alert.alert(isHindi ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Open Official Website Safely
   */
  const handleOpenOfficialWebsite = (url?: string) => {
    const targetUrl = url || scheme?.officialWebsite;
    if (!targetUrl) return;

    const validated = validateOfficialUrl(targetUrl);
    if (!validated.isValid) {
      Alert.alert(
        isHindi ? 'अमान्य लिंक' : 'Invalid URL',
        isHindi ? 'यह वेबसाइट लिंक मान्य अथवा सुरक्षित नहीं है।' : 'The official website URL is invalid or malformed.'
      );
      return;
    }

    Alert.alert(
      isHindi ? 'बाहरी सरकारी पोर्टल' : 'Official Portal Notice',
      isHindi
        ? `आप आधिकारिक सरकारी वेबसाइट (${validated.normalizedUrl}) पर पुनः निर्देशित हो रहे हैं। कृपया सतर्कतापूर्वक विवरण दर्ज करें।`
        : `You are opening the external portal (${validated.normalizedUrl}). Proceed to browser?`,
      [
        { text: isHindi ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: isHindi ? 'खोलें' : 'Open',
          onPress: () => Linking.openURL(validated.normalizedUrl).catch(() => {}),
        },
      ]
    );
  };

  /**
   * Contact poster on Samaj Chat
   */
  const handleMessagePoster = () => {
    if (!scheme) return;
    router.push({
      pathname: '/chat/[id]',
      params: {
        id: scheme.authorId,
        name: scheme.authorName,
        avatar: scheme.authorAvatarUrl || '',
      },
    } as any);
  };

  /**
   * Call Helpline
   */
  const handleCallHelpline = (phone: string) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone) {
      Linking.openURL(`tel:${cleanPhone}`).catch(() => {});
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Typography variant="sm" color="#64748B" style={{ marginTop: 12 }}>
          {isHindi ? 'सरकारी योजना लोड हो रही है...' : 'Loading government scheme details...'}
        </Typography>
      </View>
    );
  }

  if (error || !scheme) {
    return (
      <View style={styles.screen}>
        <AppHeader
          mode="detail"
          title={isHindi ? 'सरकारी योजना' : 'Government Scheme'}
          communitySlug={communitySlug}
          showBackButton={true}
        />
        <View style={styles.centerContainer}>
          <Typography variant="md" weight="bold" color="#EF4444" align="center" style={{ marginBottom: 12 }}>
            ⚠️ {error || (isHindi ? 'योजना नहीं मिली' : 'Scheme not found')}
          </Typography>
          <Button
            title={isHindi ? 'वापस जाएँ' : 'Go Back'}
            onPress={() => router.back()}
            variant="outline"
            size="sm"
          />
        </View>
      </View>
    );
  }

  const formattedTime = formatSchemeTime(scheme.createdAt, language as 'en' | 'hi');

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* 1. Header */}
      <AppHeader
        mode="detail"
        title={scheme.title}
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
              accessibilityLabel="Delete Scheme"
              style={styles.deleteHeaderBtn}
            >
              <Typography variant="xs" weight="bold" color="#EF4444">
                🗑️ {isHindi ? 'हटाएं' : 'Delete'}
              </Typography>
            </Pressable>
          ) : undefined
        }
      />

      {/* 2. Main Scroll Content */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 90, 110) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Official Disclaimer Banner */}
        <View style={styles.disclaimerCard}>
          <Typography variant="xs" color="#92400E" style={styles.disclaimerText}>
            ⚠️{' '}
            <Typography variant="xs" weight="bold" color="#78350F">
              {isHindi ? 'अस्वीकरण (Disclaimer): ' : 'Disclaimer: '}
            </Typography>
            {isHindi
              ? 'यह जानकारी समुदाय सदस्यों द्वारा जागरूकता हेतु साझा की गई है। अपना समाज किसी भी शासकीय विभाग का आधिकारिक प्रतिनिधि नहीं है। आवेदन से पूर्व कृपया आधिकारिक पोर्टल पर अवश्य सत्यापन करें।'
              : 'This information is shared by community members for awareness. Apna Samaj is not an official government entity. Always verify details on the official government website.'}
          </Typography>
        </View>

        {/* Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <Badge label={`🏛️ ${scheme.category}`} variant="info" size="sm" />
            <View style={styles.stateTag}>
              <Typography variant="xs" color="#475569">
                📍 {scheme.locationState}
              </Typography>
            </View>
          </View>

          <Typography variant="lg" weight="bold" color="#0F172A" style={styles.heroTitle}>
            {scheme.title}
          </Typography>

          <Typography variant="sm" weight="semibold" color="#1E40AF" style={styles.heroDepartment}>
            🏛️ {scheme.department}
          </Typography>

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Typography variant="xs" color="#64748B">
                {isHindi ? 'लक्षित लाभार्थी' : 'Beneficiaries'}
              </Typography>
              <Typography variant="xs" weight="bold" color="#0F172A" style={{ marginTop: 2 }}>
                🎯 {scheme.targetBeneficiaries}
              </Typography>
            </View>

            {scheme.deadline ? (
              <View style={styles.metricItem}>
                <Typography variant="xs" color="#64748B">
                  {isHindi ? 'अंतिम तिथि' : 'Deadline'}
                </Typography>
                <Typography variant="xs" weight="bold" color="#B91C1C" style={{ marginTop: 2 }}>
                  ⏰ {scheme.deadline}
                </Typography>
              </View>
            ) : (
              <View style={styles.metricItem}>
                <Typography variant="xs" color="#64748B">
                  {isHindi ? 'साझा तिथि' : 'Posted'}
                </Typography>
                <Typography variant="xs" weight="bold" color="#0F172A" style={{ marginTop: 2 }}>
                  🕒 {formattedTime || 'Recent'}
                </Typography>
              </View>
            )}
          </View>
        </Card>

        {/* Official Portal Action Card */}
        {scheme.officialWebsite ? (
          <Card style={styles.websiteActionCard}>
            <View style={styles.websiteRow}>
              <Typography variant="lg" style={{ marginRight: 10 }}>
                🌐
              </Typography>
              <View style={{ flex: 1 }}>
                <Typography variant="xs" weight="bold" color="#0369A1">
                  {isHindi ? 'आधिकारिक सरकारी पोर्टल' : 'Official Application Website'}
                </Typography>
                <Typography variant="xs" color="#64748B" numberOfLines={1} style={{ marginTop: 2 }}>
                  {scheme.officialWebsite}
                </Typography>
              </View>
            </View>

            <Button
              title={isHindi ? '🌐 आधिकारिक वेबसाइट खोलें ↗️' : '🌐 Open Official Portal ↗️'}
              onPress={() => handleOpenOfficialWebsite()}
              variant="primary"
              size="sm"
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : null}

        {/* Section 1: Scheme Benefits */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            ✨ {isHindi ? 'मिलने वाले लाभ व सहायता' : 'Scheme Benefits & Financial Aid'}
          </Typography>
          <Typography variant="xs" color="#334155" style={styles.sectionBody}>
            {scheme.benefits}
          </Typography>
        </Card>

        {/* Section 2: Eligibility Criteria */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            📋 {isHindi ? 'पात्रता व आवश्यक शर्तें' : 'Eligibility Criteria'}
          </Typography>
          <Typography variant="xs" color="#334155" style={styles.sectionBody}>
            {scheme.eligibility}
          </Typography>

          {(scheme.ageCriteria || scheme.incomeCriteria) && (
            <View style={styles.subCriteriaGrid}>
              {scheme.ageCriteria ? (
                <View style={styles.subCriteriaBox}>
                  <Typography variant="xs" weight="bold" color="#0F766E">
                    🎂 {isHindi ? 'आयु सीमा:' : 'Age Limit:'}
                  </Typography>
                  <Typography variant="xs" color="#334155" style={{ marginTop: 2 }}>
                    {scheme.ageCriteria}
                  </Typography>
                </View>
              ) : null}

              {scheme.incomeCriteria ? (
                <View style={styles.subCriteriaBox}>
                  <Typography variant="xs" weight="bold" color="#0F766E">
                    💰 {isHindi ? 'आय सीमा:' : 'Income Limit:'}
                  </Typography>
                  <Typography variant="xs" color="#334155" style={{ marginTop: 2 }}>
                    {scheme.incomeCriteria}
                  </Typography>
                </View>
              ) : null}
            </View>
          )}
        </Card>

        {/* Section 3: Required Documents Checklist */}
        {scheme.requiredDocuments && scheme.requiredDocuments.length > 0 ? (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              📄 {isHindi ? 'आवश्यक दस्तावेज (Checklist)' : 'Required Documents'}
            </Typography>
            <View style={styles.docsList}>
              {scheme.requiredDocuments.map((doc, idx) => (
                <View key={idx} style={styles.docItem}>
                  <Typography variant="xs" color="#059669" style={{ marginRight: 8 }}>
                    ✓
                  </Typography>
                  <Typography variant="xs" color="#334155" style={{ flex: 1 }}>
                    {doc}
                  </Typography>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Section 4: Application Process */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            📝 {isHindi ? 'आवेदन प्रक्रिया (How to Apply)' : 'Application Procedure'}
          </Typography>
          <Typography variant="xs" color="#334155" style={styles.sectionBody}>
            {scheme.applicationProcess}
          </Typography>
        </Card>

        {/* Section 5: Helpline / Department Contact */}
        {scheme.helpline ? (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              📞 {isHindi ? 'हेल्पलाइन व संपर्क' : 'Toll-Free Helpline & Contact'}
            </Typography>
            <Pressable
              onPress={() => scheme.helpline && handleCallHelpline(scheme.helpline)}
              style={styles.helplineBox}
            >
              <Typography variant="sm" weight="bold" color="#0D9488">
                📞 {scheme.helpline}
              </Typography>
              <Typography variant="xs" color="#64748B" style={{ marginTop: 2 }}>
                {isHindi ? 'कॉल करने हेतु टैप करें' : 'Tap to call'}
              </Typography>
            </Pressable>
          </Card>
        ) : null}

        {/* Section 6: Image Attachments & Circulars */}
        {scheme.mediaUrls && scheme.mediaUrls.length > 0 ? (
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
              🖼️ {isHindi ? 'संलग्न परिपत्र व दिशा-निर्देश' : 'Official Circulars & Flyers'}
            </Typography>
            <View style={styles.mediaGrid}>
              {scheme.mediaUrls.map((url, idx) => (
                <View key={idx} style={styles.mediaItem}>
                  <Image source={{ uri: url }} style={styles.mediaImage} resizeMode="cover" />
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Section 7: Full Description / Background */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            📖 {isHindi ? 'विस्तृत जानकारी' : 'Detailed Overview'}
          </Typography>
          <Typography variant="xs" color="#334155" style={styles.sectionBody}>
            {scheme.description}
          </Typography>
        </Card>

        {/* Section 8: Posted By (Community Member Profile Card) */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionHeader}>
            👤 {isHindi ? 'जानकारी साझाकर्ता' : 'Shared by Community Member'}
          </Typography>
          <View style={styles.authorRow}>
            <ProfileAvatar
              uri={scheme.authorAvatarUrl}
              name={scheme.authorName}
              size="md"
            />
            <View style={styles.authorInfo}>
              <Typography variant="sm" weight="bold" color="#0F172A">
                {scheme.authorName}
              </Typography>
              <Typography variant="xs" color="#64748B">
                {scheme.authorCity ? `📍 ${scheme.authorCity}` : 'Apna Samaj Member'} • {formattedTime}
              </Typography>
            </View>

            <Pressable
              onPress={handleMessagePoster}
              style={styles.chatIconBtn}
              accessibilityRole="button"
              accessibilityLabel="Chat with poster"
            >
              <Typography variant="sm">💬</Typography>
            </Pressable>
          </View>
        </Card>
      </ScrollView>

      {/* 3. Sticky Bottom Action Bar */}
      <View
        style={[
          styles.bottomStickyBar,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <View style={styles.actionButtonsRow}>
          {scheme.officialWebsite ? (
            <View style={{ flex: 1, marginRight: 8 }}>
              <Button
                title={isHindi ? '🌐 आधिकारिक पोर्टल ↗️' : '🌐 Official Portal ↗️'}
                onPress={() => handleOpenOfficialWebsite()}
                variant="primary"
              />
            </View>
          ) : null}

          <View style={{ flex: 1 }}>
            <Button
              title={isHindi ? '💬 समाज चैट' : '💬 Samaj Chat'}
              onPress={handleMessagePoster}
              variant={scheme.officialWebsite ? 'outline' : 'primary'}
            />
          </View>
        </View>
      </View>

      {/* 4. Delete Confirmation Dialog */}
      <ConfirmationDialog
        visible={showDeleteConfirm}
        title={isHindi ? 'सरकारी योजना पोस्ट हटाएं' : 'Delete Scheme Post'}
        message={
          isHindi
            ? 'क्या आप सचमुच इस सरकारी योजना पोस्ट को हटाना चाहते हैं? यह क्रिया पूर्ववत नहीं की जा सकती।'
            : 'Are you sure you want to delete this government scheme post? This action cannot be undone.'
        }
        confirmLabel={isHindi ? 'हटाएं' : 'Delete'}
        cancelLabel={isHindi ? 'रद्द करें' : 'Cancel'}
        variant="danger"
        loading={isDeleting}
        onConfirm={handleDeleteScheme}
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
    padding: 24,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  deleteHeaderBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  disclaimerCard: {
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  disclaimerText: {
    lineHeight: 18,
  },
  heroCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stateTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroTitle: {
    marginBottom: 6,
    lineHeight: 24,
  },
  heroDepartment: {
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  metricItem: {
    flex: 1,
  },
  websiteActionCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#F0F9FF',
    marginBottom: 12,
  },
  websiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  sectionHeader: {
    marginBottom: 8,
  },
  sectionBody: {
    lineHeight: 20,
  },
  subCriteriaGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  subCriteriaBox: {
    flex: 1,
    backgroundColor: '#F0FDFA',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  docsList: {
    gap: 6,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  helplineBox: {
    backgroundColor: '#F0FDFA',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  mediaItem: {
    width: '48%',
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  chatIconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

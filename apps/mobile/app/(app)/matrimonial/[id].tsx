import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PublicMatrimonialProfileDetail,
  MatrimonialPhotoItem,
} from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
  Input,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { matrimonialApi } from '../../../src/api/matrimonial.api';
import { formatHeightCm } from '../../../src/components/MatrimonialCard';

export default function MatrimonialProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { user, communitySlug } = useAuth();

  const [profile, setProfile] = useState<PublicMatrimonialProfileDetail | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);

  // Send Interest Modal State
  const [isInterestModalOpen, setIsInterestModalOpen] = useState<boolean>(false);
  const [interestMessage, setInterestMessage] = useState<string>('');
  const [isSubmittingInterest, setIsSubmittingInterest] = useState<boolean>(false);
  const [interestError, setInterestError] = useState<string | null>(null);
  const [interestSuccess, setInterestSuccess] = useState<string | null>(null);

  // Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('FAKE_PROFILE');
  const [reportExplanation, setReportExplanation] = useState<string>('');
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);

  // Block State
  const [isSubmittingBlock, setIsSubmittingBlock] = useState<boolean>(false);

  const loadProfile = useCallback(async () => {
    if (!id || !id.trim()) {
      setError(
        language === 'hi'
          ? 'प्रोफ़ाइल आईडी आवश्यक है।'
          : 'Profile ID is required to view details.'
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await matrimonialApi.getProfileById(id.trim());
      setProfile(data);
      setSelectedPhotoIndex(0);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'विवाह प्रोफ़ाइल लोड करने में असमर्थ।'
          : 'Failed to load matrimonial profile.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id, language]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const isOwnProfile = user?.id === profile?.userId;

  // Handle Interest
  const handleConfirmSendInterest = async () => {
    if (!profile) return;
    setIsSubmittingInterest(true);
    setInterestError(null);

    try {
      await matrimonialApi.sendInterest({
        receiverId: profile.userId,
        message: interestMessage.trim() || undefined,
      });

      setProfile((prev) => (prev ? { ...prev, interestStatus: 'PENDING' } : prev));
      setInterestSuccess(
        language === 'hi' ? 'रुचि सफलतापूर्वक भेजी गई!' : 'Interest request sent successfully!'
      );

      setTimeout(() => {
        setIsInterestModalOpen(false);
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

  // Handle Report
  const handleConfirmReport = async () => {
    if (!profile) return;
    setIsSubmittingReport(true);
    try {
      await matrimonialApi.reportProfile(profile.id, {
        reason: reportReason,
        explanation: reportExplanation.trim() || undefined,
      });
      setIsReportModalOpen(false);
      Alert.alert(
        language === 'hi' ? 'सफलता' : 'Success',
        language === 'hi'
          ? 'आपकी रिपोर्ट दर्ज कर ली गई है। समिति द्वारा समीक्षा की जाएगी।'
          : 'Your report has been submitted for community moderation review.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'रिपोर्ट दर्ज करने में त्रुटि।';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Handle Block
  const handleBlockCandidate = () => {
    if (!profile) return;
    Alert.alert(
      language === 'hi' ? 'सदस्य को ब्लॉक करें?' : 'Block Candidate?',
      language === 'hi'
        ? 'क्या आप इस सदस्य को ब्लॉक करना चाहते हैं? वे आपको खोज या संदेश नहीं भेज सकेंगे।'
        : 'Are you sure you want to block this profile? They will not be able to discover or contact you.',
      [
        { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: language === 'hi' ? 'ब्लॉक करें' : 'Block',
          style: 'destructive',
          onPress: async () => {
            setIsSubmittingBlock(true);
            try {
              await matrimonialApi.blockProfile(profile.id);
              Alert.alert(
                language === 'hi' ? 'ब्लॉक किया गया' : 'Blocked',
                language === 'hi'
                  ? 'सदस्य को सफलतापूर्वक ब्लॉक कर दिया गया है।'
                  : 'Candidate has been blocked.',
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'ब्लॉक करने में त्रुटि।';
              Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
              setIsSubmittingBlock(false);
            }
          },
        },
      ]
    );
  };

  const initial = profile?.fullName ? profile.fullName.trim().charAt(0).toUpperCase() : 'वि';

  // Photos list
  const photos: MatrimonialPhotoItem[] = profile?.photos || [];
  const activePhotoUrl =
    photos.length > 0 && photos[selectedPhotoIndex]
      ? photos[selectedPhotoIndex].url
      : profile?.primaryPhotoUrl || profile?.avatarUrl;

  const locationParts = [profile?.city, profile?.state].filter(Boolean);
  const locationText = locationParts.join(', ');

  // Helpers for localized labels
  const formatGender = (gender?: string | null) => {
    if (!gender) return '';
    return gender === 'FEMALE'
      ? language === 'hi'
        ? 'वधू (Bride)'
        : 'Bride'
      : language === 'hi'
      ? 'वर (Groom)'
      : 'Groom';
  };

  const formatMaritalStatus = (status?: string | null) => {
    switch (status) {
      case 'NEVER_MARRIED':
        return language === 'hi' ? 'अविवाहित (Never Married)' : 'Never Married';
      case 'DIVORCED':
        return language === 'hi' ? 'तलाकशुदा (Divorced)' : 'Divorced';
      case 'WIDOWED':
        return language === 'hi' ? 'विधवा/विधुर (Widowed)' : 'Widowed';
      case 'AWAITING_DIVORCE':
        return language === 'hi' ? 'तलाक प्रक्रियाधीन (Awaiting Divorce)' : 'Awaiting Divorce';
      default:
        return status || '';
    }
  };

  const formatDiet = (diet?: string | null) => {
    switch (diet) {
      case 'VEGETARIAN':
        return language === 'hi' ? 'शाकाहारी (Vegetarian)' : 'Vegetarian';
      case 'NON_VEGETARIAN':
        return language === 'hi' ? 'मांसाहारी (Non-Vegetarian)' : 'Non-Vegetarian';
      case 'EGGETARIAN':
        return language === 'hi' ? 'अंडा युक्त (Eggetarian)' : 'Eggetarian';
      case 'JAIN':
        return language === 'hi' ? 'जैन (Jain)' : 'Jain';
      default:
        return diet || '';
    }
  };

  const formatManglik = (manglik?: string | null) => {
    switch (manglik) {
      case 'MANGLIK':
        return language === 'hi' ? 'मांगलिक (Manglik)' : 'Manglik';
      case 'NON_MANGLIK':
        return language === 'hi' ? 'अमांगलिक (Non-Manglik)' : 'Non-Manglik';
      case 'ANSHIK':
        return language === 'hi' ? 'आंशिक मांगलिक (Anshik)' : 'Anshik Manglik';
      case 'DONT_KNOW':
        return language === 'hi' ? 'ज्ञात नहीं' : "Don't Know";
      default:
        return manglik || '';
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Typography variant="sm" color={theme.colors.textMuted} style={styles.loadingText}>
          {language === 'hi' ? 'विवाह प्रोफ़ाइल लोड हो रही है...' : 'Loading matrimonial profile...'}
        </Typography>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.colors.background }]}>
        <Card style={styles.errorCard}>
          <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
            ⚠️ {language === 'hi' ? 'त्रुटि' : 'Error'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorText}>
            {error || (language === 'hi' ? 'प्रोफ़ाइल नहीं मिली।' : 'Profile not found.')}
          </Typography>
          <Button
            title={language === 'hi' ? 'वापस जाएँ' : 'Go Back'}
            onPress={() => router.back()}
            variant="outline"
            size="sm"
            style={styles.backBtn}
          />
        </Card>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Header Bar */}
      <View
        style={[
          styles.headerBar,
          {
            paddingTop: Math.max(insets.top + 8, 16),
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Typography variant="md" color={theme.colors.primary}>
            ← {language === 'hi' ? 'वापस' : 'Back'}
          </Typography>
        </Pressable>

        <Typography variant="md" weight="bold" color={theme.colors.textPrimary} numberOfLines={1}>
          {profile.fullName}
        </Typography>

        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main Photo Gallery */}
        <Card style={styles.galleryCard}>
          <View style={styles.mainPhotoWrapper}>
            {activePhotoUrl && !imageError ? (
              <Image
                source={{ uri: activePhotoUrl }}
                style={[styles.mainPhoto, { borderColor: theme.colors.border }]}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.mainPhotoFallback,
                  {
                    backgroundColor: theme.colors.primaryLight,
                    borderColor: theme.colors.primary,
                  },
                ]}
              >
                <Typography variant="xl" weight="bold" color={theme.colors.primaryDark}>
                  {initial}
                </Typography>
              </View>
            )}

            {/* Verification Badge Overlay */}
            {profile.isVerified ? (
              <View style={[styles.verifiedBadgeOverlay, { backgroundColor: '#2E7D32' }]}>
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  ✓ {language === 'hi' ? 'सत्यापित प्रोफ़ाइल' : 'Verified Profile'}
                </Typography>
              </View>
            ) : null}
          </View>

          {/* Photo Thumbnails (if multiple) */}
          {photos.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailsRow}>
              {photos.map((item, index) => {
                const isSelected = index === selectedPhotoIndex;
                return (
                  <Pressable
                    key={item.id || index}
                    onPress={() => {
                      setSelectedPhotoIndex(index);
                      setImageError(false);
                    }}
                    style={[
                      styles.thumbnailWrapper,
                      {
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}
                  >
                    <Image source={{ uri: item.url }} style={styles.thumbnail} resizeMode="cover" />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Name & Quick Summary */}
          <View style={styles.quickSummaryBox}>
            <Typography variant="lg" weight="bold" color={theme.colors.textPrimary} align="center">
              {profile.fullName}
            </Typography>

            <View style={styles.badgesRow}>
              {profile.gender ? (
                <Badge
                  label={formatGender(profile.gender)}
                  variant={profile.gender === 'FEMALE' ? 'warning' : 'info'}
                />
              ) : null}
              {profile.maritalStatus ? (
                <Badge label={formatMaritalStatus(profile.maritalStatus)} variant="info" />
              ) : null}
              {profile.manglik ? (
                <Badge label={formatManglik(profile.manglik)} variant="default" />
              ) : null}
            </View>

            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.subTitleText}>
              {[
                profile.age ? `${profile.age} ${language === 'hi' ? 'वर्ष' : 'yrs'}` : null,
                formatHeightCm(profile.heightCm),
                locationText ? `📍 ${locationText}` : null,
              ]
                .filter(Boolean)
                .join(' • ')}
            </Typography>
          </View>
        </Card>

        {/* Contact Information (Privacy-Guarded) */}
        <Card style={styles.contactCard}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
            📞 {language === 'hi' ? 'संपर्क जानकारी' : 'Contact Information'}
          </Typography>

          {profile.unlockedContact?.phone ? (
            /* Unlocked Contact state: Mutual Acceptance confirmed */
            <View style={[styles.contactUnlockedBox, { backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }]}>
              <Typography variant="xs" weight="bold" color="#2E7D32" style={styles.unlockedTitle}>
                💖 {language === 'hi' ? 'संपर्क खुला है (आपसी रुचि स्वीकृत)' : 'Contact Unlocked (Mutually Accepted Interest)'}
              </Typography>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.phoneText}>
                {profile.unlockedContact.phone}
              </Typography>
              <Button
                title={language === 'hi' ? 'कॉल करें' : 'Call Member'}
                onPress={() => Linking.openURL(`tel:${profile.unlockedContact!.phone}`)}
                size="sm"
                variant="primary"
                style={styles.callBtn}
              />
            </View>
          ) : (
            /* Locked Contact state: Server-side privacy protection */
            <View style={[styles.contactLockedBox, { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' }]}>
              <Typography variant="xs" weight="bold" color="#616161">
                🔒 {language === 'hi' ? 'संपर्क जानकारी सुरक्षित है' : 'Contact Details Protected'}
              </Typography>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.lockedDesc}>
                {language === 'hi'
                  ? 'निजता और सुरक्षा के लिए सदस्य का फ़ोन नंबर केवल तभी प्रदर्शित होता है जब दोनों पक्ष रुचि अनुरोध स्वीकार कर लेते हैं।'
                  : 'For member privacy and safety, phone numbers are only disclosed when mutual interest is accepted.'}
              </Typography>
            </View>
          )}
        </Card>

        {/* Section 1: Personal & Physical Details */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
            👤 {language === 'hi' ? 'व्यक्तिगत एवं शारीरिक विवरण' : 'Personal & Physical Details'}
          </Typography>

          <View style={styles.gridContainer}>
            <DetailRow label={language === 'hi' ? 'आयु' : 'Age'} value={profile.age ? `${profile.age} ${language === 'hi' ? 'वर्ष' : 'years'}` : null} />
            <DetailRow label={language === 'hi' ? 'कद' : 'Height'} value={formatHeightCm(profile.heightCm)} />
            {profile.weightKg ? <DetailRow label={language === 'hi' ? 'वजन' : 'Weight'} value={`${profile.weightKg} kg`} /> : null}
            <DetailRow label={language === 'hi' ? 'वैवाहिक स्थिति' : 'Marital Status'} value={formatMaritalStatus(profile.maritalStatus)} />
            <DetailRow label={language === 'hi' ? 'मातृभाषा' : 'Mother Tongue'} value={profile.motherTongue} />
            <DetailRow label={language === 'hi' ? 'धर्म' : 'Religion'} value={profile.religion} />
            {profile.subCaste ? <DetailRow label={language === 'hi' ? 'उपजाति' : 'Sub-Caste'} value={profile.subCaste} /> : null}
            {profile.gotra ? <DetailRow label={language === 'hi' ? 'गोत्र' : 'Gotra'} value={profile.gotra} /> : null}
            <DetailRow label={language === 'hi' ? 'मांगलिक' : 'Manglik'} value={formatManglik(profile.manglik)} />
          </View>
        </Card>

        {/* Section 2: Astrological / Horoscope (if provided) */}
        {profile.rashi || profile.nakshatra || profile.birthTime || profile.birthCity ? (
          <Card style={styles.sectionCard}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
              ✨ {language === 'hi' ? 'कुंडली एवं ज्योतिष विवरण' : 'Horoscope & Astrological Details'}
            </Typography>

            <View style={styles.gridContainer}>
              {profile.rashi ? <DetailRow label={language === 'hi' ? 'राशि' : 'Rashi'} value={profile.rashi} /> : null}
              {profile.nakshatra ? <DetailRow label={language === 'hi' ? 'नक्षत्र' : 'Nakshatra'} value={profile.nakshatra} /> : null}
              {profile.birthTime ? <DetailRow label={language === 'hi' ? 'जन्म समय' : 'Birth Time'} value={profile.birthTime} /> : null}
              {profile.birthCity ? <DetailRow label={language === 'hi' ? 'जन्म स्थान' : 'Birth City'} value={profile.birthCity} /> : null}
            </View>
          </Card>
        ) : null}

        {/* Section 3: Education & Career */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
            🎓 {language === 'hi' ? 'शिक्षा एवं व्यवसाय' : 'Education & Profession'}
          </Typography>

          <View style={styles.gridContainer}>
            <DetailRow label={language === 'hi' ? 'सर्वोच्च शिक्षा' : 'Highest Education'} value={profile.highestEducation} />
            {profile.educationDetails ? <DetailRow label={language === 'hi' ? 'शिक्षा विवरण' : 'Education Details'} value={profile.educationDetails} /> : null}
            <DetailRow label={language === 'hi' ? 'व्यवसाय' : 'Occupation'} value={profile.occupation} />
            {profile.companyName ? <DetailRow label={language === 'hi' ? 'कंपनी / संस्थान' : 'Employer'} value={profile.companyName} /> : null}
            <DetailRow label={language === 'hi' ? 'वार्षिक आय' : 'Annual Income'} value={profile.annualIncome} />
            <DetailRow
              label={language === 'hi' ? 'कार्य स्थान' : 'Work Location'}
              value={[profile.workCity, profile.workState, profile.workCountry].filter(Boolean).join(', ') || null}
            />
          </View>
        </Card>

        {/* Section 4: Family Background */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
            👨‍👩‍👧‍👦 {language === 'hi' ? 'पारिवारिक पृष्ठभूमि' : 'Family Background'}
          </Typography>

          <View style={styles.gridContainer}>
            <DetailRow
              label={language === 'hi' ? 'परिवार का प्रकार' : 'Family Type'}
              value={profile.familyType === 'JOINT' ? (language === 'hi' ? 'संयुक्त परिवार' : 'Joint Family') : (language === 'hi' ? 'एकल परिवार' : 'Nuclear Family')}
            />
            {profile.fatherName ? <DetailRow label={language === 'hi' ? 'पिता का नाम' : "Father's Name"} value={profile.fatherName} /> : null}
            {profile.fatherOccupation ? <DetailRow label={language === 'hi' ? 'पिता का व्यवसाय' : "Father's Profession"} value={profile.fatherOccupation} /> : null}
            {profile.motherName ? <DetailRow label={language === 'hi' ? 'माता का नाम' : "Mother's Name"} value={profile.motherName} /> : null}
            {profile.motherOccupation ? <DetailRow label={language === 'hi' ? 'माता का व्यवसाय' : "Mother's Profession"} value={profile.motherOccupation} /> : null}
            <DetailRow
              label={language === 'hi' ? 'भाई' : 'Brothers'}
              value={`${profile.brothersCount || 0} (${profile.brothersMarried || 0} ${language === 'hi' ? 'विवाहित' : 'married'})`}
            />
            <DetailRow
              label={language === 'hi' ? 'बहनें' : 'Sisters'}
              value={`${profile.sistersCount || 0} (${profile.sistersMarried || 0} ${language === 'hi' ? 'विवाहित' : 'married'})`}
            />
            {profile.familyNativePlace ? <DetailRow label={language === 'hi' ? 'मूल निवास' : 'Native Place'} value={profile.familyNativePlace} /> : null}
            {profile.aboutFamily ? <DetailRow label={language === 'hi' ? 'परिवार के बारे में' : 'About Family'} value={profile.aboutFamily} /> : null}
          </View>
        </Card>

        {/* Section 5: Lifestyle */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
            🌿 {language === 'hi' ? 'खान-पान एवं जीवनशैली' : 'Lifestyle & Habits'}
          </Typography>

          <View style={styles.gridContainer}>
            <DetailRow label={language === 'hi' ? 'आहार' : 'Diet'} value={formatDiet(profile.diet)} />
            <DetailRow label={language === 'hi' ? 'धूम्रपान' : 'Smoking'} value={profile.smoking === 'NO' ? (language === 'hi' ? 'नहीं' : 'No') : profile.smoking} />
            <DetailRow label={language === 'hi' ? 'मद्यपान' : 'Drinking'} value={profile.drinking === 'NO' ? (language === 'hi' ? 'नहीं' : 'No') : profile.drinking} />
          </View>
        </Card>

        {/* Section 6: About Me & Expectations */}
        {profile.aboutMe || profile.partnerExpectations ? (
          <Card style={styles.sectionCard}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
              📝 {language === 'hi' ? 'मेरे बारे में एवं जीवनसाथी से अपेक्षाएँ' : 'About Me & Expectations'}
            </Typography>

            {profile.aboutMe ? (
              <View style={styles.narrativeSection}>
                <Typography variant="xs" weight="bold" color={theme.colors.textSecondary}>
                  {language === 'hi' ? 'मेरे बारे में:' : 'About Me:'}
                </Typography>
                <Typography variant="sm" color={theme.colors.textPrimary} style={styles.narrativeText}>
                  {profile.aboutMe}
                </Typography>
              </View>
            ) : null}

            {profile.partnerExpectations ? (
              <View style={styles.narrativeSection}>
                <Typography variant="xs" weight="bold" color={theme.colors.textSecondary}>
                  {language === 'hi' ? 'जीवनसाथी से अपेक्षाएँ:' : 'Partner Expectations:'}
                </Typography>
                <Typography variant="sm" color={theme.colors.textPrimary} style={styles.narrativeText}>
                  {profile.partnerExpectations}
                </Typography>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Section 7: Partner Preferences */}
        {profile.partnerPreference ? (
          <Card style={styles.sectionCard}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
              🎯 {language === 'hi' ? 'पार्टनर प्राथमिकताएँ' : 'Partner Preferences'}
            </Typography>

            <View style={styles.gridContainer}>
              <DetailRow
                label={language === 'hi' ? 'आयु सीमा' : 'Age Preference'}
                value={`${profile.partnerPreference.minAge || 18} - ${profile.partnerPreference.maxAge || 45} ${language === 'hi' ? 'वर्ष' : 'years'}`}
              />
              <DetailRow
                label={language === 'hi' ? 'कद सीमा' : 'Height Preference'}
                value={`${profile.partnerPreference.minHeightCm || 140} - ${profile.partnerPreference.maxHeightCm || 210} cm`}
              />
              {profile.partnerPreference.diet ? (
                <DetailRow label={language === 'hi' ? 'प्राथमिक आहार' : 'Preferred Diet'} value={formatDiet(profile.partnerPreference.diet)} />
              ) : null}
              {profile.partnerPreference.manglik ? (
                <DetailRow label={language === 'hi' ? 'मांगलिक प्राथमिकता' : 'Preferred Manglik'} value={formatManglik(profile.partnerPreference.manglik)} />
              ) : null}
              {profile.partnerPreference.notes ? (
                <DetailRow label={language === 'hi' ? 'विशेष टिप्पणी' : 'Notes'} value={profile.partnerPreference.notes} />
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Security & Action Buttons */}
        <View style={styles.actionsContainer}>
          {isOwnProfile ? (
            <Card style={styles.ownProfileNoticeCard}>
              <Typography variant="sm" weight="semibold" color={theme.colors.primary} align="center">
                ℹ️ {language === 'hi' ? 'यह आपकी अपनी विवाह प्रोफ़ाइल है।' : 'This is your own matrimonial profile.'}
              </Typography>
            </Card>
          ) : (
            <View style={styles.interestActionWrapper}>
              {profile.interestStatus === 'PENDING' ? (
                <View style={[styles.statusBox, { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' }]}>
                  <Typography variant="sm" weight="bold" color="#E65100" align="center">
                    ⏳ {language === 'hi' ? 'रुचि अनुरोध भेजा जा चुका है (प्रतीक्षारत)' : 'Interest Request Sent (Pending)'}
                  </Typography>
                </View>
              ) : profile.interestStatus === 'ACCEPTED' ? (
                <View style={[styles.statusBox, { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' }]}>
                  <Typography variant="sm" weight="bold" color="#2E7D32" align="center">
                    💖 {language === 'hi' ? 'आपसी संबंध स्वीकृत! ऊपर संपर्क नंबर देखें।' : 'Connected! Mutual interest accepted.'}
                  </Typography>
                </View>
              ) : profile.interestStatus === 'DECLINED' ? (
                <View style={[styles.statusBox, { backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }]}>
                  <Typography variant="sm" weight="bold" color="#C62828" align="center">
                    ✕ {language === 'hi' ? 'रुचि अनुरोध अस्वीकृत' : 'Interest Request Declined'}
                  </Typography>
                </View>
              ) : (
                <Button
                  title={language === 'hi' ? '💌 रुचि भेजें (Express Interest)' : '💌 Express Interest'}
                  onPress={() => setIsInterestModalOpen(true)}
                  fullWidth
                  size="md"
                  variant="primary"
                />
              )}
            </View>
          )}

          {/* Report & Block actions */}
          {!isOwnProfile ? (
            <View style={styles.safetyActionsRow}>
              <Pressable onPress={() => setIsReportModalOpen(true)} style={styles.safetyBtn}>
                <Typography variant="xs" color={theme.colors.textMuted}>
                  🚩 {language === 'hi' ? 'रिपोर्ट करें' : 'Report'}
                </Typography>
              </Pressable>
              <Pressable
                onPress={handleBlockCandidate}
                disabled={isSubmittingBlock}
                style={styles.safetyBtn}
              >
                <Typography variant="xs" color={theme.colors.error}>
                  🚫 {language === 'hi' ? 'ब्लॉक करें' : 'Block'}
                </Typography>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Express Interest Modal */}
      <Modal
        visible={isInterestModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingInterest) setIsInterestModalOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.modalTitle}>
              💌 {language === 'hi' ? 'विवाह संबंध रुचि भेजें' : 'Express Matrimonial Interest'}
            </Typography>

            <View style={[styles.targetInfoBox, { backgroundColor: theme.colors.background }]}>
              <Typography variant="sm" weight="bold" color={theme.colors.textPrimary}>
                {profile.fullName}
              </Typography>
              <Typography variant="xs" color={theme.colors.textSecondary}>
                {[profile.age ? `${profile.age} yrs` : null, profile.occupation, profile.city].filter(Boolean).join(' • ')}
              </Typography>
            </View>

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
                onPress={() => setIsInterestModalOpen(false)}
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

      {/* Report Modal */}
      <Modal
        visible={isReportModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingReport) setIsReportModalOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Typography variant="md" weight="bold" color={theme.colors.error} style={styles.modalTitle}>
              🚩 {language === 'hi' ? 'प्रोफ़ाइल रिपोर्ट करें' : 'Report Matrimonial Profile'}
            </Typography>

            <Typography variant="xs" color={theme.colors.textMuted} style={styles.reportNotice}>
              {language === 'hi'
                ? 'यदि यह प्रोफ़ाइल गलत या आपत्तिजनक है तो कारण चुनें:'
                : 'Select reason for reporting this profile:'}
            </Typography>

            <View style={styles.reasonRow}>
              {[
                { key: 'FAKE_PROFILE', hi: 'फ़र्ज़ी प्रोफ़ाइल', en: 'Fake Profile' },
                { key: 'INCORRECT_INFORMATION', hi: 'गलत जानकारी', en: 'Incorrect Info' },
                { key: 'MISLEADING_PHOTOS', hi: 'भ्रामक फ़ोटो', en: 'Misleading Photos' },
                { key: 'HARASSMENT', hi: 'दुर्व्यवहार', en: 'Harassment' },
              ].map((item) => {
                const isSelected = reportReason === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setReportReason(item.key)}
                    style={[
                      styles.reasonChip,
                      {
                        backgroundColor: isSelected ? theme.colors.error : theme.colors.background,
                        borderColor: isSelected ? theme.colors.error : theme.colors.border,
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

            <Input
              label={language === 'hi' ? 'विवरण (वैकल्पिक)' : 'Explanation (Optional)'}
              value={reportExplanation}
              onChangeText={setReportExplanation}
              placeholder={language === 'hi' ? 'अतिरिक्त विवरण लिखें...' : 'Provide additional details...'}
              maxLength={500}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActionsRow}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                onPress={() => setIsReportModalOpen(false)}
                variant="outline"
                size="sm"
                disabled={isSubmittingReport}
                style={styles.modalActionBtn}
              />
              <Button
                title={language === 'hi' ? 'रिपोर्ट भेजें' : 'Submit Report'}
                onPress={handleConfirmReport}
                loading={isSubmittingReport}
                size="sm"
                variant="primary"
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Reusable Detail Row
const DetailRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  const theme = useTheme();
  if (!value) return null;

  return (
    <View style={styles.detailRow}>
      <Typography variant="xs" color={theme.colors.textMuted} style={styles.detailLabel}>
        {label}:
      </Typography>
      <Typography variant="xs" weight="medium" color={theme.colors.textPrimary} style={styles.detailValue}>
        {value}
      </Typography>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  headerRightPlaceholder: {
    width: 48,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    maxWidth: 340,
  },
  errorText: {
    marginVertical: 12,
  },
  backBtn: {
    marginTop: 8,
  },
  galleryCard: {
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  mainPhotoWrapper: {
    position: 'relative',
    width: '100%',
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  mainPhoto: {
    width: '100%',
    height: '100%',
  },
  mainPhotoFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadgeOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  thumbnailsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    maxHeight: 64,
  },
  thumbnailWrapper: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 8,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  quickSummaryBox: {
    alignItems: 'center',
    width: '100%',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 8,
  },
  subTitleText: {
    marginTop: 2,
  },
  contactCard: {
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  contactUnlockedBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  unlockedTitle: {
    marginBottom: 6,
  },
  phoneText: {
    letterSpacing: 1,
    marginBottom: 10,
  },
  callBtn: {
    minWidth: 140,
  },
  contactLockedBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  lockedDesc: {
    marginTop: 4,
    lineHeight: 18,
  },
  sectionCard: {
    padding: 16,
    marginBottom: 12,
  },
  gridContainer: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    flex: 1,
  },
  detailValue: {
    flex: 1.5,
    textAlign: 'right',
  },
  narrativeSection: {
    marginBottom: 12,
  },
  narrativeText: {
    marginTop: 4,
    lineHeight: 20,
  },
  actionsContainer: {
    marginTop: 8,
    marginBottom: 20,
  },
  ownProfileNoticeCard: {
    padding: 14,
  },
  interestActionWrapper: {
    marginBottom: 12,
  },
  statusBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  safetyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
  },
  safetyBtn: {
    padding: 8,
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
  reportNotice: {
    marginBottom: 8,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
});

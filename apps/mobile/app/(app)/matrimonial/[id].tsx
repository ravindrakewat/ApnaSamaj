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
  AppHeader,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { matrimonialApi } from '../../../src/api/matrimonial.api';
import { formatHeightCm } from '../../../src/components/MatrimonialCard';

const DetailRow: React.FC<{ label: string; value?: string | number | null }> = ({
  label,
  value,
}) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.detailRow}>
      <Typography variant="xs" color="#64748B" style={styles.detailLabel}>
        {label}
      </Typography>
      <Typography variant="sm" weight="semibold" color="#0F172A" style={styles.detailValue}>
        {String(value)}
      </Typography>
    </View>
  );
};

export default function MatrimonialProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

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
        ? '👰 वधू'
        : 'Bride'
      : language === 'hi'
      ? '🤵 वर'
      : 'Groom';
  };

  const formatMaritalStatus = (status?: string | null) => {
    switch (status) {
      case 'NEVER_MARRIED':
        return language === 'hi' ? 'अविवाहित' : 'Never Married';
      case 'DIVORCED':
        return language === 'hi' ? 'तलाकशुदा' : 'Divorced';
      case 'WIDOWED':
        return language === 'hi' ? 'विधवा/विधुर' : 'Widowed';
      case 'AWAITING_DIVORCE':
        return language === 'hi' ? 'तलाक प्रक्रियाधीन' : 'Awaiting Divorce';
      default:
        return status || '';
    }
  };

  const formatDiet = (diet?: string | null) => {
    switch (diet) {
      case 'VEGETARIAN':
        return language === 'hi' ? 'शाकाहारी' : 'Vegetarian';
      case 'NON_VEGETARIAN':
        return language === 'hi' ? 'मांसाहारी' : 'Non-Vegetarian';
      case 'EGGETARIAN':
        return language === 'hi' ? 'अंडा युक्त' : 'Eggetarian';
      case 'JAIN':
        return language === 'hi' ? 'जैन' : 'Jain';
      default:
        return diet || '';
    }
  };

  const formatManglik = (manglik?: string | null) => {
    switch (manglik) {
      case 'MANGLIK':
        return language === 'hi' ? 'मांगलिक' : 'Manglik';
      case 'NON_MANGLIK':
        return language === 'hi' ? 'अमांगलिक' : 'Non-Manglik';
      case 'ANSHIK':
        return language === 'hi' ? 'आंशिक मांगलिक' : 'Anshik Manglik';
      case 'DONT_KNOW':
        return language === 'hi' ? 'ज्ञात नहीं' : "Don't Know";
      default:
        return manglik || '';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#1976D2" />
        <Typography variant="sm" color="#64748B" style={styles.loadingText}>
          {language === 'hi' ? 'विवाह प्रोफ़ाइल लोड हो रही है...' : 'Loading matrimonial profile...'}
        </Typography>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.errorScreen}>
        <Card style={styles.errorCard}>
          <Typography variant="md" weight="bold" color="#DC2626" align="center">
            ⚠️ {language === 'hi' ? 'त्रुटि' : 'Error'}
          </Typography>
          <Typography variant="sm" color="#475569" align="center" style={styles.errorText}>
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
    <View style={styles.screen}>
      {/* 1. Unified AppHeader (Detail Mode) */}
      <AppHeader
        mode="detail"
        title={profile.fullName}
        communitySlug={communitySlug}
        showBackButton={true}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
        rightAccessory={
          profile.userId === user?.id ? (
            <Pressable
              onPress={() => router.push('/(app)/matrimonial/manage' as any)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={language === 'hi' ? 'संपादित करें' : 'Edit Profile'}
              style={styles.editProfileHeaderBtn}
            >
              <Typography variant="xs" weight="bold" color="#1976D2">
                ✏️ {language === 'hi' ? 'संपादित करें' : 'Edit'}
              </Typography>
            </Pressable>
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 40, 60) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Main Photo Gallery & Candidate Hero Card */}
        <Card style={styles.heroCard}>
          <View style={styles.mainPhotoWrapper}>
            {activePhotoUrl && !imageError ? (
              <Image
                source={{ uri: activePhotoUrl }}
                style={styles.mainPhoto}
                onError={() => setImageError(true)}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.mainPhotoFallback}>
                <Typography variant="xl" weight="bold" color="#0369A1" style={styles.fallbackInitialText}>
                  {initial}
                </Typography>
              </View>
            )}

            {/* Verification Badge Overlay */}
            {profile.isVerified ? (
              <View style={styles.verifiedOverlay}>
                <Typography variant="xs" weight="bold" color="#FFFFFF">
                  ✓ {language === 'hi' ? 'सत्यापित प्रोफ़ाइल' : 'Verified Profile'}
                </Typography>
              </View>
            ) : null}
          </View>

          {/* Photo Thumbnails Strip (if multiple photos) */}
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
                      isSelected && styles.thumbnailWrapperSelected,
                    ]}
                  >
                    <Image source={{ uri: item.url }} style={styles.thumbnail} resizeMode="cover" />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Candidate Name & Badges */}
          <View style={styles.candidateIntroBox}>
            <Typography variant="lg" weight="bold" color="#0F172A" align="center" style={styles.candidateName}>
              {profile.fullName}
            </Typography>

            <View style={styles.badgesRow}>
              {profile.gender ? (
                <View
                  style={[
                    styles.roleBadge,
                    profile.gender === 'FEMALE' ? styles.brideBadge : styles.groomBadge,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight="bold"
                    color={profile.gender === 'FEMALE' ? '#BE185D' : '#0369A1'}
                  >
                    {formatGender(profile.gender)}
                  </Typography>
                </View>
              ) : null}

              {profile.maritalStatus ? (
                <View style={styles.metaBadge}>
                  <Typography variant="xs" weight="medium" color="#475569">
                    {formatMaritalStatus(profile.maritalStatus)}
                  </Typography>
                </View>
              ) : null}

              {profile.manglik ? (
                <View style={styles.metaBadge}>
                  <Typography variant="xs" weight="medium" color="#475569">
                    {formatManglik(profile.manglik)}
                  </Typography>
                </View>
              ) : null}
            </View>

            <Typography variant="sm" color="#64748B" align="center" style={styles.subTitleText}>
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

        {/* 3. Contact Information (Privacy-Guarded) */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
            📞 {language === 'hi' ? 'संपर्क जानकारी' : 'Contact Information'}
          </Typography>

          {profile.unlockedContact?.phone ? (
            /* Unlocked Contact state: Mutual Acceptance confirmed */
            <View style={styles.contactUnlockedBox}>
              <Typography variant="xs" weight="bold" color="#15803D" style={styles.unlockedTitle}>
                💖 {language === 'hi' ? 'संपर्क खुला है (आपसी रुचि स्वीकृत)' : 'Contact Unlocked (Mutually Accepted Interest)'}
              </Typography>
              <Typography variant="md" weight="bold" color="#0F172A" style={styles.phoneText}>
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
            <View style={styles.contactLockedBox}>
              <Typography variant="xs" weight="bold" color="#475569" style={styles.lockedHeader}>
                🔒 {language === 'hi' ? 'संपर्क जानकारी सुरक्षित है' : 'Contact Details Protected'}
              </Typography>
              <Typography variant="xs" color="#64748B" style={styles.lockedDesc}>
                {language === 'hi'
                  ? 'निजता और सुरक्षा के लिए सदस्य का फ़ोन नंबर केवल तभी प्रदर्शित होता है जब दोनों पक्ष रुचि अनुरोध स्वीकार कर लेते हैं।'
                  : 'For member privacy and safety, phone numbers are only disclosed when mutual interest is accepted.'}
              </Typography>
            </View>
          )}
        </Card>

        {/* 4. Section: Personal & Physical Details */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
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

        {/* 5. Section: Astrological / Horoscope (if provided) */}
        {profile.rashi || profile.nakshatra || profile.birthTime || profile.birthCity ? (
          <Card style={styles.sectionCard}>
            <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
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

        {/* 6. Section: Education & Career */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
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

        {/* 7. Section: Family Background */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
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

        {/* 8. Section: Lifestyle */}
        <Card style={styles.sectionCard}>
          <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
            🌿 {language === 'hi' ? 'खान-पान एवं जीवनशैली' : 'Lifestyle & Habits'}
          </Typography>

          <View style={styles.gridContainer}>
            <DetailRow label={language === 'hi' ? 'आहार' : 'Diet'} value={formatDiet(profile.diet)} />
            <DetailRow label={language === 'hi' ? 'धूम्रपान' : 'Smoking'} value={profile.smoking === 'NO' ? (language === 'hi' ? 'नहीं' : 'No') : profile.smoking} />
            <DetailRow label={language === 'hi' ? 'मद्यपान' : 'Drinking'} value={profile.drinking === 'NO' ? (language === 'hi' ? 'नहीं' : 'No') : profile.drinking} />
          </View>
        </Card>

        {/* 9. Section: About Me & Expectations */}
        {profile.aboutMe || profile.partnerExpectations ? (
          <Card style={styles.sectionCard}>
            <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
              📝 {language === 'hi' ? 'मेरे बारे में एवं जीवनसाथी से अपेक्षाएँ' : 'About Me & Expectations'}
            </Typography>

            {profile.aboutMe ? (
              <View style={styles.narrativeSection}>
                <Typography variant="xs" weight="bold" color="#64748B" style={styles.narrativeLabel}>
                  {language === 'hi' ? 'मेरे बारे में:' : 'About Me:'}
                </Typography>
                <Typography variant="sm" color="#334155" style={styles.narrativeText}>
                  {profile.aboutMe}
                </Typography>
              </View>
            ) : null}

            {profile.partnerExpectations ? (
              <View style={styles.narrativeSection}>
                <Typography variant="xs" weight="bold" color="#64748B" style={styles.narrativeLabel}>
                  {language === 'hi' ? 'जीवनसाथी से अपेक्षाएँ:' : 'Partner Expectations:'}
                </Typography>
                <Typography variant="sm" color="#334155" style={styles.narrativeText}>
                  {profile.partnerExpectations}
                </Typography>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* 10. Section: Partner Preferences */}
        {profile.partnerPreference ? (
          <Card style={styles.sectionCard}>
            <Typography variant="md" weight="bold" color="#0F172A" style={styles.sectionTitle}>
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

        {/* 11. Security & Action Buttons */}
        <View style={styles.actionsContainer}>
          {isOwnProfile ? (
            <Card style={styles.ownProfileNoticeCard}>
              <Typography variant="sm" weight="semibold" color="#1976D2" align="center">
                ℹ️ {language === 'hi' ? 'यह आपकी अपनी विवाह प्रोफ़ाइल है।' : 'This is your own matrimonial profile.'}
              </Typography>
            </Card>
          ) : (
            <View style={styles.interestActionWrapper}>
              {profile.interestStatus === 'PENDING' ? (
                <View style={[styles.statusBox, styles.pendingBox]}>
                  <Typography variant="sm" weight="bold" color="#C2410C" align="center">
                    ⏳ {language === 'hi' ? 'रुचि अनुरोध भेजा जा चुका है (प्रतीक्षारत)' : 'Interest Request Sent (Pending)'}
                  </Typography>
                </View>
              ) : profile.interestStatus === 'ACCEPTED' ? (
                <View style={[styles.statusBox, styles.acceptedBox]}>
                  <Typography variant="sm" weight="bold" color="#15803D" align="center">
                    💖 {language === 'hi' ? 'आपसी संबंध स्वीकृत! ऊपर संपर्क नंबर देखें।' : 'Connected! Mutual interest accepted.'}
                  </Typography>
                </View>
              ) : profile.interestStatus === 'DECLINED' ? (
                <View style={[styles.statusBox, styles.declinedBox]}>
                  <Typography variant="sm" weight="bold" color="#B91C1C" align="center">
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
              <Pressable onPress={() => setIsReportModalOpen(true)} style={styles.safetyBtn} hitSlop={6}>
                <Typography variant="xs" color="#64748B" weight="medium">
                  🚩 {language === 'hi' ? 'रिपोर्ट करें' : 'Report'}
                </Typography>
              </Pressable>
              <Pressable
                onPress={handleBlockCandidate}
                disabled={isSubmittingBlock}
                style={styles.safetyBtn}
                hitSlop={6}
              >
                <Typography variant="xs" color="#DC2626" weight="medium">
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
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            if (!isSubmittingInterest) setIsInterestModalOpen(false);
          }}
        >
          <Pressable
            style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom + 20, 30) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.dragHandle} />

            <Typography variant="md" weight="bold" color="#0F172A" style={styles.modalTitle}>
              💌 {language === 'hi' ? 'विवाह संबंध रुचि भेजें' : 'Express Matrimonial Interest'}
            </Typography>

            <View style={styles.targetInfoBox}>
              <Typography variant="sm" weight="bold" color="#0F172A">
                {profile.fullName}
              </Typography>
              <Typography variant="xs" color="#64748B">
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

            <View style={styles.modalActionsRow}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                onPress={() => setIsInterestModalOpen(false)}
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
          </Pressable>
        </Pressable>
      </Modal>

      {/* Report Candidate Modal */}
      <Modal
        visible={isReportModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSubmittingReport) setIsReportModalOpen(false);
        }}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => {
            if (!isSubmittingReport) setIsReportModalOpen(false);
          }}
        >
          <Pressable
            style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom + 20, 30) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.dragHandle} />

            <Typography variant="md" weight="bold" color="#0F172A" style={styles.modalTitle}>
              🚩 {language === 'hi' ? 'प्रोफ़ाइल रिपोर्ट करें' : 'Report Profile'}
            </Typography>

            <Typography variant="xs" color="#64748B" style={styles.reportSubtitle}>
              {language === 'hi'
                ? 'यदि यह प्रोफ़ाइल नियमों का उल्लंघन करती है या भ्रामक है, तो कारण चुनें:'
                : 'Select reason if this profile violates community guidelines or is misleading:'}
            </Typography>

            <View style={styles.reasonsList}>
              {[
                { key: 'FAKE_PROFILE', hi: 'फ़र्ज़ी प्रोफ़ाइल (Fake Profile)', en: 'Fake Profile' },
                { key: 'INAPPROPRIATE_CONTENT', hi: 'अनुचित सामग्री (Inappropriate)', en: 'Inappropriate Content' },
                { key: 'MISLEADING_INFO', hi: 'भ्रामक विवरण (Misleading Info)', en: 'Misleading Info' },
                { key: 'HARASSMENT', hi: 'उत्पीड़न / दुर्व्यवहार (Harassment)', en: 'Harassment' },
              ].map((reason) => {
                const isSelected = reportReason === reason.key;
                return (
                  <Pressable
                    key={reason.key}
                    onPress={() => setReportReason(reason.key)}
                    style={[
                      styles.reasonOption,
                      isSelected && styles.reasonOptionSelected,
                    ]}
                  >
                    <Typography
                      variant="xs"
                      weight={isSelected ? 'bold' : 'medium'}
                      color={isSelected ? '#1976D2' : '#334155'}
                    >
                      {language === 'hi' ? reason.hi : reason.en}
                    </Typography>
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={language === 'hi' ? 'अतिरिक्त विवरण (वैकल्पिक)' : 'Explanation (Optional)'}
              value={reportExplanation}
              onChangeText={setReportExplanation}
              placeholder="विवरण दर्ज करें..."
              multiline
              numberOfLines={2}
            />

            <View style={styles.modalActionsRow}>
              <Button
                title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                onPress={() => setIsReportModalOpen(false)}
                variant="outline"
                size="md"
                disabled={isSubmittingReport}
                style={styles.modalActionBtn}
              />
              <Button
                title={language === 'hi' ? 'रिपोर्ट भेजें' : 'Submit Report'}
                onPress={handleConfirmReport}
                loading={isSubmittingReport}
                disabled={isSubmittingReport}
                size="md"
                variant="primary"
                style={styles.modalActionBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  editProfileHeaderBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
  },
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    width: '100%',
  },
  errorText: {
    marginTop: 8,
    marginBottom: 16,
  },
  backBtn: {
    minWidth: 120,
  },
  scrollContent: {
    padding: 16,
  },
  heroCard: {
    padding: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  mainPhotoWrapper: {
    position: 'relative',
    width: '100%',
    height: 280,
    backgroundColor: '#F1F5F9',
  },
  mainPhoto: {
    width: '100%',
    height: '100%',
  },
  mainPhotoFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackInitialText: {
    fontSize: 48,
  },
  verifiedOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  thumbnailsRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  thumbnailWrapper: {
    width: 54,
    height: 54,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  thumbnailWrapperSelected: {
    borderColor: '#1976D2',
    borderWidth: 2,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  candidateIntroBox: {
    padding: 16,
    alignItems: 'center',
  },
  candidateName: {
    fontSize: 19,
    marginBottom: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  brideBadge: {
    backgroundColor: '#FCE7F3',
    borderWidth: 1,
    borderColor: '#FBCFE8',
  },
  groomBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  metaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subTitleText: {
    marginTop: 2,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 15,
  },
  gridContainer: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  detailLabel: {
    flex: 1,
    marginRight: 8,
  },
  detailValue: {
    flex: 1.5,
    textAlign: 'right',
  },
  contactUnlockedBox: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
  },
  unlockedTitle: {
    marginBottom: 6,
  },
  phoneText: {
    fontSize: 18,
    marginBottom: 10,
  },
  callBtn: {
    minWidth: 130,
  },
  contactLockedBox: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  lockedHeader: {
    marginBottom: 4,
  },
  lockedDesc: {
    textAlign: 'center',
    lineHeight: 18,
  },
  narrativeSection: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  narrativeLabel: {
    marginBottom: 4,
  },
  narrativeText: {
    lineHeight: 20,
  },
  actionsContainer: {
    marginTop: 8,
  },
  ownProfileNoticeCard: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
  },
  interestActionWrapper: {
    marginBottom: 12,
  },
  statusBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pendingBox: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  acceptedBox: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  declinedBox: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  safetyActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 10,
  },
  safetyBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
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
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
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
  reportSubtitle: {
    marginBottom: 12,
    lineHeight: 18,
  },
  reasonsList: {
    gap: 8,
    marginBottom: 14,
  },
  reasonOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reasonOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1976D2',
  },
});

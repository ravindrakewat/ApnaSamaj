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
import { PublicMemberProfile } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
  AppHeader,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { usersApi } from '../../../src/api/users.api';
import { chatApi } from '../../../src/api/chat.api';

const DetailRow: React.FC<{
  icon: string;
  label: string;
  value?: string | null;
}> = ({ icon, label, value }) => {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailLabelBox}>
        <Typography variant="xs" style={styles.rowIcon}>
          {icon}
        </Typography>
        <Typography variant="xs" color="#64748B" weight="medium">
          {label}
        </Typography>
      </View>
      <Typography variant="sm" weight="semibold" color="#0F172A" style={styles.rowValue}>
        {value || '—'}
      </Typography>
    </View>
  );
};

export default function MemberProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug } = useAuth();

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const [member, setMember] = useState<PublicMemberProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);
  const [isStartingChat, setIsStartingChat] = useState<boolean>(false);

  const loadProfile = useCallback(async () => {
    if (!id || !id.trim()) {
      setError(
        language === 'hi'
          ? 'सदस्य आईडी आवश्यक है।'
          : 'Member ID is required to view profile.'
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await usersApi.getPublicProfile(id.trim());
      setMember(data);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'सदस्य प्रोफ़ाइल लोड करने में असमर्थ।'
          : 'Failed to load member profile.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [id, language]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleStartChat = async () => {
    if (!member?.id || isStartingChat) return;

    if (user?.id === member.id) {
      Alert.alert(
        language === 'hi' ? 'सूचना' : 'Notice',
        language === 'hi' ? 'आप स्वयं को संदेश नहीं भेज सकते।' : 'You cannot message yourself.'
      );
      return;
    }

    setIsStartingChat(true);
    try {
      const conv = await chatApi.createDirectConversation(member.id);
      router.push(`/chat/${conv.id}` as any);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'चैट शुरू करने में विफल।'
          : 'Failed to start chat.';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsStartingChat(false);
    }
  };

  const initial = member?.fullName ? member.fullName.trim().charAt(0).toUpperCase() : 'स';

  const formatJoinedDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const formatGender = (gender?: string | null) => {
    if (!gender) return null;
    const upper = gender.toUpperCase();
    if (upper === 'MALE') return language === 'hi' ? 'पुरुष (Male)' : 'Male';
    if (upper === 'FEMALE') return language === 'hi' ? 'महिला (Female)' : 'Female';
    return language === 'hi' ? 'अन्य (Other)' : 'Other';
  };

  return (
    <View style={styles.screen}>
      {/* 1. Unified AppHeader (Detail Mode) */}
      <AppHeader
        mode="detail"
        title={member?.fullName || (language === 'hi' ? 'सदस्य प्रोफ़ाइल' : 'Member Profile')}
        communitySlug={communitySlug}
        showBackButton={true}
        showLanguageSwitcher={true}
        language={language}
        onLanguageToggle={toggleLanguage}
      />

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Typography variant="sm" color="#64748B" style={styles.loadingText}>
            {language === 'hi' ? 'प्रोफ़ाइल लोड हो रही है...' : 'Loading profile...'}
          </Typography>
        </View>
      ) : error || !member ? (
        <View style={styles.errorPadding}>
          <Card style={styles.errorCard}>
            <Typography variant="lg" style={styles.errorIcon}>
              👤
            </Typography>
            <Typography variant="md" weight="bold" color="#DC2626" align="center">
              {language === 'hi' ? 'प्रोफ़ाइल उपलब्ध नहीं है' : 'Profile Unavailable'}
            </Typography>
            <Typography variant="sm" color="#475569" align="center" style={styles.errorDesc}>
              {error ||
                (language === 'hi'
                  ? 'यह सदस्य प्रोफ़ाइल नहीं मिली या वर्तमान में इस समुदाय में उपलब्ध नहीं है।'
                  : 'This member profile was not found or is not currently available in this community.')}
            </Typography>
            <View style={styles.errorBtnRow}>
              <Button
                title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
                variant="primary"
                size="sm"
                onPress={loadProfile}
                style={styles.actionBtn}
              />
              <Button
                title={language === 'hi' ? 'वापस जाएं' : 'Back'}
                variant="outline"
                size="sm"
                onPress={() => router.back()}
                style={styles.actionBtn}
              />
            </View>
          </Card>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 40, 60) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* 2. Profile Header Card */}
          <Card style={styles.profileHeaderCard}>
            <View style={styles.avatarSection}>
              {member.avatarUrl && !imageError ? (
                <Image
                  source={{ uri: member.avatarUrl }}
                  style={styles.largeAvatar}
                  onError={() => setImageError(true)}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.largeAvatarFallback}>
                  <Typography variant="xl" weight="bold" color="#0369A1" style={styles.avatarInitial}>
                    {initial}
                  </Typography>
                </View>
              )}

              <Typography variant="lg" weight="bold" color="#0F172A" style={styles.profileName}>
                {member.fullName}
              </Typography>

              <View style={styles.badgesRow}>
                <View
                  style={[
                    styles.roleBadge,
                    member.role === 'COMMUNITY_ADMIN' ? styles.adminBadge : styles.memberBadge,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight="bold"
                    color={member.role === 'COMMUNITY_ADMIN' ? '#B91C1C' : '#0369A1'}
                  >
                    {member.role || 'MEMBER'}
                  </Typography>
                </View>

                {communitySlug ? (
                  <View style={styles.communityBadge}>
                    <Typography variant="xs" weight="medium" color="#475569">
                      {communitySlug}
                    </Typography>
                  </View>
                ) : null}
              </View>

              {member.joinedAt ? (
                <Typography variant="xs" color="#64748B" style={styles.joinedText}>
                  {language === 'hi'
                    ? `सदस्यता: ${formatJoinedDate(member.joinedAt)}`
                    : `Member since ${formatJoinedDate(member.joinedAt)}`}
                </Typography>
              ) : null}

              {/* Message Action Button (Disabled for self) */}
              {user?.id !== member.id ? (
                <View style={styles.messageActionContainer}>
                  <Button
                    title={language === 'hi' ? '💬 व्यक्तिगत संदेश भेजें' : '💬 Send Message'}
                    variant="primary"
                    size="md"
                    loading={isStartingChat}
                    onPress={handleStartChat}
                    style={styles.messageButton}
                  />
                </View>
              ) : null}
            </View>
          </Card>

          {/* 3. About / Bio Card */}
          {member.bio ? (
            <Card style={styles.sectionCard}>
              <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
                📝 {language === 'hi' ? 'परिचय (About)' : 'About / Bio'}
              </Typography>
              <View style={styles.bioBox}>
                <Typography variant="sm" color="#334155" style={styles.bioText}>
                  "{member.bio}"
                </Typography>
              </View>
            </Card>
          ) : null}

          {/* 4. Location & Roots Card */}
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
              🏛️ {language === 'hi' ? 'सामुदायिक एवं स्थान विवरण' : 'Community & Location Details'}
            </Typography>

            <View style={styles.detailList}>
              <DetailRow
                icon="📍"
                label={language === 'hi' ? 'स्थान' : 'Location'}
                value={[member.city, member.state].filter(Boolean).join(', ') || null}
              />
              <DetailRow
                icon="🌿"
                label={language === 'hi' ? 'गोत्र' : 'Gotra'}
                value={member.gotra}
              />
              <DetailRow
                icon="👥"
                label={language === 'hi' ? 'उप-जाति' : 'Sub-Caste'}
                value={member.subCaste}
              />
              <DetailRow
                icon="⚧️"
                label={language === 'hi' ? 'लिंग' : 'Gender'}
                value={formatGender(member.gender)}
              />
            </View>
          </Card>

          {/* 5. Privacy & Safety Information Banner */}
          <Card style={styles.privacyCard}>
            <View style={styles.privacyHeader}>
              <Typography variant="xs" weight="bold" color="#475569">
                🔒 {language === 'hi' ? 'निजता एवं सुरक्षा' : 'Privacy & Safety'}
              </Typography>
            </View>
            <Typography variant="xs" color="#64748B" style={styles.privacyDesc}>
              {language === 'hi'
                ? 'समाज के सदस्यों की गोपनीयता बनाए रखने के लिए संपर्क विवरण (फ़ोन/ईमेल) सीधे प्रदर्शित नहीं किए जाते हैं। आप "संदेश भेजें" बटन का उपयोग करके सुरक्षित संवाद कर सकते हैं।'
                : 'To protect member privacy and safety, personal contact numbers and emails are not publicly disclosed. Use the "Send Message" button above for verified and secure communication.'}
            </Typography>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
  },
  errorPadding: {
    padding: 20,
    justifyContent: 'center',
    flex: 1,
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorDesc: {
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 18,
  },
  errorBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    minWidth: 100,
  },
  scrollContent: {
    padding: 16,
  },
  profileHeaderCard: {
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  avatarSection: {
    alignItems: 'center',
  },
  largeAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#1976D2',
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  largeAvatarFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#E0F2FE',
    borderWidth: 2,
    borderColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarInitial: {
    fontSize: 34,
  },
  profileName: {
    fontSize: 19,
    marginBottom: 8,
    textAlign: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadge: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  memberBadge: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  communityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  joinedText: {
    fontSize: 12,
    marginBottom: 14,
  },
  messageActionContainer: {
    width: '100%',
    marginTop: 4,
  },
  messageButton: {
    width: '100%',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
    fontSize: 14.5,
  },
  bioBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bioText: {
    lineHeight: 20,
    fontStyle: 'italic',
  },
  detailList: {
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  detailLabelBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowIcon: {
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
  },
  privacyCard: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  privacyHeader: {
    marginBottom: 4,
  },
  privacyDesc: {
    lineHeight: 18,
  },
});

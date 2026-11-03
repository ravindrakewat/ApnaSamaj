import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PublicMemberProfile } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { usersApi } from '../../../src/api/users.api';

export default function MemberProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { language } = useLocalization();
  const { communitySlug } = useAuth();

  const [member, setMember] = useState<PublicMemberProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);

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

  const initial = member?.fullName ? member.fullName.trim().charAt(0).toUpperCase() : 'स';

  // Format joined date
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

  // Format gender label
  const formatGender = (gender?: string | null) => {
    if (!gender) return language === 'hi' ? 'निर्दिष्ट नहीं' : 'Not specified';
    const upper = gender.toUpperCase();
    if (upper === 'MALE') return language === 'hi' ? 'पुरुष' : 'Male';
    if (upper === 'FEMALE') return language === 'hi' ? 'महिला' : 'Female';
    return language === 'hi' ? 'अन्य' : 'Other';
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.headerBar,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={language === 'hi' ? 'वापस जाएं' : 'Back'}
        >
          <Typography variant="lg" weight="bold" color={theme.colors.primary}>
            ←
          </Typography>
        </Pressable>

        <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
          {language === 'hi' ? 'सदस्य प्रोफ़ाइल' : 'Member Profile'}
        </Typography>

        <View style={styles.headerSpacer} />
      </View>

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Typography variant="sm" color={theme.colors.textSecondary} style={styles.loadingText}>
            {language === 'hi' ? 'प्रोफ़ाइल लोड हो रही है...' : 'Loading profile...'}
          </Typography>
        </View>
      ) : error || !member ? (
        <View style={styles.errorPadding}>
          <Card style={styles.stateCard}>
            <Typography variant="lg" style={styles.errorIcon}>
              👤
            </Typography>
            <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
              {language === 'hi' ? 'प्रोफ़ाइल उपलब्ध नहीं है' : 'Profile Unavailable'}
            </Typography>
            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorDesc}>
              {error ||
                (language === 'hi'
                  ? 'यह सदस्य प्रोफ़ाइल नहीं मिली या वर्तमान में इस समुदाय में उपलब्ध नहीं है।'
                  : 'This member profile was not found or is not currently available in this community.')}
            </Typography>
            <View style={styles.errorBtnRow}>
              <Button
                title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
                variant="primary"
                onPress={loadProfile}
                style={styles.actionBtn}
              />
              <Button
                title={language === 'hi' ? 'वापस जाएं' : 'Back'}
                variant="outline"
                onPress={() => router.back()}
                style={styles.actionBtn}
              />
            </View>
          </Card>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Profile Header Card */}
          <Card style={styles.profileHeaderCard}>
            <View style={styles.avatarSection}>
              {member.avatarUrl && !imageError ? (
                <Image
                  source={{ uri: member.avatarUrl }}
                  style={[styles.largeAvatar, { borderColor: theme.colors.border }]}
                  onError={() => setImageError(true)}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.largeAvatarFallback,
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

              <Typography variant="lg" weight="bold" color={theme.colors.textPrimary} style={styles.profileName}>
                {member.fullName}
              </Typography>

              <View style={styles.badgesRow}>
                <Badge
                  label={member.role || 'MEMBER'}
                  variant={member.role === 'COMMUNITY_ADMIN' ? 'warning' : 'info'}
                  size="sm"
                />
                <Badge label={communitySlug} variant="default" size="sm" />
              </View>

              {member.joinedAt ? (
                <Typography variant="xs" color={theme.colors.textMuted} style={styles.joinedText}>
                  {language === 'hi'
                    ? `सदस्यता: ${formatJoinedDate(member.joinedAt)}`
                    : `Member since ${formatJoinedDate(member.joinedAt)}`}
                </Typography>
              ) : null}
            </View>
          </Card>

          {/* About / Bio Card */}
          {member.bio ? (
            <Card style={styles.sectionCard}>
              <Typography variant="sm" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
                {language === 'hi' ? 'परिचय (About)' : 'About'}
              </Typography>
              <Typography variant="sm" color={theme.colors.textSecondary} style={styles.bioText}>
                {member.bio}
              </Typography>
            </Card>
          ) : null}

          {/* Location & Roots Card */}
          <Card style={styles.sectionCard}>
            <Typography variant="sm" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
              {language === 'hi' ? 'सामुदायिक एवं स्थान विवरण' : 'Community & Location Details'}
            </Typography>

            {/* City & State */}
            <View style={styles.detailRow}>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.detailLabel}>
                {language === 'hi' ? 'स्थान' : 'Location'}:
              </Typography>
              <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary} style={styles.detailValue}>
                {[member.city, member.state].filter(Boolean).join(', ') ||
                  (language === 'hi' ? 'निर्दिष्ट नहीं' : 'Not specified')}
              </Typography>
            </View>

            {/* Gotra */}
            <View style={styles.detailRow}>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.detailLabel}>
                {language === 'hi' ? 'गोत्र' : 'Gotra'}:
              </Typography>
              <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary} style={styles.detailValue}>
                {member.gotra || (language === 'hi' ? 'निर्दिष्ट नहीं' : 'Not specified')}
              </Typography>
            </View>

            {/* Sub-Caste */}
            <View style={styles.detailRow}>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.detailLabel}>
                {language === 'hi' ? 'उप-जाति' : 'Sub-Caste'}:
              </Typography>
              <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary} style={styles.detailValue}>
                {member.subCaste || (language === 'hi' ? 'निर्दिष्ट नहीं' : 'Not specified')}
              </Typography>
            </View>

            {/* Gender */}
            <View style={styles.detailRow}>
              <Typography variant="xs" color={theme.colors.textMuted} style={styles.detailLabel}>
                {language === 'hi' ? 'लिंग' : 'Gender'}:
              </Typography>
              <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary} style={styles.detailValue}>
                {formatGender(member.gender)}
              </Typography>
            </View>
          </Card>

          {/* Privacy & Safety Information Banner */}
          <Card style={[styles.privacyCard, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <View style={styles.privacyRow}>
              <Typography variant="md" style={styles.lockIcon}>
                🔒
              </Typography>
              <View style={styles.privacyTextContainer}>
                <Typography variant="xs" weight="bold" color={theme.colors.textPrimary}>
                  {language === 'hi' ? 'गोपनीयता सुरक्षा' : 'Privacy Protection'}
                </Typography>
                <Typography variant="xs" color={theme.colors.textMuted} style={styles.privacyDesc}>
                  {language === 'hi'
                    ? 'समुदाय सुरक्षा एवं गोपनीयता नीति के तहत सदस्यों का मोबाइल नंबर व ईमेल सुरक्षित रखा गया है।'
                    : 'Personal phone numbers and emails are safeguarded under community privacy policy.'}
                </Typography>
              </View>
            </View>
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    elevation: 2,
  },
  backButton: {
    padding: 4,
  },
  headerSpacer: {
    width: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  errorPadding: {
    padding: 16,
    marginTop: 24,
  },
  stateCard: {
    padding: 24,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorDesc: {
    marginTop: 6,
    marginBottom: 20,
  },
  errorBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    minWidth: 120,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  profileHeaderCard: {
    padding: 24,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
  },
  largeAvatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },
  largeAvatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  profileName: {
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  joinedText: {
    marginTop: 2,
  },
  sectionCard: {
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6,
  },
  bioText: {
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    minWidth: 80,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
  },
  privacyCard: {
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    marginTop: 4,
    marginBottom: 20,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockIcon: {
    fontSize: 20,
  },
  privacyTextContainer: {
    flex: 1,
  },
  privacyDesc: {
    marginTop: 2,
    lineHeight: 16,
  },
});


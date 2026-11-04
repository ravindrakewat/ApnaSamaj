import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CurrentMemberProfile } from '@apnasamaj/shared-types';
import {
  Typography,
  Card,
  Button,
  Badge,
  Input,
  BottomNavigation,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { usersApi } from '../../../src/api/users.api';

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language } = useLocalization();
  const { user, communitySlug, updateUser } = useAuth();

  const [profileData, setProfileData] = useState<CurrentMemberProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);

  // Edit Profile Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editGender, setEditGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | undefined>(undefined);
  const [editBio, setEditBio] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editState, setEditState] = useState<string>('');
  const [editSubCaste, setEditSubCaste] = useState<string>('');
  const [editGotra, setEditGotra] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  /**
   * Loads personal profile from backend API
   */
  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await usersApi.getMyProfile();
      setProfileData(data);
      // Initialize edit fields
      setEditFullName(data.profile?.fullName || user?.fullName || '');
      setEditGender((data.profile?.gender as any) || undefined);
      setEditBio(data.profile?.bio || '');
      setEditCity(data.profile?.city || '');
      setEditState(data.profile?.state || '');
      setEditSubCaste(data.profile?.subCaste || '');
      setEditGotra(data.profile?.gotra || '');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'प्रोफ़ाइल लोड करने में विफल।';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  /**
   * Handle Avatar Pick & Upload
   */
  const handlePickAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          language === 'hi' ? 'अनुमति अस्वीकृत' : 'Permission Denied',
          language === 'hi'
            ? 'अवतार बदलने के लिए फ़ोटो लाइब्रेरी की अनुमति आवश्यक है।'
            : 'Photo library access is required to update avatar.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const fileSize = asset.fileSize || 0;
      if (fileSize > 5 * 1024 * 1024) {
        Alert.alert(
          language === 'hi' ? 'फ़ाइल बहुत बड़ी है' : 'File Too Large',
          language === 'hi'
            ? 'अवतार फ़ोटो का आकार 5MB से कम होना चाहिए।'
            : 'Avatar image must not exceed 5MB.'
        );
        return;
      }

      setIsUploadingAvatar(true);
      const fileName = asset.fileName || `avatar-${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';

      const uploadResult = await usersApi.uploadAvatar({
        uri: asset.uri,
        name: fileName,
        type: mimeType,
      });

      if (uploadResult?.avatarUrl) {
        setProfileData((prev) =>
          prev
            ? {
                ...prev,
                profile: prev.profile
                  ? { ...prev.profile, avatarUrl: uploadResult.avatarUrl }
                  : ({ avatarUrl: uploadResult.avatarUrl } as any),
              }
            : prev
        );
        setImageError(false);
        Alert.alert(
          language === 'hi' ? 'सफलता' : 'Success',
          language === 'hi' ? 'प्रोफ़ाइल फ़ोटो सफलतापूर्वक अपडेट हुई!' : 'Profile photo updated!'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'अवतार अपलोड करने में त्रुटि।';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  /**
   * Save Profile Updates
   */
  const handleSaveProfile = async () => {
    if (!editFullName.trim() || editFullName.trim().length < 2) {
      setEditError(
        language === 'hi'
          ? 'नाम कम से कम 2 अक्षरों का होना चाहिए।'
          : 'Full name must be at least 2 characters.'
      );
      return;
    }

    setIsSaving(true);
    setEditError(null);

    try {
      const updated = await usersApi.updateMyProfile({
        fullName: editFullName.trim(),
        gender: editGender || null,
        bio: editBio.trim() || null,
        city: editCity.trim() || null,
        state: editState.trim() || null,
        subCaste: editSubCaste.trim() || null,
        gotra: editGotra.trim() || null,
      });

      setProfileData(updated);

      // Sync user in AuthContext
      if (updated.profile?.fullName) {
        await updateUser({ fullName: updated.profile.fullName });
      }

      setIsEditModalOpen(false);
      Alert.alert(
        language === 'hi' ? 'सफलता' : 'Success',
        language === 'hi' ? 'प्रोफ़ाइल सफलतापूर्वक अपडेट हो गई!' : 'Profile updated successfully!'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'प्रोफ़ाइल अपडेट करने में विफल।';
      setEditError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const p = profileData?.profile;
  const fullName = p?.fullName || user?.fullName || (language === 'hi' ? 'समाज सदस्य' : 'Community Member');
  const initial = fullName.trim().charAt(0).toUpperCase();
  const avatarUrl = p?.avatarUrl;

  const roleLabel = profileData?.role || user?.role || 'MEMBER';
  const statusLabel = profileData?.status || user?.status || 'ACTIVE';

  const formatJoinedDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const formatGender = (gender?: string | null) => {
    if (!gender) return null;
    return gender === 'MALE'
      ? language === 'hi'
        ? 'पुरुष (Male)'
        : 'Male'
      : gender === 'FEMALE'
      ? language === 'hi'
        ? 'महिला (Female)'
        : 'Female'
      : language === 'hi'
      ? 'अन्य (Other)'
      : 'Other';
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {/* Top Header */}
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
        <Typography variant="lg" weight="bold" color={theme.colors.textPrimary}>
          {language === 'hi' ? 'मेरी प्रोफ़ाइल' : 'My Profile'}
        </Typography>

        {/* Settings Navigation Icon */}
        <Pressable
          onPress={() => router.push('/(app)/profile/settings' as any)}
          style={[styles.settingsButton, { borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={language === 'hi' ? 'सेटिंग्स खोलें' : 'Open settings'}
        >
          <Typography variant="sm">⚙️</Typography>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Typography variant="sm" color={theme.colors.textMuted} style={styles.loadingText}>
              {language === 'hi' ? 'प्रोफ़ाइल लोड हो रही है...' : 'Loading profile...'}
            </Typography>
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Typography variant="md" weight="bold" color={theme.colors.error} align="center">
              ⚠️ {language === 'hi' ? 'लोड करने में समस्या' : 'Error'}
            </Typography>
            <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.errorMsg}>
              {error}
            </Typography>
            <Button
              title={language === 'hi' ? 'पुनः प्रयास करें' : 'Retry'}
              onPress={loadProfile}
              variant="outline"
              size="sm"
            />
          </Card>
        ) : (
          <>
            {/* Header Hero Card */}
            <Card style={styles.heroCard}>
              <View style={styles.avatarWrapper}>
                {avatarUrl && !imageError ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={[styles.avatar, { borderColor: theme.colors.border }]}
                    onError={() => setImageError(true)}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.avatarFallback,
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

                {/* Edit Photo / Camera Pill Button */}
                <Pressable
                  onPress={handlePickAvatar}
                  disabled={isUploadingAvatar}
                  style={[styles.cameraPill, { backgroundColor: theme.colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel="Change avatar"
                >
                  {isUploadingAvatar ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Typography variant="xs" color="#FFFFFF">
                      📷
                    </Typography>
                  )}
                </Pressable>
              </View>

              {/* Name & Role Badges */}
              <Typography variant="lg" weight="bold" color={theme.colors.textPrimary} align="center">
                {fullName}
              </Typography>

              <View style={styles.badgeRow}>
                <Badge label={roleLabel} variant={roleLabel === 'COMMUNITY_ADMIN' ? 'error' : 'info'} size="sm" />
                <Badge label={statusLabel} variant={statusLabel === 'ACTIVE' ? 'success' : 'warning'} size="sm" />
                <Badge label={communitySlug} variant="default" size="sm" />
              </View>

              {profileData?.createdAt ? (
                <Typography variant="xs" color={theme.colors.textMuted} align="center" style={styles.joinedText}>
                  {language === 'hi' ? 'सदस्यता:' : 'Member since:'} {formatJoinedDate(profileData.createdAt)}
                </Typography>
              ) : null}

              {/* Edit Profile Trigger Button */}
              <Button
                title={language === 'hi' ? '✏️ प्रोफ़ाइल संपादित करें' : '✏️ Edit Profile'}
                onPress={() => setIsEditModalOpen(true)}
                variant="outline"
                size="sm"
                style={styles.editProfileBtn}
              />
            </Card>

            {/* Bio Section */}
            {p?.bio ? (
              <Card style={styles.infoCard}>
                <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
                  📝 {language === 'hi' ? 'परिचय (Bio)' : 'About / Bio'}
                </Typography>
                <Typography variant="sm" color={theme.colors.textSecondary} style={styles.bioText}>
                  {p.bio}
                </Typography>
              </Card>
            ) : null}

            {/* Personal & Community Details Card */}
            <Card style={styles.infoCard}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
                👤 {language === 'hi' ? 'व्यक्तिगत एवं समाज विवरण' : 'Personal & Roots Details'}
              </Typography>

              <View style={styles.detailList}>
                <ProfileRow
                  label={language === 'hi' ? 'मोबाइल नंबर' : 'Phone'}
                  value={profileData?.phone || user?.phone}
                />
                <ProfileRow
                  label={language === 'hi' ? 'लिंग' : 'Gender'}
                  value={formatGender(p?.gender)}
                />
                <ProfileRow
                  label={language === 'hi' ? 'शहर' : 'City'}
                  value={p?.city}
                />
                <ProfileRow
                  label={language === 'hi' ? 'राज्य' : 'State'}
                  value={p?.state}
                />
                <ProfileRow
                  label={language === 'hi' ? 'उपजाति' : 'Sub-Caste'}
                  value={p?.subCaste}
                />
                <ProfileRow
                  label={language === 'hi' ? 'गोत्र' : 'Gotra'}
                  value={p?.gotra}
                />
                <ProfileRow
                  label={language === 'hi' ? 'संबद्ध समुदाय' : 'Community Context'}
                  value={communitySlug}
                />
              </View>
            </Card>

            {/* Account Status & Privacy Card */}
            <Card style={styles.infoCard}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary} style={styles.sectionTitle}>
                🔒 {language === 'hi' ? 'खाता स्थिति एवं सुरक्षा' : 'Account & Privacy'}
              </Typography>

              <View style={styles.detailList}>
                <ProfileRow
                  label={language === 'hi' ? 'खाता स्थिति' : 'Account Status'}
                  value={statusLabel === 'ACTIVE' ? (language === 'hi' ? 'सक्रिय (Active)' : 'Active') : statusLabel}
                />
                <ProfileRow
                  label={language === 'hi' ? 'भूमिका' : 'Role'}
                  value={roleLabel}
                />
                <ProfileRow
                  label={language === 'hi' ? 'फ़ोन सत्यापन' : 'Phone Verified'}
                  value={profileData?.isPhoneVerified ? '✓ हाँ (Yes)' : 'प्रतीक्षारत (Pending)'}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!isSaving) setIsEditModalOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
                {language === 'hi' ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile'}
              </Typography>
              <Pressable
                onPress={() => setIsEditModalOpen(false)}
                disabled={isSaving}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Typography variant="md" color={theme.colors.textMuted}>
                  ✕
                </Typography>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <Input
                label={language === 'hi' ? 'पूरा नाम *' : 'Full Name *'}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="उदा. सुनील केवट"
              />

              {/* Gender Selector */}
              <View style={styles.formGroup}>
                <Typography variant="xs" weight="medium" color={theme.colors.textPrimary} style={styles.formLabel}>
                  {language === 'hi' ? 'लिंग (Gender):' : 'Gender:'}
                </Typography>
                <View style={styles.genderRow}>
                  {[
                    { key: 'MALE', hi: 'पुरुष', en: 'Male' },
                    { key: 'FEMALE', hi: 'महिला', en: 'Female' },
                    { key: 'OTHER', hi: 'अन्य', en: 'Other' },
                  ].map((item) => {
                    const isSelected = editGender === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => setEditGender(item.key as any)}
                        style={[
                          styles.genderChip,
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

              <Input
                label={language === 'hi' ? 'परिचय (Bio)' : 'Bio'}
                value={editBio}
                onChangeText={setEditBio}
                placeholder={language === 'hi' ? 'अपने बारे में संक्षेप में लिखें...' : 'Tell the community about yourself...'}
                maxLength={500}
                multiline
                numberOfLines={3}
                helperText={`${editBio.length} / 500`}
              />

              <View style={styles.twoColumnRow}>
                <View style={styles.colFlex}>
                  <Input
                    label={language === 'hi' ? 'शहर' : 'City'}
                    value={editCity}
                    onChangeText={setEditCity}
                    placeholder="उदा. भोपाल"
                  />
                </View>
                <View style={styles.colFlex}>
                  <Input
                    label={language === 'hi' ? 'राज्य' : 'State'}
                    value={editState}
                    onChangeText={setEditState}
                    placeholder="उदा. मध्य प्रदेश"
                  />
                </View>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.colFlex}>
                  <Input
                    label={language === 'hi' ? 'उपजाति' : 'Sub-Caste'}
                    value={editSubCaste}
                    onChangeText={setEditSubCaste}
                    placeholder="उदा. केवट"
                  />
                </View>
                <View style={styles.colFlex}>
                  <Input
                    label={language === 'hi' ? 'गोत्र' : 'Gotra'}
                    value={editGotra}
                    onChangeText={setEditGotra}
                    placeholder="उदा. कश्यप"
                  />
                </View>
              </View>

              {editError ? (
                <View style={[styles.errorBox, { backgroundColor: '#FFEBEE' }]}>
                  <Typography variant="xs" color="#C62828">
                    {editError}
                  </Typography>
                </View>
              ) : null}

              <View style={styles.modalBtnRow}>
                <Button
                  title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
                  onPress={() => setIsEditModalOpen(false)}
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  style={styles.modalBtn}
                />
                <Button
                  title={language === 'hi' ? 'सहेजें' : 'Save'}
                  onPress={handleSaveProfile}
                  loading={isSaving}
                  size="sm"
                  variant="primary"
                  style={styles.modalBtn}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNavigation activeTab="profile" />
    </View>
  );
}

// Reusable Profile Row Component
const ProfileRow: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
  const theme = useTheme();
  return (
    <View style={styles.profileRow}>
      <Typography variant="xs" color={theme.colors.textMuted} style={styles.rowLabel}>
        {label}
      </Typography>
      <Typography
        variant="xs"
        weight="medium"
        color={value ? theme.colors.textPrimary : theme.colors.textMuted}
        style={styles.rowValue}
      >
        {value || '—'}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
  },
  errorCard: {
    padding: 20,
    alignItems: 'center',
  },
  errorMsg: {
    marginVertical: 10,
  },
  heroCard: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraPill: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 8,
  },
  joinedText: {
    marginBottom: 12,
  },
  editProfileBtn: {
    minWidth: 160,
  },
  infoCard: {
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  bioText: {
    lineHeight: 20,
  },
  detailList: {
    gap: 8,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rowLabel: {
    flex: 1,
  },
  rowValue: {
    flex: 1.5,
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    borderRadius: 16,
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalScroll: {
    maxHeight: 460,
  },
  formGroup: {
    marginBottom: 10,
  },
  formLabel: {
    marginBottom: 6,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colFlex: {
    flex: 1,
  },
  errorBox: {
    padding: 8,
    borderRadius: 6,
    marginVertical: 6,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 10,
  },
  modalBtn: {
    flex: 1,
  },
});


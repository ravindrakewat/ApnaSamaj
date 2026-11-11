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
  AppHeader,
  BottomSheet,
  BottomNavigation,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { usersApi } from '../../../src/api/users.api';

const ProfileRow: React.FC<{
  icon: string;
  label: string;
  value?: string | null;
}> = ({ icon, label, value }) => {
  return (
    <View style={styles.profileRow}>
      <View style={styles.profileRowLabelBox}>
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

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
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
      ? language === 'hi' ? 'पुरुष (Male)' : 'Male'
      : gender === 'FEMALE'
        ? language === 'hi' ? 'महिला (Female)' : 'Female'
        : language === 'hi' ? 'अन्य (Other)' : 'Other';
  };

  // Calculate profile completion score
  const completionItems = [
    Boolean(fullName && fullName !== 'समाज सदस्य'),
    Boolean(avatarUrl),
    Boolean(p?.bio),
    Boolean(p?.city),
    Boolean(p?.state),
    Boolean(p?.subCaste),
    Boolean(p?.gotra),
    Boolean(profileData?.isPhoneVerified),
  ];
  const filledCount = completionItems.filter(Boolean).length;
  const completionPercent = Math.round((filledCount / completionItems.length) * 100);

  return (
    <View style={styles.screen}>
      {/* 1. Standardized Brand AppHeader with Settings Shortcut */}
      <AppHeader
        mode="brand"
        icon="👤"
        title={language === 'hi' ? 'मेरी प्रोफ़ाइल' : 'My Profile'}
        communitySlug={communitySlug}
        showProfileAvatar={false}
        rightAccessory={
          <Pressable
            onPress={() => router.push('/(app)/profile/settings' as any)}
            style={styles.settingsHeaderBtn}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'सेटिंग्स' : 'Settings'}
            hitSlop={8}
          >
            <Typography variant="sm">⚙️</Typography>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 90, 110) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1976D2" />
            <Typography variant="sm" color="#64748B" style={styles.loadingText}>
              {language === 'hi' ? 'प्रोफ़ाइल लोड हो रही है...' : 'Loading profile...'}
            </Typography>
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Typography variant="md" weight="bold" color="#DC2626" align="center">
              ⚠️ {language === 'hi' ? 'लोड करने में समस्या' : 'Error'}
            </Typography>
            <Typography variant="sm" color="#475569" align="center" style={styles.errorMsg}>
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
            {/* 2. Hero Profile Card */}
            <Card style={styles.heroCard}>
              <View style={styles.avatarWrapper}>
                {avatarUrl && !imageError ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                    onError={() => setImageError(true)}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Typography variant="xl" weight="bold" color="#0369A1" style={styles.avatarInitial}>
                      {initial}
                    </Typography>
                  </View>
                )}

                {/* Floating Camera Button */}
                <Pressable
                  onPress={handlePickAvatar}
                  disabled={isUploadingAvatar}
                  style={styles.cameraPill}
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
              <Typography variant="lg" weight="bold" color="#0F172A" align="center" style={styles.userName}>
                {fullName}
              </Typography>

              <View style={styles.badgeRow}>
                <View style={[styles.roleBadge, roleLabel === 'COMMUNITY_ADMIN' ? styles.adminBadge : styles.memberBadge]}>
                  <Typography
                    variant="xs"
                    weight="bold"
                    color={roleLabel === 'COMMUNITY_ADMIN' ? '#B91C1C' : '#0369A1'}
                  >
                    {roleLabel}
                  </Typography>
                </View>

                <View style={styles.activeBadge}>
                  <Typography variant="xs" weight="bold" color="#15803D">
                    {statusLabel === 'ACTIVE' ? '✓ सक्रिय' : statusLabel}
                  </Typography>
                </View>

                {communitySlug ? (
                  <View style={styles.communitySlugBadge}>
                    <Typography variant="xs" weight="medium" color="#475569">
                      {communitySlug}
                    </Typography>
                  </View>
                ) : null}
              </View>

              {profileData?.createdAt ? (
                <Typography variant="xs" color="#64748B" align="center" style={styles.joinedText}>
                  {language === 'hi' ? 'सदस्यता:' : 'Member since:'} {formatJoinedDate(profileData.createdAt)}
                </Typography>
              ) : null}

              {/* Quick Actions Row */}
              <View style={styles.heroActionsRow}>
                <Button
                  title={language === 'hi' ? '✏️ प्रोफ़ाइल संपादित करें' : '✏️ Edit Profile'}
                  onPress={() => setIsEditModalOpen(true)}
                  variant="primary"
                  size="sm"
                  style={styles.editActionBtn}
                />
                <Button
                  title={language === 'hi' ? '⚙️ सेटिंग्स' : '⚙️ Settings'}
                  onPress={() => router.push('/(app)/profile/settings' as any)}
                  variant="outline"
                  size="sm"
                  style={styles.settingsActionBtn}
                />
              </View>
            </Card>

            {/* 3. Profile Completion Progress Card */}
            <Card style={styles.completionCard}>
              <View style={styles.completionHeaderRow}>
                <Typography variant="xs" weight="bold" color="#0F172A">
                  📊 {language === 'hi' ? 'प्रोफ़ाइल पूर्णता' : 'Profile Completion'}
                </Typography>
                <Typography variant="xs" weight="bold" color="#1976D2">
                  {completionPercent}%
                </Typography>
              </View>

              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${completionPercent}%` }]} />
              </View>

              <Typography variant="xs" color="#64748B" style={styles.completionHint}>
                {completionPercent === 100
                  ? language === 'hi' ? 'शानदार! आपकी प्रोफ़ाइल 100% पूर्ण है।' : 'Great! Your profile is 100% complete.'
                  : language === 'hi'
                    ? 'अपनी पूरी जानकारी जोड़ने से समाज में आपकी पहचान मजबूत होती है।'
                    : 'Completing your profile strengthens your presence in the community.'}
              </Typography>
            </Card>

            {/* 4. Bio Section */}
            {p?.bio ? (
              <Card style={styles.sectionCard}>
                <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
                  📝 {language === 'hi' ? 'परिचय (About)' : 'About / Bio'}
                </Typography>
                <View style={styles.bioBox}>
                  <Typography variant="sm" color="#334155" style={styles.bioText}>
                    "{p.bio}"
                  </Typography>
                </View>
              </Card>
            ) : null}

            {/* 5. Personal & Roots Details Card */}
            <Card style={styles.sectionCard}>
              <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
                👤 {language === 'hi' ? 'व्यक्तिगत एवं समाज विवरण' : 'Personal & Roots Details'}
              </Typography>

              <View style={styles.detailList}>
                <ProfileRow
                  icon="📱"
                  label={language === 'hi' ? 'मोबाइल नंबर' : 'Phone'}
                  value={profileData?.phone || user?.phone}
                />
                <ProfileRow
                  icon="⚧️"
                  label={language === 'hi' ? 'लिंग' : 'Gender'}
                  value={formatGender(p?.gender)}
                />
                <ProfileRow
                  icon="📍"
                  label={language === 'hi' ? 'शहर' : 'City'}
                  value={p?.city}
                />
                <ProfileRow
                  icon="🏛️"
                  label={language === 'hi' ? 'राज्य' : 'State'}
                  value={p?.state}
                />
                <ProfileRow
                  icon="👥"
                  label={language === 'hi' ? 'उपजाति' : 'Sub-Caste'}
                  value={p?.subCaste}
                />
                <ProfileRow
                  icon="🌿"
                  label={language === 'hi' ? 'गोत्र' : 'Gotra'}
                  value={p?.gotra}
                />
                <ProfileRow
                  icon="🏢"
                  label={language === 'hi' ? 'संबद्ध समुदाय' : 'Community Context'}
                  value={communitySlug}
                />
              </View>
            </Card>

            {/* 6. Account Status & Privacy Card */}
            <Card style={styles.sectionCard}>
              <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
                🔒 {language === 'hi' ? 'खाता स्थिति एवं सुरक्षा' : 'Account & Privacy'}
              </Typography>

              <View style={styles.detailList}>
                <ProfileRow
                  icon="⚡"
                  label={language === 'hi' ? 'खाता स्थिति' : 'Account Status'}
                  value={statusLabel === 'ACTIVE' ? (language === 'hi' ? 'सक्रिय (Active)' : 'Active') : statusLabel}
                />
                <ProfileRow
                  icon="🛡️"
                  label={language === 'hi' ? 'भूमिका' : 'Role'}
                  value={roleLabel}
                />
                <ProfileRow
                  icon="✓"
                  label={language === 'hi' ? 'फ़ोन सत्यापन' : 'Phone Verified'}
                  value={profileData?.isPhoneVerified ? '✓ हाँ (Yes)' : 'प्रतीक्षारत (Pending)'}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>

      {/* 7. Slide-up Edit Profile Bottom Sheet */}
      <BottomSheet
        visible={isEditModalOpen}
        onClose={() => {
          if (!isSaving) setIsEditModalOpen(false);
        }}
        title={language === 'hi' ? 'प्रोफ़ाइल संपादित करें' : 'Edit Profile'}
        icon="✏️"
        preventDismiss={isSaving}
        footer={
          <View style={styles.sheetActionsRow}>
            <Button
              title={language === 'hi' ? 'रद्द करें' : 'Cancel'}
              onPress={() => setIsEditModalOpen(false)}
              variant="outline"
              size="md"
              disabled={isSaving}
              style={styles.modalActionBtn}
            />
            <Button
              title={language === 'hi' ? 'सहेजें' : 'Save Changes'}
              onPress={handleSaveProfile}
              loading={isSaving}
              disabled={isSaving}
              size="md"
              variant="primary"
              style={styles.modalActionBtn}
            />
          </View>
        }
      >
        <Input
          label={language === 'hi' ? 'पूरा नाम *' : 'Full Name *'}
          value={editFullName}
          onChangeText={setEditFullName}
          placeholder="उदा. सुनील केवट"
        />

        {/* Gender Selector Chips */}
        <View style={styles.formGroup}>
          <Typography variant="xs" weight="medium" color="#0F172A" style={styles.formLabel}>
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
                    isSelected && styles.genderChipSelected,
                  ]}
                >
                  <Typography
                    variant="xs"
                    weight={isSelected ? 'bold' : 'medium'}
                    color={isSelected ? '#1976D2' : '#475569'}
                  >
                    {language === 'hi' ? item.hi : item.en}
                  </Typography>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          label={language === 'hi' ? 'परिचय (Bio)' : 'Bio / About'}
          value={editBio}
          onChangeText={setEditBio}
          placeholder={
            language === 'hi'
              ? 'अपने बारे में या कार्यक्षेत्र का संक्षिप्त परिचय लिखें...'
              : 'Write a brief description about yourself...'
          }
          multiline
          numberOfLines={3}
        />

        <Input
          label={language === 'hi' ? 'शहर (City)' : 'City'}
          value={editCity}
          onChangeText={setEditCity}
          placeholder="उदा. भोपाल"
        />

        <Input
          label={language === 'hi' ? 'राज्य (State)' : 'State'}
          value={editState}
          onChangeText={setEditState}
          placeholder="उदा. मध्य प्रदेश"
        />

        <Input
          label={language === 'hi' ? 'उपजाति (Sub-Caste)' : 'Sub-Caste'}
          value={editSubCaste}
          onChangeText={setEditSubCaste}
          placeholder="उदा. केवट / मल्लाह"
        />

        <Input
          label={language === 'hi' ? 'गोत्र (Gotra)' : 'Gotra'}
          value={editGotra}
          onChangeText={setEditGotra}
          placeholder="उदा. कश्यप"
        />

        {editError ? (
          <View style={styles.errorBox}>
            <Typography variant="xs" color="#DC2626">
              {editError}
            </Typography>
          </View>
        ) : null}
      </BottomSheet>

      {/* Shared Bottom Navigation */}
      <BottomNavigation activeTab="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  settingsHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorMsg: {
    marginTop: 8,
    marginBottom: 16,
  },
  heroCard: {
    padding: 20,
    alignItems: 'center',
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
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: '#1976D2',
    backgroundColor: '#F1F5F9',
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E0F2FE',
    borderWidth: 2,
    borderColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 34,
  },
  cameraPill: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 2,
  },
  userName: {
    fontSize: 19,
    marginBottom: 8,
  },
  badgeRow: {
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
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  communitySlugBadge: {
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
  heroActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  editActionBtn: {
    flex: 1.2,
  },
  settingsActionBtn: {
    flex: 0.8,
  },
  completionCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  completionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBarBackground: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1976D2',
    borderRadius: 4,
  },
  completionHint: {
    fontSize: 11.5,
    lineHeight: 16,
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
    fontSize: 15,
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
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  profileRowLabelBox: {
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
  // Sheet Styles
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
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalScroll: {
    marginTop: 12,
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    marginBottom: 6,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  genderChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderChipSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1976D2',
  },
  errorBox: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    marginTop: 8,
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalActionBtn: {
    flex: 1,
  },
});

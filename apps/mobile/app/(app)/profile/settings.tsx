import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Typography,
  Card,
  Button,
  Badge,
  Input,
  AppHeader,
  ConfirmationDialog,
} from '../../../src/components';
import { useTheme } from '../../../src/hooks/useTheme';
import { useLocalization } from '../../../src/hooks/useLocalization';
import { useAuth } from '../../../src/hooks/useAuth';
import { TranslationLanguage } from '../../../src/localization/i18n';
import { notificationsApi } from '../../../src/api/notifications.api';
import { NotificationPreferencesItem } from '@apnasamaj/shared-types';

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { user, communitySlug, switchCommunity, logout, isLoading } = useAuth();

  const [newCommunitySlug, setNewCommunitySlug] = useState('');
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [isSwitchingCommunity, setIsSwitchingCommunity] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Confirmation Dialog States
  const [isLogoutDialogVisible, setIsLogoutDialogVisible] = useState(false);
  const [switchCommunityTarget, setSwitchCommunityTarget] = useState<string | null>(null);

  // Notification Preferences State
  const [preferences, setPreferences] = useState<NotificationPreferencesItem>({
    personalMessages: true,
    groupMessages: true,
    matrimonial: true,
    likes: true,
    comments: true,
    announcements: true,
    communityUpdates: true,
  });
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadPreferences() {
      try {
        const data = await notificationsApi.getNotificationPreferences();
        if (isMounted) {
          setPreferences(data);
        }
      } catch (err) {
        console.warn('[Settings] Failed to load notification preferences:', err);
      } finally {
        if (isMounted) {
          setIsLoadingPreferences(false);
        }
      }
    }
    loadPreferences();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleTogglePreference = async (key: keyof NotificationPreferencesItem) => {
    const previous = preferences[key];
    const updatedValue = !previous;

    setUpdatingKey(key);
    try {
      const result = await notificationsApi.updateNotificationPreferences({
        [key]: updatedValue,
      });
      setPreferences(result);
    } catch (err: unknown) {
      console.warn(`[Settings] Failed to update ${key} preference:`, err);
      Alert.alert(
        language === 'hi' ? 'त्रुटि' : 'Error',
        language === 'hi'
          ? 'सूचना प्राथमिकताएं सहेजने में विफल। कृपया पुनः प्रयास करें।'
          : 'Failed to update notification preference. Please try again.'
      );
    } finally {
      setUpdatingKey(null);
    }
  };

  /**
   * Change Language handler
   */
  const handleSelectLanguage = async (selectedLang: TranslationLanguage) => {
    if (selectedLang === language) return;
    try {
      await setLanguage(selectedLang);
    } catch (err: unknown) {
      console.warn('[Settings] Failed to save language preference:', err);
    }
  };

  /**
   * Confirm and switch community
   */
  const handleSwitchCommunity = () => {
    const target = newCommunitySlug.trim().toLowerCase();
    if (!target) {
      setCommunityError(
        language === 'hi'
          ? 'कृपया समुदाय का कोड (slug) दर्ज करें।'
          : 'Please enter a community slug.'
      );
      return;
    }

    if (target === communitySlug.toLowerCase()) {
      setCommunityError(
        language === 'hi'
          ? 'आप पहले से इसी समुदाय में हैं।'
          : 'You are already in this community.'
      );
      return;
    }

    setCommunityError(null);
    setSwitchCommunityTarget(target);
  };

  const executeCommunitySwitch = async () => {
    if (!switchCommunityTarget) return;
    const target = switchCommunityTarget;
    setIsSwitchingCommunity(true);
    try {
      await switchCommunity(target);
      setSwitchCommunityTarget(null);
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'समुदाय बदलने में असमर्थ।';
      setCommunityError(msg);
      setIsSwitchingCommunity(false);
      setSwitchCommunityTarget(null);
    }
  };

  /**
   * Logout Handler
   */
  const handleLogout = () => {
    setIsLogoutDialogVisible(true);
  };

  const performLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setIsLogoutDialogVisible(false);
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'लॉगआउट में त्रुटि हुई।';
      Alert.alert(language === 'hi' ? 'त्रुटि' : 'Error', msg);
    } finally {
      setIsLoggingOut(false);
      setIsLogoutDialogVisible(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* 1. Unified AppHeader (Detail Mode) */}
      <AppHeader
        mode="detail"
        title={language === 'hi' ? 'सेटिंग्स एवं प्राथमिकताएं' : 'Settings & Preferences'}
        communitySlug={communitySlug}
        showBackButton={true}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom + 40, 60) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Language Preferences Section */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
            🌐 {language === 'hi' ? 'भाषा प्राथमिकता (Language)' : 'Language Preferences'}
          </Typography>

          <Typography variant="xs" color="#64748B" style={styles.sectionSubtitle}>
            {language === 'hi'
              ? 'ऐप इंटरफ़ेस के लिए पसंदीदा भाषा चुनें:'
              : 'Select your preferred language for the application interface:'}
          </Typography>

          <View style={styles.languageOptionsRow}>
            {/* Hindi Card */}
            <Pressable
              onPress={() => handleSelectLanguage('hi')}
              style={[
                styles.languageCard,
                language === 'hi' && styles.languageCardActive,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: language === 'hi' }}
            >
              <View style={styles.languageCardHeader}>
                <Typography variant="md" weight="bold" color={language === 'hi' ? '#1976D2' : '#0F172A'}>
                  हिंदी
                </Typography>
                {language === 'hi' && (
                  <View style={styles.checkPill}>
                    <Typography variant="xs" weight="bold" color="#FFFFFF">
                      ✓
                    </Typography>
                  </View>
                )}
              </View>
              <Typography variant="xs" color={language === 'hi' ? '#1976D2' : '#64748B'}>
                Hindi (हिन्दी)
              </Typography>
            </Pressable>

            {/* English Card */}
            <Pressable
              onPress={() => handleSelectLanguage('en')}
              style={[
                styles.languageCard,
                language === 'en' && styles.languageCardActive,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: language === 'en' }}
            >
              <View style={styles.languageCardHeader}>
                <Typography variant="md" weight="bold" color={language === 'en' ? '#1976D2' : '#0F172A'}>
                  English
                </Typography>
                {language === 'en' && (
                  <View style={styles.checkPill}>
                    <Typography variant="xs" weight="bold" color="#FFFFFF">
                      ✓
                    </Typography>
                  </View>
                )}
              </View>
              <Typography variant="xs" color={language === 'en' ? '#1976D2' : '#64748B'}>
                English
              </Typography>
            </Pressable>
          </View>
        </Card>

        {/* 3. Community Context & Multi-Tenant Switching */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
            🏛️ {language === 'hi' ? 'समुदाय स्विच करें (Community)' : 'Switch Community'}
          </Typography>

          <View style={styles.currentCommunityRow}>
            <Typography variant="xs" color="#64748B" weight="medium">
              {language === 'hi' ? 'वर्तमान समुदाय:' : 'Current Community:'}
            </Typography>
            <View style={styles.currentSlugBadge}>
              <Typography variant="xs" weight="bold" color="#0369A1">
                {communitySlug}
              </Typography>
            </View>
          </View>

          {/* Tenant Isolation Security Warning */}
          <View style={styles.warningBox}>
            <Typography variant="xs" color="#92400E" style={styles.warningText}>
              ⚠️ {language === 'hi'
                ? 'अपना समाज का प्रत्येक समुदाय एक अलग, सुरक्षित डेटाबेस में संग्रहीत है। समुदाय बदलने से वर्तमान सत्र समाप्त हो जाएगा।'
                : 'Each Apna Samaj community is isolated in a separate, secure database. Switching communities terminates your active session.'}
            </Typography>
          </View>

          <Input
            label={language === 'hi' ? 'नया समुदाय कोड (Slug)' : 'New Community Slug'}
            value={newCommunitySlug}
            onChangeText={(txt) => {
              setNewCommunitySlug(txt);
              setCommunityError(null);
            }}
            placeholder="उदा. kewat, gupta, rathore"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {communityError ? (
            <View style={styles.errorBox}>
              <Typography variant="xs" color="#DC2626">
                {communityError}
              </Typography>
            </View>
          ) : null}

          <Button
            title={language === 'hi' ? 'समुदाय बदलें' : 'Switch Community'}
            onPress={handleSwitchCommunity}
            loading={isSwitchingCommunity}
            disabled={isSwitchingCommunity || !newCommunitySlug.trim()}
            variant="outline"
            size="md"
            style={styles.switchBtn}
          />
        </Card>

        {/* 4. Notification Preferences */}
        <Card style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
              🔔 {language === 'hi' ? 'सूचना प्राथमिकताएं' : 'Notification Preferences'}
            </Typography>
            <Pressable
              onPress={() => router.push('/(app)/notifications' as any)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={language === 'hi' ? 'सूचनाएं देखें' : 'View notifications'}
            >
              <Typography variant="xs" weight="bold" color="#1976D2">
                {language === 'hi' ? 'इनबॉक्स देखें →' : 'View Inbox →'}
              </Typography>
            </Pressable>
          </View>

          <Typography variant="xs" color="#64748B" style={styles.sectionSubtitle}>
            {language === 'hi'
              ? 'चुनें कि आप किन गतिविधियों के लिए पुश सूचनाएं प्राप्त करना चाहते हैं:'
              : 'Choose which activities you receive push notifications for:'}
          </Typography>

          {isLoadingPreferences ? (
            <View style={styles.preferencesLoading}>
              <ActivityIndicator size="small" color="#1976D2" />
              <Typography variant="xs" color="#64748B" style={styles.loadingPrefText}>
                {language === 'hi' ? 'प्राथमिकताएं लोड हो रही हैं...' : 'Loading preferences...'}
              </Typography>
            </View>
          ) : (
            <View style={styles.preferenceRows}>
              {[
                {
                  key: 'personalMessages' as const,
                  labelHi: 'व्यक्तिगत संदेश (Private Messages)',
                  labelEn: 'Direct Messages',
                  descHi: 'जब कोई सदस्य आपको व्यक्तिगत संदेश भेजे',
                  descEn: 'When another member sends you a direct message',
                },
                {
                  key: 'groupMessages' as const,
                  labelHi: 'समूह संदेश (Group Chat)',
                  labelEn: 'Group Messages',
                  descHi: 'आपके जुड़े समूहों में नए संदेश',
                  descEn: 'New messages in your joined groups',
                },
                {
                  key: 'matrimonial' as const,
                  labelHi: 'विवाह संबंध रुचियाँ (Matrimonial)',
                  labelEn: 'Matrimonial Interests',
                  descHi: 'जब कोई सदस्य विवाह संबंध में रुचि व्यक्त करे',
                  descEn: 'When someone expresses matrimonial interest',
                },
                {
                  key: 'announcements' as const,
                  labelHi: 'घोषणाएं एवं नोटिस (Announcements)',
                  labelEn: 'Announcements',
                  descHi: 'समाज प्रशासक द्वारा प्रकाशित आधिकारिक घोषणाएं',
                  descEn: 'Official notices posted by community administrators',
                },
                {
                  key: 'communityUpdates' as const,
                  labelHi: 'सामुदायिक कार्यक्रम (Events & Updates)',
                  labelEn: 'Community Updates',
                  descHi: 'आगामी सामाजिक कार्यक्रम और सूचनाएं',
                  descEn: 'Upcoming community programs and activities',
                },
                {
                  key: 'comments' as const,
                  labelHi: 'पोस्ट टिप्पणियाँ (Comments)',
                  labelEn: 'Post Comments',
                  descHi: 'आपकी पोस्ट पर नई टिप्पणियों की सूचना',
                  descEn: 'When members comment on your posts',
                },
              ].map((item) => {
                const isEnabled = preferences[item.key];
                const isUpdating = updatingKey === item.key;
                return (
                  <View key={item.key} style={styles.prefRow}>
                    <View style={styles.prefLabelBox}>
                      <Typography variant="sm" weight="semibold" color="#0F172A">
                        {language === 'hi' ? item.labelHi : item.labelEn}
                      </Typography>
                      <Typography variant="xs" color="#64748B" style={styles.prefDesc}>
                        {language === 'hi' ? item.descHi : item.descEn}
                      </Typography>
                    </View>
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#1976D2" style={styles.prefLoader} />
                    ) : (
                      <Switch
                        value={isEnabled}
                        onValueChange={() => handleTogglePreference(item.key)}
                        trackColor={{ false: '#CBD5E1', true: '#90CAF9' }}
                        thumbColor={isEnabled ? '#1976D2' : '#F1F5F9'}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* 5. Account Security & Verification */}
        <Card style={styles.sectionCard}>
          <Typography variant="sm" weight="bold" color="#0F172A" style={styles.sectionTitle}>
            🔒 {language === 'hi' ? 'सुरक्षा एवं सत्यापन' : 'Account Security'}
          </Typography>

          <View style={styles.securityRow}>
            <View>
              <Typography variant="xs" color="#64748B" weight="medium">
                {language === 'hi' ? 'फ़ोन सत्यापन स्थिति' : 'Phone Verification'}
              </Typography>
              <Typography variant="sm" weight="bold" color="#0F172A">
                {user?.phone ? `+91 ${user.phone}` : '—'}
              </Typography>
            </View>
            <View style={styles.verifiedStatusPill}>
              <Typography variant="xs" weight="bold" color="#15803D">
                ✓ {language === 'hi' ? 'सत्यापित' : 'Verified'}
              </Typography>
            </View>
          </View>
        </Card>

        {/* 6. Logout Section */}
        <Card style={styles.logoutCard}>
          <Typography variant="sm" weight="bold" color="#DC2626" style={styles.sectionTitle}>
            🚪 {language === 'hi' ? 'सत्र समाप्त करें (Logout)' : 'End Session (Logout)'}
          </Typography>

          <Typography variant="xs" color="#64748B" style={styles.logoutDesc}>
            {language === 'hi'
              ? 'लॉगआउट करने से आपके डिवाइस से सक्रिय क्रेडेंशियल सुरक्षित रूप से हटा दिए जाएंगे।'
              : 'Logging out terminates your current active session and securely clears device auth tokens.'}
          </Typography>

          <Button
            title={language === 'hi' ? 'लॉगआउट करें' : 'Logout of Account'}
            onPress={handleLogout}
            loading={isLoggingOut}
            disabled={isLoggingOut}
            variant="outline"
            size="md"
            style={styles.logoutBtn}
          />
        </Card>
      </ScrollView>

      {/* Switch Community Confirmation Dialog */}
      <ConfirmationDialog
        visible={Boolean(switchCommunityTarget)}
        title={language === 'hi' ? 'समुदाय बदलें?' : 'Switch Community?'}
        message={
          language === 'hi'
            ? `समुदाय "${switchCommunityTarget || ''}" में बदलने से आपका वर्तमान सत्र समाप्त हो जाएगा ताकि समुदाय डेटा अलग और सुरक्षित रहे।`
            : `Switching to "${switchCommunityTarget || ''}" will terminate your current session to maintain physical tenant isolation.`
        }
        confirmLabel={language === 'hi' ? 'हाँ, बदलें' : 'Switch'}
        cancelLabel={language === 'hi' ? 'रद्द करें' : 'Cancel'}
        variant="warning"
        icon="🔄"
        loading={isSwitchingCommunity}
        onConfirm={executeCommunitySwitch}
        onCancel={() => setSwitchCommunityTarget(null)}
      />

      {/* Logout Confirmation Dialog */}
      <ConfirmationDialog
        visible={isLogoutDialogVisible}
        title={language === 'hi' ? 'लॉगआउट की पुष्टि' : 'Confirm Logout'}
        message={
          language === 'hi'
            ? 'क्या आप निश्चित रूप से अपना सत्र समाप्त करना चाहते हैं? सुरक्षित क्रेडेंशियल डिवाइस से हटा दिए जाएंगे।'
            : 'Are you sure you want to log out? Your secure credentials will be removed from this device.'
        }
        confirmLabel={language === 'hi' ? 'लॉगआउट' : 'Logout'}
        cancelLabel={language === 'hi' ? 'रद्द करें' : 'Cancel'}
        variant="danger"
        icon="🚪"
        loading={isLoggingOut}
        onConfirm={performLogout}
        onCancel={() => setIsLogoutDialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  sectionTitle: {
    marginBottom: 4,
    fontSize: 14.5,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  languageOptionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  languageCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  languageCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1976D2',
  },
  languageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  checkPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentCommunityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  currentSlugBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  warningBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  warningText: {
    lineHeight: 17,
  },
  errorBox: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    marginBottom: 10,
  },
  switchBtn: {
    marginTop: 4,
  },
  preferencesLoading: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingPrefText: {
    marginTop: 8,
  },
  preferenceRows: {
    gap: 14,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  prefLabelBox: {
    flex: 1,
    marginRight: 12,
  },
  prefDesc: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
  },
  prefLoader: {
    paddingHorizontal: 12,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  verifiedStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  logoutCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 12,
  },
  logoutDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  logoutBtn: {
    borderColor: '#DC2626',
  },
});

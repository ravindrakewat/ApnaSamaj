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
  BottomNavigation,
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

    const title = language === 'hi' ? 'समुदाय बदलें?' : 'Switch Community?';
    const message =
      language === 'hi'
        ? `समुदाय "${target}" में बदलने से आपका वर्तमान सत्र समाप्त हो जाएगा। क्या आप जारी रखना चाहते हैं?`
        : `Switching to "${target}" will terminate your current session to maintain tenant isolation. Do you wish to continue?`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(message);
      if (confirmed) {
        executeCommunitySwitch(target);
      }
    } else {
      Alert.alert(title, message, [
        { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: language === 'hi' ? 'हाँ, बदलें' : 'Switch',
          style: 'destructive',
          onPress: () => executeCommunitySwitch(target),
        },
      ]);
    }
  };

  const executeCommunitySwitch = async (slug: string) => {
    setIsSwitchingCommunity(true);
    try {
      await switchCommunity(slug);
      // NavigationGate in root _layout will automatically route to login
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'समुदाय बदलने में असमर्थ।';
      setCommunityError(msg);
      setIsSwitchingCommunity(false);
    }
  };

  /**
   * Confirm and Logout
   */
  const handleLogout = () => {
    const title = language === 'hi' ? 'लॉगआउट' : 'Log Out';
    const message =
      language === 'hi'
        ? 'क्या आप सचमुच अपने खाते से लॉगआउट करना चाहते हैं?'
        : 'Are you sure you want to log out from your account?';

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(message);
      if (confirmed) {
        executeLogout();
      }
    } else {
      Alert.alert(title, message, [
        { text: language === 'hi' ? 'रद्द करें' : 'Cancel', style: 'cancel' },
        {
          text: language === 'hi' ? 'लॉगआउट' : 'Log Out',
          style: 'destructive',
          onPress: executeLogout,
        },
      ]);
    }
  };

  const executeLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      // NavigationGate in root _layout will automatically route to login
    } catch (err: unknown) {
      console.warn('[Settings] Logout error:', err);
      setIsLoggingOut(false);
    }
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
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { borderColor: theme.colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={language === 'hi' ? 'वापस जाएं' : 'Go back'}
        >
          <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
            ←
          </Typography>
        </Pressable>

        <Typography variant="lg" weight="bold" color={theme.colors.textPrimary} style={styles.headerTitle}>
          {language === 'hi' ? 'सेटिंग्स' : 'Settings'}
        </Typography>

        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Section 1: Language Preference */}
        <Typography variant="sm" weight="bold" color={theme.colors.textMuted} style={styles.sectionHeader}>
          {language === 'hi' ? 'भाषा प्राथमिकता (LANGUAGE)' : 'LANGUAGE PREFERENCE'}
        </Typography>

        <Card style={styles.sectionCard}>
          {/* Hindi Option */}
          <Pressable
            onPress={() => handleSelectLanguage('hi')}
            style={[
              styles.optionRow,
              {
                borderColor: language === 'hi' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'hi' ? theme.colors.primaryLight : theme.colors.surface,
              },
            ]}
          >
            <View style={styles.optionTextContainer}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
                हिन्दी (Hindi)
              </Typography>
              <Typography variant="xs" color={theme.colors.textSecondary}>
                मातृभाषा एवं समाज संवाद हेतु
              </Typography>
            </View>
            <View
              style={[
                styles.radioIndicator,
                {
                  borderColor: language === 'hi' ? theme.colors.primary : theme.colors.borderStrong,
                  backgroundColor: language === 'hi' ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              {language === 'hi' && <View style={styles.radioInner} />}
            </View>
          </Pressable>

          {/* English Option */}
          <Pressable
            onPress={() => handleSelectLanguage('en')}
            style={[
              styles.optionRow,
              styles.optionRowSpaced,
              {
                borderColor: language === 'en' ? theme.colors.primary : theme.colors.border,
                backgroundColor: language === 'en' ? theme.colors.primaryLight : theme.colors.surface,
              },
            ]}
          >
            <View style={styles.optionTextContainer}>
              <Typography variant="md" weight="bold" color={theme.colors.textPrimary}>
                English (अंग्रेजी)
              </Typography>
              <Typography variant="xs" color={theme.colors.textSecondary}>
                Standard interface in English
              </Typography>
            </View>
            <View
              style={[
                styles.radioIndicator,
                {
                  borderColor: language === 'en' ? theme.colors.primary : theme.colors.borderStrong,
                  backgroundColor: language === 'en' ? theme.colors.primary : 'transparent',
                },
              ]}
            >
              {language === 'en' && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        </Card>

        {/* Section 2: Community Context & Multi-Tenant Switcher */}
        <Typography variant="sm" weight="bold" color={theme.colors.textMuted} style={styles.sectionHeader}>
          {language === 'hi' ? 'समाज समुदाय (COMMUNITY CONTEXT)' : 'COMMUNITY CONTEXT'}
        </Typography>

        <Card style={styles.sectionCard}>
          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'वर्तमान समुदाय:' : 'Active Community:'}
            </Typography>
            <Badge label={communitySlug.toUpperCase()} variant="info" size="sm" />
          </View>

          <View style={[styles.warningBox, { backgroundColor: theme.colors.warningLight, borderColor: theme.colors.warning }]}>
            <Typography variant="xs" color={theme.colors.textPrimary}>
              {language === 'hi'
                ? '⚠️ सुरक्षा सूचना: अपना समाज बहु-समुदाय (Multi-Tenant) सुरक्षित प्रणाली है। समुदाय बदलने पर पुराना सत्र समाप्त हो जाएगा ताकि कोई डेटा लीक न हो।'
                : '⚠️ Tenant Isolation: Apna Samaj preserves physical database isolation. Switching communities terminates the active session to prevent cross-tenant data leakage.'}
            </Typography>
          </View>

          <View style={styles.switchForm}>
            <Input
              label={language === 'hi' ? 'नया समुदाय कोड (Slug)' : 'New Community Slug'}
              placeholder="e.g. demo, kewat, maheshwari"
              value={newCommunitySlug}
              onChangeText={(text) => {
                setNewCommunitySlug(text);
                setCommunityError(null);
              }}
              autoCapitalize="none"
              error={communityError || undefined}
            />

            <Button
              title={
                isSwitchingCommunity
                  ? language === 'hi'
                    ? 'बदला जा रहा है...'
                    : 'Switching...'
                  : language === 'hi'
                    ? 'समुदाय बदलें'
                    : 'Switch Community'
              }
              onPress={handleSwitchCommunity}
              disabled={isSwitchingCommunity || !newCommunitySlug.trim()}
              loading={isSwitchingCommunity}
              variant="outline"
              size="md"
              style={styles.switchBtn}
            />
          </View>
        </Card>

        {/* Section 3: Notification Preferences (FCM) */}
        <Typography variant="sm" weight="bold" color={theme.colors.textMuted} style={styles.sectionHeader}>
          {language === 'hi' ? 'सूचनाएं व अलर्ट (NOTIFICATION PREFERENCES)' : 'NOTIFICATION PREFERENCES'}
        </Typography>

        <Card style={styles.sectionCard}>
          {isLoadingPreferences ? (
            <View style={{ padding: 16, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} size="small" />
            </View>
          ) : (
            <>
              {/* Personal Messages */}
              <View style={styles.preferenceRow}>
                <View style={styles.preferenceText}>
                  <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
                    {language === 'hi' ? 'व्यक्तिगत संदेश (Direct Messages)' : 'Personal Messages'}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textSecondary}>
                    {language === 'hi' ? 'निजी बातचीत के नए संदेश' : 'Direct one-to-one chat messages'}
                  </Typography>
                </View>
                <Switch
                  value={preferences.personalMessages}
                  onValueChange={() => handleTogglePreference('personalMessages')}
                  disabled={updatingKey === 'personalMessages'}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                  thumbColor={preferences.personalMessages ? theme.colors.primary : theme.colors.borderStrong}
                />
              </View>

              {/* Group Messages */}
              <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
                <View style={styles.preferenceText}>
                  <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
                    {language === 'hi' ? 'समूह संदेश (Group Chat)' : 'Group Messages'}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textSecondary}>
                    {language === 'hi' ? 'समाज समूहों के संदेश' : 'Community group chat notifications'}
                  </Typography>
                </View>
                <Switch
                  value={preferences.groupMessages}
                  onValueChange={() => handleTogglePreference('groupMessages')}
                  disabled={updatingKey === 'groupMessages'}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                  thumbColor={preferences.groupMessages ? theme.colors.primary : theme.colors.borderStrong}
                />
              </View>

              {/* Matrimonial */}
              <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
                <View style={styles.preferenceText}>
                  <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
                    {language === 'hi' ? 'वैवाहिक रिश्ते व रुचि (Matrimonial)' : 'Matrimonial'}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textSecondary}>
                    {language === 'hi' ? 'नई रुचि और स्वीकृत प्रस्ताव' : 'Interest requests & match updates'}
                  </Typography>
                </View>
                <Switch
                  value={preferences.matrimonial}
                  onValueChange={() => handleTogglePreference('matrimonial')}
                  disabled={updatingKey === 'matrimonial'}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                  thumbColor={preferences.matrimonial ? theme.colors.primary : theme.colors.borderStrong}
                />
              </View>

              {/* Likes & Comments */}
              <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
                <View style={styles.preferenceText}>
                  <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
                    {language === 'hi' ? 'पसंद व टिप्पणियाँ (Social Activity)' : 'Likes & Comments'}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textSecondary}>
                    {language === 'hi' ? 'आपकी पोस्ट पर प्रतिक्रियाएं' : 'Reactions and comments on your posts'}
                  </Typography>
                </View>
                <Switch
                  value={preferences.likes && preferences.comments}
                  onValueChange={() => {
                    handleTogglePreference('likes');
                    handleTogglePreference('comments');
                  }}
                  disabled={updatingKey === 'likes' || updatingKey === 'comments'}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                  thumbColor={preferences.likes ? theme.colors.primary : theme.colors.borderStrong}
                />
              </View>

              {/* Announcements & Community Updates */}
              <View style={[styles.preferenceRow, styles.preferenceRowBorder]}>
                <View style={styles.preferenceText}>
                  <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
                    {language === 'hi' ? 'घोषणाएं व समाज सूचनाएं' : 'Announcements & Updates'}
                  </Typography>
                  <Typography variant="xs" color={theme.colors.textSecondary}>
                    {language === 'hi' ? 'महत्वपूर्ण सामाजिक सूचनाएं' : 'Important community announcements'}
                  </Typography>
                </View>
                <Switch
                  value={preferences.announcements}
                  onValueChange={() => handleTogglePreference('announcements')}
                  disabled={updatingKey === 'announcements'}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primaryLight }}
                  thumbColor={preferences.announcements ? theme.colors.primary : theme.colors.borderStrong}
                />
              </View>
            </>
          )}
        </Card>

        {/* Section 4: Account & Security */}
        <Typography variant="sm" weight="bold" color={theme.colors.textMuted} style={styles.sectionHeader}>
          {language === 'hi' ? 'खाता एवं सुरक्षा (ACCOUNT & SECURITY)' : 'ACCOUNT & SECURITY'}
        </Typography>

        <Card style={styles.sectionCard}>
          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'मोबाइल नंबर:' : 'Registered Phone:'}
            </Typography>
            <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
              {user?.phone ? `+91 ${user.phone}` : '—'}
            </Typography>
          </View>

          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'भूमिका (Role):' : 'Role:'}
            </Typography>
            <Badge label={user?.role || 'MEMBER'} variant="info" size="sm" />
          </View>

          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'खाता स्थिति:' : 'Status:'}
            </Typography>
            <Badge label={user?.status || 'ACTIVE'} variant="success" size="sm" />
          </View>

          <View style={styles.logoutContainer}>
            <Button
              title={
                isLoggingOut || isLoading
                  ? language === 'hi'
                    ? 'लॉगआउट हो रहा है...'
                    : 'Logging out...'
                  : language === 'hi'
                    ? '🚪 लॉगआउट करें (Log Out)'
                    : '🚪 Log Out'
              }
              onPress={handleLogout}
              disabled={isLoggingOut || isLoading}
              loading={isLoggingOut}
              variant="outline"
              size="md"
              style={{ ...styles.logoutBtn, borderColor: theme.colors.error }}
              textStyle={{ color: theme.colors.error }}
            />
          </View>
        </Card>

        {/* Section 4: App Information */}
        <Typography variant="sm" weight="bold" color={theme.colors.textMuted} style={styles.sectionHeader}>
          {language === 'hi' ? 'ऐप विवरण (APP INFORMATION)' : 'APP INFORMATION'}
        </Typography>

        <Card style={styles.sectionCard}>
          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'ऐप का नाम:' : 'App Name:'}
            </Typography>
            <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
              अपना समाज (Apna Samaj)
            </Typography>
          </View>

          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'संस्करण (Version):' : 'Version:'}
            </Typography>
            <Badge label="v1.0.0 (Batch 7)" variant="default" size="sm" />
          </View>

          <View style={styles.detailRow}>
            <Typography variant="sm" color={theme.colors.textSecondary}>
              {language === 'hi' ? 'सुरक्षा मानक:' : 'Security:'}
            </Typography>
            <Typography variant="xs" weight="medium" color={theme.colors.success}>
              ✓ Tenant-Isolated Multi-Community
            </Typography>
          </View>
        </Card>

        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Persistent Bottom Tab Bar */}
      <BottomNavigation activeTab="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginLeft: -10, // balance spacer
  },
  headerSpacer: {
    width: 28,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
  },
  sectionHeader: {
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  sectionCard: {
    padding: 16,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  optionRowSpaced: {
    marginTop: 10,
  },
  optionTextContainer: {
    flex: 1,
  },
  radioIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  warningBox: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 12,
  },
  switchForm: {
    marginTop: 8,
  },
  switchBtn: {
    marginTop: 8,
  },
  logoutContainer: {
    marginTop: 16,
    paddingTop: 8,
  },
  logoutBtn: {
    borderWidth: 1.5,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  preferenceRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  preferenceText: {
    flex: 1,
    paddingRight: 16,
  },
});

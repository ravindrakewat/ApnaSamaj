import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Typography,
  Card,
  Input,
  Button,
} from '../../src/components';
import { useTheme } from '../../src/hooks/useTheme';
import { useLocalization } from '../../src/hooks/useLocalization';
import { useAuth } from '../../src/hooks/useAuth';
import { validatePassword, validateCommunitySlug } from '../../src/utils/validation';
import { authApi } from '../../src/api/auth.api';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string; slug?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { communitySlug: authCommunitySlug } = useAuth();
  const isHindi = language === 'hi';

  const [slug, setSlug] = useState<string>(params.slug || authCommunitySlug || 'kewat');
  // Token kept strictly in volatile React component state (never stored in persistent storage)
  const [token, setToken] = useState<string>(params.token || '');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Field validation errors
  const [slugError, setSlugError] = useState<string | undefined>();
  const [tokenError, setTokenError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleLanguage = () => {
    setLanguage(isHindi ? 'en' : 'hi');
  };

  const handleResetPassword = async () => {
    if (isSubmitting) return;
    setServerError(null);

    // Validate fields
    const slugValidation = validateCommunitySlug(slug, language);
    setSlugError(slugValidation.error);

    let hasError = false;

    if (!token.trim()) {
      setTokenError(isHindi ? 'रीसेट टोकन दर्ज करना आवश्यक है।' : 'Reset token is required.');
      hasError = true;
    } else {
      setTokenError(undefined);
    }

    const passValidation = validatePassword(newPassword, language);
    setPasswordError(passValidation.error);
    if (!passValidation.isValid) {
      hasError = true;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(
        isHindi
          ? 'पासवर्ड और पुष्टि पासवर्ड मेल नहीं खाते।'
          : 'Passwords do not match.'
      );
      hasError = true;
    } else {
      setConfirmPasswordError(undefined);
    }

    if (!slugValidation.isValid || hasError) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword(
        token.trim(),
        newPassword,
        slug.trim().toLowerCase()
      );
      setIsSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : isHindi
            ? 'पासवर्ड रीसेट विफल रहा। टोकन अमान्य अथवा समाप्त हो सकता है।'
            : 'Password reset failed. The token may be invalid or expired.';
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(insets.top, 20) + 8,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Top Navigation Bar: Back & Language Switcher */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
          >
            <Typography variant="sm" weight="semibold" color={theme.colors.textPrimary}>
              ← {isHindi ? 'वापस' : 'Back'}
            </Typography>
          </Pressable>

          <Pressable
            onPress={toggleLanguage}
            style={[
              styles.langPill,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
          >
            <Typography variant="xs" weight="bold" color={theme.colors.primary}>
              {isHindi ? 'English' : 'हिंदी'}
            </Typography>
          </Pressable>
        </View>

        {/* 2. Hero Header */}
        <View style={styles.heroSection}>
          <View style={[styles.iconBox, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
            <Typography variant="lg" style={styles.iconEmoji}>
              🔑
            </Typography>
          </View>
          <Typography variant="lg" weight="bold" color={theme.colors.textPrimary} align="center" style={styles.title}>
            {isHindi ? 'नया पासवर्ड सेट करें' : 'Reset Password'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.subtitle}>
            {isHindi
              ? 'कृपया अपना रीसेट टोकन दर्ज करें और एक नया सुरक्षित पासवर्ड चुनें।'
              : 'Enter your verification token and create a new secure password.'}
          </Typography>
        </View>

        {/* 3. Form Card or Success Card */}
        {isSuccess ? (
          <Card style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Typography variant="lg">🎉</Typography>
            </View>

            <Typography variant="md" weight="bold" color="#065F46" align="center" style={{ marginBottom: 8 }}>
              {isHindi ? 'पासवर्ड सफलतापूर्वक बदल दिया गया!' : 'Password Reset Successfully!'}
            </Typography>

            <Typography variant="sm" color="#334155" align="center" style={{ lineHeight: 20, marginBottom: 20 }}>
              {isHindi
                ? 'आपका खाता सुरक्षित रूप से अपडेट हो गया है। अब आप अपने नए पासवर्ड के साथ लॉगिन कर सकते हैं।'
                : 'Your account credentials have been updated securely. You can now log in with your new password.'}
            </Typography>

            <Button
              title={isHindi ? 'अब लॉगिन करें / Log In Now' : 'Log In Now'}
              onPress={() => router.replace('/(auth)/login')}
              variant="primary"
              fullWidth
            />
          </Card>
        ) : (
          <Card style={styles.formCard}>
            {/* Server Error Banner */}
            {serverError && (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: theme.colors.errorLight,
                    borderColor: theme.colors.error,
                  },
                ]}
              >
                <Typography variant="xs" color={theme.colors.error} weight="semibold">
                  ⚠️ {serverError}
                </Typography>
              </View>
            )}

            {/* Community Tenant Slug Input */}
            <Input
              label={isHindi ? 'समुदाय कोड (Community)' : 'Community Identifier'}
              value={slug}
              onChangeText={(val) => {
                setSlug(val);
                if (slugError) setSlugError(undefined);
              }}
              placeholder="e.g. kewat"
              autoCapitalize="none"
              autoCorrect={false}
              error={slugError}
              helperText={
                isHindi
                  ? 'समुदाय का अनूठा कोड (जैसे: kewat)'
                  : 'Community tenant identifier (e.g., kewat)'
              }
            />

            {/* Reset Token Input */}
            <Input
              label={isHindi ? 'रीसेट टोकन (Reset Token)' : 'Reset Token'}
              value={token}
              onChangeText={(val) => {
                setToken(val);
                if (tokenError) setTokenError(undefined);
              }}
              placeholder={isHindi ? 'टोकन यहाँ पेस्ट करें...' : 'Paste token here...'}
              autoCapitalize="none"
              autoCorrect={false}
              error={tokenError}
              helperText={
                isHindi
                  ? 'निर्देशों में प्राप्त रीसेट टोकन स्ट्रिंग'
                  : 'The reset token string sent in instructions'
              }
            />

            {/* New Password Input */}
            <Input
              label={isHindi ? 'नया पासवर्ड' : 'New Password'}
              value={newPassword}
              onChangeText={(val) => {
                setNewPassword(val);
                if (passwordError) setPasswordError(undefined);
              }}
              placeholder="••••••••"
              secureTextEntry={!showNewPassword}
              error={passwordError}
              rightAccessory={
                <Pressable
                  onPress={() => setShowNewPassword((prev) => !prev)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
                    {showNewPassword
                      ? isHindi
                        ? 'छुपाएँ'
                        : 'Hide'
                      : isHindi
                        ? 'दिखाएँ'
                        : 'Show'}
                  </Typography>
                </Pressable>
              }
              helperText={
                isHindi
                  ? 'कम से कम 8 वर्ण का सुरक्षित पासवर्ड'
                  : 'At least 8 characters long'
              }
            />

            {/* Confirm New Password Input */}
            <Input
              label={isHindi ? 'नए पासवर्ड की पुष्टि करें' : 'Confirm New Password'}
              value={confirmPassword}
              onChangeText={(val) => {
                setConfirmPassword(val);
                if (confirmPasswordError) setConfirmPasswordError(undefined);
              }}
              placeholder="••••••••"
              secureTextEntry={!showConfirmPassword}
              error={confirmPasswordError}
              rightAccessory={
                <Pressable
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.eyeBtn}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
                    {showConfirmPassword
                      ? isHindi
                        ? 'छुपाएँ'
                        : 'Hide'
                      : isHindi
                        ? 'दिखाएँ'
                        : 'Show'}
                  </Typography>
                </Pressable>
              }
            />

            {/* Submit Button */}
            <Button
              title={isHindi ? 'पासवर्ड अपडेट करें / Reset' : 'Update Password'}
              onPress={handleResetPassword}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
              style={styles.submitBtn}
            />
          </Card>
        )}

        {/* 4. Footer Links */}
        <View style={styles.footerNote}>
          <Pressable
            onPress={() => router.replace('/(auth)/login')}
            style={styles.loginLink}
            accessibilityRole="link"
          >
            <Typography variant="sm" color={theme.colors.textSecondary} align="center">
              {isHindi ? 'पासवर्ड याद आ गया? ' : 'Remember your password? '}
              <Typography variant="sm" weight="bold" color={theme.colors.primary}>
                {isHindi ? 'लॉगिन करें' : 'Log In'}
              </Typography>
            </Typography>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    maxWidth: 320,
    lineHeight: 20,
  },
  formCard: {
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    marginBottom: 16,
  },
  successCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    marginBottom: 16,
  },
  successIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  eyeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  submitBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
  },
  footerNote: {
    marginTop: 8,
    alignItems: 'center',
  },
  loginLink: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});


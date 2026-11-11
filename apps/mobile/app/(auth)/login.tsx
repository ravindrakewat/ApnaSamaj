import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Typography,
  Card,
  Input,
  Button,
  Badge,
} from '../../src/components';
import { useTheme } from '../../src/hooks/useTheme';
import { useLocalization } from '../../src/hooks/useLocalization';
import { useAuth } from '../../src/hooks/useAuth';
import {
  validatePhone,
  validatePassword,
  validateCommunitySlug,
} from '../../src/utils/validation';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLocalization();
  const { login, communitySlug, error: authError, clearError } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState(communitySlug || 'kewat');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field validation errors
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [slugError, setSlugError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const handleLogin = async () => {
    if (isSubmitting) return;
    clearError();
    setServerError(null);

    // Validate fields
    const phoneValidation = validatePhone(phone, language);
    const passValidation = validatePassword(password, language);
    const slugValidation = validateCommunitySlug(slug, language);

    setPhoneError(phoneValidation.error);
    setPasswordError(passValidation.error);
    setSlugError(slugValidation.error);

    if (!phoneValidation.isValid || !passValidation.isValid || !slugValidation.isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(
        {
          phone: phoneValidation.normalized,
          password,
        },
        slug.trim().toLowerCase()
      );
      // Successful login updates AuthContext; root navigation guard will redirect to /(app)
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : language === 'hi'
            ? 'लॉगिन विफल रहा। कृपया विवरण पुनः जांचें।'
            : 'Login failed. Please check your credentials.';
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
            paddingTop: Math.max(insets.top + 8, 20),
            paddingBottom: Math.max(insets.bottom + 24, 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <View style={styles.tenantPillContainer}>
            <Badge
              label={`Tenant: ${slug.trim().toLowerCase() || 'default'}`}
              variant="info"
              size="sm"
            />
          </View>
          <Pressable
            onPress={toggleLanguage}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            style={[
              styles.langPill,
              {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
              },
            ]}
          >
            <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
              🌐 {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>
        </View>

        {/* Brand Hero Banner */}
        <View style={styles.brandContainer}>
          <View style={[styles.brandIcon, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="display" weight="bold" color="#FFFFFF">
              अ
            </Typography>
          </View>
          <Typography
            variant="title"
            weight="bold"
            color={theme.colors.textPrimary}
            style={styles.appName}
          >
            {language === 'hi' ? 'अपना समाज' : 'Apna Samaj'}
          </Typography>
          <Typography
            variant="sm"
            color={theme.colors.textSecondary}
            align="center"
            style={styles.tagline}
          >
            {language === 'hi'
              ? 'समुदाय का सशक्त, सुरक्षित एवं एकीकृत डिजिटल मंच'
              : 'Empowering Communities Through Digital Connection'}
          </Typography>
        </View>

        {/* Modern Form Card */}
        <Card style={styles.formCard}>
          <View style={styles.formHeader}>
            <Typography variant="lg" weight="bold" color={theme.colors.textPrimary}>
              {t('auth:loginTitle')}
            </Typography>
            <Typography variant="xs" color={theme.colors.textSecondary} style={styles.formSubtitle}>
              {language === 'hi'
                ? 'अपने पंजीकृत मोबाइल नंबर से प्रवेश करें'
                : 'Sign in with your registered phone number'}
            </Typography>
          </View>

          {/* Server Error Alert Banner */}
          {(serverError || authError) && (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.colors.errorLight,
                  borderColor: theme.colors.error,
                },
              ]}
            >
              <Typography variant="xs" weight="bold" color={theme.colors.error}>
                ⚠️ {serverError || authError}
              </Typography>
            </View>
          )}

          {/* Community Slug Input */}
          <Input
            label={language === 'hi' ? 'कम्युनिटी स्लग (Community Slug)' : 'Community Slug'}
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
              language === 'hi'
                ? 'समुदाय का अनूठा कोड (मल्टी-टेनेंट सुरक्षा)'
                : 'Unique community tenant identifier'
            }
          />

          {/* Mobile Phone Input with +91 Country Code Badge */}
          <Input
            label={t('auth:phone')}
            value={phone}
            onChangeText={(val) => {
              setPhone(val);
              if (phoneError) setPhoneError(undefined);
            }}
            placeholder="9876543210"
            keyboardType="phone-pad"
            maxLength={13}
            error={phoneError}
            leftAccessory={
              <View style={styles.phonePrefix}>
                <Typography variant="sm" weight="bold" color={theme.colors.primary}>
                  +91
                </Typography>
                <View style={[styles.prefixDivider, { backgroundColor: theme.colors.border }]} />
              </View>
            }
            helperText={
              language === 'hi'
                ? '10 अंकों का भारतीय मोबाइल नंबर दर्ज करें'
                : 'Enter 10-digit Indian mobile number'
            }
          />

          {/* Password Input with Show/Hide Toggle */}
          <Input
            label={t('auth:password')}
            value={password}
            onChangeText={(val) => {
              setPassword(val);
              if (passwordError) setPasswordError(undefined);
            }}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            error={passwordError}
            rightAccessory={
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Typography variant="xs" weight="semibold" color={theme.colors.primary}>
                  {showPassword
                    ? language === 'hi'
                      ? 'छुपाएँ'
                      : 'Hide'
                    : language === 'hi'
                      ? 'दिखाएँ'
                      : 'Show'}
                </Typography>
              </Pressable>
            }
          />

          {/* Forgot Password Action Link */}
          <View style={styles.forgotPasswordRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(auth)/forgot-password',
                  params: { slug: slug.trim().toLowerCase() },
                } as any)
              }
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={language === 'hi' ? 'पासवर्ड भूल गए?' : 'Forgot Password?'}
            >
              <Typography variant="xs" weight="bold" color={theme.colors.primary}>
                {language === 'hi' ? 'पासवर्ड भूल गए? (Forgot Password?)' : 'Forgot Password?'}
              </Typography>
            </Pressable>
          </View>

          {/* Submit Button */}
          <Button
            title={t('auth:loginButton')}
            onPress={handleLogin}
            loading={isSubmitting}
            disabled={isSubmitting}
            fullWidth
            style={styles.submitBtn}
          />
        </Card>

        {/* Footer Navigation Link to Register */}
        <View style={styles.footerContainer}>
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            style={styles.linkPressable}
            accessibilityRole="link"
          >
            <Typography variant="sm" color={theme.colors.textSecondary} align="center">
              {language === 'hi' ? 'खाता नहीं है? ' : "Don't have an account? "}
              <Typography variant="sm" weight="bold" color={theme.colors.primary}>
                {language === 'hi' ? 'नया सदस्य पंजीकरण' : 'Register Now'}
              </Typography>
            </Typography>
          </Pressable>

          {/* Trust & Security Badge */}
          <View style={styles.securityNote}>
            <Typography variant="xs" color={theme.colors.textMuted} align="center">
              🔒 {language === 'hi' ? '256-बिट सुरक्षित एन्क्रिप्टेड समुदाय नेटवर्क' : '256-bit Encrypted Secure Community Platform'}
            </Typography>
          </View>
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
    marginBottom: 20,
  },
  tenantPillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  tagline: {
    maxWidth: 300,
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
  formHeader: {
    marginBottom: 16,
  },
  formSubtitle: {
    marginTop: 4,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  phonePrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  prefixDivider: {
    width: 1,
    height: 20,
    marginLeft: 8,
  },
  eyeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  forgotPasswordRow: {
    alignItems: 'flex-end',
    marginBottom: 12,
    marginTop: -4,
  },
  submitBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  linkPressable: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityNote: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
});

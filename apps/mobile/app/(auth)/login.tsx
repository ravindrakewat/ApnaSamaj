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
  const { language, setLanguage, t } = useLocalization();
  const { login, communitySlug, error: authError, clearError } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState(communitySlug || 'demo');
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
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar with Language Selector */}
        <View style={styles.topBar}>
          <Badge
            label={slug.trim() ? `Tenant: ${slug.trim().toLowerCase()}` : 'Apna Samaj'}
            variant="info"
            size="sm"
          />
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
              {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>
        </View>

        {/* Brand Banner */}
        <View style={styles.brandContainer}>
          <View style={[styles.brandIcon, { backgroundColor: theme.colors.primary }]}>
            <Typography variant="title" weight="bold" color={theme.colors.textInverse}>
              अ
            </Typography>
          </View>
          <Typography
            variant="title"
            weight="bold"
            color={theme.colors.primary}
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
              ? 'समुदाय का सशक्त, सुरक्षित मंच'
              : 'Connecting & Empowering Communities'}
          </Typography>
        </View>

        {/* Login Form Card */}
        <Card style={styles.formCard}>
          <Typography variant="lg" weight="bold" style={styles.cardHeader}>
            {t('auth:loginTitle')}
          </Typography>

          {/* Server Error Alert */}
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
              <Typography variant="xs" weight="medium" color={theme.colors.error}>
                {serverError || authError}
              </Typography>
            </View>
          )}

          {/* Community Slug Input */}
          <Input
            label={language === 'hi' ? 'कम्युनिटी स्लग (Community)' : 'Community Slug'}
            value={slug}
            onChangeText={(val) => {
              setSlug(val);
              if (slugError) setSlugError(undefined);
            }}
            placeholder="e.g. demo"
            autoCapitalize="none"
            autoCorrect={false}
            error={slugError}
            helperText={
              language === 'hi'
                ? 'आपके समुदाय का अनूठा कोड (डिफ़ॉल्ट: demo)'
                : 'Unique community code (default: demo)'
            }
          />

          {/* Mobile Phone Input */}
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
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Typography variant="xs" weight="medium" color={theme.colors.primary}>
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

          {/* Submit Button */}
          <Button
            title={t('auth:loginButton')}
            onPress={handleLogin}
            loading={isSubmitting}
            fullWidth
            style={styles.submitBtn}
          />
        </Card>

        {/* Footer Link to Register */}
        <View style={styles.footerContainer}>
          <Pressable
            onPress={() => router.push('/(auth)/register')}
            style={styles.linkPressable}
            accessibilityRole="link"
          >
            <Typography
              variant="sm"
              weight="medium"
              color={theme.colors.primary}
              align="center"
            >
              {t('auth:needAccount')}
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
    paddingTop: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  langPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  appName: {
    fontSize: 24,
    marginBottom: 4,
  },
  tagline: {
    maxWidth: 280,
  },
  formCard: {
    padding: 20,
    marginBottom: 20,
  },
  cardHeader: {
    marginBottom: 16,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  eyeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  submitBtn: {
    marginTop: 8,
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  linkPressable: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

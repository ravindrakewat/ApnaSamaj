import React, { useState, useEffect, useRef } from 'react';
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
import { validatePhone, validateCommunitySlug } from '../../src/utils/validation';
import { authApi } from '../../src/api/auth.api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useLocalization();
  const { communitySlug: authCommunitySlug } = useAuth();
  const isHindi = language === 'hi';

  const [slug, setSlug] = useState<string>(params.slug || authCommunitySlug || 'kewat');
  const [phone, setPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // Field validation errors
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [slugError, setSlugError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);

  // 60-Second Cooldown Timer for Resend
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldownSeconds(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const toggleLanguage = () => {
    setLanguage(isHindi ? 'en' : 'hi');
  };

  const handleSubmit = async () => {
    if (isSubmitting || cooldownSeconds > 0) return;
    setServerError(null);

    // Validate fields
    const phoneValidation = validatePhone(phone, language);
    const slugValidation = validateCommunitySlug(slug, language);

    setPhoneError(phoneValidation.error);
    setSlugError(slugValidation.error);

    if (!phoneValidation.isValid || !slugValidation.isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(
        phoneValidation.normalized,
        slug.trim().toLowerCase()
      );
      setIsSubmitted(true);
      startCooldown();
    } catch (err: unknown) {
      // Even on unexpected network failures, display safe user-facing error
      const message =
        err instanceof Error
          ? err.message
          : isHindi
            ? 'अनुरोध पूरा करने में असमर्थ। कृपया पुनः प्रयास करें।'
            : 'Unable to process request. Please try again.';
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
            accessibilityLabel="Go back to login"
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
          <View style={[styles.iconBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <Typography variant="lg" style={styles.iconEmoji}>
              🔐
            </Typography>
          </View>
          <Typography variant="lg" weight="bold" color={theme.colors.textPrimary} align="center" style={styles.title}>
            {isHindi ? 'पासवर्ड पुनर्प्राप्ति' : 'Forgot Password'}
          </Typography>
          <Typography variant="sm" color={theme.colors.textSecondary} align="center" style={styles.subtitle}>
            {isHindi
              ? 'अपने समुदाय के पंजीकृत मोबाइल नंबर पर पासवर्ड रीसेट निर्देश प्राप्त करें।'
              : 'Enter your registered mobile number to receive password recovery instructions.'}
          </Typography>
        </View>

        {/* 3. Form Card or Success Card */}
        {isSubmitted ? (
          <Card style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Typography variant="lg">✅</Typography>
            </View>

            <Typography variant="md" weight="bold" color="#065F46" align="center" style={{ marginBottom: 8 }}>
              {isHindi ? 'निर्देश भेजे गए / Request Sent' : 'Recovery Instructions Sent'}
            </Typography>

            <Typography variant="sm" color="#334155" align="center" style={{ lineHeight: 20, marginBottom: 16 }}>
              {isHindi
                ? `यदि मोबाइल नंबर (+91 ${phone.replace(/\D/g, '').slice(-10)}) आपके समुदाय (${slug}) में पंजीकृत है, तो पासवर्ड रीसेट निर्देश जारी कर दिए गए हैं।`
                : `If the mobile number (+91 ${phone.replace(/\D/g, '').slice(-10)}) is registered with community "${slug}", recovery instructions have been dispatched.`}
            </Typography>

            {/* Anti-Enumeration Security Notice */}
            <View style={styles.securityNoticeBox}>
              <Typography variant="xs" color="#64748B" align="center" style={{ lineHeight: 16 }}>
                🔒{' '}
                {isHindi
                  ? 'सुरक्षा कारणों से, यह संदेश यह प्रकट नहीं करता कि कोई खाता मौजूद है या नहीं।'
                  : 'For security and privacy, this response does not disclose whether an account exists.'}
              </Typography>
            </View>

            {/* Action Buttons */}
            <Button
              title={isHindi ? '🔑 मेरे पास रीसेट टोकन है (Reset Password)' : '🔑 Enter Reset Token'}
              onPress={() =>
                router.push({
                  pathname: '/(auth)/reset-password',
                  params: { slug: slug.trim().toLowerCase() },
                } as any)
              }
              variant="primary"
              fullWidth
              style={{ marginBottom: 12 }}
            />

            <Button
              title={
                cooldownSeconds > 0
                  ? isHindi
                    ? `पुनः अनुरोध (${cooldownSeconds}s)`
                    : `Resend in (${cooldownSeconds}s)`
                  : isHindi
                    ? 'पुनः निर्देश भेजें'
                    : 'Resend Instructions'
              }
              onPress={handleSubmit}
              variant="outline"
              fullWidth
              disabled={cooldownSeconds > 0 || isSubmitting}
              style={{ marginBottom: 12 }}
            />

            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              style={styles.backToLoginBtn}
              accessibilityRole="link"
            >
              <Typography variant="xs" weight="bold" color={theme.colors.primary} align="center">
                ← {isHindi ? 'लॉगिन पृष्ठ पर लौटें' : 'Back to Login'}
              </Typography>
            </Pressable>
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

            {/* Phone Number Input with +91 Country Code */}
            <Input
              label={isHindi ? 'पंजीकृत मोबाइल नंबर' : 'Registered Mobile Number'}
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
                isHindi
                  ? '10 अंकों का भारतीय मोबाइल नंबर दर्ज करें'
                  : 'Enter 10-digit Indian mobile number'
              }
            />

            {/* Submit Button */}
            <Button
              title={isHindi ? 'निर्देश भेजें / Send Reset Link' : 'Send Reset Instructions'}
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
              style={styles.submitBtn}
            />

            {/* Direct Token Entry Link */}
            <View style={styles.tokenPromptRow}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/reset-password',
                    params: { slug: slug.trim().toLowerCase() },
                  } as any)
                }
                hitSlop={8}
                accessibilityRole="link"
              >
                <Typography variant="xs" weight="semibold" color={theme.colors.textSecondary} align="center">
                  {isHindi ? 'पहले से रीसेट टोकन मिला है? ' : 'Already have a reset token? '}
                  <Typography variant="xs" weight="bold" color={theme.colors.primary}>
                    {isHindi ? 'यहाँ पासवर्ड बदलें' : 'Reset Here'}
                  </Typography>
                </Typography>
              </Pressable>
            </View>
          </Card>
        )}

        {/* 4. Footer Help Note */}
        <View style={styles.footerNote}>
          <Typography variant="xs" color={theme.colors.textMuted} align="center">
            🔒 {isHindi ? 'एन्क्रिप्टेड सुरक्षित प्रमाणीकरण' : 'End-to-End Secure Multi-Tenant Authentication'}
          </Typography>
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
  securityNoticeBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    width: '100%',
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
  submitBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
  },
  tokenPromptRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  backToLoginBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  footerNote: {
    marginTop: 8,
    alignItems: 'center',
  },
});


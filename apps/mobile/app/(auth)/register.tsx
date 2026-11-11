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
} from '../../src/components';
import { useTheme } from '../../src/hooks/useTheme';
import { useLocalization } from '../../src/hooks/useLocalization';
import { useAuth } from '../../src/hooks/useAuth';
import {
  validateFullName,
  validatePhone,
  validatePassword,
  validateCommunitySlug,
} from '../../src/utils/validation';

export default function RegisterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t } = useLocalization();
  const { register, communitySlug, error: authError, clearError } = useAuth();

  // Required Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [slug, setSlug] = useState(communitySlug || 'kewat');
  const [showPassword, setShowPassword] = useState(false);

  // Optional Profile Fields matching backend schema
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | undefined>(undefined);
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [subCaste, setSubCaste] = useState('');
  const [gotra, setGotra] = useState('');

  // Optional Section Toggle
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field validation errors
  const [fullNameError, setFullNameError] = useState<string | undefined>();
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [slugError, setSlugError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);

  const toggleLanguage = () => {
    setLanguage(language === 'hi' ? 'en' : 'hi');
  };

  const handleRegister = async () => {
    if (isSubmitting) return;
    clearError();
    setServerError(null);

    // Validate required fields
    const nameValidation = validateFullName(fullName, language);
    const phoneValidation = validatePhone(phone, language);
    const passValidation = validatePassword(password, language);
    const slugValidation = validateCommunitySlug(slug, language);

    setFullNameError(nameValidation.error);
    setPhoneError(phoneValidation.error);
    setPasswordError(passValidation.error);
    setSlugError(slugValidation.error);

    if (
      !nameValidation.isValid ||
      !phoneValidation.isValid ||
      !passValidation.isValid ||
      !slugValidation.isValid
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      await register(
        {
          fullName: fullName.trim(),
          phone: phoneValidation.normalized,
          password,
          ...(gender ? { gender } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(stateName.trim() ? { state: stateName.trim() } : {}),
          ...(subCaste.trim() ? { subCaste: subCaste.trim() } : {}),
          ...(gotra.trim() ? { gotra: gotra.trim() } : {}),
        },
        slug.trim().toLowerCase()
      );
      // Successful registration sets tokens and AuthContext; root guard redirects to /(app)
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : language === 'hi'
          ? 'पंजीकरण विफल रहा। कृपया पुनः प्रयास करें।'
          : 'Registration failed. Please try again.';
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
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back to login"
          >
            <Typography variant="sm" weight="bold" color={theme.colors.primary}>
              {language === 'hi' ? '← लॉगिन पर लौटें' : '← Back to Login'}
            </Typography>
          </Pressable>

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

        {/* Hero Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={[styles.brandBadge, { backgroundColor: theme.colors.primary }]}>
              <Typography variant="sm" weight="bold" color="#FFFFFF">
                अ
              </Typography>
            </View>
            <Typography variant="title" weight="bold" color={theme.colors.textPrimary}>
              {t('auth:registerTitle')}
            </Typography>
          </View>
          <Typography
            variant="sm"
            color={theme.colors.textSecondary}
            style={styles.subtitle}
          >
            {language === 'hi'
              ? 'अपने समुदाय के डिजिटल परिवार से जुड़ने के लिए विवरण भरें'
              : 'Join your community platform in a few simple steps'}
          </Typography>
        </View>

        {/* Form Card */}
        <Card style={styles.formCard}>
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
                ? 'जिस समुदाय में खाता बनाना है उसका कोड (उदा. kewat)'
                : 'Target community code (e.g. kewat)'
            }
          />

          {/* Full Name Input */}
          <Input
            label={t('auth:fullName')}
            value={fullName}
            onChangeText={(val) => {
              setFullName(val);
              if (fullNameError) setFullNameError(undefined);
            }}
            placeholder={language === 'hi' ? 'उदा. राहुल शर्मा' : 'e.g. Rahul Sharma'}
            autoCapitalize="words"
            error={fullNameError}
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
                ? '10-अंकों का भारतीय मोबाइल नंबर (6, 7, 8 या 9 से शुरू)'
                : '10-digit Indian phone number starting with 6-9'
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
            helperText={
              language === 'hi'
                ? 'कम से कम 8 अक्षर होने चाहिए'
                : 'Must be at least 8 characters'
            }
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

          {/* Optional Profile Details Accordion Toggle */}
          <Pressable
            onPress={() => setShowOptionalFields((prev) => !prev)}
            style={[
              styles.accordionToggle,
              {
                borderColor: theme.colors.border,
                backgroundColor: showOptionalFields ? '#EFF6FF' : '#F8FAFC',
              },
            ]}
            accessibilityRole="button"
          >
            <Typography variant="sm" weight="semibold" color={theme.colors.primary}>
              {showOptionalFields
                ? language === 'hi'
                  ? '▼ अतिरिक्त विवरण छुपाएँ'
                  : '▼ Hide Optional Profile Details'
                : language === 'hi'
                ? '▶ अतिरिक्त विवरण जोड़ें (वैकल्पिक)'
                : '▶ Add Profile Details (Optional)'}
            </Typography>
          </Pressable>

          {/* Optional Profile Section */}
          {showOptionalFields && (
            <View style={styles.optionalSection}>
              {/* Gender Selector Chips */}
              <View style={styles.genderContainer}>
                <Typography
                  variant="sm"
                  weight="medium"
                  color={theme.colors.textPrimary}
                  style={styles.genderLabel}
                >
                  {language === 'hi' ? 'लिंग (Gender)' : 'Gender'}
                </Typography>
                <View style={styles.genderRow}>
                  {(
                    [
                      { key: 'MALE', hi: 'पुरुष', en: 'Male' },
                      { key: 'FEMALE', hi: 'महिला', en: 'Female' },
                      { key: 'OTHER', hi: 'अन्य', en: 'Other' },
                    ] as const
                  ).map((item) => {
                    const isSelected = gender === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() =>
                          setGender(isSelected ? undefined : item.key)
                        }
                        style={[
                          styles.genderChip,
                          {
                            borderColor: isSelected
                              ? theme.colors.primary
                              : theme.colors.border,
                            backgroundColor: isSelected
                              ? theme.colors.primary
                              : '#F8FAFC',
                          },
                        ]}
                      >
                        <Typography
                          variant="xs"
                          weight="semibold"
                          color={
                            isSelected
                              ? '#FFFFFF'
                              : theme.colors.textPrimary
                          }
                        >
                          {language === 'hi' ? item.hi : item.en}
                        </Typography>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* City Input */}
              <Input
                label={language === 'hi' ? 'शहर (City)' : 'City'}
                value={city}
                onChangeText={setCity}
                placeholder={language === 'hi' ? 'उदा. इंदौर' : 'e.g. Indore'}
              />

              {/* State Input */}
              <Input
                label={language === 'hi' ? 'राज्य (State)' : 'State'}
                value={stateName}
                onChangeText={setStateName}
                placeholder={language === 'hi' ? 'उदा. मध्य प्रदेश' : 'e.g. Madhya Pradesh'}
              />

              {/* Sub-Caste Input */}
              <Input
                label={language === 'hi' ? 'उप-जाति (Sub-Caste)' : 'Sub-Caste'}
                value={subCaste}
                onChangeText={setSubCaste}
                placeholder={language === 'hi' ? 'उदा. राठौर' : 'e.g. Rathore'}
              />

              {/* Gotra Input */}
              <Input
                label={language === 'hi' ? 'गोत्र (Gotra)' : 'Gotra'}
                value={gotra}
                onChangeText={setGotra}
                placeholder={language === 'hi' ? 'उदा. कश्यप' : 'e.g. Kashyap'}
              />
            </View>
          )}

          {/* Register Button */}
          <Button
            title={t('auth:registerButton')}
            onPress={handleRegister}
            loading={isSubmitting}
            disabled={isSubmitting}
            fullWidth
            style={styles.submitBtn}
          />
        </Card>

        {/* Footer Link to Login */}
        <View style={styles.footerContainer}>
          <Pressable
            onPress={() => router.push('/(auth)/login')}
            style={styles.linkPressable}
            accessibilityRole="link"
          >
            <Typography variant="sm" color={theme.colors.textSecondary} align="center">
              {language === 'hi' ? 'पहले से खाता है? ' : 'Already have an account? '}
              <Typography variant="sm" weight="bold" color={theme.colors.primary}>
                {language === 'hi' ? 'लॉगिन करें' : 'Login'}
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
    marginBottom: 16,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 40,
    justifyContent: 'center',
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
  header: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 6,
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
  accordionToggle: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionalSection: {
    marginTop: 4,
  },
  genderContainer: {
    marginBottom: 16,
  },
  genderLabel: {
    marginBottom: 8,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderChip: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    marginTop: 10,
    height: 48,
    borderRadius: 12,
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 4,
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

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
  const [slug, setSlug] = useState(communitySlug || 'demo');
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
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Bar with Back and Language Buttons */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back to login"
          >
            <Typography variant="sm" weight="semibold" color={theme.colors.primary}>
              {language === 'hi' ? '← लॉगिन' : '← Login'}
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
              {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>
        </View>

        {/* Brand Banner */}
        <View style={styles.header}>
          <Typography variant="title" weight="bold" color={theme.colors.primary}>
            {t('auth:registerTitle')}
          </Typography>
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

        {/* Registration Form Card */}
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
                ? 'जिस समुदाय में खाता बनाना है उसका कोड (उदा. demo)'
                : 'Target community code (e.g. demo)'
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

          {/* Optional Profile Details Accordion Toggle */}
          <Pressable
            onPress={() => setShowOptionalFields((prev) => !prev)}
            style={[styles.accordionToggle, { borderColor: theme.colors.border }]}
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
                  {language === 'hi' ? 'लिंग' : 'Gender'}
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
                              : theme.colors.surface,
                          },
                        ]}
                      >
                        <Typography
                          variant="xs"
                          weight="semibold"
                          color={
                            isSelected
                              ? theme.colors.textInverse
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
            <Typography
              variant="sm"
              weight="medium"
              color={theme.colors.primary}
              align="center"
            >
              {t('auth:alreadyHaveAccount')}
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
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
  },
  subtitle: {
    marginTop: 6,
    lineHeight: 20,
  },
  formCard: {
    padding: 20,
    marginBottom: 20,
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
  accordionToggle: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginVertical: 12,
    alignItems: 'center',
  },
  optionalSection: {
    marginTop: 8,
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
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtn: {
    marginTop: 10,
  },
  footerContainer: {
    alignItems: 'center',
    marginTop: 4,
  },
  linkPressable: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

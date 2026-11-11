import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Typography } from './Typography';
import { ProfileAvatar } from './ProfileAvatar';

export interface AppHeaderProps {
  /** Mode: 'brand' for primary tabs/home; 'detail' for nested screens with back button */
  mode?: 'brand' | 'detail';
  /** Screen or community title */
  title?: string;
  /** Subtitle text (optional) */
  subtitle?: string;
  /** Custom icon or emoji (defaults to stylized 'अ' box in brand mode) */
  icon?: React.ReactNode;
  /** Tenant community slug (e.g. 'kewat') displayed as badge pill */
  communitySlug?: string;
  /** Whether to show back navigation button in detail mode (defaults to true in detail mode) */
  showBackButton?: boolean;
  /** Custom back button press handler (defaults to router.back()) */
  onBackPress?: () => void;
  /** Whether to show the language switcher pill */
  showLanguageSwitcher?: boolean;
  /** Active language: 'hi' | 'en' */
  language?: 'hi' | 'en';
  /** Callback when language switcher is toggled */
  onLanguageToggle?: () => void;
  /** Whether to show user profile avatar button */
  showProfileAvatar?: boolean;
  /** Profile avatar image URL or fallback */
  avatarUrl?: string | null;
  /** Fallback avatar initial character (e.g. 'R') */
  avatarInitial?: string;
  /** Callback when profile avatar is pressed */
  onProfilePress?: () => void;
  /** Right-side accessory / action components */
  rightAccessory?: React.ReactNode;
  /** Container style overrides */
  style?: ViewStyle;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  mode = 'brand',
  title,
  subtitle,
  icon,
  communitySlug,
  showBackButton,
  onBackPress,
  showLanguageSwitcher,
  language = 'hi',
  onLanguageToggle,
  showProfileAvatar,
  avatarUrl,
  avatarInitial,
  onProfilePress,
  rightAccessory,
  style,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isBrand = mode === 'brand';
  const shouldShowBack = showBackButton !== undefined ? showBackButton : !isBrand;
  const shouldShowLang = showLanguageSwitcher !== undefined ? showLanguageSwitcher : isBrand;
  const shouldShowProfile = showProfileAvatar !== undefined ? showProfileAvatar : isBrand;

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  };

  const handleProfile = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      router.push('/(app)/profile' as any);
    }
  };

  const defaultTitle = isBrand ? (language === 'hi' ? 'अपना समाज' : 'Apna Samaj') : 'विवरण';
  const displayTitle = title || defaultTitle;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 10),
        },
        style,
      ]}
    >
      {/* 1. Left Section */}
      <View style={styles.leftSection}>
        {shouldShowBack ? (
          <Pressable
            onPress={handleBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={language === 'hi' ? 'वापस जाएं' : 'Back'}
            style={styles.backButton}
          >
            <Typography variant="lg" weight="bold" color="#1976D2" style={styles.backArrow}>
              ←
            </Typography>
          </Pressable>
        ) : isBrand ? (
          <View style={styles.brandIconBox}>
            {icon ? (
              typeof icon === 'string' ? (
                <Typography variant="sm" weight="bold" color="#FFFFFF">
                  {icon}
                </Typography>
              ) : (
                icon
              )
            ) : (
              <Typography variant="md" weight="bold" color="#FFFFFF" style={styles.defaultBrandLetter}>
                अ
              </Typography>
            )}
          </View>
        ) : null}

        {/* Title & Community Badge */}
        <View style={styles.titleColumn}>
          <Typography
            variant="md"
            weight="bold"
            color={isBrand ? '#1976D2' : '#0F172A'}
            numberOfLines={1}
            style={styles.titleText}
          >
            {displayTitle}
          </Typography>

          {communitySlug ? (
            <View style={styles.communitySlugPill}>
              <Typography variant="xs" weight="bold" color="#0369A1" style={styles.communitySlugText}>
                {communitySlug}
              </Typography>
            </View>
          ) : subtitle ? (
            <Typography variant="xs" color="#64748B" numberOfLines={1}>
              {subtitle}
            </Typography>
          ) : null}
        </View>
      </View>

      {/* 2. Right Actions Section */}
      <View style={styles.rightSection}>
        {rightAccessory}

        {shouldShowLang && onLanguageToggle && (
          <Pressable
            onPress={onLanguageToggle}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Switch language"
            style={styles.langPill}
          >
            <Typography variant="xs" weight="bold" color="#1976D2">
              {language === 'hi' ? 'English' : 'हिन्दी'}
            </Typography>
          </Pressable>
        )}

        {shouldShowProfile && (
          <ProfileAvatar
            uri={avatarUrl}
            initial={avatarInitial}
            size="sm"
            onPress={handleProfile}
            accessibilityLabel="Open profile"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    zIndex: 10,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 8,
  },
  backButton: {
    paddingRight: 4,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 22,
    lineHeight: 26,
  },
  brandIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1976D2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  defaultBrandLetter: {
    fontSize: 18,
    lineHeight: 22,
  },
  titleColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 16.5,
    lineHeight: 21,
    letterSpacing: -0.3,
  },
  communitySlugPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  communitySlugText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
});


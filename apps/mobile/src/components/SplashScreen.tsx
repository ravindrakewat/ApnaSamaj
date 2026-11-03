import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Typography } from './Typography';
import { useTheme } from '../hooks/useTheme';
import { useLocalization } from '../hooks/useLocalization';

export const SplashScreen: React.FC = () => {
  const theme = useTheme();
  const { language } = useLocalization();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.centerBox}>
        {/* Brand Icon / Symbol */}
        <View style={[styles.iconPlaceholder, { backgroundColor: theme.colors.primary }]}>
          <Typography variant="title" weight="bold" color={theme.colors.textInverse}>
            अ
          </Typography>
        </View>

        <Typography
          variant="title"
          weight="bold"
          color={theme.colors.primary}
          style={styles.title}
        >
          {language === 'hi' ? 'अपना समाज' : 'Apna Samaj'}
        </Typography>

        <Typography
          variant="sm"
          color={theme.colors.textSecondary}
          style={styles.subtitle}
        >
          {language === 'hi'
            ? 'समुदाय का सशक्त, सुरक्षित मंच'
            : 'Connecting & Empowering Communities'}
        </Typography>

        <View style={styles.loaderWrapper}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Typography
            variant="xs"
            color={theme.colors.textMuted}
            style={styles.loadingText}
          >
            {language === 'hi' ? 'सत्र प्रारंभ हो रहा है...' : 'Initializing session...'}
          </Typography>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centerBox: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  title: {
    fontSize: 26,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  loaderWrapper: {
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    marginTop: 4,
  },
});


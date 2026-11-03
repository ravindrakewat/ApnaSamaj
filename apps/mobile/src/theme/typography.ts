import { Platform, TextStyle } from 'react-native';

/**
 * Apna Samaj Mobile Design System — Typography Tokens
 * Optimized for Devanagari (Hindi) and Latin (English) readability on Android and iOS.
 */
export const fontFamilies = {
  regular: Platform.select({
    android: 'sans-serif',
    ios: 'System',
    default: 'sans-serif',
  }),
  medium: Platform.select({
    android: 'sans-serif-medium',
    ios: 'System',
    default: 'sans-serif-medium',
  }),
  bold: Platform.select({
    android: 'sans-serif',
    ios: 'System',
    default: 'sans-serif',
  }),
};

export const fontSizes = {
  xxs: 10,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  title: 28,
  display: 32,
} as const;

export const lineHeights = {
  xxs: 14,
  xs: 16,
  sm: 20,
  md: 22,
  lg: 24,
  xl: 26,
  xxl: 30,
  title: 34,
  display: 38,
} as const;

export const fontWeights: Record<string, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};


import { Platform, ViewStyle } from 'react-native';

/**
 * Apna Samaj Mobile Design System — Elevation & Shadow Tokens
 * Lightweight elevation optimized for low-end Android GPUs and battery life.
 */
export const shadows: Record<'none' | 'subtle' | 'card' | 'floating' | 'topBar' | 'bottomNav', ViewStyle> = {
  none: {
    ...Platform.select({
      android: { elevation: 0 },
      ios: {
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
      },
      default: {},
    }),
  },
  subtle: {
    ...Platform.select({
      android: { elevation: 1 },
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      default: {},
    }),
  },
  card: {
    ...Platform.select({
      android: { elevation: 2 },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      default: {},
    }),
  },
  floating: {
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      default: {},
    }),
  },
  topBar: {
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      default: {},
    }),
  },
  bottomNav: {
    ...Platform.select({
      android: { elevation: 8 },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 5,
      },
      default: {},
    }),
  },
};


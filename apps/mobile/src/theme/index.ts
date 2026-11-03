import { colors } from './colors';
import { fontFamilies, fontSizes, lineHeights, fontWeights } from './typography';
import { spacing } from './spacing';
import { borderRadius } from './borderRadius';
import { shadows } from './shadows';

export const theme = {
  colors,
  typography: {
    fontFamilies,
    fontSizes,
    lineHeights,
    fontWeights,
  },
  spacing,
  borderRadius,
  shadows,
} as const;

export type Theme = typeof theme;

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './borderRadius';
export * from './shadows';


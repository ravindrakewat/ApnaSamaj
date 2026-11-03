/**
 * Apna Samaj Mobile Design System — Border Radius Tokens
 * Subtle, modern rounded cards and chips.
 */
export const borderRadius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

export type BorderRadiusToken = keyof typeof borderRadius;


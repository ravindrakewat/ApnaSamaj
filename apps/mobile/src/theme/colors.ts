/**
 * Apna Samaj Mobile Design System — Color Tokens
 * Optimized for high contrast, clean white background, and professional community appearance.
 */
export const colors = {
  // Brand Primary (Apna Samaj Classic Blue)
  primary: '#1976D2',
  primaryDark: '#1565C0',
  primaryLight: '#E3F2FD',
  primaryBorder: '#90CAF9',

  // Brand Secondary (Community Purple)
  secondary: '#9C27B0',
  secondaryDark: '#7B1FA2',
  secondaryLight: '#F3E5F5',

  // Background & Surfaces
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9',

  // Typography / Content
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Borders & Dividers
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  // Functional & Semantic States
  success: '#16A34A',
  successLight: '#DCFCE7',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  info: '#0284C7',
  infoLight: '#E0F2FE',

  // Interactive Overlays
  ripple: 'rgba(25, 118, 210, 0.12)',
  disabled: '#94A3B8',
  disabledSurface: '#E2E8F0',
} as const;

export type ColorToken = keyof typeof colors;


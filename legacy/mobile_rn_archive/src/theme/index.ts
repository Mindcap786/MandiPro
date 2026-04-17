/**
 * Design System — MandiPro Mobile
 * ────────────────────────────────
 * Single source of truth for colors, typography, spacing, and shadows.
 * Supports light/dark modes via the `colors` export.
 */

import { Dimensions } from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Colors ─────────────────────────────────────────────────

export const palette = {
  // Brand
  primary: '#2563EB',        // Blue 600
  primaryLight: '#3B82F6',   // Blue 500
  primaryDark: '#1D4ED8',    // Blue 700

  // Semantic
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#DC2626',
  errorLight: '#FEE2E2',
  info: '#0EA5E9',
  infoLight: '#E0F2FE',

  // Neutral
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',

  // Transparent
  overlay: 'rgba(0,0,0,0.5)',
  backdrop: 'rgba(0,0,0,0.3)',
} as const;

export const colors = {
  light: {
    ...palette,
    background: palette.white,
    surface: palette.gray50,
    card: palette.white,
    text: palette.gray900,
    textSecondary: palette.gray500,
    textMuted: palette.gray400,
    border: palette.gray200,
    divider: palette.gray100,
    primary: palette.primary,
    primaryText: palette.white,
  },
  dark: {
    ...palette,
    background: palette.gray900,
    surface: palette.gray800,
    card: palette.gray800,
    text: palette.gray50,
    textSecondary: palette.gray400,
    textMuted: palette.gray500,
    border: palette.gray700,
    divider: palette.gray800,
    primary: palette.primaryLight,
    primaryText: palette.white,
  },
} as const;

export type ThemeColors = typeof colors.light;

// ─── Typography ─────────────────────────────────────────────

export const fonts = {
  regular: 'System',
  medium: 'System',
  semiBold: 'System',
  bold: 'System',
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const lineHeight = {
  xs: 16,
  sm: 18,
  md: 22,
  lg: 24,
  xl: 28,
  '2xl': 32,
  '3xl': 38,
  '4xl': 44,
} as const;

// ─── Spacing ────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
} as const;

// ─── Border Radius ──────────────────────────────────────────

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

// ─── Shadows ────────────────────────────────────────────────

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
} as const;

// ─── Layout Constants ───────────────────────────────────────

export const layout = {
  screenWidth: SCREEN_W,
  screenHeight: SCREEN_H,
  maxContentWidth: 600,
  headerHeight: 56,
  tabBarHeight: 60,
  bottomInset: 34,  // iPhone notch-era safe area
} as const;

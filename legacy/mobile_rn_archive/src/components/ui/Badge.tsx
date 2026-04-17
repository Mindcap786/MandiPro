/**
 * Badge — Inline status/tag indicator
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { palette, spacing, radius, fontSize } from '@/theme';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const colorMap: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: palette.gray100, text: palette.gray700 },
  success: { bg: palette.successLight, text: palette.success },
  warning: { bg: palette.warningLight, text: palette.warning },
  error: { bg: palette.errorLight, text: palette.error },
  info: { bg: palette.infoLight, text: palette.info },
};

export function Badge({ label, variant = 'default', style }: BadgeProps) {
  const { bg, text } = colorMap[variant];

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});

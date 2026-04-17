/**
 * Row — Horizontal flex container with common alignment presets.
 */

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '@/theme';

interface RowProps {
  children: React.ReactNode;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'between';
  style?: ViewStyle;
}

const alignMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
} as const;

export function Row({ children, gap = spacing.sm, align = 'center', style }: RowProps) {
  return (
    <View
      style={[
        styles.row,
        { gap, justifyContent: alignMap[align] as any },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

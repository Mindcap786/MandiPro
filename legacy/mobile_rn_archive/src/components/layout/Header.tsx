/**
 * Header — Screen header with title, subtitle, back button, and right action.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { palette, spacing, fontSize, layout } from '@/theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
}

export function Header({ title, subtitle, onBack, backLabel = 'Back', right }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={12}>
            <Text style={styles.backText}>{`\u2039 ${backLabel}`}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
    backgroundColor: palette.white,
  },
  left: {
    width: 80,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  right: {
    width: 80,
    alignItems: 'flex-end',
  },
  backBtn: {
    paddingVertical: spacing.xs,
  },
  backText: {
    fontSize: fontSize.md,
    color: palette.primary,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.gray900,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: palette.gray500,
    marginTop: 1,
  },
});

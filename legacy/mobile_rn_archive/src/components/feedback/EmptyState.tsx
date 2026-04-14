/**
 * EmptyState — Shown when a list/screen has no data.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { palette, spacing, fontSize } from '@/theme';
import { Button } from '@/components/ui/Button';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {actionLabel && onAction && (
        <Button title={actionLabel} onPress={onAction} variant="outline" size="sm" style={styles.btn} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['3xl'],
  },
  icon: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.gray900,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.sm,
    color: palette.gray500,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  btn: {
    marginTop: spacing.xl,
  },
});

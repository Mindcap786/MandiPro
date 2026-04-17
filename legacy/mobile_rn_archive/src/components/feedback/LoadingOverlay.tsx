/**
 * LoadingOverlay — Full-screen loading with optional message.
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { palette, fontSize, spacing } from '@/theme';

interface LoadingOverlayProps {
  message?: string;
  visible?: boolean;
}

export function LoadingOverlay({ message = 'Loading...', visible = true }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  box: {
    backgroundColor: palette.white,
    borderRadius: 12,
    padding: spacing['2xl'],
    alignItems: 'center',
    minWidth: 160,
  },
  message: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: palette.gray700,
  },
});

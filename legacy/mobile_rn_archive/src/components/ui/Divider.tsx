import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { palette, spacing } from '@/theme';

interface DividerProps {
  style?: ViewStyle;
  vertical?: boolean;
}

export function Divider({ style, vertical }: DividerProps) {
  return (
    <View
      style={[
        vertical ? styles.vertical : styles.horizontal,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: {
    height: 1,
    backgroundColor: palette.gray200,
    marginVertical: spacing.md,
  },
  vertical: {
    width: 1,
    backgroundColor: palette.gray200,
    marginHorizontal: spacing.md,
    alignSelf: 'stretch',
  },
});

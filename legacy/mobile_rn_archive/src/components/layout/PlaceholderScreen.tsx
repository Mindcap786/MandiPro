import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Header } from '@/components/layout';
import { palette, spacing, fontSize } from '@/theme';

export function PlaceholderScreen({ route, navigation }: any) {
  const { title = 'Coming Soon', subtitle = 'This module is being optimized for mobile.' } = route.params || {};

  return (
    <Screen scroll={false} padded={false}>
      <Header title={title} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.icon}>🚧</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: palette.gray50,
  },
  icon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: palette.gray900,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.md,
    color: palette.gray500,
    textAlign: 'center',
    lineHeight: 22,
  },
});

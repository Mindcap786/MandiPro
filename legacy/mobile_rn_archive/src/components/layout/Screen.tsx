/**
 * Screen — Base screen wrapper with SafeArea, scroll, and keyboard handling.
 */

import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, spacing } from '@/theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  keyboard?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  backgroundColor?: string;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  keyboard = true,
  style,
  contentStyle,
  backgroundColor = palette.white,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const content = (
    <View
      style={[
        styles.content,
        padded && styles.padded,
        { paddingBottom: insets.bottom + spacing.lg },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  ) : (
    content
  );

  const wrapped = keyboard ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      {inner}
    </KeyboardAvoidingView>
  ) : (
    inner
  );

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor, paddingTop: insets.top },
        style,
      ]}
    >
      <StatusBar barStyle="dark-content" />
      {wrapped}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  content: { flex: 1 },
  padded: { paddingHorizontal: spacing.lg },
  scrollContent: { flexGrow: 1 },
});

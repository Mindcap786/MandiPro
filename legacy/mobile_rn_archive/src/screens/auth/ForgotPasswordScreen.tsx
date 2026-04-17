/**
 * Forgot Password Screen — Send password reset email.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/types';
import { supabase } from '@/api/supabase';
import { useToastStore } from '@/stores/toast-store';
import { Screen } from '@/components/layout';
import { Input, Button } from '@/components/ui';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const toast = useToastStore();

  const handleReset = async () => {
    if (!email.trim()) {
      toast.show('Please enter your email', 'error');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
    setLoading(false);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    setSent(true);
    toast.show('Reset link sent to your email', 'success');
  };

  return (
    <Screen scroll padded keyboard>
      <View style={styles.container}>
        <Text style={styles.heading}>Reset Password</Text>
        <Text style={styles.description}>
          {sent
            ? 'Check your inbox for the reset link. You can close this screen.'
            : 'Enter your registered email and we\'ll send a reset link.'}
        </Text>

        {!sent && (
          <>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
              required
            />

            <Button
              title="Send Reset Link"
              onPress={handleReset}
              loading={loading}
              fullWidth
              size="lg"
            />
          </>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'\u2039'} Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: palette.gray900,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.md,
    color: palette.gray500,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  backBtn: {
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  backText: {
    fontSize: fontSize.md,
    color: palette.primary,
  },
});

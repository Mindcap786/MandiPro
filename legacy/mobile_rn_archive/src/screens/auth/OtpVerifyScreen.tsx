/**
 * OTP Verification Screen — User enters OTP sent to their email.
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

type Props = NativeStackScreenProps<AuthStackParamList, 'OtpVerify'>;

export function OtpVerifyScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const toast = useToastStore();

  const handleVerify = async () => {
    if (otp.length < 6) {
      toast.show('Please enter the 6-digit code', 'error');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'signup',
    });
    setLoading(false);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    toast.show('Email verified! Welcome to MandiPro.', 'success');
    // Auth state change listener will auto-navigate to Main
  };

  const handleResend = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    setResending(false);

    if (error) {
      toast.show(error.message, 'error');
    } else {
      toast.show('New code sent!', 'success');
    }
  };

  return (
    <Screen scroll padded keyboard>
      <View style={styles.container}>
        <Text style={styles.heading}>Verify Email</Text>
        <Text style={styles.description}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>

        <Input
          label="Verification Code"
          placeholder="000000"
          value={otp}
          onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          autoFocus
          required
        />

        <Button
          title="Verify"
          onPress={handleVerify}
          loading={loading}
          fullWidth
          size="lg"
        />

        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Didn't receive the code? </Text>
          <TouchableOpacity onPress={handleResend} disabled={resending}>
            <Text style={styles.resendLink}>{resending ? 'Sending...' : 'Resend'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{'\u2039'} Back to Signup</Text>
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
  email: {
    fontWeight: '600',
    color: palette.gray800,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  resendText: {
    fontSize: fontSize.sm,
    color: palette.gray500,
  },
  resendLink: {
    fontSize: fontSize.sm,
    color: palette.primary,
    fontWeight: '600',
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

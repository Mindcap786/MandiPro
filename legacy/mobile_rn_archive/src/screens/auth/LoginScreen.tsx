/**
 * Login Screen — Email + Password sign-in with forgot password link.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { Screen } from '@/components/layout';
import { Input, Button } from '@/components/ui';
import { palette, spacing, fontSize, radius } from '@/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, loading } = useAuthStore();
  const toast = useToastStore();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      toast.show('Please enter email and password', 'error');
      return;
    }

    const { error } = await signIn(email.trim().toLowerCase(), password);
    if (error) {
      toast.show(error, 'error');
    }
    // On success, RootNavigator auto-switches to Main via session state
  };

  return (
    <Screen scroll padded keyboard>
      <View style={styles.container}>
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <Text style={styles.logo}>MandiPro</Text>
          <Text style={styles.tagline}>Mandi Management Platform</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.heading}>Sign In</Text>

          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            required
          />

          <Input
            label="Password"
            placeholder="Enter password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            rightIcon={
              <Text style={styles.eyeIcon}>{showPassword ? '\u{1F441}' : '\u{1F441}\u200D\u{1F5E8}'}</Text>
            }
            onRightIconPress={() => setShowPassword(!showPassword)}
            required
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotBtn}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            size="lg"
          />
        </View>

        {/* Switch to Signup */}
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
            <Text style={styles.switchLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logo: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    color: palette.primary,
  },
  tagline: {
    fontSize: fontSize.sm,
    color: palette.gray500,
    marginTop: spacing.xs,
  },
  form: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  heading: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: palette.gray900,
    marginBottom: spacing.xl,
  },
  eyeIcon: {
    fontSize: 16,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.xl,
    marginTop: -spacing.sm,
  },
  forgotText: {
    fontSize: fontSize.sm,
    color: palette.primary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  switchText: {
    fontSize: fontSize.md,
    color: palette.gray500,
  },
  switchLink: {
    fontSize: fontSize.md,
    color: palette.primary,
    fontWeight: '600',
  },
});

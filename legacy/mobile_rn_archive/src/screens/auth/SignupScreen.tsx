/**
 * Signup Screen — Email, username (live uniqueness check), password confirm,
 * full name, business name, plan selection, then OTP verification.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '@/navigation/types';
import { useToastStore } from '@/stores/toast-store';
import { api } from '@/api/client';
import { Screen } from '@/components/layout';
import { Input, Button, Badge } from '@/components/ui';
import { palette, spacing, fontSize, radius } from '@/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

const PLANS = [
  { slug: 'basic', name: 'Basic', monthlyPrice: 499, yearlyPrice: 4999, users: 3 },
  { slug: 'standard', name: 'Standard', monthlyPrice: 999, yearlyPrice: 9999, users: 10 },
  { slug: 'enterprise', name: 'Enterprise', monthlyPrice: 2499, yearlyPrice: 24999, users: 50 },
];

export function SignupScreen({ navigation }: Props) {
  const toast = useToastStore();

  // Form state
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('basic');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Validation state
  const [emailTaken, setEmailTaken] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [checkingUnique, setCheckingUnique] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Uniqueness Check ───
  const checkUniqueness = useCallback(
    async (field: 'email' | 'username', value: string) => {
      if (!value.trim()) return;
      setCheckingUnique(true);
      try {
        const res = await api.post<{ emailTaken: boolean; usernameTaken: boolean }>(
          '/api/auth/check-unique',
          {
            email: field === 'email' ? value.trim().toLowerCase() : undefined,
            username: field === 'username' ? value.trim().toLowerCase() : undefined,
          }
        );
        if (res.ok && res.data) {
          if (field === 'email') setEmailTaken(res.data.emailTaken);
          if (field === 'username') setUsernameTaken(res.data.usernameTaken);
        }
      } catch {}
      setCheckingUnique(false);
    },
    []
  );

  // ─── Submit ───
  const handleSignup = async () => {
    // Validation
    if (!email || !username || !fullName || !businessName || !password || !confirmPassword) {
      toast.show('Please fill all fields', 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast.show('Passwords do not match', 'error');
      return;
    }
    if (password.length < 8) {
      toast.show('Password must be at least 8 characters', 'error');
      return;
    }
    if (emailTaken || usernameTaken) {
      toast.show('Email or username is already taken', 'error');
      return;
    }

    setSubmitting(true);

    // Supabase signup (sends OTP email)
    const { supabase } = await import('@/api/supabase');
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          username: username.trim().toLowerCase(),
          business_name: businessName.trim(),
          plan: selectedPlan,
          billing_cycle: billingCycle,
        },
      },
    });

    setSubmitting(false);

    if (error) {
      toast.show(error.message, 'error');
      return;
    }

    toast.show('Verification email sent!', 'success');
    navigation.navigate('OtpVerify', { email: email.trim().toLowerCase() });
  };

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  return (
    <Screen scroll padded keyboard>
      <View style={styles.container}>
        <Text style={styles.heading}>Create Account</Text>
        <Text style={styles.subheading}>Set up your MandiPro business account</Text>

        {/* Full Name */}
        <Input
          label="Full Name"
          placeholder="Ramesh Kumar"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          required
        />

        {/* Business Name */}
        <Input
          label="Business / Organization Name"
          placeholder="Kumar Mandi Pvt. Ltd."
          value={businessName}
          onChangeText={setBusinessName}
          required
        />

        {/* Email */}
        <Input
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setEmailTaken(false);
          }}
          onBlur={() => checkUniqueness('email', email)}
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailTaken ? 'This email is already registered' : undefined}
          required
        />

        {/* Username */}
        <Input
          label="Username"
          placeholder="ramesh_kumar"
          value={username}
          onChangeText={(t) => {
            setUsername(t.replace(/[^a-z0-9_]/gi, '').toLowerCase());
            setUsernameTaken(false);
          }}
          onBlur={() => checkUniqueness('username', username)}
          autoCapitalize="none"
          error={usernameTaken ? 'This username is taken' : undefined}
          hint={!usernameTaken && username.length > 0 ? `@${username}` : undefined}
          required
        />

        {/* Password */}
        <Input
          label="Password"
          placeholder="Min. 8 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          required
        />

        {/* Confirm Password */}
        <Input
          label="Confirm Password"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          error={
            confirmPassword.length > 0 && !passwordsMatch
              ? 'Passwords do not match'
              : undefined
          }
          hint={passwordsMatch ? '\u2713 Passwords match' : undefined}
          required
        />

        {/* Billing Cycle Toggle */}
        <View style={styles.cycleRow}>
          <TouchableOpacity
            style={[styles.cycleBtn, billingCycle === 'monthly' && styles.cycleBtnActive]}
            onPress={() => setBillingCycle('monthly')}
          >
            <Text style={[styles.cycleBtnText, billingCycle === 'monthly' && styles.cycleBtnTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cycleBtn, billingCycle === 'yearly' && styles.cycleBtnActive]}
            onPress={() => setBillingCycle('yearly')}
          >
            <Text style={[styles.cycleBtnText, billingCycle === 'yearly' && styles.cycleBtnTextActive]}>
              Yearly (Save 17%)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Plan Selection */}
        <Text style={styles.sectionLabel}>Select Plan</Text>
        {PLANS.map((plan) => {
          const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
          const isSelected = selectedPlan === plan.slug;
          return (
            <TouchableOpacity
              key={plan.slug}
              style={[styles.planCard, isSelected && styles.planCardSelected]}
              onPress={() => setSelectedPlan(plan.slug)}
              activeOpacity={0.7}
            >
              <View style={styles.planHeader}>
                <Text style={[styles.planName, isSelected && styles.planNameSelected]}>
                  {plan.name}
                </Text>
                <Badge
                  label={`${plan.users} users`}
                  variant={isSelected ? 'info' : 'default'}
                />
              </View>
              <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
                {'\u20B9'}{price.toLocaleString('en-IN')}/{billingCycle === 'monthly' ? 'mo' : 'yr'}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Submit */}
        <Button
          title="Create Account"
          onPress={handleSignup}
          loading={submitting}
          fullWidth
          size="lg"
          style={{ marginTop: spacing.xl }}
        />

        {/* Switch to Login */}
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.switchLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing['2xl'],
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    color: palette.gray900,
  },
  subheading: {
    fontSize: fontSize.sm,
    color: palette.gray500,
    marginBottom: spacing.xl,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: palette.gray700,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  cycleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  cycleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.gray300,
    alignItems: 'center',
  },
  cycleBtnActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  cycleBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: palette.gray600,
  },
  cycleBtnTextActive: {
    color: palette.white,
  },
  planCard: {
    borderWidth: 1,
    borderColor: palette.gray200,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planCardSelected: {
    borderColor: palette.primary,
    backgroundColor: '#EFF6FF',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  planName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: palette.gray800,
  },
  planNameSelected: {
    color: palette.primary,
  },
  planPrice: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: palette.gray900,
  },
  planPriceSelected: {
    color: palette.primaryDark,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing['2xl'],
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

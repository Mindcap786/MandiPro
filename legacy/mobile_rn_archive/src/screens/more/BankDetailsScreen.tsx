/**
 * Bank Details Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'BankDetails'>;

export function BankDetailsScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['org-prefs', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('organization_preferences')
        .select('bank_details, upi_id')
        .eq('organization_id', orgId!)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || {};
    },
    enabled: !!orgId,
  });

  const renderField = (label: string, value: string) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || 'Not configured'}</Text>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Bank Details (Invoices)" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Primary Invoice Bank Account</Text>
          {renderField('Bank Details JSON / Text', JSON.stringify((prefs as any)?.bank_details || 'None', null, 2))}
          {renderField('UPI ID', (prefs as any)?.upi_id || 'None')}
        </View>
        <Text style={styles.note}>Note: To edit these settings, please log into the Web Dashboard as an Administrator.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.primary, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: fontSize.sm, color: palette.gray900, fontWeight: '600', backgroundColor: palette.gray50, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: palette.gray100 },
  note: { marginTop: spacing.lg, textAlign: 'center', color: palette.gray500, fontSize: fontSize.xs, fontStyle: 'italic', paddingHorizontal: spacing.lg }
});

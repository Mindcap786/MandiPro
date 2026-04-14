/**
 * Compliance Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Compliance'>;

export function ComplianceScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['org-compliance', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('organization_preferences')
        .select('mandi_license_no, market_fee_percent, nirashrit_percent')
        .eq('organization_id', orgId!)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || {};
    },
    enabled: !!orgId,
  });

  const renderItem = (label: string, value: string) => (
    <View style={styles.item}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || 'Not Configured'}</Text>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Legal & Compliance" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Mandi Licenses</Text>
          {renderItem('Mandi License No.', (prefs as any)?.mandi_license_no)}
          {renderItem('Market Fee Rate', `${(prefs as any)?.market_fee_percent || 0}%`)}
          {renderItem('Nirashrit Fund Rate', `${(prefs as any)?.nirashrit_percent || 0}%`)}
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={styles.sectionTitle}>Data Privacy</Text>
          <Text style={styles.subText}>Your data is stored securely in compliance with regional data sovereignty laws. Periodic backups are performed every 24 hours.</Text>
        </View>

        <Text style={styles.note}>For detailed compliance certificates, please contact MandiPro support.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.primary, marginBottom: spacing.md },
  item: { marginBottom: spacing.md },
  label: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: fontSize.sm, color: palette.gray900, fontWeight: '600' },
  subText: { fontSize: fontSize.sm, color: palette.gray600, lineHeight: 20 },
  note: { marginTop: spacing.lg, textAlign: 'center', color: palette.gray500, fontSize: fontSize.xs, fontStyle: 'italic', paddingHorizontal: spacing.lg }
});

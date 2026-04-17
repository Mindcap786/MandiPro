/**
 * Fields Governance Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'FieldsGovernance'>;

export function FieldsGovernanceScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['org-prefs', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('organization_preferences')
        .select('*')
        .eq('organization_id', orgId!)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || {};
    },
    enabled: !!orgId,
  });

  const renderToggle = (label: string, value: boolean) => (
    <Row align="between" style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} disabled trackColor={{ true: palette.primary, false: palette.gray200 }} />
    </Row>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Fields Governance" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.card}>
          {renderToggle('Enable Market Fee (Mandi Tax)', prefs?.enable_market_fee ?? true)}
          {renderToggle('Enable Nirashrit Fund', prefs?.enable_nirashrit ?? true)}
          {renderToggle('Default to Cash Sales', prefs?.default_cash_sales ?? false)}
          {renderToggle('Print Item-wise Commission', prefs?.print_item_commission ?? true)}
          {renderToggle('Show Advance Deductions', prefs?.show_advance_deductions ?? true)}
          {renderToggle('Collect Labor Charges', prefs?.collect_labor_charges ?? true)}
        </View>
        <Text style={styles.note}>Note: To edit these settings, please log into the Web Dashboard as an Administrator.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  row: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  label: { fontSize: fontSize.sm, color: palette.gray800, fontWeight: '600' },
  note: { marginTop: spacing.lg, textAlign: 'center', color: palette.gray500, fontSize: fontSize.xs, fontStyle: 'italic', paddingHorizontal: spacing.lg }
});

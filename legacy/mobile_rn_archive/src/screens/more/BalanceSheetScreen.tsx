/**
 * Balance Sheet Screen
 * Real-time overview of Assets, Liabilities, and Equity.
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

type Props = NativeStackScreenProps<MoreStackParamList, 'BalanceSheet'>;

export function BalanceSheetScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: accounts = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['balance-sheet-accounts', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('accounts')
        .select('name, type, account_sub_type, current_balance')
        .eq('organization_id', orgId!)
        .in('type', ['asset', 'liability', 'equity', 'bank', 'cash'])
        .neq('current_balance', 0)
        .order('type');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const fmt = (n: number) => `₹${Math.abs(Number(n || 0)).toLocaleString('en-IN')}`;

  const assets = accounts.filter(a => ['asset', 'bank', 'cash'].includes(a.type));
  const liabilities = accounts.filter(a => ['liability', 'equity'].includes(a.type));

  const totalAssets = assets.reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const totalLiab = liabilities.reduce((s, a) => s + Number(a.current_balance || 0), 0);

  const renderSection = (title: string, list: any[], total: number) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {list.length === 0 ? (
        <Text style={styles.emptyText}>No accounts found.</Text>
      ) : (
        list.map((acc, idx) => (
          <Row key={idx} align="between" style={styles.row}>
            <View>
              <Text style={styles.accName}>{acc.name}</Text>
              <Text style={styles.accType}>{acc.account_sub_type || acc.type}</Text>
            </View>
            <Text style={styles.accBal}>{fmt(acc.current_balance)}</Text>
          </Row>
        ))
      )}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total {title}</Text>
        <Text style={styles.totalValue}>{fmt(total)}</Text>
      </View>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Balance Sheet" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}>
        {renderSection('Assets', assets, totalAssets)}
        {renderSection('Liabilities & Equity', liabilities, totalLiab)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.primary, textTransform: 'uppercase', marginBottom: spacing.md },
  row: { borderBottomWidth: 1, borderBottomColor: palette.gray100, paddingBottom: spacing.sm, marginBottom: spacing.sm },
  accName: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray900 },
  accType: { fontSize: fontSize.xs, color: palette.gray500, textTransform: 'capitalize' },
  accBal: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray800 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 2, borderTopColor: palette.gray200 },
  totalLabel: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray900 },
  totalValue: { fontSize: fontSize.lg, fontWeight: '900', color: palette.primary },
  emptyText: { color: palette.gray400, fontStyle: 'italic', marginBottom: spacing.md }
});

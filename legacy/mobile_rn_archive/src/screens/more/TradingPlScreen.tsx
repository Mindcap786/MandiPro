/**
 * Trading P&L Screen
 * Real-time overview of Income and Expenses.
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

type Props = NativeStackScreenProps<MoreStackParamList, 'TradingPl'>;

export function TradingPlScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: accounts = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['trading-pl-accounts', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('accounts')
        .select('name, type, account_sub_type, current_balance')
        .eq('organization_id', orgId!)
        .in('type', ['income', 'expense'])
        .neq('current_balance', 0)
        .order('type');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const fmt = (n: number) => `₹${Math.abs(Number(n || 0)).toLocaleString('en-IN')}`;

  const income = accounts.filter(a => a.type === 'income');
  const expense = accounts.filter(a => a.type === 'expense');

  // Income is normally credit balance (so it might be negative in some DB schemas depending on ledger structure)
  // Let's take Math.abs for simplistic view
  const totalIncome = income.reduce((s, a) => s + Math.abs(Number(a.current_balance || 0)), 0);
  const totalExpense = expense.reduce((s, a) => s + Math.abs(Number(a.current_balance || 0)), 0);
  const netProfit = totalIncome - totalExpense;

  const renderSection = (title: string, list: any[], total: number) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: title === 'Income' ? palette.success : palette.error }]}>{title}</Text>
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
        <Text style={[styles.totalValue, { color: title === 'Income' ? palette.success : palette.error }]}>{fmt(total)}</Text>
      </View>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Trading P&L" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}>
        
        <View style={styles.profitBox}>
          <Text style={styles.profitLabel}>Net Profit/Loss</Text>
          <Text style={[styles.profitVal, { color: netProfit >= 0 ? palette.success : palette.error }]}>
            {netProfit >= 0 ? '+' : '-'}{fmt(Math.abs(netProfit))}
          </Text>
        </View>

        {renderSection('Income', income, totalIncome)}
        {renderSection('Expenses', expense, totalExpense)}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profitBox: { backgroundColor: palette.white, padding: spacing.lg, borderRadius: radius.lg, marginBottom: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: palette.gray200, ...shadows.md },
  profitLabel: { fontSize: fontSize.sm, color: palette.gray500, fontWeight: '700', textTransform: 'uppercase' },
  profitVal: { fontSize: 32, fontWeight: '900', marginTop: spacing.xs },
  
  section: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', textTransform: 'uppercase', marginBottom: spacing.md },
  row: { borderBottomWidth: 1, borderBottomColor: palette.gray100, paddingBottom: spacing.sm, marginBottom: spacing.sm },
  accName: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray900 },
  accType: { fontSize: fontSize.xs, color: palette.gray500, textTransform: 'capitalize' },
  accBal: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray800 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 2, borderTopColor: palette.gray200 },
  totalLabel: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray900 },
  totalValue: { fontSize: fontSize.lg, fontWeight: '900' },
  emptyText: { color: palette.gray400, fontStyle: 'italic', marginBottom: spacing.md }
});

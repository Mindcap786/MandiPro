/**
 * Finance Screen — Ledger summary: accounts and recent ledger entries.
 */

import React from 'react';
import { ScrollView, Text, View, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Divider, Badge } from '@/components/ui';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'FinanceOverview'>;

export function FinanceScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery({
    queryKey: ['accounts', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        
        .from('accounts')
        .select('id, name, type, opening_balance, is_active')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('type');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const { data: recentEntries = [], isLoading: loadingEntries, refetch: refetchEntries } = useQuery({
    queryKey: ['ledger-recent', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        
        .from('ledger_entries')
        .select('id, entry_date, debit, credit, narration, transaction_type')
        .eq('organization_id', orgId!)
        .order('entry_date', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const fmt = (n: number) =>
    `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const isLoading = loadingAccounts || loadingEntries;
  const refetch = () => { refetchAccounts(); refetchEntries(); };

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header title="Finance" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      >
        {/* Accounts */}
        <Text style={styles.sectionTitle}>Chart of Accounts</Text>
        <Card padded elevated style={styles.card}>
          {accounts.slice(0, 8).map((acc, idx) => (
            <View key={acc.id}>
              {idx > 0 && <Divider />}
              <Row align="between" style={styles.accRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accName} numberOfLines={1}>{acc.name}</Text>
                  <Text style={styles.accType}>{acc.type}</Text>
                </View>
                {acc.opening_balance != null && (
                  <Text style={styles.accBalance}>{fmt(acc.opening_balance)}</Text>
                )}
              </Row>
            </View>
          ))}
          {accounts.length === 0 && (
            <Text style={styles.empty}>No accounts configured</Text>
          )}
        </Card>

        {/* Recent Ledger Entries */}
        <Text style={styles.sectionTitle}>Recent Ledger Entries</Text>
        <Card padded elevated style={styles.card}>
          {recentEntries.map((entry, idx) => (
            <View key={entry.id}>
              {idx > 0 && <Divider />}
              <Row align="between" style={styles.entryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryDate}>{entry.entry_date}</Text>
                  {entry.narration && (
                    <Text style={styles.entryNarration} numberOfLines={1}>{entry.narration}</Text>
                  )}
                </View>
                <View style={styles.entryAmounts}>
                  {entry.debit > 0 && (
                    <Text style={[styles.entryAmt, { color: palette.error }]}>DR {fmt(entry.debit)}</Text>
                  )}
                  {entry.credit > 0 && (
                    <Text style={[styles.entryAmt, { color: palette.success }]}>CR {fmt(entry.credit)}</Text>
                  )}
                </View>
              </Row>
            </View>
          ))}
          {recentEntries.length === 0 && (
            <Text style={styles.empty}>No ledger entries yet</Text>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: palette.gray700, marginBottom: spacing.md, marginTop: spacing.lg },
  card: { marginBottom: spacing.sm },
  accRow: { paddingVertical: spacing.sm },
  accName: { fontSize: fontSize.md, fontWeight: '500', color: palette.gray900 },
  accType: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  accBalance: { fontSize: fontSize.md, fontWeight: '600', color: palette.gray900 },
  entryRow: { paddingVertical: spacing.sm },
  entryDate: { fontSize: fontSize.sm, color: palette.gray500 },
  entryNarration: { fontSize: fontSize.md, color: palette.gray800, marginTop: 2 },
  entryAmounts: { alignItems: 'flex-end' },
  entryAmt: { fontSize: fontSize.sm, fontWeight: '600' },
  empty: { fontSize: fontSize.sm, color: palette.gray400, textAlign: 'center', padding: spacing.lg },
});

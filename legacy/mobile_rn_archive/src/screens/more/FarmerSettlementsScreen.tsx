/**
 * Farmer Settlements — 1:1 of web /finance/farmer-settlements.
 * Reads mandi.view_party_balances filtered to contact_type='farmer',
 * shows outstanding balance per farmer, lets user open Patti.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { palette, spacing, fontSize, radius } from '@/theme';

export function FarmerSettlementsScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');

  const { data = [], isRefetching, refetch } = useQuery({
    queryKey: ['farmer-settlements', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('view_party_balances')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('contact_type', 'farmer');
      if (error) throw new Error(error.message);
      return (data ?? []).map((f: any) => ({
        id: f.contact_id,
        name: f.contact_name,
        city: f.contact_city,
        balance: -Number(f.net_balance || 0), // farmer payable = -(debit-credit)
      }));
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(
    () => data.filter((f: any) => f.name?.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  const totalDue = useMemo(
    () => data.reduce((s: number, f: any) => s + Math.max(0, f.balance), 0),
    [data],
  );

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <Header title="Farmer Payables" onBack={() => navigation.goBack()} />
      <View style={{ padding: spacing.lg }}>
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={styles.kpiLabel}>GLOBAL OUTSTANDING</Text>
          <Text style={styles.kpiValue}>{fmt(totalDue)}</Text>
        </Card>
        <SearchInput placeholder="Search farmer..." value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No farmers found.</Text>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.city}>{item.city || 'Regional Area'}</Text>
              </View>
              <Badge
                label={item.balance > 0 ? 'PAYMENT DUE' : 'SETTLED'}
                variant={item.balance > 0 ? 'warning' : 'success'}
              />
            </View>
            <View style={styles.amountRow}>
              <Text style={styles.subLabel}>Outstanding</Text>
              <Text style={[styles.amount, { color: item.balance > 0 ? palette.warning : palette.success }]}>
                {fmt(Math.max(0, item.balance))}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                title="Statement"
                variant="outline"
                onPress={() => navigation.navigate('Ledger', { contactId: item.id })}
                style={{ flex: 1 }}
              />
              <Button
                title="Settle (Patti)"
                onPress={() => navigation.navigate('PattiNew', { farmerId: item.id })}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiLabel: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700', letterSpacing: 1 },
  kpiValue: { fontSize: fontSize['2xl'], fontWeight: '900', color: palette.success, marginTop: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: palette.gray900 },
  city: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.gray100 },
  subLabel: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '600' },
  amount: { fontSize: fontSize.xl, fontWeight: '900' },
  empty: { textAlign: 'center', padding: spacing['2xl'], color: palette.gray500 },
});

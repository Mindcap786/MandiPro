/**
 * Sales Orders List — 1:1 of web /sales-orders.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize, radius } from '@/theme';

const STATUSES = ['all', 'Draft', 'Sent', 'Accepted', 'Partially Invoiced', 'Fully Invoiced', 'Cancelled'];

export function SalesOrdersListScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data = [], isRefetching, refetch } = useQuery({
    queryKey: ['sales-orders', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('sales_orders')
        .select('*, buyer:contacts!sales_orders_buyer_id_fkey(id, name, city)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(
    () =>
      data.filter((o: any) => {
        const matchSearch =
          !search ||
          o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
          o.buyer?.name?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchSearch && matchStatus;
      }),
    [data, search, statusFilter],
  );

  const totalValue = filtered.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <Header
        title="Sales Orders"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('SalesOrderCreate')}>
            <Text style={styles.addBtn}>+ New</Text>
          </TouchableOpacity>
        }
      />
      <View style={{ padding: spacing.lg }}>
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={styles.kpiLabel}>TOTAL ORDER VALUE</Text>
          <Text style={styles.kpiValue}>{fmt(totalValue)}</Text>
        </Card>
        <SearchInput placeholder="Search SO # or buyer..." value={search} onChangeText={setSearch} />
        <View style={styles.tabs}>
          {STATUSES.map((s) => (
            <TouchableOpacity key={s} onPress={() => setStatusFilter(s)} style={[styles.tab, statusFilter === s && styles.tabActive]}>
              <Text style={[styles.tabText, statusFilter === s && styles.tabTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={styles.empty}>No sales orders found.</Text>}
        renderItem={({ item }: any) => (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.order_number}</Text>
                <Text style={styles.sub}>
                  {item.buyer?.name ?? 'Unknown'} · {new Date(item.order_date).toLocaleDateString('en-IN')}
                </Text>
              </View>
              <Badge label={item.status?.toUpperCase() || 'DRAFT'} variant="info" />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.amount}>{fmt(item.total_amount || 0)}</Text>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { color: palette.primary, fontWeight: '700', fontSize: fontSize.md },
  kpiLabel: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700', letterSpacing: 1 },
  kpiValue: { fontSize: fontSize['2xl'], fontWeight: '900', color: palette.gray900, marginTop: spacing.xs },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.gray200 },
  tabActive: { backgroundColor: palette.gray900, borderColor: palette.gray900 },
  tabText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray600 },
  tabTextActive: { color: palette.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900 },
  sub: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  metaRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100 },
  amount: { fontSize: fontSize.lg, fontWeight: '900', color: palette.gray900, textAlign: 'right' },
  empty: { textAlign: 'center', color: palette.gray500, padding: spacing['2xl'] },
});

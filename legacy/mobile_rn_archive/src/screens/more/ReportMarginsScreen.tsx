/**
 * Margin Analysis Report — 1:1 of web /reports/margins.
 * Reads mandi.sale_items joined to sales/lots/items, aggregates by item or buyer.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { Select } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { palette, spacing, fontSize, radius } from '@/theme';

export function ReportMarginsScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [period, setPeriod] = useState('30');
  const [view, setView] = useState<'items' | 'customers'>('items');

  const { data: saleItems = [], isRefetching, refetch } = useQuery({
    queryKey: ['margins', orgId, period],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - parseInt(period));
      const { data, error } = await mandi()
        .from('sale_items')
        .select(
          `id, qty, rate, amount, cost_price, margin_amount,
           sale:sales!sale_id(id, sale_date, buyer_id, buyer:contacts!buyer_id(id, name)),
           lot:lots!lot_id(id, supplier_rate, item:items!item_id(id, name))`,
        )
        .eq('organization_id', orgId!)
        .gte('sale.sale_date', since.toISOString())
        .order('amount', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const itemMargins = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; cost: number; qty: number }>();
    saleItems.forEach((si: any) => {
      const id = si.lot?.item?.id || 'unknown';
      const name = si.lot?.item?.name || 'Unknown';
      const e = map.get(id) || { name, revenue: 0, cost: 0, qty: 0 };
      e.revenue += si.amount || 0;
      e.cost += si.cost_price || (si.lot?.supplier_rate || 0) * si.qty;
      e.qty += si.qty || 0;
      map.set(id, e);
    });
    return Array.from(map.entries())
      .map(([id, d]) => ({
        id,
        ...d,
        margin: d.revenue - d.cost,
        marginPct: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.margin - a.margin);
  }, [saleItems]);

  const customerMargins = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; cost: number; orders: number }>();
    saleItems.forEach((si: any) => {
      const id = si.sale?.buyer?.id || 'unknown';
      const name = si.sale?.buyer?.name || 'Unknown';
      const e = map.get(id) || { name, revenue: 0, cost: 0, orders: 0 };
      e.revenue += si.amount || 0;
      e.cost += si.cost_price || (si.lot?.supplier_rate || 0) * si.qty;
      e.orders += 1;
      map.set(id, e);
    });
    return Array.from(map.entries())
      .map(([id, d]) => ({
        id,
        ...d,
        margin: d.revenue - d.cost,
        marginPct: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.margin - a.margin);
  }, [saleItems]);

  const totalRevenue = saleItems.reduce((s: number, si: any) => s + (si.amount || 0), 0);
  const totalCost = saleItems.reduce(
    (s: number, si: any) => s + (si.cost_price || (si.lot?.supplier_rate || 0) * si.qty),
    0,
  );
  const totalMargin = totalRevenue - totalCost;
  const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <Header title="Margin Analysis" onBack={() => navigation.goBack()} />
      <View style={{ padding: spacing.lg }}>
        <Select
          label="Period"
          options={[
            { label: 'Last 7 Days', value: '7' },
            { label: 'Last 30 Days', value: '30' },
            { label: 'Last 90 Days', value: '90' },
            { label: 'Last Year', value: '365' },
          ]}
          value={period}
          onChange={setPeriod}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md }}>
          <Card style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>REVENUE</Text>
            <Text style={styles.kpiValue}>{fmt(totalRevenue)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>COST</Text>
            <Text style={styles.kpiValue}>{fmt(totalCost)}</Text>
          </Card>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <Card style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>MARGIN</Text>
            <Text style={[styles.kpiValue, { color: totalMargin >= 0 ? palette.success : palette.error }]}>
              {fmt(totalMargin)}
            </Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>MARGIN %</Text>
            <Text style={[styles.kpiValue, { color: totalMarginPct >= 0 ? palette.success : palette.error }]}>
              {totalMarginPct.toFixed(1)}%
            </Text>
          </Card>
        </View>
        <View style={styles.tabs}>
          {(['items', 'customers'] as const).map((v) => (
            <TouchableOpacity key={v} onPress={() => setView(v)} style={[styles.tab, view === v && styles.tabActive]}>
              <Text style={[styles.tabText, view === v && styles.tabTextActive]}>
                {v === 'items' ? `By Item (${itemMargins.length})` : `By Customer (${customerMargins.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={view === 'items' ? itemMargins : customerMargins}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={styles.empty}>No data for the selected period.</Text>}
        renderItem={({ item }: any) => (
          <Card style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Badge
                label={`${item.marginPct.toFixed(1)}%`}
                variant={item.marginPct >= 20 ? 'success' : item.marginPct >= 0 ? 'warning' : 'error'}
              />
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.lbl}>Revenue</Text>
              <Text style={styles.val}>{fmt(item.revenue)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.lbl}>Cost</Text>
              <Text style={styles.val}>{fmt(item.cost)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.lbl}>Margin</Text>
              <Text style={[styles.val, { color: item.margin >= 0 ? palette.success : palette.error, fontWeight: '900' }]}>
                {fmt(item.margin)}
              </Text>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiLabel: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700' },
  kpiValue: { fontSize: fontSize.lg, fontWeight: '900', color: palette.gray900, marginTop: spacing.xs },
  tabs: { flexDirection: 'row', gap: spacing.xs },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.gray200, alignItems: 'center' },
  tabActive: { backgroundColor: palette.gray900, borderColor: palette.gray900 },
  tabText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray600 },
  tabTextActive: { color: palette.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  name: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900, flex: 1 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  lbl: { fontSize: fontSize.xs, color: palette.gray500 },
  val: { fontSize: fontSize.sm, color: palette.gray700 },
  empty: { textAlign: 'center', color: palette.gray500, padding: spacing['2xl'] },
});

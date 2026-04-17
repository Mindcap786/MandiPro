/**
 * Reports Screen — P&L summary, stock value, sales summary by period.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi, core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card } from '@/components/ui';
import { palette, spacing, fontSize, radius } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Reports'>;
type Period = 'today' | 'week' | 'month';

function periodRange(p: Period): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = fmt(now);

  if (p === 'today') return { from: to, to };
  if (p === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: fmt(from), to };
  }
  const from = new Date(now);
  from.setDate(1);
  return { from: fmt(from), to };
}

export function ReportsScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [period, setPeriod] = useState<Period>('month');
  const { from, to } = periodRange(period);

  const { data: salesStats, isLoading: loadingSales, refetch } = useQuery({
    queryKey: ['report-sales', orgId, from, to],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('sales')
        .select('total_amount, total_qty, status')
        .eq('organization_id', orgId!)
        .neq('status', 'draft')
        .gte('sale_date', from)
        .lte('sale_date', to);
      if (error) throw new Error(error.message);

      const rows = data ?? [];
      return {
        count: rows.length,
        totalAmount: rows.reduce((s, r) => s + (r.total_amount ?? 0), 0),
        totalQty: rows.reduce((s, r) => s + (r.total_qty ?? 0), 0),
      };
    },
    enabled: !!orgId,
  });

  const { data: stockStats } = useQuery({
    queryKey: ['report-stock', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('current_qty, supplier_rate, sale_price, status')
        .eq('organization_id', orgId!)
        .eq('status', 'active');
      if (error) throw new Error(error.message);

      const rows = data ?? [];
      return {
        count: rows.length,
        stockValue: rows.reduce(
          (s, r) => s + (r.current_qty ?? 0) * (r.supplier_rate ?? 0),
          0
        ),
        potentialRevenue: rows.reduce(
          (s, r) => s + (r.current_qty ?? 0) * (r.sale_price ?? 0),
          0
        ),
      };
    },
    enabled: !!orgId,
  });

  const fmt = (n: number) =>
    `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header title="Reports" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loadingSales} onRefresh={refetch} />}
      >
        {/* Period Selector */}
        <Row style={styles.periodRow} gap={spacing.sm}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
              onPress={() => setPeriod(p.key)}
            >
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Row>

        {/* Sales Summary */}
        <Text style={styles.sectionTitle}>Sales Summary</Text>
        <Card padded elevated style={styles.card}>
          <View style={styles.statGrid}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{salesStats?.count ?? 0}</Text>
              <Text style={styles.statLabel}>Orders</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{fmt(salesStats?.totalAmount ?? 0)}</Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{salesStats?.totalQty?.toFixed(0) ?? 0}</Text>
              <Text style={styles.statLabel}>Qty Sold</Text>
            </View>
          </View>
        </Card>

        {/* Stock Summary */}
        <Text style={styles.sectionTitle}>Current Stock</Text>
        <Card padded elevated style={styles.card}>
          <View style={styles.statGrid}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stockStats?.count ?? 0}</Text>
              <Text style={styles.statLabel}>Active Lots</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{fmt(stockStats?.stockValue ?? 0)}</Text>
              <Text style={styles.statLabel}>Stock Cost</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: palette.success }]}>
                {fmt(stockStats?.potentialRevenue ?? 0)}
              </Text>
              <Text style={styles.statLabel}>Potential Rev.</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  periodRow: { marginBottom: spacing.lg },
  periodBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.gray200,
    alignItems: 'center',
    backgroundColor: palette.white,
  },
  periodBtnActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  periodText: { fontSize: fontSize.sm, fontWeight: '500', color: palette.gray600 },
  periodTextActive: { color: palette.white },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '600', color: palette.gray700, marginBottom: spacing.md, marginTop: spacing.sm },
  card: { marginBottom: spacing.sm },
  statGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', paddingVertical: spacing.sm },
  statVal: { fontSize: fontSize.xl, fontWeight: '700', color: palette.gray900 },
  statLabel: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 4 },
});

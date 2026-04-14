import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import { useQuery } from '@tanstack/react-query';
import { mandi } from '@/api/db';
import { useAuthStore } from '@/stores/auth-store';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<SalesStackParamList, 'SalesHub'>;

const QUICK_ACTIONS = [
  {
    id: 'pos',
    title: 'POS Billing',
    subtitle: 'Lightning fast sales',
    icon: '⚡',
    screen: 'Pos',
    color: '#EEF2FF',
    iconColor: '#4F46E5',
  },
  {
    id: 'new_sale',
    title: 'Standard Sale',
    subtitle: 'Detailed invoices',
    icon: '📝',
    screen: 'SaleCreate',
    color: '#ECFDF5',
    iconColor: '#059669',
  },
  {
    id: 'returns',
    title: 'Returns',
    subtitle: 'Credit memos',
    icon: '🔄',
    screen: 'Returns',
    color: '#FEF2F2',
    iconColor: '#DC2626',
  },
  {
    id: 'bulk_sale',
    title: 'Bulk Lot Sale',
    subtitle: 'Consignment sales',
    icon: '⚡',
    screen: 'BulkLotSale',
    color: '#FDF2F9',
    iconColor: '#DB2777',
  },
  {
    id: 'quotations',
    title: 'Quotations',
    subtitle: 'Price estimates',
    icon: '📝',
    screen: 'QuotationsList',
    color: '#FFF7ED',
    iconColor: '#EA580C',
  },
  {
    id: 'orders',
    title: 'Sales Orders',
    subtitle: 'Confirmed orders',
    icon: '📦',
    screen: 'SalesOrdersList',
    color: '#F5F3FF',
    iconColor: '#7C3AED',
  },
  {
    id: 'challans',
    title: 'Deliv. Challans',
    subtitle: 'Shipping notes',
    icon: '🚚',
    screen: 'DeliveryChallansList',
    color: '#FDF2F9',
    iconColor: '#DB2777',
  },
  {
    id: 'list',
    title: 'History',
    subtitle: 'All transactions',
    icon: '📋',
    screen: 'SalesList',
    color: '#EEF2FF',
    iconColor: '#4F46E5',
  },
];

export function SalesHubScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const today = new Date().toISOString().split('T')[0];

  // ── Fetch Today's Stats ──
  const { data: stats = { count: 0, total: 0 } } = useQuery({
    queryKey: ['sales-stats-today', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('sales')
        .select('total_amount')
        .eq('organization_id', orgId!)
        .eq('sale_date', today);
      if (error) throw error;
      const total = data.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      return { count: data.length, total };
    },
    enabled: !!orgId,
  });

  // ── Fetch Recent Sales ──
  const { data: recentSales = [] } = useQuery({
    queryKey: ['sales-recent', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('sales')
        .select('id, bill_no, total_amount, buyer:buyer_id(name)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <Screen scroll padded={false} backgroundColor={palette.gray50}>
      <Header title="Sales Terminal" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Metric Cards */}
        <Row style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: palette.primary }]}>
            <Text style={styles.statLabel}>Today's Sales</Text>
            <Text style={styles.statValue}>{fmt(stats.total)}</Text>
            <Badge label={`${stats.count} Bills`} variant="success" style={styles.statBadge} />
          </View>
        </Row>

        <Text style={styles.sectionTitle}>Operations</Text>
        <View style={styles.grid}>
          {QUICK_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.actionCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.screen as any)}
            >
              <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                <Text style={[styles.icon, { color: item.iconColor }]}>{item.icon}</Text>
              </View>
              <Text style={styles.actionTitle}>{item.title}</Text>
              <Text style={styles.actionSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SalesList')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.recentCard}>
          {recentSales.map((sale: any, idx: number) => (
            <React.Fragment key={sale.id}>
              <TouchableOpacity 
                style={styles.recentRow}
                onPress={() => navigation.navigate('SaleDetail', { id: sale.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentBuyer}>{sale.buyer?.name || 'Walk-in'}</Text>
                  <Text style={styles.recentBill}>Bill #{sale.bill_no}</Text>
                </View>
                <Text style={styles.recentAmount}>{fmt(sale.total_amount)}</Text>
              </TouchableOpacity>
              {idx < recentSales.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
          {recentSales.length === 0 && (
            <Text style={styles.emptyText}>No sales recorded today.</Text>
          )}
        </Card>

        <TouchableOpacity 
          style={styles.dayBookBanner}
          onPress={() => navigation.navigate('Finance' as any, { screen: 'DayBook' })}
        >
          <View style={styles.bannerContent}>
            <Text style={styles.bannerIcon}>📖</Text>
            <View>
              <Text style={styles.bannerTitle}>Day Book</Text>
              <Text style={styles.bannerSubtitle}>Full audit trail for today</Text>
            </View>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  statsRow: { marginBottom: spacing.xl },
  statCard: { flex: 1, padding: spacing.xl, borderRadius: radius['2xl'], ...shadows.md, position: 'relative', overflow: 'hidden' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: fontSize.xs, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { color: palette.white, fontSize: 32, fontWeight: '900', marginTop: spacing.xs },
  statBadge: { alignSelf: 'flex-start', marginTop: spacing.md, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  actionCard: { width: '47.5%', backgroundColor: palette.white, padding: spacing.lg, borderRadius: radius.xl, ...shadows.sm, borderWidth: 1, borderColor: palette.gray100 },
  iconBox: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  icon: { fontSize: 20 },
  actionTitle: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray900 },
  actionSubtitle: { fontSize: 10, color: palette.gray500, marginTop: 2, fontWeight: '600' },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  viewAll: { color: palette.primary, fontWeight: '700', fontSize: fontSize.xs },
  recentCard: { paddingVertical: spacing.sm },
  recentRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  recentBuyer: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray900 },
  recentBill: { fontSize: 10, color: palette.gray500, marginTop: 2 },
  recentAmount: { fontSize: fontSize.sm, fontWeight: '900', color: palette.gray900 },
  divider: { height: 1, backgroundColor: palette.gray100, marginHorizontal: spacing.md },
  emptyText: { textAlign: 'center', color: palette.gray400, padding: spacing.xl, fontSize: fontSize.xs, fontWeight: '600' },
  dayBookBanner: {
    backgroundColor: palette.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: palette.gray100,
    marginTop: spacing.xl,
  },
  bannerContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  bannerIcon: { fontSize: 24 },
  bannerTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  bannerSubtitle: { fontSize: 10, color: palette.gray500, fontWeight: '600' },
  chevron: { fontSize: 24, color: palette.gray300, fontWeight: '300' },
});

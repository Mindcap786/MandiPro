import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '@/navigation/types';
import { useQuery } from '@tanstack/react-query';
import { mandi } from '@/api/db';
import { useAuthStore } from '@/stores/auth-store';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<InventoryStackParamList, 'InventoryHub'>;

const INVENTORY_ACTIONS = [
  {
    id: 'stock',
    title: 'Stock Status',
    subtitle: 'Current inventory',
    icon: '📦',
    screen: 'LotsList',
    color: '#EFF6FF',
    iconColor: '#2563EB',
  },
  {
    id: 'quick_entry',
    title: 'Quick Entry',
    subtitle: 'Fast stock add',
    icon: '⚡',
    screen: 'StockQuickEntry',
    color: '#F0FDF4',
    iconColor: '#16A34A',
  },
  {
    id: 'commodities',
    title: 'Master List',
    subtitle: 'Item specs & grades',
    icon: '🌾',
    screen: 'CommoditiesList',
    color: '#FFFBEB',
    iconColor: '#D97706',
  },
  {
    id: 'arrivals',
    title: 'Arrivals',
    subtitle: 'Incoming goods',
    icon: '🚛',
    screen: 'ArrivalsList',
    color: '#F5F3FF',
    iconColor: '#7C3AED',
  },
];

export function InventoryHubScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  // ── Fetch Stock Stats ──
  const { data: stats = { totalLots: 0, highValueCount: 0 } } = useQuery({
    queryKey: ['inventory-stats', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('id, supplier_rate')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .gt('current_qty', 0);
      if (error) throw error;
      const highValue = data.filter(l => (l.supplier_rate || 0) > 2000).length;
      return { totalLots: data.length, highValueCount: highValue };
    },
    enabled: !!orgId,
  });

  // ── Fetch Recent Stock ──
  const { data: recentStock = [] } = useQuery({
    queryKey: ['inventory-recent', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('id, lot_code, current_qty, unit, item:item_id(name)')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .gt('current_qty', 0)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  return (
    <Screen scroll padded={false} backgroundColor={palette.gray50}>
      <Header title="Stock Control" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Metric Cards */}
        <Row style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#1E293B' }]}>
            <Text style={styles.statLabel}>Active Lots</Text>
            <Text style={styles.statValue}>{stats.totalLots}</Text>
            <Badge label={`In Warehouse`} variant="info" style={styles.statBadge} />
          </View>
        </Row>

        <Text style={styles.sectionTitle}>Operations</Text>
        <View style={styles.grid}>
          {INVENTORY_ACTIONS.map((item) => (
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
          <Text style={styles.sectionTitle}>Live Stock Preview</Text>
          <TouchableOpacity onPress={() => navigation.navigate('LotsList')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.recentCard}>
          {recentStock.map((lot: any, idx: number) => (
            <React.Fragment key={lot.id}>
              <TouchableOpacity 
                style={styles.recentRow}
                onPress={() => navigation.navigate('LotDetail', { id: lot.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentItem}>{lot.item?.name || 'Item'}</Text>
                  <Text style={styles.recentCode}>{lot.lot_code}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.recentQty}>{lot.current_qty}</Text>
                  <Text style={styles.recentUnit}>{lot.unit}</Text>
                </View>
              </TouchableOpacity>
              {idx < recentStock.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
          {recentStock.length === 0 && (
            <Text style={styles.emptyText}>No active stock found.</Text>
          )}
        </Card>

        <TouchableOpacity 
          style={styles.dayBookBanner}
          onPress={() => navigation.navigate('Finance' as any, { screen: 'DayBook' })}
        >
          <View style={styles.bannerContent}>
            <Text style={styles.bannerIcon}>📖</Text>
            <View>
              <Text style={styles.bannerTitle}>Review Day Book</Text>
              <Text style={styles.bannerSubtitle}>Sync inventory with financial trail</Text>
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
  recentItem: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray900 },
  recentCode: { fontSize: 10, color: palette.gray500, marginTop: 2, fontWeight: '600' },
  recentQty: { fontSize: fontSize.sm, fontWeight: '900', color: palette.gray900 },
  recentUnit: { fontSize: 10, color: palette.gray500, fontWeight: '600' },
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

/**
 * Dashboard Screen — KPI cards + quick actions + recent activity.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { Screen } from '@/components/layout';
import { Card, Badge, Avatar } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { mandi, core } from '@/api/db';

// ─── KPI Card ───────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color = palette.primary,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <View style={[styles.kpiCard, shadows.md]}>
      <View style={[styles.kpiAccent, { backgroundColor: color }]} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

// ─── Quick Action ────────────────────────────────────────────

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Dashboard Screen ────────────────────────────────────────

export function DashboardScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: stats, isRefetching, refetch } = useQuery({
    queryKey: ['dashboard-stats', orgId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      const [salesRes, lotsRes, arrivalsRes] = await Promise.all([
        mandi()
          .from('sales')
          .select('total_amount, status')
          .eq('organization_id', orgId!)
          .eq('sale_date', today),
        mandi()
          .from('lots')
          .select('id, status, current_qty, unit')
          .eq('organization_id', orgId!)
          .eq('status', 'active'),
        mandi()
          .from('arrivals')
          .select('id')
          .eq('organization_id', orgId!)
          .eq('arrival_date', today),
      ]);

      const todaySales = salesRes.data ?? [];
      const activeLots = lotsRes.data ?? [];
      const todayArrivals = arrivalsRes.data ?? [];

      const totalSalesAmount = todaySales
        .filter((s) => s.status !== 'draft')
        .reduce((sum, s) => sum + (s.total_amount ?? 0), 0);

      return {
        todaySalesAmount: totalSalesAmount,
        todaySalesCount: todaySales.length,
        activeLotsCount: activeLots.length,
        todayArrivalsCount: todayArrivals.length,
      };
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const fmt = (n: number) =>
    `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {profile?.full_name ?? 'User'}
            </Text>
            <Text style={styles.orgName} numberOfLines={1}>
              {profile?.organization?.name}
            </Text>
          </View>
          <Avatar name={profile?.full_name ?? undefined} size="md" />
        </View>

        {/* KPI Row */}
        <Text style={styles.sectionTitle}>Today's Summary</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.kpiScroll}>
          <KpiCard
            label="Sales Today"
            value={fmt(stats?.todaySalesAmount ?? 0)}
            sub={`${stats?.todaySalesCount ?? 0} orders`}
            color={palette.success}
          />
          <KpiCard
            label="Active Lots"
            value={String(stats?.activeLotsCount ?? 0)}
            sub="in stock"
            color={palette.primary}
          />
          <KpiCard
            label="Arrivals Today"
            value={String(stats?.todayArrivalsCount ?? 0)}
            sub="received"
            color={palette.warning}
          />
        </ScrollView>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          <QuickAction
            icon="💰"
            label="New Sale"
            onPress={() => navigation.navigate('Sales', { screen: 'SaleCreate' })}
          />
          <QuickAction
            icon="🚛"
            label="New Arrival"
            onPress={() => navigation.navigate('Sales', { screen: 'ArrivalCreate' })}
          />
          <QuickAction
            icon="📦"
            label="View Lots"
            onPress={() => navigation.navigate('Inventory', { screen: 'LotsList' })}
          />
          <QuickAction
            icon="📖"
            label="Day Book"
            onPress={() => navigation.navigate('Finance', { screen: 'DayBook' })}
          />
          <QuickAction
            icon="📊"
            label="Ledger"
            onPress={() => navigation.navigate('Finance', { screen: 'FinanceHub' })}
          />
          <QuickAction
            icon="👥"
            label="Contacts"
            onPress={() => navigation.navigate('More', { screen: 'MoreMenu' })}
          />
        </View>

        {/* Subscription Banner */}
        {profile?.organization?.status === 'trial' && (
          <View style={styles.trialBanner}>
            <Text style={styles.trialText}>
              ⏰ Trial active — upgrade to continue after expiry
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xl,
  },
  greeting: { fontSize: fontSize.sm, color: palette.gray500 },
  userName: { fontSize: fontSize.xl, fontWeight: '700', color: palette.gray900 },
  orgName: { fontSize: fontSize.sm, color: palette.gray500, marginTop: 2 },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: palette.gray700,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  kpiScroll: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg },
  kpiCard: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginRight: spacing.md,
    minWidth: 140,
    overflow: 'hidden',
  },
  kpiAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  kpiLabel: { fontSize: fontSize.xs, color: palette.gray500, marginTop: spacing.sm },
  kpiValue: { fontSize: fontSize.xl, fontWeight: '700', color: palette.gray900, marginTop: spacing.xs },
  kpiSub: { fontSize: fontSize.xs, color: palette.gray400, marginTop: 2 },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  quickAction: {
    width: '30%',
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  quickIcon: { fontSize: 26, marginBottom: spacing.xs },
  quickLabel: { fontSize: fontSize.xs, color: palette.gray700, textAlign: 'center', fontWeight: '500' },
  trialBanner: {
    marginTop: spacing.xl,
    backgroundColor: palette.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  trialText: { fontSize: fontSize.sm, color: palette.warning, fontWeight: '500' },
});

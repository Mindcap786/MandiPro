/**
 * Day Book Screen — Mobile iteration mapping to web DayBook.
 * Displays daily financial inflows, outflows, and balances.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { parseISO, format } from 'date-fns';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'DayBook'>;

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export function DayBookScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  // 1. Fetch Ledger Entries for Date
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['day-book', orgId, format(date, 'yyyy-MM-dd')],
    queryFn: async () => {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);

      // Fetch entries with joined accounts and vouchers
      const { data: entries, error } = await mandi()
        .from('ledger_entries')
        .select(`
          id, debit, credit, description, entry_date, transaction_type,
          account:accounts(name, type, account_sub_type),
          voucher:vouchers(voucher_no, type, narration)
        `)
        .eq('organization_id', orgId!)
        .gte('entry_date', start.toISOString())
        .lte('entry_date', end.toISOString())
        .order('entry_date', { ascending: false });

      if (error) throw new Error(error.message);

      const activeEntries = (entries || []).filter((e: any) => e.status !== 'reversed');
      
      const totalIn = activeEntries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
      const totalOut = activeEntries.reduce((sum, e) => sum + Number(e.debit || 0), 0);

      // We skip Opening/Closing balance calculation for MVP due to complex historical querying need.
      // Net Cashflow for the day:
      const net = totalIn - totalOut;

      return {
        entries: activeEntries,
        totalIn,
        totalOut,
        net
      };
    },
    enabled: !!orgId,
  });

  const getEntryColor = (entry: any) => {
    if (Number(entry.credit) > 0) return palette.success; // Inflow
    if (Number(entry.debit) > 0) return palette.error;    // Outflow
    return palette.gray500;
  };

  const getEntrySign = (entry: any) => {
    if (Number(entry.credit) > 0) return '+';
    if (Number(entry.debit) > 0) return '-';
    return '';
  };

  const getEntryAmount = (entry: any) => {
    const val = Number(entry.credit) > 0 ? Number(entry.credit) : Number(entry.debit);
    return fmt(val);
  };

  return (
    <Screen scroll={false} padded={false} backgroundColor={palette.gray50}>
      <Header title="Day Book" onBack={() => navigation.goBack()} />

      {/* Date Selector */}
      <View style={styles.dateHeader}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateLabel}>Select Date: </Text>
          <Text style={styles.dateValue}>{format(date, 'dd MMM yyyy')}</Text>
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_, d) => {
              setShowPicker(false);
              if (d) setDate(d);
            }}
          />
        )}
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { borderLeftColor: palette.success }]}>
          <Text style={styles.summaryTitle}>Total Inflow</Text>
          <Text style={[styles.summaryVal, { color: palette.success }]}>{fmt(data?.totalIn || 0)}</Text>
        </View>
        <View style={[styles.summaryBox, { borderLeftColor: palette.error }]}>
          <Text style={styles.summaryTitle}>Total Outflow</Text>
          <Text style={[styles.summaryVal, { color: palette.error }]}>{fmt(data?.totalOut || 0)}</Text>
        </View>
      </View>

      {/* Ledger List */}
      <FlatList
        data={data?.entries || []}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.emptyText}>No transactions on this date.</Text> : null
        }
        renderItem={({ item }) => {
          const color = getEntryColor(item);
          const amt = getEntryAmount(item);
          const sign = getEntrySign(item);
          const isIncome = Number(item.credit) > 0;
          return (
            <View style={styles.entryCard}>
              <Row align="between" style={{ marginBottom: spacing.xs }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.descText} numberOfLines={2}>
                    {item.description || (item.voucher as any)?.narration || 'Transaction Entry'}
                  </Text>
                  <Text style={styles.typeText}>
                    {item.transaction_type?.replace(/_/g, ' ').toUpperCase() || 'MANUAL'}
                    {(item.voucher as any)?.voucher_no ? ` • VCH#${(item.voucher as any).voucher_no}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Text style={[styles.amtText, { color }]}>
                    {sign} {amt}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: isIncome ? palette.successLight : palette.errorLight }]}>
                    <Text style={[styles.badgeText, { color: isIncome ? palette.success : palette.error }]}>
                      {isIncome ? 'IN' : 'OUT'}
                    </Text>
                  </View>
                </View>
              </Row>
              {(item.account as any)?.name && (
                <Text style={styles.accText}>A/c: {(item.account as any).name}</Text>
              )}
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateHeader: { padding: spacing.md, backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.gray200 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.gray100, padding: spacing.md, borderRadius: radius.md, alignSelf: 'flex-start' },
  dateLabel: { fontSize: fontSize.sm, color: palette.gray600 },
  dateValue: { fontSize: fontSize.md, fontWeight: '700', color: palette.primary },
  summaryRow: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  summaryBox: { flex: 1, backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, borderLeftWidth: 4, ...shadows.sm },
  summaryTitle: { fontSize: fontSize.xs, color: palette.gray500, textTransform: 'uppercase', fontWeight: '600' },
  summaryVal: { fontSize: fontSize.lg, fontWeight: '800', marginTop: spacing.xs },
  entryCard: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  descText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray900 },
  typeText: { fontSize: fontSize.xs, fontWeight: '800', color: palette.gray400, marginTop: 4 },
  amtText: { fontSize: fontSize.md, fontWeight: '900' },
  accText: { fontSize: fontSize.xs, color: palette.gray500, fontStyle: 'italic', marginTop: spacing.xs },
  emptyText: { textAlign: 'center', color: palette.gray400, marginTop: spacing.xl, fontStyle: 'italic' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  badgeText: { fontSize: 10, fontWeight: '900' }
});

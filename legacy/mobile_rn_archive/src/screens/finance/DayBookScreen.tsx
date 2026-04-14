import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FinanceStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core, mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<FinanceStackParamList, 'DayBook'>;

/** 
 * Ported Business Logic from Web
 */
const inferVoucherFlow = (entry: any) => {
  const rawType = String(entry.transaction_type || entry.voucher?.type || "").toLowerCase();
  const text = `${entry.description || ""} ${entry.voucher?.narration || ""}`.toLowerCase();

  if (rawType.includes('sale_payment') || text.includes('sale payment')) return 'sale_payment';
  if (rawType === 'receipt' || rawType.includes('receipt')) return 'receipt';
  
  if (
    rawType.includes('purchase') || 
    text.includes('bill for arrival') || 
    text.includes('lot_purchase') || 
    text.includes('advance paid')
  ) return 'purchase';

  if (
    rawType === 'payment' ||
    rawType.includes('payment') ||
    rawType.includes('expense') ||
    text.includes('expense')
  ) return 'payment';

  if (rawType.includes('sale') || text.includes('sale invoice')) return 'sale';

  return rawType || 'transaction';
};

export function DayBookScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const startOfDay = useMemo(() => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [date]);

  const endOfDay = useMemo(() => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [date]);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['day-book', orgId, startOfDay],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('ledger_entries')
        .select(`
          *,
          account:accounts(name, type),
          voucher:vouchers(type, voucher_no, narration)
        `)
        .eq('organization_id', orgId!)
        .gte('entry_date', startOfDay)
        .lte('entry_date', endOfDay)
        .order('entry_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Grouping logic
  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, any[]>();
    
    entries.forEach((entry: any) => {
      const key = entry.voucher_id || entry.reference_id || `raw_${entry.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    });

    return Array.from(groups.values()).map(group => {
      const first = group[0];
      const flow = inferVoucherFlow(first);
      
      const totalDebit = group.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
      const totalCredit = group.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
      
      // Determine if this is primarily Inflow or Outflow for Summary
      const isOutflow = flow === 'purchase' || flow === 'payment';
      const isInflow = flow === 'sale' || flow === 'sale_payment' || flow === 'receipt';
      
      return {
        id: first.voucher_id || first.id,
        date: first.entry_date,
        type: flow,
        voucherNo: first.voucher?.voucher_no,
        description: first.description || first.voucher?.narration || 'No description',
        amount: isOutflow ? totalCredit : totalDebit,
        isOutflow,
        isInflow,
        raw: group
      };
    });
  }, [entries]);

  const totals = useMemo(() => {
    return groupedTransactions.reduce((acc, curr) => {
      if (curr.isOutflow) acc.outflow += curr.amount;
      if (curr.isInflow) acc.inflow += curr.amount;
      return acc;
    }, { inflow: 0, outflow: 0 });
  }, [groupedTransactions]);

  const formatDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Day Book" onBack={() => navigation.goBack()} />
      
      {/* Date Selector Overlay */}
      <View style={styles.dateHeader}>
        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.datePickerBtn}>
          <Text style={styles.dateLabel}>DATE</Text>
          <Text style={styles.dateValue}>{formatDate(date)} 📅</Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, d) => {
            setShowDatePicker(false);
            if (d) setDate(d);
          }}
        />
      )}

      {/* Summary Row */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryBox, { backgroundColor: '#ECFDF5' }]}>
          <Text style={styles.summaryTitle}>INFLOW</Text>
          <Text style={[styles.summaryAmount, { color: '#059669' }]}>₹{totals.inflow.toLocaleString('en-IN')}</Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FEF2F2' }]}>
          <Text style={styles.summaryTitle}>OUTFLOW</Text>
          <Text style={[styles.summaryAmount, { color: '#DC2626' }]}>₹{totals.outflow.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Fetching daily records...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {groupedTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyText}>No transactions found for this day.</Text>
            </View>
          ) : (
            groupedTransactions.map((tx) => (
              <Card key={tx.id} style={styles.txCard}>
                <Row align="between" style={{ marginBottom: spacing.xs }}>
                  <Text style={styles.txType}>{tx.type.replace('_', ' ').toUpperCase()}</Text>
                  <Text style={styles.txTime}>{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </Row>
                
                <Text style={styles.txDesc} numberOfLines={2}>{tx.description}</Text>
                
                {tx.voucherNo && (
                    <Text style={styles.voucherNo}>Voucher: #{tx.voucherNo}</Text>
                )}

                <Divider style={{ marginVertical: spacing.sm }} />

                <Row align="between">
                   <Badge 
                    label={tx.isOutflow ? 'DR (Paid)' : 'CR (Recvd)'} 
                    variant={tx.isOutflow ? 'error' : 'success'} 
                  />
                  <Text style={[styles.txAmount, { color: tx.isOutflow ? '#DC2626' : '#059669' }]}>
                    {tx.isInflow ? '+' : '-'} ₹{tx.amount.toLocaleString('en-IN')}
                  </Text>
                </Row>
              </Card>
            ))
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateHeader: { padding: spacing.md, backgroundColor: palette.white, borderBottomWidth: 1, borderColor: palette.gray100 },
  datePickerBtn: { alignItems: 'center' },
  dateLabel: { fontSize: 10, fontWeight: '800', color: palette.gray400, letterSpacing: 1 },
  dateValue: { fontSize: fontSize.md, fontWeight: '900', color: palette.primary, marginTop: 2 },
  summaryContainer: { flexDirection: 'row', padding: spacing.md, gap: spacing.md },
  summaryBox: { flex: 1, padding: spacing.lg, borderRadius: radius.lg, ...shadows.sm },
  summaryTitle: { fontSize: 10, fontWeight: '900', color: palette.gray600, letterSpacing: 0.5 },
  summaryAmount: { fontSize: fontSize.lg, fontWeight: '900', marginTop: 4 },
  scrollContent: { padding: spacing.md, paddingBottom: spacing['3xl'] },
  txCard: { marginBottom: spacing.md, padding: spacing.md },
  txType: { fontSize: 10, fontWeight: '900', color: palette.primary, letterSpacing: 0.5 },
  txTime: { fontSize: 10, color: palette.gray400 },
  txDesc: { fontSize: fontSize.sm, color: palette.gray800, fontWeight: '600', marginTop: 2 },
  voucherNo: { fontSize: 10, color: palette.gray500, fontStyle: 'italic', marginTop: 2 },
  txAmount: { fontSize: fontSize.md, fontWeight: '900' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  loadingText: { marginTop: spacing.md, color: palette.gray500, fontWeight: '600' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { color: palette.gray400, fontWeight: '600' }
});

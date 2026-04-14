import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FinanceStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi, pub } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider, Select } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Ledger'>;

const inferVoucherFlow = (tx: any) => {
    const rawType = String(tx.transaction_type || tx.voucher_type || "").toLowerCase();
    const text = `${tx.particulars || ""} ${tx.description || ""}`.toLowerCase();

    if (rawType.includes("receipt") || text.includes("payment received") || text.includes("receiv")) return "receipt";
    if (rawType.includes("payment") || text.includes("payment paid") || text.includes("paid to")) return "payment";
    if (rawType.includes("sale") || text.includes("sale invoice")) return "sale";
    if (rawType.includes("purchase") || text.includes("bill for arrival")) return "purchase";
    
    return rawType || "transaction";
};

export function LedgerScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  
  const [contactId, setContactId] = useState('');
  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of month
    to: new Date()
  });
  const [pickerMode, setPickerMode] = useState<'from' | 'to' | null>(null);

  // ── Fetch Active Contacts ──
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-all-active', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('contacts')
        .select('id, name, type')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const contactOptions = useMemo(() => 
    contacts.map(c => ({ label: `${c.name} (${c.type})`, value: c.id })), 
  [contacts]);

  // ── Fetch Statement using RPC ──
  const { data: statement, isLoading, isFetching } = useQuery({
    queryKey: ['ledger-statement', orgId, contactId, dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
        const { data, error } = await pub().rpc('get_ledger_statement', {
            p_organization_id: orgId!,
            p_contact_id: contactId,
            p_start_date: dateRange.from.toISOString(),
            p_end_date: dateRange.to.toISOString()
        });
        if (error) throw error;
        return data;
    },
    enabled: !!orgId && !!contactId,
  });

  const formatDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    const suffix = val < 0 ? " Cr" : (val > 0 ? " Dr" : "");
    return `₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2 })}${suffix}`;
  };

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Party Ledger" onBack={() => navigation.goBack()} />

      {/* Filter Section */}
      <View style={styles.filterCard}>
        <Select
          label="Select Party"
          options={contactOptions}
          value={contactId}
          onChange={setContactId}
          placeholder="Select a contact..."
        />

        <Row gap={spacing.md} style={{ marginTop: spacing.sm }}>
          <TouchableOpacity 
            style={styles.dateSelector} 
            onPress={() => setPickerMode('from')}
          >
            <Text style={styles.dateType}>FROM</Text>
            <Text style={styles.dateVal}>{formatDate(dateRange.from)}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.dateSelector} 
            onPress={() => setPickerMode('to')}
          >
            <Text style={styles.dateType}>TO</Text>
            <Text style={styles.dateVal}>{formatDate(dateRange.to)}</Text>
          </TouchableOpacity>
        </Row>
      </View>

      {pickerMode && (
        <DateTimePicker
          value={pickerMode === 'from' ? dateRange.from : dateRange.to}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, d) => {
            setPickerMode(null);
            if (d) {
                setDateRange(prev => ({ 
                    ...prev, 
                    [pickerMode]: d 
                }));
            }
          }}
        />
      )}

      {isLoading && !!contactId ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={styles.loadingText}>Computing statement...</Text>
        </View>
      ) : !contactId ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>👤</Text>
          <Text style={styles.emptyText}>Please select a party to view statement</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Summary Cards */}
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Opening</Text>
              <Text style={styles.summaryVal}>{formatCurrency(statement?.opening_balance || 0)}</Text>
            </View>
            <View style={[styles.summaryItem, { backgroundColor: (statement?.closing_balance || 0) < 0 ? '#FEF2F2' : '#ECFDF5' }]}>
              <Text style={styles.summaryLabel}>Closing</Text>
              <Text style={[styles.summaryVal, { color: (statement?.closing_balance || 0) < 0 ? '#DC2626' : '#059669' }]}>
                {formatCurrency(statement?.closing_balance || 0)}
              </Text>
            </View>
          </View>

          {/* Transaction List */}
          {statement?.transactions?.length === 0 ? (
            <Text style={{ textAlign: 'center', color: palette.gray400, marginTop: 40 }}>No transactions in this period.</Text>
          ) : (
            statement?.transactions?.map((tx: any, idx: number) => {
              const flow = inferVoucherFlow(tx);
              const isCredit = Number(tx.credit) > 0;
              const amount = isCredit ? Number(tx.credit) : Number(tx.debit);
              const color = isCredit ? '#DC2626' : '#059669';

              return (
                <Card key={idx} style={styles.txCard}>
                  <Row align="between">
                    <View style={{ flex: 1 }}>
                        <Text style={styles.txDate}>{new Date(tx.date || tx.created_at).toLocaleDateString()}</Text>
                        <Text style={styles.txParticulars} numberOfLines={2}>{tx.particulars || tx.description}</Text>
                        <Text style={styles.txVoucher}>{tx.voucher_type?.toUpperCase()} #{tx.voucher_no || '---'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.txAmount, { color }]}>
                            {isCredit ? '-' : '+'} ₹{amount.toLocaleString('en-IN')}
                        </Text>
                        <Badge label={isCredit ? 'Credit' : 'Debit'} variant={isCredit ? 'error' : 'success'} />
                    </View>
                  </Row>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterCard: { backgroundColor: palette.white, padding: spacing.md, borderBottomWidth: 1, borderColor: palette.gray100, gap: spacing.sm },
  dateSelector: { flex: 1, backgroundColor: palette.gray50, padding: spacing.sm, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: palette.gray200 },
  dateType: { fontSize: 8, fontWeight: '900', color: palette.gray400, letterSpacing: 1 },
  dateVal: { fontSize: fontSize.sm, fontWeight: '700', color: palette.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  loadingText: { marginTop: spacing.md, color: palette.gray500, fontWeight: '600' },
  emptyIcon: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { color: palette.gray400, fontWeight: '600', textAlign: 'center', paddingHorizontal: 40 },
  scrollContent: { padding: spacing.md, paddingBottom: 100 },
  summaryGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  summaryItem: { flex: 1, backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.lg, ...shadows.sm, borderWidth: 1, borderColor: palette.gray100 },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: palette.gray500, textTransform: 'uppercase' },
  summaryVal: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900, marginTop: 4 },
  txCard: { marginBottom: spacing.sm, padding: spacing.md },
  txDate: { fontSize: 10, color: palette.gray500, fontWeight: '700' },
  txParticulars: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray900, marginTop: 2 },
  txVoucher: { fontSize: 10, color: palette.gray400, fontStyle: 'italic', marginTop: 2 },
  txAmount: { fontSize: fontSize.md, fontWeight: '900', marginBottom: 4 },
});

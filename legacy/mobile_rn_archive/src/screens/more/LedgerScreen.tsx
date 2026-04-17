/**
 * Ledger Screen — Party-wise outstanding balances and transaction history.
 * CRITICAL GAP: Completely missing from mobile. Web has /ledgers with full buyer ledger.
 *
 * This screen shows:
 *  1. A searchable list of all contacts with their outstanding balance
 *  2. Tap any party → drill into their transaction history
 */

import React, { useState } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core, mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Ledger'>;

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

interface PartyBalance {
  id: string;
  name: string;
  contact_type: string;
  phone?: string;
  totalSales: number;
  totalReceipts: number;
  balance: number;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: 'sale' | 'receipt' | 'credit_note';
  description: string;
  debit: number;
  credit: number;
  runningBalance?: number;
}

export function LedgerScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');
  const [selectedParty, setSelectedParty] = useState<PartyBalance | null>(null);
  const [filter, setFilter] = useState<'all' | 'debit' | 'credit'>('all');

  // ── Fetch all contacts with their balance summary ──
  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ['ledger-summary', orgId],
    queryFn: async () => {
      const { data: ctxData, error: ctxErr } = await core()
        .from('contacts')
        .select('id, name, contact_type, phone')
        .eq('organization_id', orgId!)
        .in('contact_type', ['buyer', 'supplier', 'farmer'])
        .eq('is_active', true)
        .order('name');
      if (ctxErr) throw new Error(ctxErr.message);

      const parties = ctxData ?? [];

      // For each party, get total sales (debit) and total receipts (credit)
      const [salesRes, receiptsRes] = await Promise.all([
        mandi()
          .from('sales')
          .select('buyer_id, total_amount, status')
          .eq('organization_id', orgId!)
          .neq('status', 'draft'),
        core()
          .from('vouchers')
          .select('party_id, amount, type')
          .eq('organization_id', orgId!)
          .eq('type', 'receipt'),
      ]);

      const salesByBuyer: Record<string, number> = {};
      for (const s of salesRes.data ?? []) {
        if (s.buyer_id) {
          salesByBuyer[s.buyer_id] = (salesByBuyer[s.buyer_id] ?? 0) + (s.total_amount ?? 0);
        }
      }

      const receiptsByParty: Record<string, number> = {};
      for (const r of receiptsRes.data ?? []) {
        if (r.party_id) {
          receiptsByParty[r.party_id] = (receiptsByParty[r.party_id] ?? 0) + (r.amount ?? 0);
        }
      }

      return parties.map((p): PartyBalance => {
        const totalSales = salesByBuyer[p.id] ?? 0;
        const totalReceipts = receiptsByParty[p.id] ?? 0;
        return {
          ...p,
          totalSales,
          totalReceipts,
          balance: totalSales - totalReceipts,
        };
      });
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });

  // ── Fetch selected party's transactions ──
  const { data: transactions = [], isLoading: loadingTxns } = useQuery({
    queryKey: ['ledger-party', orgId, selectedParty?.id],
    queryFn: async (): Promise<LedgerEntry[]> => {
      if (!selectedParty) return [];

      const [salesRes, receiptsRes] = await Promise.all([
        mandi()
          .from('sales')
          .select('id, sale_date, total_amount, invoice_no, status')
          .eq('organization_id', orgId!)
          .eq('buyer_id', selectedParty.id)
          .neq('status', 'draft')
          .order('sale_date', { ascending: false }),
        core()
          .from('vouchers')
          .select('id, date, amount, narration, voucher_no')
          .eq('organization_id', orgId!)
          .eq('party_id', selectedParty.id)
          .eq('type', 'receipt')
          .order('date', { ascending: false }),
      ]);

      const salesEntries: LedgerEntry[] = (salesRes.data ?? []).map((s) => ({
        id: `sale_${s.id}`,
        date: s.sale_date,
        type: 'sale' as const,
        description: s.invoice_no ? `Invoice #${s.invoice_no}` : 'Sale',
        debit: s.total_amount ?? 0,
        credit: 0,
      }));

      const receiptEntries: LedgerEntry[] = (receiptsRes.data ?? []).map((r) => ({
        id: `rcpt_${r.id}`,
        date: r.date,
        type: 'receipt' as const,
        description: r.narration ?? `Voucher #${r.voucher_no}`,
        debit: 0,
        credit: r.amount ?? 0,
      }));

      // Merge and sort by date
      return [...salesEntries, ...receiptEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
    enabled: !!selectedParty,
  });

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const filtered = contacts.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTxns = transactions.filter((t) => {
    if (filter === 'debit') return t.debit > 0;
    if (filter === 'credit') return t.credit > 0;
    return true;
  });

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header title="Ledger" onBack={() => navigation.goBack()} />

      {/* Summary Strip */}
      <View style={styles.summaryStrip}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Receivable</Text>
          <Text style={[styles.summaryValue, { color: palette.error }]}>
            {fmt(contacts.reduce((s, c) => s + Math.max(0, c.balance), 0))}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Payable</Text>
          <Text style={[styles.summaryValue, { color: palette.success }]}>
            {fmt(contacts.reduce((s, c) => s + Math.max(0, -c.balance), 0))}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Parties</Text>
          <Text style={styles.summaryValue}>{contacts.length}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <SearchInput placeholder="Search party..." value={search} onChangeText={setSearch} />
      </View>

      {/* Party List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No parties found"
              message="Add buyers and suppliers in Contacts to see ledger"
            />
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelectedParty(item)}
            activeOpacity={0.72}
          >
            <View style={styles.card}>
              <Row align="between">
                <View style={{ flex: 1 }}>
                  <Text style={styles.partyName}>{item.name}</Text>
                  <Text style={styles.partyType}>
                    {item.contact_type.charAt(0).toUpperCase() + item.contact_type.slice(1)}
                    {item.phone ? `  ·  ${item.phone}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={[
                      styles.balance,
                      { color: item.balance > 0 ? palette.error : item.balance < 0 ? palette.success : palette.gray500 },
                    ]}
                  >
                    {item.balance === 0 ? 'Settled' : item.balance > 0 ? `DR ${fmt(item.balance)}` : `CR ${fmt(item.balance)}`}
                  </Text>
                  {item.balance !== 0 && (
                    <Text style={styles.balanceSub}>
                      {item.balance > 0 ? 'Receivable' : 'Payable'}
                    </Text>
                  )}
                </View>
              </Row>
              {/* Mini bar */}
              <View style={styles.miniBar}>
                <View style={styles.miniBarRow}>
                  <Text style={styles.miniBarLabel}>Sales</Text>
                  <Text style={[styles.miniBarValue, { color: palette.error }]}>
                    {fmt(item.totalSales)}
                  </Text>
                </View>
                <View style={styles.miniBarRow}>
                  <Text style={styles.miniBarLabel}>Receipts</Text>
                  <Text style={[styles.miniBarValue, { color: palette.success }]}>
                    {fmt(item.totalReceipts)}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Party Detail Modal */}
      {selectedParty && (
        <Modal animationType="slide" presentationStyle="pageSheet" visible>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setSelectedParty(null)}>
                <Text style={styles.closeBtn}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedParty.name}</Text>
              <View style={{ width: 60 }} />
            </View>

            {/* Balance Summary */}
            <View style={[
              styles.modalBanner,
              {
                backgroundColor:
                  selectedParty.balance > 0 ? palette.errorLight
                  : selectedParty.balance < 0 ? palette.successLight
                  : palette.gray100,
              },
            ]}>
              <Text style={styles.modalBalanceLabel}>
                {selectedParty.balance > 0
                  ? 'Amount Receivable'
                  : selectedParty.balance < 0
                  ? 'Amount Payable'
                  : 'Account Settled'}
              </Text>
              <Text
                style={[
                  styles.modalBalanceValue,
                  {
                    color:
                      selectedParty.balance > 0
                        ? palette.error
                        : selectedParty.balance < 0
                        ? palette.success
                        : palette.gray500,
                  },
                ]}
              >
                {fmt(selectedParty.balance)}
              </Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.tabBar}>
              {(['all', 'debit', 'credit'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.tab, filter === f && styles.tabActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                    {f === 'all' ? 'All' : f === 'debit' ? 'Sales (Dr)' : 'Receipts (Cr)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Transaction List */}
            <ScrollView contentContainerStyle={styles.txnList}>
              {filteredTxns.map((txn, idx) => (
                <View key={txn.id}>
                  {idx > 0 && <Divider />}
                  <Row align="between" style={styles.txnRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnDate}>{formatDate(txn.date)}</Text>
                      <Text style={styles.txnDesc} numberOfLines={2}>{txn.description}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      {txn.debit > 0 && (
                        <Text style={[styles.txnAmt, { color: palette.error }]}>
                          DR {fmt(txn.debit)}
                        </Text>
                      )}
                      {txn.credit > 0 && (
                        <Text style={[styles.txnAmt, { color: palette.success }]}>
                          CR {fmt(txn.credit)}
                        </Text>
                      )}
                      <Badge
                        label={txn.type === 'receipt' ? 'Receipt' : 'Sale'}
                        variant={txn.type === 'receipt' ? 'success' : 'info'}
                      />
                    </View>
                  </Row>
                </View>
              ))}
              {filteredTxns.length === 0 && !loadingTxns && (
                <Text style={styles.emptyTxn}>No transactions found</Text>
              )}
              {loadingTxns && (
                <Text style={styles.emptyTxn}>Loading transactions...</Text>
              )}
            </ScrollView>
          </View>
        </Modal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryStrip: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
    paddingVertical: spacing.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: palette.gray200 },
  summaryLabel: { fontSize: fontSize.xs, color: palette.gray500 },
  summaryValue: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900, marginTop: 2 },
  searchBar: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: palette.white,
  },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['4xl'], backgroundColor: palette.gray50 },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  partyName: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
  partyType: { fontSize: fontSize.sm, color: palette.gray500, marginTop: 2 },
  balance: { fontSize: fontSize.md, fontWeight: '700' },
  balanceSub: { fontSize: fontSize.xs, color: palette.gray500 },
  miniBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  miniBarRow: { flexDirection: 'row', gap: spacing.xs },
  miniBarLabel: { fontSize: fontSize.xs, color: palette.gray500 },
  miniBarValue: { fontSize: fontSize.xs, fontWeight: '600' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: palette.white },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray200,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.gray900, flex: 1, textAlign: 'center' },
  closeBtn: { fontSize: fontSize.md, color: palette.primary, fontWeight: '500' },
  modalBanner: {
    padding: spacing.xl,
    alignItems: 'center',
    margin: spacing.lg,
    borderRadius: radius.lg,
  },
  modalBalanceLabel: { fontSize: fontSize.sm, color: palette.gray600, marginBottom: spacing.xs },
  modalBalanceValue: { fontSize: fontSize['3xl'], fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: palette.gray100,
  },
  tabActive: { backgroundColor: palette.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '500', color: palette.gray600 },
  tabTextActive: { color: palette.white },
  txnList: { padding: spacing.lg },
  txnRow: { paddingVertical: spacing.md },
  txnDate: { fontSize: fontSize.xs, color: palette.gray500 },
  txnDesc: { fontSize: fontSize.sm, color: palette.gray800, marginTop: 2 },
  txnAmt: { fontSize: fontSize.md, fontWeight: '700' },
  emptyTxn: { textAlign: 'center', color: palette.gray400, padding: spacing.xl },
});

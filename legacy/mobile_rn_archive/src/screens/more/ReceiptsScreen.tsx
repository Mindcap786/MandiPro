/**
 * Receipts Screen — Record payment receipts from buyers.
 * CRITICAL GAP: This entire screen was missing. Web has /receipts.
 *
 * Maps to: core.vouchers (type = 'receipt') — same as web app.
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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Receipts'>;

const PAGE_SIZE = 20;

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

function formatDateForDB(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ReceiptForm {
  partyId: string;
  amount: string;
  paymentMode: string;
  narration: string;
  referenceNo: string;
}

const paymentModes = [
  { label: 'Cash', value: 'cash' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'UPI', value: 'upi' },
  { label: 'NEFT/RTGS', value: 'bank_transfer' },
];

export function ReceiptsScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ReceiptForm>({
    partyId: '',
    amount: '',
    paymentMode: 'cash',
    narration: '',
    referenceNo: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<ReceiptForm>>({});

  // ── Fetch Receipts ──
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: ['receipts', orgId],
      queryFn: async ({ pageParam = 0 }) => {
        const { data, error } = await core()
          .from('vouchers')
          .select(`
            id, date, voucher_no, amount, type, narration, payment_mode, reference_no, is_locked,
            party:party_id(name)
          `)
          .eq('organization_id', orgId!)
          .eq('type', 'receipt')
          .order('date', { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        return data ?? [];
      },
      getNextPageParam: (last, all) =>
        last.length === PAGE_SIZE ? all.flat().length : undefined,
      enabled: !!orgId,
      initialPageParam: 0,
    });

  // ── Fetch Buyers for form ──
  const { data: buyers = [] } = useQuery({
    queryKey: ['contacts-buyers', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .in('contact_type', ['buyer', 'supplier', 'farmer'])
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const items = data?.pages.flat() ?? [];
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const validate = (): boolean => {
    const errs: Partial<ReceiptForm> = {};
    if (!form.partyId) errs.partyId = 'Select a party';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Enter valid amount';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Create Receipt ──
  const { mutate: createReceipt, isPending } = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed');
      const { error } = await core()
        .from('vouchers')
        .insert({
          organization_id: orgId,
          date: formatDateForDB(new Date()),
          type: 'receipt',
          party_id: form.partyId || null,
          amount: parseFloat(form.amount),
          payment_mode: form.paymentMode,
          narration: form.narration.trim() || null,
          reference_no: form.referenceNo.trim() || null,
          is_locked: false,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.show('Receipt recorded ✓', 'success');
      qc.invalidateQueries({ queryKey: ['receipts', orgId] });
      qc.invalidateQueries({ queryKey: ['finance-summary', orgId] });
      setShowModal(false);
      setForm({ partyId: '', amount: '', paymentMode: 'cash', narration: '', referenceNo: '' });
      setFormErrors({});
    },
    onError: (err: Error) => {
      if (err.message !== 'Validation failed') toast.show(err.message, 'error');
    },
  });

  const buyerOptions = buyers.map((b) => ({ label: b.name, value: b.id }));

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header
        title="Receipts"
        onBack={() => navigation.goBack()}
        right={
          <Button title="+ New" onPress={() => setShowModal(true)} size="sm" />
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No receipts yet"
              message="Record payments received from buyers"
              actionLabel="New Receipt"
              onAction={() => setShowModal(true)}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Row align="between">
              <View style={{ flex: 1 }}>
                <Text style={styles.partyName}>
                  {(item as any).party?.name ?? 'Unknown Party'}
                </Text>
                <Text style={styles.date}>{formatDate(item.date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amount}>{fmt(item.amount)}</Text>
                <Badge
                  label={item.payment_mode ?? 'cash'}
                  variant="success"
                />
              </View>
            </Row>
            {item.narration && (
              <Text style={styles.narration} numberOfLines={1}>{item.narration}</Text>
            )}
            <Row align="between" style={styles.footer}>
              <Text style={styles.voucherNo}>Voucher #{item.voucher_no}</Text>
              {item.is_locked && <Badge label="Locked" variant="default" />}
            </Row>
          </View>
        )}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Text style={styles.loadingMore}>Loading more...</Text>
          ) : null
        }
      />

      {/* New Receipt Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Receipt</Text>
            <TouchableOpacity onPress={() => createReceipt()} disabled={isPending}>
              <Text style={[styles.saveBtn, isPending && { opacity: 0.5 }]}>
                {isPending ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Select
              label="Party *"
              options={buyerOptions}
              value={form.partyId}
              onChange={(v) => {
                setForm((f) => ({ ...f, partyId: v }));
                setFormErrors((e) => ({ ...e, partyId: undefined }));
              }}
              placeholder="Select buyer / supplier..."
              required
            />
            {formErrors.partyId && <Text style={styles.err}>{formErrors.partyId}</Text>}

            <Input
              label="Amount (₹) *"
              placeholder="0.00"
              value={form.amount}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, amount: v }));
                setFormErrors((e) => ({ ...e, amount: undefined }));
              }}
              keyboardType="decimal-pad"
              error={formErrors.amount}
              required
            />

            <Select
              label="Payment Mode"
              options={paymentModes}
              value={form.paymentMode}
              onChange={(v) => setForm((f) => ({ ...f, paymentMode: v }))}
            />

            <Input
              label="Reference No."
              placeholder="Cheque no., UTR, etc."
              value={form.referenceNo}
              onChangeText={(v) => setForm((f) => ({ ...f, referenceNo: v }))}
            />

            <Input
              label="Narration"
              placeholder="Description (optional)"
              value={form.narration}
              onChangeText={(v) => setForm((f) => ({ ...f, narration: v }))}
              multiline
              numberOfLines={3}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['4xl'], backgroundColor: palette.gray50 },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  partyName: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
  date: { fontSize: fontSize.sm, color: palette.gray500, marginTop: 2 },
  amount: { fontSize: fontSize.lg, fontWeight: '700', color: palette.success },
  narration: { fontSize: fontSize.sm, color: palette.gray600, marginTop: spacing.sm },
  footer: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100 },
  voucherNo: { fontSize: fontSize.xs, color: palette.gray400 },
  loadingMore: { textAlign: 'center', color: palette.gray400, padding: spacing.lg },
  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray200,
    backgroundColor: palette.white,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: palette.gray900 },
  cancelBtn: { fontSize: fontSize.md, color: palette.gray500 },
  saveBtn: { fontSize: fontSize.md, fontWeight: '700', color: palette.primary },
  modalContent: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  err: { fontSize: fontSize.sm, color: palette.error, marginTop: -spacing.sm, marginBottom: spacing.sm },
});

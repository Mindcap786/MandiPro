import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { EmptyState } from '@/components/feedback';
import { Badge, Button } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Payments'>;

const PAGE_SIZE = 20;

const paymentModes = [
  { label: 'Cash', value: 'cash' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Bank Transfer (NEFT/RTGS)', value: 'bank_transfer' },
  { label: 'UPI', value: 'upi' },
  { label: 'Adjustment', value: 'adjustment' },
];

function formatDate(dateStr: string) {
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return dateStr; }
}

function formatDateForDB(d: Date) {
  return d.toISOString().split('T')[0];
}

interface PaymentForm {
  partyId: string;
  amount: string;
  paymentMode: string;
  narration: string;
  referenceNo: string;
}

export function PaymentsScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const toast = useToastStore();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<PaymentForm>({
    partyId: '', amount: '', paymentMode: 'cash', narration: '', referenceNo: ''
  });
  const [formErrors, setFormErrors] = useState<Partial<PaymentForm>>({});

  // ── Fetch Payments ──
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['payments', orgId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await core()
        .from('vouchers')
        .select(`
          id, date, amount, payment_mode, voucher_no, narration, is_locked, reference_no,
          party:party_id(name, contact_type)
        `)
        .eq('organization_id', orgId!)
        .eq('type', 'payment')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.flat().length : undefined),
    enabled: !!orgId,
    initialPageParam: 0,
  });

  // ── Fetch Parties ──
  const { data: payees = [] } = useQuery({
    queryKey: ['payments-parties', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .in('contact_type', ['farmer', 'supplier', 'transporter'])
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
    const errs: Partial<PaymentForm> = {};
    if (!form.partyId) errs.partyId = 'Select a party';
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Enter valid amount';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Create Payment ──
  const { mutate: createPayment, isPending } = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed');
      const { error } = await core()
        .from('vouchers')
        .insert({
          organization_id: orgId,
          date: formatDateForDB(new Date()),
          type: 'payment',
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
      toast.show('Payment recorded ✓', 'success');
      qc.invalidateQueries({ queryKey: ['payments', orgId] });
      qc.invalidateQueries({ queryKey: ['finance-summary', orgId] });
      setShowModal(false);
      setForm({ partyId: '', amount: '', paymentMode: 'cash', narration: '', referenceNo: '' });
      setFormErrors({});
    },
    onError: (err: Error) => {
      if (err.message !== 'Validation failed') toast.show(err.message, 'error');
    },
  });

  const payeeOptions = payees.map((b) => ({ label: b.name, value: b.id }));

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header
        title="Payments"
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
              title="No payments made yet"
              message="Record payments made to suppliers and farmers"
              actionLabel="New Payment"
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
                  variant="error" // Red for outflow
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

      {/* New Payment Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Payment</Text>
            <TouchableOpacity onPress={() => createPayment()} disabled={isPending}>
              <Text style={[styles.saveBtn, isPending && { opacity: 0.5 }]}>
                {isPending ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Select
              label="Pay To *"
              options={payeeOptions}
              value={form.partyId}
              onChange={(v) => {
                setForm((f) => ({ ...f, partyId: v }));
                setFormErrors((e) => ({ ...e, partyId: undefined }));
              }}
              placeholder="Select supplier / farmer..."
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
  amount: { fontSize: fontSize.lg, fontWeight: '700', color: palette.error }, // Red outflow
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
  saveBtn: { fontSize: fontSize.md, fontWeight: '700', color: palette.error },
  modalContent: { padding: spacing.lg, paddingBottom: spacing['4xl'] },
  err: { fontSize: fontSize.sm, color: palette.error, marginTop: -spacing.sm, marginBottom: spacing.sm },
});

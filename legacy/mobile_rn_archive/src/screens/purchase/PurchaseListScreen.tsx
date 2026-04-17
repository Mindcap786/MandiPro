/**
 * Purchase Bills Screen — List and create purchase bills.
 * CRITICAL FIX: Previous implementation hit core.vouchers (payment type).
 * Web's /purchase/bills hits mandi.purchase_bills — this now uses the correct table.
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
import { PurchaseStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'PurchaseList'>;

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

interface BillForm {
  supplierId: string;
  billNo: string;
  billDate: string;
  dueDate: string;
  totalAmount: string;
  taxAmount: string;
  notes: string;
}

const STATUS_TABS = ['all', 'pending', 'paid', 'partial'] as const;
type StatusTab = typeof STATUS_TABS[number];

export function PurchaseListScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<StatusTab>('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<BillForm>({
    supplierId: '',
    billNo: '',
    billDate: formatDateForDB(new Date()),
    dueDate: '',
    totalAmount: '',
    taxAmount: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<BillForm>>({});

  // ── Fetch Purchase Bills ──
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } =
    useInfiniteQuery({
      queryKey: ['purchase-bills', orgId, activeStatus],
      queryFn: async ({ pageParam = 0 }) => {
        let q = mandi()
          .from('purchase_bills')
          .select(`
            id, bill_no, bill_date, due_date, total_amount, paid_amount, status, tax_amount,
            supplier:supplier_id(name)
          `)
          .eq('organization_id', orgId!)
          .order('bill_date', { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE - 1);

        if (activeStatus !== 'all') {
          q = q.eq('status', activeStatus);
        }

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data ?? [];
      },
      getNextPageParam: (last, all) =>
        last.length === PAGE_SIZE ? all.flat().length : undefined,
      enabled: !!orgId,
      initialPageParam: 0,
    });

  // ── Fetch Suppliers ──
  const { data: suppliers = [] } = useQuery({
    queryKey: ['contacts-suppliers', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .in('contact_type', ['supplier', 'farmer'])
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
    const errs: Partial<BillForm> = {};
    if (!form.supplierId) errs.supplierId = 'Select a supplier';
    if (!form.totalAmount || parseFloat(form.totalAmount) <= 0) errs.totalAmount = 'Enter valid amount';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const { mutate: createBill, isPending } = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed');
      const { error } = await mandi()
        .from('purchase_bills')
        .insert({
          organization_id: orgId,
          supplier_id: form.supplierId,
          bill_no: form.billNo.trim() || null,
          bill_date: form.billDate,
          due_date: form.dueDate || null,
          total_amount: parseFloat(form.totalAmount),
          tax_amount: parseFloat(form.taxAmount) || 0,
          paid_amount: 0,
          status: 'pending',
          notes: form.notes.trim() || null,
        });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.show('Purchase bill created ✓', 'success');
      qc.invalidateQueries({ queryKey: ['purchase-bills', orgId] });
      setShowModal(false);
      setForm({
        supplierId: '',
        billNo: '',
        billDate: formatDateForDB(new Date()),
        dueDate: '',
        totalAmount: '',
        taxAmount: '',
        notes: '',
      });
      setFormErrors({});
    },
    onError: (err: Error) => {
      if (err.message !== 'Validation failed') toast.show(err.message, 'error');
    },
  });

  const supplierOptions = suppliers.map((s) => ({ label: s.name, value: s.id }));

  const statusVariant: Record<string, any> = {
    pending: 'warning',
    paid: 'success',
    partial: 'info',
    cancelled: 'default',
  };

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header
        title="Purchase Bills"
        right={
          <Button title="+ New Bill" onPress={() => setShowModal(true)} size="sm" />
        }
      />

      {/* Status Tabs */}
      <View style={styles.tabBar}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveStatus(tab)}
            style={[styles.tab, activeStatus === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeStatus === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
              title="No purchase bills"
              message="Record bills from your suppliers"
              actionLabel="New Bill"
              onAction={() => setShowModal(true)}
            />
          ) : null
        }
        renderItem={({ item }) => {
          const balance = (item.total_amount ?? 0) - (item.paid_amount ?? 0);
          return (
            <View style={styles.card}>
              <Row align="between">
                <View style={{ flex: 1 }}>
                  <Text style={styles.supplierName}>
                    {(item as any).supplier?.name ?? 'Unknown Supplier'}
                  </Text>
                  <Text style={styles.date}>{formatDate(item.bill_date)}</Text>
                  {item.bill_no && (
                    <Text style={styles.billNo}>Bill #{item.bill_no}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={styles.amount}>{fmt(item.total_amount)}</Text>
                  <Badge label={item.status} variant={statusVariant[item.status] ?? 'default'} />
                </View>
              </Row>
              {balance > 0 && item.status !== 'paid' && (
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Balance Due</Text>
                  <Text style={styles.balanceAmount}>{fmt(balance)}</Text>
                </View>
              )}
              {item.due_date && (
                <Text style={styles.dueDate}>Due: {formatDate(item.due_date)}</Text>
              )}
            </View>
          );
        }}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Text style={styles.loadingMore}>Loading more...</Text>
          ) : null
        }
      />

      {/* Create Bill Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.cancelBtn}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Purchase Bill</Text>
            <TouchableOpacity onPress={() => createBill()} disabled={isPending}>
              <Text style={[styles.saveBtn, isPending && { opacity: 0.5 }]}>
                {isPending ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Select
              label="Supplier *"
              options={supplierOptions}
              value={form.supplierId}
              onChange={(v) => {
                setForm((f) => ({ ...f, supplierId: v }));
                setFormErrors((e) => ({ ...e, supplierId: undefined }));
              }}
              placeholder="Select supplier..."
              required
            />
            {formErrors.supplierId && <Text style={styles.err}>{formErrors.supplierId}</Text>}

            <Input
              label="Bill Number"
              placeholder="Supplier's bill/invoice number"
              value={form.billNo}
              onChangeText={(v) => setForm((f) => ({ ...f, billNo: v }))}
            />

            <Input
              label="Total Amount (₹) *"
              placeholder="0.00"
              value={form.totalAmount}
              onChangeText={(v) => {
                setForm((f) => ({ ...f, totalAmount: v }));
                setFormErrors((e) => ({ ...e, totalAmount: undefined }));
              }}
              keyboardType="decimal-pad"
              error={formErrors.totalAmount}
              required
            />

            <Input
              label="Tax Amount (₹)"
              placeholder="GST / tax included in total"
              value={form.taxAmount}
              onChangeText={(v) => setForm((f) => ({ ...f, taxAmount: v }))}
              keyboardType="decimal-pad"
            />

            <Input
              label="Notes"
              placeholder="Description (optional)"
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['4xl'], backgroundColor: palette.gray50 },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  supplierName: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
  date: { fontSize: fontSize.sm, color: palette.gray500, marginTop: 2 },
  billNo: { fontSize: fontSize.sm, color: palette.gray500, marginTop: 2 },
  amount: { fontSize: fontSize.lg, fontWeight: '700', color: palette.error },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  balanceLabel: { fontSize: fontSize.sm, color: palette.gray600 },
  balanceAmount: { fontSize: fontSize.md, fontWeight: '700', color: palette.warning },
  dueDate: { fontSize: fontSize.xs, color: palette.gray400, marginTop: spacing.xs },
  loadingMore: { textAlign: 'center', color: palette.gray400, padding: spacing.lg },
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

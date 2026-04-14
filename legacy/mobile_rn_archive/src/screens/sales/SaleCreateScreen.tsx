/**
 * Sale Create Screen — Premium form with inline validation, date picker,
 * discount, notes, and commission fields matching the web new-sale-form.
 * FIXES:
 *  1. Added inline validation with error messages (not just toast)
 *  2. Added discount_amount, notes fields
 *  3. Added editable sale_date with DateTimePicker
 *  4. Shows per-item subtotal as user types
 *  5. Buyer search/filter
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { calculateSaleTotals } from '@/utils/sales-tax';
import { mapDatabaseError } from '@/utils/error-mapper';

type Props = NativeStackScreenProps<SalesStackParamList, 'SaleCreate' | 'BulkLotSale'>;

interface LineItem {
  lot_id: string;
  lot_code: string;
  quantity: string;
  rate: string;
  unit: string;
}

interface FormErrors {
  buyer?: string;
  items?: string;
  [key: string]: string | undefined;
}

function formatDateForDisplay(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateForDB(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function SaleCreateScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [buyerId, setBuyerId] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [saleDate, setSaleDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [loadingCharges, setLoadingCharges] = useState('');
  const [unloadingCharges, setUnloadingCharges] = useState('');
  const [otherExpenses, setOtherExpenses] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [items, setItems] = useState<LineItem[]>([
    { lot_id: '', lot_code: '', quantity: '', rate: '', unit: '' },
  ]);

  // ── Buyers ──
  const { data: buyers = [] } = useQuery({
    queryKey: ['contacts-buyers', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('type', 'buyer')
        .eq('status', 'active')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // ── Active Lots ──
  const { data: lots = [] } = useQuery({
    queryKey: ['lots-active', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('id, lot_code, current_qty, unit, sale_price')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .gt('current_qty', 0)
        .order('lot_code');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // ── Fetch Mandi Settings (Tax/Fee) ──
  const { data: taxSettings = {} } = useQuery({
    queryKey: ['mandi-settings', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('mandi_settings')
        .select('*')
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data || {};
    },
    enabled: !!orgId,
  });


  const addItem = () =>
    setItems((prev) => [...prev, { lot_id: '', lot_code: '', quantity: '', rate: '', unit: '' }]);

  const updateItem = (idx: number, field: keyof LineItem, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === 'lot_id') {
          const lot = lots.find((l) => l.id === value);
          if (lot) {
            updated.lot_code = lot.lot_code;
            updated.unit = lot.unit ?? '';
            updated.rate = lot.sale_price ? String(lot.sale_price) : '';
          }
        }
        return updated;
      })
    );
    // Clear item error on change
    if (errors.items) setErrors((e) => ({ ...e, items: undefined }));
  };

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const totals = calculateSaleTotals({
    items: items.map((i) => ({
      amount: (parseFloat(i.quantity) || 0) * (parseFloat(i.rate) || 0),
      gst_rate: (lots.find(l => l.id === i.lot_id) as any)?.gst_rate || 0,
    })),
    taxSettings: {
      market_fee_percent: (taxSettings as any).market_fee_percent || 0,
      nirashrit_percent: (taxSettings as any).nirashrit_percent || 0,
      misc_fee_percent: (taxSettings as any).misc_fee_percent || 0,
    },
    loadingCharges,
    unloadingCharges,
    otherExpenses,
    discountAmount,
  });

  const subtotal = totals.subTotal;
  const discount = totals.discountAmount;
  const totalAmount = totals.grandTotal;

  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  // ── Validation ──
  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!buyerId) newErrors.buyer = 'Please select a buyer';
    const validItems = items.filter((i) => i.lot_id && i.quantity && i.rate);
    if (validItems.length === 0) newErrors.items = 'Add at least one item with lot, qty and rate';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const { mutate: createSale, isPending } = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed');
      const validItems = items.filter((i) => i.lot_id && i.quantity && i.rate);
      const idempotencyKey = Crypto.randomUUID();

      const { data, error } = await mandi().rpc('confirm_sale_transaction', {
        p_organization_id: orgId,
        p_buyer_id: buyerId,
        p_sale_date: formatDateForDB(saleDate),
        p_payment_mode: paymentMode,
        p_total_amount: subtotal,
        p_items: validItems.map(i => ({
          lot_id: i.lot_id,
          item_id: (lots.find(l => l.id === i.lot_id) as any)?.commodity_id || (lots.find(l => l.id === i.lot_id) as any)?.item_id,
          qty: parseFloat(i.quantity),
          rate: parseFloat(i.rate),
          amount: parseFloat(i.quantity) * parseFloat(i.rate),
          unit: i.unit
        })),
        p_market_fee: totals.marketFee,
        p_nirashrit: totals.nirashrit,
        p_misc_fee: totals.miscFee,
        p_loading_charges: totals.loadingCharges,
        p_unloading_charges: totals.unloadingCharges,
        p_other_expenses: totals.otherExpenses,
        p_amount_received: paymentMode === 'credit' ? 0 : totalAmount,
        p_idempotency_key: idempotencyKey,
        p_due_date: null,
        p_cheque_no: null,
        p_cheque_date: null,
        p_cheque_status: false,
        p_bank_name: null,
        p_bank_account_id: null,
        p_cgst_amount: 0,
        p_sgst_amount: 0,
        p_igst_amount: 0,
        p_gst_total: 0,
        p_discount_percent: 0,
        p_discount_amount: discount
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (sale) => {
      toast.show('Sale created successfully ✓', 'success');
      qc.invalidateQueries({ queryKey: ['sales', orgId] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats', orgId] });
      qc.invalidateQueries({ queryKey: ['lots-active', orgId] });
      navigation.replace('SaleDetail', { id: sale.id });
    },
    onError: (err: any) => {
      if (err.message !== 'Validation failed') {
        const mapped = mapDatabaseError(err);
        toast.show(mapped.message, mapped.severity === 'warning' ? 'info' : mapped.severity);
      }
    },
  });

  const lotOptions = lots.map((l) => ({
    label: `${l.lot_code} (${l.current_qty} ${l.unit})`,
    value: l.id,
  }));
  const buyerOptions = buyers.map((b) => ({ label: b.name, value: b.id }));
  const paymentOptions = [
    { label: 'Cash', value: 'cash' },
    { label: 'Credit', value: 'credit' },
    { label: 'Cheque', value: 'cheque' },
    { label: 'UPI', value: 'upi' },
    { label: 'NEFT/RTGS', value: 'bank_transfer' },
  ];

  return (
    <Screen scroll padded keyboard>
      <Header title="New Sale" onBack={() => navigation.goBack()} />

      {/* Sale Details Card */}
      <Card title="Sale Details" style={styles.card}>
        <Select
          label="Buyer *"
          options={buyerOptions}
          value={buyerId}
          onChange={(v) => {
            setBuyerId(v);
            setErrors((e) => ({ ...e, buyer: undefined }));
          }}
          placeholder="Select buyer..."
          required
        />
        {errors.buyer && <Text style={styles.errorText}>{errors.buyer}</Text>}

        <Select
          label="Payment Mode"
          options={paymentOptions}
          value={paymentMode}
          onChange={setPaymentMode}
          required
        />

        {/* Date Picker */}
        <TouchableOpacity
          style={styles.datePicker}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateLabel}>Sale Date</Text>
          <Text style={styles.dateValue}>{formatDateForDisplay(saleDate)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={saleDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) setSaleDate(selectedDate);
            }}
          />
        )}
      </Card>

      {/* Items Card */}
      <Card title="Items" style={styles.card}>
        {errors.items && (
          <Text style={[styles.errorText, { marginBottom: spacing.sm }]}>{errors.items}</Text>
        )}
        {items.map((item, idx) => (
          <View key={idx} style={styles.itemBlock}>
            {idx > 0 && <Divider />}
            <Row align="between" style={styles.itemHeader}>
              <Text style={styles.itemNo}>Item {idx + 1}</Text>
              {items.length > 1 && (
                <TouchableOpacity onPress={() => removeItem(idx)}>
                  <Text style={styles.removeBtn}>✕ Remove</Text>
                </TouchableOpacity>
              )}
            </Row>
            <Select
              label="Lot"
              options={lotOptions}
              value={item.lot_id}
              onChange={(v) => updateItem(idx, 'lot_id', v)}
              placeholder="Select lot..."
              required
            />
            <Row style={{ gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Input
                  label={`Qty${item.unit ? ` (${item.unit})` : ''}`}
                  placeholder="0"
                  value={item.quantity}
                  onChangeText={(v) => updateItem(idx, 'quantity', v)}
                  keyboardType="decimal-pad"
                  required
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Rate (₹)"
                  placeholder="0.00"
                  value={item.rate}
                  onChangeText={(v) => updateItem(idx, 'rate', v)}
                  keyboardType="decimal-pad"
                  required
                />
              </View>
            </Row>
            {item.quantity && item.rate && (
              <Text style={styles.itemSubtotal}>
                Subtotal: {fmt((parseFloat(item.quantity) || 0) * (parseFloat(item.rate) || 0))}
              </Text>
            )}
          </View>
        ))}
        <Button
          title="+ Add Item"
          onPress={addItem}
          variant="outline"
          size="sm"
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      {/* Optional Fields */}
      <Card title="Additional Details" style={styles.card}>
        <Input
          label="Discount (₹)"
          placeholder="0.00"
          value={discountAmount}
          onChangeText={setDiscountAmount}
          keyboardType="decimal-pad"
          hint="Will be deducted from total"
        />
        <Row style={{ gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Loading (₹)"
              placeholder="0"
              value={loadingCharges}
              onChangeText={setLoadingCharges}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Unloading (₹)"
              placeholder="0"
              value={unloadingCharges}
              onChangeText={setUnloadingCharges}
              keyboardType="decimal-pad"
            />
          </View>
        </Row>
        <Input
          label="Other Expenses"
          placeholder="0"
          value={otherExpenses}
          onChangeText={setOtherExpenses}
          keyboardType="decimal-pad"
        />
        <Input
          label="Notes"
          placeholder="Internal notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </Card>

      {/* Totals Summary */}
      <View style={styles.summaryBox}>
        <Row align="between">
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{fmt(subtotal)}</Text>
        </Row>
        <Row align="between" style={{ marginTop: spacing.xs }}>
          <Text style={styles.summaryLabel}>Market Fee ({ (taxSettings as any).market_fee_percent || 0 }%)</Text>
          <Text style={styles.summaryValue}>+{fmt(totals.marketFee)}</Text>
        </Row>
        {totals.nirashrit > 0 && (
          <Row align="between" style={{ marginTop: spacing.xs }}>
            <Text style={styles.summaryLabel}>Nirashrit ({ (taxSettings as any).nirashrit_percent || 0 }%)</Text>
            <Text style={styles.summaryValue}>+{fmt(totals.nirashrit)}</Text>
          </Row>
        )}
        {discount > 0 && (
          <Row align="between" style={{ marginTop: spacing.xs }}>
            <Text style={styles.summaryLabel}>Discount</Text>
            <Text style={[styles.summaryValue, { color: palette.error }]}>-{fmt(discount)}</Text>
          </Row>
        )}
        <View style={styles.totalDivider} />
        <Row align="between">
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{fmt(totalAmount)}</Text>
        </Row>
      </View>

      <Button
        title="Create Sale"
        onPress={() => createSale()}
        loading={isPending}
        fullWidth
        size="lg"
        style={{ marginBottom: spacing['2xl'] }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  itemBlock: { marginBottom: spacing.sm },
  itemHeader: { marginBottom: spacing.sm },
  itemNo: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray700 },
  removeBtn: { fontSize: fontSize.sm, color: palette.error, fontWeight: '500' },
  itemSubtotal: {
    fontSize: fontSize.sm,
    color: palette.primary,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: palette.error,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  datePicker: {
    borderWidth: 1,
    borderColor: palette.gray200,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: { fontSize: fontSize.sm, color: palette.gray500 },
  dateValue: { fontSize: fontSize.md, fontWeight: '600', color: palette.primary },
  summaryBox: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  summaryLabel: { fontSize: fontSize.sm, color: palette.gray600 },
  summaryValue: { fontSize: fontSize.md, fontWeight: '600', color: palette.gray800 },
  totalDivider: {
    height: 1,
    backgroundColor: palette.gray200,
    marginVertical: spacing.sm,
  },
  totalLabel: { fontSize: fontSize.lg, fontWeight: '700', color: palette.gray900 },
  totalValue: { fontSize: fontSize['2xl'], fontWeight: '700', color: palette.primary },
});

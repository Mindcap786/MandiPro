/**
 * POS Screen — Fast, single-screen rapid entry system for lot sales.
 * Optimized for touch interfaces without complex form scrolling.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, core } from '@/api/db';
import { Screen, Row } from '@/components/layout';
import { Input, Select } from '@/components/forms';
import { Button, Badge } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { calculateSaleTotals } from '@/utils/sales-tax';

type Props = NativeStackScreenProps<SalesStackParamList, 'Pos'>;

function formatDateForDB(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function PosScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [selectedLot, setSelectedLot] = useState<any>(null);
  const [buyerId, setBuyerId] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [discount, setDiscount] = useState('');

  // ── Fetch Buyers ──
  const { data: buyers = [] } = useQuery({
    queryKey: ['contacts-buyers', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('contact_type', 'buyer')
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // ── Fetch Lots ──
  const { data: lots = [] } = useQuery({
    queryKey: ['lots-pos', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('id, lot_code, current_qty, unit, sale_price, commodity:commodity_id(name)')
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


  const numericQty = parseFloat(qty) || 0;
  const numericRate = parseFloat(rate) || 0;
  const numericDisc = parseFloat(discount) || 0;

  const totals = calculateSaleTotals({
    items: selectedLot ? [{
      amount: numericQty * numericRate,
      gst_rate: (selectedLot as any).gst_rate || 0,
    }] : [],
    taxSettings: {
      market_fee_percent: (taxSettings as any).market_fee_percent || 0,
      nirashrit_percent: (taxSettings as any).nirashrit_percent || 0,
      misc_fee_percent: (taxSettings as any).misc_fee_percent || 0,
    },
    discountAmount: numericDisc,
  });

  const subtotal = numericQty * numericRate;
  const grandTotal = totals.grandTotal;

  const { mutate: completeSale, isPending } = useMutation({
    mutationFn: async () => {
      if (!selectedLot) throw new Error('Select a lot');
      if (!buyerId) throw new Error('Select a buyer');
      if (numericQty <= 0) throw new Error('Enter qty');
      if (numericRate <= 0) throw new Error('Enter rate');

      const idempotencyKey = Math.random().toString(36).slice(2) + Date.now();

      // RPC Payload matching Web lib/mandi/confirm-sale-transaction.ts
      const { data, error } = await mandi().rpc('confirm_sale_transaction', {
        p_organization_id: orgId,
        p_buyer_id: buyerId,
        p_sale_date: formatDateForDB(new Date()),
        p_payment_mode: paymentMode,
        p_total_amount: subtotal,
        p_items: [{
          lot_id: selectedLot.id,
          item_id: selectedLot.item_id || selectedLot.commodity_id, // ensure commodity link
          qty: numericQty,
          rate: numericRate,
          amount: subtotal,
          unit: selectedLot.unit
        }],
        p_market_fee: totals.marketFee,
        p_nirashrit: totals.nirashrit,
        p_misc_fee: totals.miscFee,
        p_loading_charges: 0,
        p_unloading_charges: 0,
        p_other_expenses: 0,
        p_amount_received: paymentMode === 'credit' ? 0 : grandTotal,
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
        p_discount_amount: numericDisc
      });

      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      toast.show('POS Sale Confirmed ✓', 'success');
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['lots-pos'] });
      qc.invalidateQueries({ queryKey: ['party-ledger'] });
      qc.invalidateQueries({ queryKey: ['day-book'] });
      // Reset Form
      setSelectedLot(null);
      setQty('');
      setRate('');
      setDiscount('');
    },
    onError: (err: Error) => toast.show(err.message, 'error'),
  });

  const handleLotSelect = (lot: any) => {
    setSelectedLot(lot);
    if (lot.sale_price) setRate(String(lot.sale_price));
    setQty('');
  };

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const buyerOptions = buyers.map((b) => ({ label: b.name, value: b.id }));
  const paymentModes = [
    { label: 'Cash', value: 'cash' },
    { label: 'Credit (Udhaar)', value: 'credit' },
    { label: 'UPI', value: 'upi' }
  ];

  return (
    <Screen scroll={false} padded={false} keyboard backgroundColor={palette.gray100}>
      <View style={styles.header}>
        <Row align="between">
          <Text style={styles.title}>SuperPOS</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.closeBtn}>Close</Text>
          </TouchableOpacity>
        </Row>
      </View>

      <View style={styles.container}>
        {/* LEFT PANEL : Lots Grid */}
        <View style={styles.leftPanel}>
          <Text style={styles.sectionTitle}>Select Active Lot</Text>
          <FlatList
            data={lots}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: spacing.sm }}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            renderItem={({ item }) => {
              const isSelected = selectedLot?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.lotCard, isSelected && styles.lotCardActive]}
                  onPress={() => handleLotSelect(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.lotCode, isSelected && { color: palette.white }]}>
                    {item.lot_code}
                  </Text>
                  <Text style={[styles.cmdName, isSelected && { color: palette.white }]} numberOfLines={1}>
                    {(item as any).commodity?.name}
                  </Text>
                  <View style={styles.lotMeta}>
                    <Badge label={`${item.current_qty} ${item.unit}`} variant={isSelected ? 'default' : 'info'} />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* RIGHT PANEL : Checkout Form */}
        <View style={styles.rightPanel}>
          <Text style={styles.sectionTitle}>Checkout</Text>
          <View style={styles.checkoutForm}>
            {selectedLot ? (
              <View style={styles.selectedLotPill}>
                <Text style={styles.selectedLotText}>Selling: {selectedLot.lot_code}</Text>
              </View>
            ) : (
              <Text style={styles.helpText}>Tap a lot on the left to begin.</Text>
            )}

            <Select
              label="Buyer *"
              options={buyerOptions}
              value={buyerId}
              onChange={setBuyerId}
              placeholder="Walk-in Customer..."
            />
            <Select
              label="Payment Type"
              options={paymentModes}
              value={paymentMode}
              onChange={setPaymentMode}
            />

            <Row align="between" style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              <View style={{ flex: 1 }}>
                <Input
                  label={`Qty (${selectedLot?.unit || '-'})`}
                  placeholder="0"
                  value={qty}
                  onChangeText={setQty}
                  keyboardType="decimal-pad"
                  editable={!!selectedLot}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  label="Rate (₹)"
                  placeholder="0"
                  value={rate}
                  onChangeText={setRate}
                  keyboardType="decimal-pad"
                  editable={!!selectedLot}
                />
              </View>
            </Row>
            
            <Input
              label="Discount (₹)"
              placeholder="0"
              value={discount}
              onChangeText={setDiscount}
              keyboardType="decimal-pad"
              editable={!!selectedLot}
            />

            <View style={styles.totalsBox}>
              <Row align="between">
                <Text style={styles.totLabel}>Subtotal:</Text>
                <Text style={styles.totVal}>{fmt(subtotal)}</Text>
              </Row>
              <Row align="between">
                <Text style={styles.totLabel}>Market Fee ({ (taxSettings as any).market_fee_percent || 0 }%):</Text>
                <Text style={styles.totVal}>+{fmt(totals.marketFee)}</Text>
              </Row>
              <View style={styles.divider} />
              <Row align="between">
                <Text style={styles.grandTotalLabel}>TO PAY:</Text>
                <Text style={styles.grandTotalVal}>{fmt(grandTotal)}</Text>
              </Row>
            </View>

            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.lg }}>
              <Button
                title={isPending ? 'Processing...' : `SWIPE TO PAY ${fmt(grandTotal)}`}
                onPress={() => completeSale()}
                loading={isPending}
                fullWidth
                size="lg"
                disabled={!selectedLot || numericQty <= 0 || !buyerId}
                style={{ height: 60, borderRadius: radius.xl }}
              />
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg, backgroundColor: palette.white, borderBottomWidth: 1, borderBottomColor: palette.gray200 },
  title: { fontSize: fontSize.xl, fontWeight: '900', color: palette.primary, fontStyle: 'italic' },
  closeBtn: { fontSize: fontSize.md, fontWeight: '600', color: palette.error },
  container: { flex: 1, flexDirection: 'row' },
  leftPanel: { flex: 1.2, padding: spacing.md, borderRightWidth: 1, borderRightColor: palette.gray200, backgroundColor: palette.gray50 },
  rightPanel: { flex: 1, padding: spacing.md, backgroundColor: palette.white },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: '800', color: palette.gray400, textTransform: 'uppercase', marginBottom: spacing.md },
  lotCard: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.lg, ...shadows.sm, borderWidth: 1, borderColor: palette.gray200, flex: 1, minHeight: 90 },
  lotCardActive: { backgroundColor: palette.primary, borderColor: palette.primaryDark },
  lotCode: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900, marginBottom: 2 },
  cmdName: { fontSize: fontSize.xs, color: palette.gray500, marginBottom: spacing.sm },
  lotMeta: { flexDirection: 'row', marginTop: 'auto' },
  checkoutForm: { flex: 1, gap: spacing.md },
  selectedLotPill: { backgroundColor: palette.primaryLight, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: palette.primary },
  selectedLotText: { color: palette.primaryDark, fontWeight: '700', textAlign: 'center', fontSize: fontSize.sm },
  helpText: { textAlign: 'center', color: palette.gray400, fontStyle: 'italic', paddingVertical: spacing.md },
  totalsBox: { backgroundColor: palette.gray100, padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.md },
  totLabel: { fontSize: fontSize.sm, color: palette.gray600, fontWeight: '500' },
  totVal: { fontSize: fontSize.sm, color: palette.gray900, fontWeight: '700' },
  divider: { height: 1, backgroundColor: palette.gray300, marginVertical: spacing.sm },
  grandTotalLabel: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900 },
  grandTotalVal: { fontSize: fontSize.xl, fontWeight: '900', color: palette.success },
});

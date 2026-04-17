import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mandi } from '@/api/db';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Button, Divider, Badge } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { calculateSaleTotals } from '@/utils/sales-tax';

type Props = NativeStackScreenProps<SalesStackParamList, 'BulkLotSale'>;

interface Distribution {
  id: string; // Internal local ID for list management
  buyer_id: string;
  quantity: string;
  rate: string;
  paymentMode: string;
}

export function BulkLotSaleScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [selectedLotId, setSelectedLotId] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [distributions, setDistributions] = useState<Distribution[]>([
    { id: Crypto.randomUUID(), buyer_id: '', quantity: '', rate: '', paymentMode: 'credit' },
  ]);

  // ── Masters ──
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
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: lots = [] } = useQuery({
    queryKey: ['lots-active', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('id, lot_code, current_qty, unit, sale_price, item_id')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .gt('current_qty', 0)
        .order('lot_code');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!orgId,
  });

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

  const selectedLot = lots.find(l => l.id === selectedLotId);

  const addDistribution = () => {
    setDistributions(prev => [
      ...prev,
      { id: Crypto.randomUUID(), buyer_id: '', quantity: '', rate: selectedLot?.sale_price ? String(selectedLot.sale_price) : '', paymentMode: 'credit' }
    ]);
  };

  const removeDistribution = (id: string) => {
    if (distributions.length > 1) {
      setDistributions(prev => prev.filter(d => d.id !== id));
    }
  };

  const updateDist = (id: string, field: keyof Distribution, value: string) => {
    setDistributions(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const totalQtyDistributed = distributions.reduce((sum, d) => sum + (parseFloat(d.quantity) || 0), 0);
  const remainingInLot = selectedLot ? selectedLot.current_qty - totalQtyDistributed : 0;

  const { mutate: processBulkSale, isPending } = useMutation({
    mutationFn: async () => {
      if (!selectedLotId) throw new Error('Please select a stock lot first.');
      if (totalQtyDistributed === 0) throw new Error('Please add at least one distribution.');
      if (remainingInLot < 0) throw new Error('Distributed quantity exceeds available stock.');

      const validDists = distributions.filter(d => d.buyer_id && d.quantity && d.rate);
      
      // We loop and process one by one like the web app
      for (const dist of validDists) {
        const qtyVal = parseFloat(dist.quantity);
        const rateVal = parseFloat(dist.rate);
        const subtotal = qtyVal * rateVal;

        const totals = calculateSaleTotals({
          items: [{ amount: subtotal, gst_rate: (selectedLot as any).gst_rate || 0 }],
          taxSettings: {
            market_fee_percent: (taxSettings as any).market_fee_percent || 0,
            nirashrit_percent: (taxSettings as any).nirashrit_percent || 0,
            misc_fee_percent: (taxSettings as any).misc_fee_percent || 0,
          },
          loadingCharges: '0',
          unloadingCharges: '0',
          otherExpenses: '0',
          discountAmount: '0',
        });

        const { error } = await mandi().rpc('confirm_sale_transaction', {
          p_organization_id: orgId,
          p_buyer_id: dist.buyer_id,
          p_sale_date: saleDate,
          p_payment_mode: dist.paymentMode,
          p_total_amount: subtotal,
          p_items: [{
            lot_id: selectedLotId,
            item_id: selectedLot!.item_id,
            qty: qtyVal,
            rate: rateVal,
            amount: subtotal,
            unit: selectedLot!.unit
          }],
          p_market_fee: totals.marketFee,
          p_nirashrit: totals.nirashrit,
          p_misc_fee: totals.miscFee,
          p_amount_received: dist.paymentMode === 'credit' ? 0 : totals.grandTotal,
          p_idempotency_key: Crypto.randomUUID(),
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.show('Bulk distribution successful! 🚀', 'success');
      qc.invalidateQueries({ queryKey: ['sales', orgId] });
      qc.invalidateQueries({ queryKey: ['lots-active', orgId] });
      navigation.navigate('SalesList');
    },
    onError: (err: any) => {
      Alert.alert('Distribution Failed', err.message);
    }
  });

  return (
    <Screen scroll padded backgroundColor={palette.gray50}>
      <Header title="Bulk Lot Distribution" subtitle="1 Lot → Multiple Buyers" onBack={() => navigation.goBack()} />

      {/* Step 1: Stock Selection */}
      <Card title="Step 1: Pick Stock" style={styles.card}>
        <Select
          label="Source Lot"
          options={lots.map(l => ({ label: `${l.lot_code} (${l.current_qty} ${l.unit})`, value: l.id }))}
          value={selectedLotId}
          onChange={setSelectedLotId}
          placeholder="Select lot to distribute..."
        />
        {selectedLot && (
          <View style={styles.lotSummary}>
            <Row align="between">
              <Text style={styles.lotLabel}>Available</Text>
              <Text style={styles.lotValue}>{selectedLot.current_qty} {selectedLot.unit}</Text>
            </Row>
            <Divider style={{ marginVertical: spacing.sm }} />
            <Row align="between">
              <Text style={styles.lotLabel}>Remaining After</Text>
              <Text style={[styles.lotValue, remainingInLot < 0 ? { color: palette.error } : { color: palette.success }]}>
                {remainingInLot.toFixed(2)} {selectedLot.unit}
              </Text>
            </Row>
          </View>
        )}
      </Card>

      {/* Step 2: Distribution */}
      <Text style={styles.sectionTitle}>Step 2: Assign Buyers</Text>
      {distributions.map((dist, index) => (
        <Card key={dist.id} style={styles.distCard}>
          <Row align="between" style={{ marginBottom: spacing.md }}>
            <Text style={styles.distNo}>Buyer #{index + 1}</Text>
            {distributions.length > 1 && (
              <TouchableOpacity onPress={() => removeDistribution(dist.id)}>
                <Text style={styles.removeBtn}>✕ Remove</Text>
              </TouchableOpacity>
            )}
          </Row>
          
          <Select
            label="Customer"
            options={buyers.map(b => ({ label: b.name, value: b.id }))}
            value={dist.buyer_id}
            onChange={(v) => updateDist(dist.id, 'buyer_id', v)}
            placeholder="Select buyer..."
          />

          <Row style={{ gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Qty"
                placeholder="0.00"
                value={dist.quantity}
                onChangeText={(v) => updateDist(dist.id, 'quantity', v)}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Rate"
                placeholder="0.00"
                value={dist.rate}
                onChangeText={(v) => updateDist(dist.id, 'rate', v)}
                keyboardType="decimal-pad"
              />
            </View>
          </Row>

          <Select
            label="Payment Mode"
            options={[
              { label: 'Credit (Udhaar)', value: 'credit' },
              { label: 'Cash', value: 'cash' },
              { label: 'Online/Bank', value: 'upi' },
            ]}
            value={dist.paymentMode}
            onChange={(v) => updateDist(dist.id, 'paymentMode', v)}
          />

          {dist.quantity && dist.rate && (
            <Text style={styles.rowTotal}>
              Line Total: ₹{(parseFloat(dist.quantity) * parseFloat(dist.rate)).toLocaleString()}
            </Text>
          )}
        </Card>
      ))}

      <Button
        title="+ Add Another Buyer"
        variant="outline"
        onPress={addDistribution}
        style={{ marginBottom: spacing.xl }}
      />

      <View style={styles.footer}>
        <Button
          title={isPending ? "Processing..." : `Process ${distributions.length} Invoices`}
          onPress={() => processBulkSale()}
          loading={isPending}
          size="lg"
          fullWidth
          disabled={!selectedLotId || remainingInLot < 0}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  distCard: { marginBottom: spacing.md, padding: spacing.lg },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray500, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  lotSummary: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.lg, marginTop: spacing.sm },
  lotLabel: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '600' },
  lotValue: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray900 },
  distNo: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray600 },
  removeBtn: { fontSize: fontSize.xs, color: palette.error, fontWeight: '700' },
  rowTotal: { fontSize: fontSize.xs, color: palette.primary, fontWeight: '800', textAlign: 'right', marginTop: spacing.xs },
  footer: { marginTop: spacing.xl, marginBottom: spacing['3xl'] },
});

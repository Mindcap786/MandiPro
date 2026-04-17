import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, core } from '@/api/db';
import { supabase } from '@/api/supabase'; // We need direct supabase client for RPC
import { Screen, Header, Row } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { mapDatabaseError } from '@/utils/error-mapper';

type Props = NativeStackScreenProps<InventoryStackParamList, 'StockQuickEntry'>;

function formatDateForDB(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateForDisplay(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function StockQuickEntryScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  
  // Single item entry natively for "Quick" usage (avoiding ugly dynamic lists on small screens)
  const [itemId, setItemId] = useState('');
  const [unit, setUnit] = useState('Box');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [commission, setCommission] = useState('');
  const [weightLoss, setWeightLoss] = useState('');
  const [lessUnits, setLessUnits] = useState('');
  const [paymentMode, setPaymentMode] = useState('credit');
  const [advance, setAdvance] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');

  // ── Fetch Commodities ──
  const { data: commodities = [] } = useQuery({
    queryKey: ['commodities', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('commodities')
        .select('id, name, default_unit')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // ── Fetch Suppliers ──
  const { data: suppliers = [] } = useQuery({
    queryKey: ['contacts-suppliers', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name, contact_type')
        .eq('organization_id', orgId!)
        .in('contact_type', ['farmer', 'supplier'])
        .eq('status', 'active')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  // ── Fetch Bank Accounts ──
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('bank_accounts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { mutate: recordQuickPurchase, isPending } = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error('Supplier is required');
      if (!itemId) throw new Error('Commodity is required');
      const numQty = parseFloat(qty) || 0;
      const numRate = parseFloat(rate) || 0;
      if (numQty <= 0) throw new Error('Valid Quantity is required');
      if (numRate <= 0) throw new Error('Valid Rate is required');

      const supplier = suppliers.find(s => s.id === supplierId);
      const isFarmer = supplier?.contact_type === 'farmer';
      
      const rpcItems = [{
        item_id: itemId,
        qty: numQty,
        unit: unit,
        rate: numRate,
        commission: parseFloat(commission) || 0,
        weight_loss: parseFloat(weightLoss) || 0,
        less_units: parseFloat(lessUnits) || 0,
        commission_type: isFarmer ? 'farmer' : 'supplier',
      }];

      const pAdvance = parseFloat(advance) || 0;

      const { data, error } = await supabase.rpc('record_quick_purchase', {
        p_organization_id: orgId,
        p_supplier_id: supplierId,
        p_arrival_date: formatDateForDB(date),
        p_arrival_type: (parseFloat(commission) > 0) ? (isFarmer ? 'commission' : 'commission_supplier') : 'direct',
        p_items: rpcItems,
        p_advance: pAdvance,
        p_advance_payment_mode: paymentMode === 'bank' ? 'upi_bank' : paymentMode,
        p_advance_bank_account_id: bankAccountId || null,
        p_advance_cheque_no: null,
        p_advance_cheque_date: null,
        p_advance_bank_name: null,
        p_advance_cheque_status: false,
        p_clear_instantly: false,
        p_created_by: profile?.id
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.show('Stock recorded ✓', 'success');
      qc.invalidateQueries({ queryKey: ['lots-active'] });
      qc.invalidateQueries({ queryKey: ['arrivals'] });
      qc.invalidateQueries({ queryKey: ['party-ledger'] });
      qc.invalidateQueries({ queryKey: ['day-book'] });
      navigation.goBack();
    },
    onError: (err: any) => {
      const mapped = mapDatabaseError(err);
      toast.show(mapped.message, mapped.severity === 'warning' ? 'info' : mapped.severity);
    },
  });

  const suppOptions = suppliers.map((s) => ({ label: `${s.name} (${s.contact_type})`, value: s.id }));
  const cmdOptions = commodities.map((c) => ({ label: c.name, value: c.id }));
  const unitOptions = ['Box', 'Crate', 'Kgs', 'Tons', 'Pieces'].map(u => ({ label: u, value: u }));
  const payOptions = [
    { label: 'Credit (Udhaar)', value: 'credit' },
    { label: 'Cash', value: 'cash' },
    { label: 'UPI / Bank', value: 'bank' },
  ];

  const handleCommoditySelect = (id: string) => {
    setItemId(id);
    const cmd = commodities.find(c => c.id === id);
    if (cmd?.default_unit) setUnit(cmd.default_unit);
  };

  const currentSubtotal = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);

  return (
    <Screen scroll padded keyboard backgroundColor={palette.gray50}>
      <Header title="Quick Stock Entry" onBack={() => navigation.goBack()} />

      <Card title="Purchase Details" style={styles.card}>
        <Row align="between" style={{ marginBottom: spacing.md }}>
          <Text style={styles.lbl}>Entry Date</Text>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateBtn}>
            <Text style={styles.dateText}>{formatDateForDisplay(date)}</Text>
          </TouchableOpacity>
        </Row>
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

        <Select
          label="Farmer / Supplier *"
          options={suppOptions}
          value={supplierId}
          onChange={setSupplierId}
          placeholder="Select party..."
        />
        <Select
          label="Commodity *"
          options={cmdOptions}
          value={itemId}
          onChange={handleCommoditySelect}
          placeholder="Select item..."
        />
      </Card>

      <Card title="Pricing & Quantities" style={styles.card}>
        <Row style={{ gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input label="Quantity *" placeholder="0" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Select label="Unit" options={unitOptions} value={unit} onChange={setUnit} />
          </View>
        </Row>

        <Row style={{ gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input label="Rate / Price *" placeholder="0.00" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Comm (%)" placeholder="0" value={commission} onChangeText={setCommission} keyboardType="decimal-pad" hint="Optional" />
          </View>
        </Row>

        <Divider style={{ marginVertical: spacing.md }} />
        <Row style={{ gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input label="W. Loss (%)" placeholder="0" value={weightLoss} onChangeText={setWeightLoss} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Less Qty" placeholder="0" value={lessUnits} onChangeText={setLessUnits} keyboardType="decimal-pad" />
          </View>
        </Row>
        
        {currentSubtotal > 0 && (
          <Text style={styles.subtotalText}>Gross Value: ₹{currentSubtotal.toLocaleString('en-IN')}</Text>
        )}
      </Card>

      <Card title="Initial Payment (Advance)" style={styles.card}>
        <Select
          label="Payment Mode"
          options={payOptions}
          value={paymentMode}
          onChange={setPaymentMode}
        />
        {paymentMode === 'bank' && (
          <Select
            label="Bank Account"
            options={bankAccounts.map(b => ({ label: b.name, value: b.id }))}
            value={bankAccountId}
            onChange={setBankAccountId}
          />
        )}
        {paymentMode !== 'credit' && (
          <Input
            label="Paid Amount (₹)"
            placeholder="0.00"
            value={advance}
            onChangeText={setAdvance}
            keyboardType="decimal-pad"
          />
        )}
      </Card>

      <Button
        title="Record Purchase & Create Lot"
        onPress={() => recordQuickPurchase()}
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
  lbl: { fontSize: fontSize.sm, color: palette.gray600, fontWeight: '500' },
  dateBtn: { backgroundColor: palette.gray100, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  dateText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.primary },
  subtotalText: { textAlign: 'right', color: palette.primaryDark, fontWeight: '700', marginTop: spacing.xs, fontSize: fontSize.sm },
});

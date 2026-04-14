import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FinanceStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, pub } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Button, Input, Select, Divider } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<FinanceStackParamList, 'Receipts' | 'Payments'>;

export function VoucherCreateScreen({ route, navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const mode = route.name === 'Receipts' ? 'receipt' : 'payment';
  const isReceipt = mode === 'receipt';

  const [form, setForm] = useState({
    partyId: '',
    accountId: '', // For expense payments
    amount: '',
    discount: '0',
    date: new Date(),
    paymentMode: 'cash' as 'cash' | 'bank' | 'upi' | 'cheque',
    bankAccountId: '',
    remarks: '',
    chequeNo: '',
    chequeDate: new Date(),
    chequeStatus: 'Pending',
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showChequeDatePicker, setShowChequeDatePicker] = useState(false);

  // ── Fetch Shared Data ──
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-active', orgId],
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

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts-active', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('accounts')
        .select('id, name, type, account_sub_type, code')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const contactOptions = useMemo(() => 
    contacts.map(c => ({ label: `${c.name} (${c.type})`, value: c.id })), 
  [contacts]);

  const bankAccountOptions = useMemo(() => 
    accounts.filter(a => a.account_sub_type === 'bank').map(a => ({ label: a.name, value: a.id })), 
  [accounts]);

  const expenseAccountOptions = useMemo(() => 
    accounts.filter(a => a.type === 'expense').map(a => ({ label: a.name, value: a.id })), 
  [accounts]);

  // ── Mutation ──
  const mutation = useMutation({
    mutationFn: async (payload: any) => {
        const { data, error } = await pub().rpc('create_voucher', payload);
        if (error) throw error;
        return data;
    },
    onSuccess: () => {
        toast.show(`${isReceipt ? 'Receipt' : 'Payment'} saved successfully`, 'success');
        qc.invalidateQueries({ queryKey: ['day-book'] });
        qc.invalidateQueries({ queryKey: ['ledger-statement'] });
        navigation.goBack();
    },
    onError: (err: any) => {
        Alert.alert('Error', err.message);
    }
  });

  const handleSave = () => {
    if (!form.partyId && !form.accountId) {
        return Alert.alert('Validation', `Please select a ${isReceipt ? 'Buyer' : 'Party/Account'}`);
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
        return Alert.alert('Validation', 'Please enter a valid amount');
    }

    const payload = {
        p_organization_id: orgId,
        p_voucher_type: mode,
        p_date: form.date.toISOString(),
        p_amount: parseFloat(form.amount),
        p_payment_mode: form.paymentMode,
        p_party_id: form.partyId || null,
        p_account_id: form.accountId || null,
        p_remarks: form.remarks,
        p_discount: parseFloat(form.discount || '0'),
        p_cheque_no: form.paymentMode === 'cheque' ? form.chequeNo : null,
        p_cheque_date: form.paymentMode === 'cheque' ? form.chequeDate.toISOString().split('T')[0] : null,
        p_cheque_status: form.paymentMode === 'cheque' ? form.chequeStatus : null,
        p_bank_account_id: ['bank', 'upi', 'cheque'].includes(form.paymentMode) ? form.bankAccountId : null,
    };

    mutation.mutate(payload);
  };

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title={isReceipt ? 'New Receipt' : 'New Payment'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Details</Text>
          
          <TouchableOpacity 
            style={styles.datePicker} 
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateLabel}>DATE</Text>
            <Text style={styles.dateValue}>{form.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={form.date}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowDatePicker(false);
                if (d) setForm(prev => ({ ...prev, date: d }));
              }}
            />
          )}

          <Select
            label={isReceipt ? "Received From (Buyer/Farmer)" : "Paid To (Farmer/Supplier)"}
            options={contactOptions}
            value={form.partyId}
            onChange={(v) => setForm(prev => ({ ...prev, partyId: v, accountId: '' }))}
            placeholder="Select contact..."
          />

          {!isReceipt && (
            <Select
              label="OR Expense Account (Optional)"
              options={expenseAccountOptions}
              value={form.accountId}
              onChange={(v) => setForm(prev => ({ ...prev, accountId: v, partyId: '' }))}
              placeholder="Select expense account..."
            />
          )}

          <Row gap={spacing.md}>
            <View style={{ flex: 1 }}>
              <Input
                label="Amount (₹)"
                value={form.amount}
                onChangeText={(v) => setForm(prev => ({ ...prev, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Settlement/Write-off"
                value={form.discount}
                onChangeText={(v) => setForm(prev => ({ ...prev, discount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>
          </Row>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.modeContainer}>
            {(['cash', 'bank', 'upi', 'cheque'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, form.paymentMode === m && styles.modeBtnActive]}
                onPress={() => setForm(prev => ({ ...prev, paymentMode: m }))}
              >
                <Text style={[styles.modeText, form.paymentMode === m && styles.modeTextActive]}>
                  {m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {['bank', 'upi', 'cheque'].includes(form.paymentMode) && (
            <Select
              label="Bank Account"
              options={bankAccountOptions}
              value={form.bankAccountId}
              onChange={(v) => setForm(prev => ({ ...prev, bankAccountId: v }))}
              placeholder="Select our bank..."
            />
          )}

          {form.paymentMode === 'cheque' && (
            <View style={styles.chequeSection}>
              <Divider style={{ marginVertical: spacing.md }} />
              <Input
                label="Cheque Number"
                value={form.chequeNo}
                onChangeText={(v) => setForm(prev => ({ ...prev, chequeNo: v }))}
                placeholder="6-digit number"
              />
              <TouchableOpacity 
                style={styles.datePicker} 
                onPress={() => setShowChequeDatePicker(true)}
              >
                <Text style={styles.dateLabel}>CHEQUE DATE</Text>
                <Text style={styles.dateValue}>{form.chequeDate.toLocaleDateString()}</Text>
              </TouchableOpacity>

              {showChequeDatePicker && (
                <DateTimePicker
                  value={form.chequeDate}
                  mode="date"
                  onChange={(_, d) => {
                    setShowChequeDatePicker(false);
                    if (d) setForm(prev => ({ ...prev, chequeDate: d }));
                  }}
                />
              )}

              <Select
                label="Status"
                options={[
                  { label: 'Pending', value: 'Pending' },
                  { label: 'Cleared', value: 'Cleared' },
                ]}
                value={form.chequeStatus}
                onChange={(v) => setForm(prev => ({ ...prev, chequeStatus: v }))}
              />
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <Input
            label="Remarks / Description"
            value={form.remarks}
            onChangeText={(v) => setForm(prev => ({ ...prev, remarks: v }))}
            placeholder="e.g. Being payment for invoice #123"
            multiline
          />
        </Card>

        <View style={styles.footer}>
          <Button 
            title={mutation.isPending ? "SAVING..." : "SAVE VOUCHER"} 
            onPress={handleSave}
            disabled={mutation.isPending}
            style={styles.submitBtn}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
  card: { padding: spacing.md },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: palette.gray400, textTransform: 'uppercase', marginBottom: spacing.md, letterSpacing: 1 },
  datePicker: { backgroundColor: palette.gray50, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, marginBottom: spacing.md },
  dateLabel: { fontSize: 8, fontWeight: '900', color: palette.gray400, marginBottom: 4 },
  dateValue: { fontSize: fontSize.md, fontWeight: '700', color: palette.primary },
  modeContainer: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  modeBtn: { flex: 1, height: 40, backgroundColor: palette.gray100, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: palette.gray200 },
  modeBtnActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  modeText: { fontSize: 10, fontWeight: '800', color: palette.gray600 },
  modeTextActive: { color: palette.white },
  chequeSection: { gap: spacing.sm },
  footer: { marginTop: spacing.lg },
  submitBtn: { height: 50 },
});

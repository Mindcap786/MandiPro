/**
 * Purchase Create — Record a payment/debit voucher.
 */

import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PurchaseStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { core } from '@/api/db';
import { Screen, Header } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { spacing } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'PurchaseCreate'>;

export function PurchaseCreateScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [type, setType] = useState('payment');
  const [date] = useState(new Date().toISOString().split('T')[0]);

  const { mutate: create, isPending } = useMutation({
    mutationFn: async () => {
      if (!amount || parseFloat(amount) <= 0) throw new Error('Enter a valid amount');
      const { data, error } = await core()
        .from('vouchers')
        .insert({
          organization_id: orgId,
          date,
          type,
          amount: parseFloat(amount),
          narration: narration || null,
          is_locked: false,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (v) => {
      toast.show('Voucher created', 'success');
      qc.invalidateQueries({ queryKey: ['vouchers-purchase', orgId] });
      navigation.replace('PurchaseDetail', { id: v.id });
    },
    onError: (err: Error) => toast.show(err.message, 'error'),
  });

  return (
    <Screen scroll padded keyboard>
      <Header title="New Payment" onBack={() => navigation.goBack()} />

      <Card title="Voucher Details" style={{ marginBottom: spacing.lg }}>
        <Select
          label="Type"
          options={[{ label: 'Payment', value: 'payment' }, { label: 'Debit', value: 'debit' }]}
          value={type}
          onChange={setType}
          required
        />
        <Input label="Amount (\u20B9)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" required />
        <Input label="Narration" placeholder="Description (optional)" value={narration} onChangeText={setNarration} multiline />
      </Card>

      <Button title="Create Voucher" onPress={() => create()} loading={isPending} fullWidth size="lg" style={{ marginBottom: spacing['2xl'] }} />
    </Screen>
  );
}

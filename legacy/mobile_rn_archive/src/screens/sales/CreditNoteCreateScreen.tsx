/**
 * Credit/Debit Note Create — 1:1 of web /credit-notes/new.
 * Inserts public.credit_debit_notes.
 */
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { pub } from '@/api/db';
import { palette, spacing } from '@/theme';

export function CreditNoteCreateScreen({ navigation, route }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [noteType, setNoteType] = useState<'Credit Note' | 'Debit Note'>(route?.params?.type || 'Credit Note');
  const [contactId, setContactId] = useState('');
  const [refInvoiceId, setRefInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const { data: parties = [] } = useQuery({
    queryKey: ['cn-parties', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('contacts')
        .select('id, name, type')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['cn-invoices', orgId, contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await pub()
        .from('sales')
        .select('id, bill_no, sale_date, total_amount')
        .eq('organization_id', orgId!)
        .eq('contact_id', contactId)
        .order('sale_date', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId && !!contactId,
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error('Select a party');
      const a = parseFloat(amount);
      if (!a || a <= 0) throw new Error('Enter a valid amount');
      if (!reason.trim()) throw new Error('Reason is required');

      const prefix = noteType === 'Credit Note' ? 'CN' : 'DN';
      const { error } = await pub().from('credit_debit_notes').insert({
        organization_id: orgId,
        contact_id: contactId,
        reference_invoice_id: refInvoiceId || null,
        note_type: noteType,
        note_number: `${prefix}-${Date.now().toString().slice(-6)}`,
        note_date: new Date().toISOString().split('T')[0],
        amount: a,
        reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.show(`${noteType} created`, 'success');
      qc.invalidateQueries({ queryKey: ['credit-notes', orgId] });
      navigation.goBack();
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  return (
    <Screen scroll padded keyboard>
      <Header title={`New ${noteType}`} onBack={() => navigation.goBack()} />
      <Card style={{ marginBottom: spacing.lg }}>
        <Select
          label="Type *"
          options={[
            { label: 'Credit Note', value: 'Credit Note' },
            { label: 'Debit Note', value: 'Debit Note' },
          ]}
          value={noteType}
          onChange={(v) => setNoteType(v as any)}
          required
        />
        <Select
          label="Party *"
          options={parties.map((p: any) => ({ label: p.name, value: p.id }))}
          value={contactId}
          onChange={setContactId}
          placeholder="Select party..."
          required
        />
        {invoices.length > 0 && (
          <Select
            label="Reference Invoice (optional)"
            options={[{ label: 'None', value: '' }, ...invoices.map((i: any) => ({ label: `${i.bill_no} — ₹${i.total_amount}`, value: i.id }))]}
            value={refInvoiceId}
            onChange={setRefInvoiceId}
            placeholder="Select invoice..."
          />
        )}
        <Input label="Amount ₹ *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" required />
        <Input label="Reason *" value={reason} onChangeText={setReason} multiline numberOfLines={3} required />
      </Card>
      <Button title={`Create ${noteType}`} onPress={() => save()} loading={isPending} fullWidth size="lg" style={{ marginBottom: spacing['2xl'] }} />
    </Screen>
  );
}

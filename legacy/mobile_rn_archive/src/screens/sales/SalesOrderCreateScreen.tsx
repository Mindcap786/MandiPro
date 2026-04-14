/**
 * Sales Order Create — 1:1 of web /sales-orders/new.
 * Inserts public.sales_orders + public.sales_order_items.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize } from '@/theme';

type Line = { item_id: string; qty: string; rate: string };

const newLine = (): Line => ({ item_id: '', qty: '1', rate: '0' });

export function SalesOrderCreateScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [buyerId, setBuyerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const { data: buyers = [] } = useQuery({
    queryKey: ['so-buyers', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('type', 'buyer')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['so-items', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('items')
        .select('id, name')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const total = useMemo(
    () =>
      lines.reduce((s, l) => {
        const q = parseFloat(l.qty) || 0;
        const r = parseFloat(l.rate) || 0;
        return s + q * r;
      }, 0),
    [lines],
  );

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (!buyerId) throw new Error('Select a buyer');
      const valid = lines.filter((l) => l.item_id && parseFloat(l.qty) > 0);
      if (valid.length === 0) throw new Error('Add at least one item');

      const orderNumber = `SO-${Date.now().toString().slice(-6)}`;
      const { data: order, error } = await pub()
        .from('sales_orders')
        .insert({
          organization_id: orgId,
          buyer_id: buyerId,
          order_number: orderNumber,
          order_date: new Date().toISOString().split('T')[0],
          total_amount: total,
          notes: notes || null,
          status: 'Draft',
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      const rows = valid.map((l) => {
        const q = parseFloat(l.qty);
        const r = parseFloat(l.rate);
        return {
          sales_order_id: order.id,
          item_id: l.item_id,
          quantity: q,
          unit_price: r,
          total_price: q * r,
        };
      });
      const { error: e2 } = await pub().from('sales_order_items').insert(rows);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: () => {
      toast.show('Sales order created', 'success');
      qc.invalidateQueries({ queryKey: ['sales-orders', orgId] });
      navigation.goBack();
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  const update = (i: number, p: Partial<Line>) =>
    setLines((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...p };
      return next;
    });

  return (
    <Screen scroll padded keyboard>
      <Header title="New Sales Order" onBack={() => navigation.goBack()} />
      <Card title="Buyer" style={{ marginBottom: spacing.lg }}>
        <Select
          label="Buyer *"
          options={buyers.map((b: any) => ({ label: b.name, value: b.id }))}
          value={buyerId}
          onChange={setBuyerId}
          placeholder="Select buyer..."
          required
        />
      </Card>
      <Card title="Items" style={{ marginBottom: spacing.lg }}>
        {lines.map((l, i) => (
          <View key={i} style={{ paddingBottom: spacing.sm }}>
            <Select
              label={`Item #${i + 1}`}
              options={items.map((it: any) => ({ label: it.name, value: it.id }))}
              value={l.item_id}
              onChange={(v) => update(i, { item_id: v })}
              placeholder="Select..."
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input label="Qty" value={l.qty} onChangeText={(v) => update(i, { qty: v })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Rate ₹" value={l.rate} onChangeText={(v) => update(i, { rate: v })} keyboardType="decimal-pad" />
              </View>
            </View>
            {lines.length > 1 && (
              <TouchableOpacity onPress={() => setLines(lines.filter((_, x) => x !== i))}>
                <Text style={styles.remove}>− Remove</Text>
              </TouchableOpacity>
            )}
            {i < lines.length - 1 && <Divider style={{ marginVertical: spacing.sm }} />}
          </View>
        ))}
        <Button title="+ Add Item" variant="outline" onPress={() => setLines([...lines, newLine()])} />
      </Card>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.totals}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalVal}>₹{total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
        </View>
      </Card>
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} containerStyle={{ marginBottom: spacing.lg }} />
      <Button title="Create Sales Order" onPress={() => save()} loading={isPending} fullWidth size="lg" style={{ marginBottom: spacing['2xl'] }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  remove: { color: palette.error, fontSize: fontSize.sm, marginTop: spacing.xs },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray700 },
  totalVal: { fontSize: fontSize['2xl'], fontWeight: '900', color: palette.gray900 },
});

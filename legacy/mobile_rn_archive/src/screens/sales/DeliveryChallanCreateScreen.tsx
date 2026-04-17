/**
 * Delivery Challan Create — 1:1 of web /delivery-challans/new.
 * Inserts public.delivery_challans + public.delivery_challan_items.
 * Optionally pre-fills from a sales_order's items.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize } from '@/theme';

type Line = { item_id: string; quantity_dispatched: string };
const newLine = (): Line => ({ item_id: '', quantity_dispatched: '1' });

export function DeliveryChallanCreateScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [contactId, setContactId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [driver, setDriver] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const { data: parties = [] } = useQuery({
    queryKey: ['dc-parties', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['dc-items', orgId],
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

  const { data: orders = [] } = useQuery({
    queryKey: ['dc-orders', orgId, contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await pub()
        .from('sales_orders')
        .select('id, order_number, order_date')
        .eq('organization_id', orgId!)
        .eq('buyer_id', contactId)
        .order('order_date', { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId && !!contactId,
  });

  // pre-fill from selected sales order
  useEffect(() => {
    if (!salesOrderId) return;
    (async () => {
      const { data } = await pub()
        .from('sales_orders')
        .select('*, sales_order_items(*)')
        .eq('id', salesOrderId)
        .single();
      if (data?.sales_order_items?.length) {
        setLines(
          data.sales_order_items.map((it: any) => ({
            item_id: it.item_id,
            quantity_dispatched: String(it.quantity),
          })),
        );
        toast.show(`Loaded items from ${data.order_number}`, 'success');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salesOrderId]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (!contactId) throw new Error('Select a consignee');
      const valid = lines.filter((l) => l.item_id && parseFloat(l.quantity_dispatched) > 0);
      if (valid.length === 0) throw new Error('Add at least one item');

      const challanNumber = `CH-${Date.now().toString().slice(-6)}`;
      const { data: challan, error } = await pub()
        .from('delivery_challans')
        .insert({
          organization_id: orgId,
          contact_id: contactId,
          sales_order_id: salesOrderId || null,
          challan_number: challanNumber,
          challan_date: new Date().toISOString().split('T')[0],
          vehicle_number: vehicle || null,
          driver_name: driver || null,
          status: 'Draft',
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      const rows = valid.map((l) => ({
        delivery_challan_id: challan.id,
        item_id: l.item_id,
        quantity_dispatched: parseFloat(l.quantity_dispatched),
      }));
      const { error: e2 } = await pub().from('delivery_challan_items').insert(rows);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: () => {
      toast.show('Delivery challan created', 'success');
      qc.invalidateQueries({ queryKey: ['delivery-challans', orgId] });
      navigation.goBack();
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  const update = (i: number, p: Partial<Line>) =>
    setLines((prev) => {
      const n = [...prev];
      n[i] = { ...n[i], ...p };
      return n;
    });

  return (
    <Screen scroll padded keyboard>
      <Header title="New Delivery Challan" onBack={() => navigation.goBack()} />
      <Card title="Consignee" style={{ marginBottom: spacing.lg }}>
        <Select
          label="Consignee / Party *"
          options={parties.map((p: any) => ({ label: p.name, value: p.id }))}
          value={contactId}
          onChange={setContactId}
          placeholder="Select party..."
          required
        />
        {orders.length > 0 && (
          <Select
            label="Link Sales Order (optional)"
            options={[{ label: 'None', value: '' }, ...orders.map((o: any) => ({ label: o.order_number, value: o.id }))]}
            value={salesOrderId}
            onChange={setSalesOrderId}
            placeholder="Select order..."
          />
        )}
      </Card>
      <Card title="Vehicle" style={{ marginBottom: spacing.lg }}>
        <Input label="Vehicle Number" value={vehicle} onChangeText={setVehicle} autoCapitalize="characters" placeholder="MH 12 AB 1234" />
        <Input label="Driver Name" value={driver} onChangeText={setDriver} />
      </Card>
      <Card title="Items Dispatched" style={{ marginBottom: spacing.lg }}>
        {lines.map((l, i) => (
          <View key={i}>
            <Select
              label={`Item #${i + 1}`}
              options={items.map((it: any) => ({ label: it.name, value: it.id }))}
              value={l.item_id}
              onChange={(v) => update(i, { item_id: v })}
              placeholder="Select..."
            />
            <Input label="Qty Dispatched" value={l.quantity_dispatched} onChangeText={(v) => update(i, { quantity_dispatched: v })} keyboardType="decimal-pad" />
            {lines.length > 1 && (
              <TouchableOpacity onPress={() => setLines(lines.filter((_, x) => x !== i))}>
                <Text style={{ color: palette.error, marginBottom: spacing.sm }}>− Remove</Text>
              </TouchableOpacity>
            )}
            {i < lines.length - 1 && <Divider style={{ marginVertical: spacing.sm }} />}
          </View>
        ))}
        <Button title="+ Add Item" variant="outline" onPress={() => setLines([...lines, newLine()])} />
      </Card>
      <Button title="Create Challan" onPress={() => save()} loading={isPending} fullWidth size="lg" style={{ marginBottom: spacing['2xl'] }} />
    </Screen>
  );
}

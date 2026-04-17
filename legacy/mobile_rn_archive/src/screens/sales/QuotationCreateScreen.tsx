/**
 * Quotation Create — 1:1 of web /quotations new form (mobile-friendly).
 * Inserts public.quotations + public.quotation_items.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize } from '@/theme';

type LineItem = {
  item_id: string;
  qty: string;
  rate: string;
  unit: string;
  hsn_code: string;
  gst_rate: string;
};

const newLine = (): LineItem => ({
  item_id: '',
  qty: '',
  rate: '',
  unit: 'Kg',
  hsn_code: '',
  gst_rate: '0',
});

export function QuotationCreateScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [buyerId, setBuyerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(
    '1. Quotation valid for 15 days.\n2. 50% advance payment required.\n3. Taxes & shipping extra.',
  );
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  const { data: buyers = [] } = useQuery({
    queryKey: ['quotation-buyers', orgId],
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
    queryKey: ['quotation-items', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('items')
        .select('id, name, default_unit, hsn_code, gst_rate, purchase_price')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      // auto-fill from item master
      if (patch.item_id) {
        const m = items.find((i: any) => i.id === patch.item_id);
        if (m) {
          next[idx].unit = m.default_unit || 'Kg';
          next[idx].hsn_code = m.hsn_code || '';
          next[idx].gst_rate = String(m.gst_rate || 0);
          next[idx].rate = String((m.purchase_price || 0) * 1.15);
        }
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    let sub = 0;
    let tax = 0;
    lines.forEach((li) => {
      const q = parseFloat(li.qty) || 0;
      const r = parseFloat(li.rate) || 0;
      const g = parseFloat(li.gst_rate) || 0;
      const base = q * r;
      sub += base;
      tax += (base * g) / 100;
    });
    return { sub, tax, grand: sub + tax };
  }, [lines]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      if (!buyerId) throw new Error('Select a buyer');
      const valid = lines.filter((li) => li.item_id && parseFloat(li.qty) > 0);
      if (valid.length === 0) throw new Error('Add at least one item line');

      const today = new Date().toISOString().split('T')[0];
      const { data: qn, error } = await pub()
        .from('quotations')
        .insert({
          organization_id: orgId,
          buyer_id: buyerId,
          quotation_date: today,
          valid_until: validUntil || null,
          subtotal: totals.sub,
          gst_total: totals.tax,
          grand_total: totals.grand,
          notes: notes || null,
          terms: terms || null,
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      const rows = valid.map((li) => {
        const q = parseFloat(li.qty);
        const r = parseFloat(li.rate);
        const g = parseFloat(li.gst_rate) || 0;
        return {
          organization_id: orgId,
          quotation_id: qn.id,
          item_id: li.item_id,
          qty: q,
          unit: li.unit,
          rate: r,
          hsn_code: li.hsn_code || null,
          gst_rate: g,
          tax_amount: (q * r * g) / 100,
          amount: q * r,
        };
      });
      const { error: e2 } = await pub().from('quotation_items').insert(rows);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: () => {
      toast.show('Quotation created', 'success');
      qc.invalidateQueries({ queryKey: ['quotations', orgId] });
      navigation.goBack();
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <Screen scroll padded keyboard>
      <Header title="New Quotation" onBack={() => navigation.goBack()} />
      <Card title="Buyer & Validity" style={{ marginBottom: spacing.lg }}>
        <Select
          label="Buyer *"
          options={buyers.map((b: any) => ({ label: b.name, value: b.id }))}
          value={buyerId}
          onChange={setBuyerId}
          placeholder="Select buyer..."
          required
        />
        <Input
          label="Valid Until (YYYY-MM-DD)"
          placeholder="2026-04-30"
          value={validUntil}
          onChangeText={setValidUntil}
        />
      </Card>

      <Card title="Line Items" style={{ marginBottom: spacing.lg }}>
        {lines.map((li, idx) => (
          <View key={idx} style={styles.lineCard}>
            <Select
              label={`Item #${idx + 1}`}
              options={items.map((i: any) => ({ label: i.name, value: i.id }))}
              value={li.item_id}
              onChange={(v) => updateLine(idx, { item_id: v })}
              placeholder="Select item..."
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input label="Qty" value={li.qty} onChangeText={(v) => updateLine(idx, { qty: v })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Rate ₹" value={li.rate} onChangeText={(v) => updateLine(idx, { rate: v })} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="GST %" value={li.gst_rate} onChangeText={(v) => updateLine(idx, { gst_rate: v })} keyboardType="decimal-pad" />
              </View>
            </View>
            {lines.length > 1 && (
              <TouchableOpacity onPress={() => setLines(lines.filter((_, i) => i !== idx))}>
                <Text style={styles.removeBtn}>− Remove line</Text>
              </TouchableOpacity>
            )}
            {idx < lines.length - 1 && <Divider style={{ marginVertical: spacing.sm }} />}
          </View>
        ))}
        <Button title="+ Add Item Line" variant="outline" onPress={() => setLines([...lines, newLine()])} />
      </Card>

      <Card title="Totals" style={{ marginBottom: spacing.lg }}>
        <Row label="Subtotal" value={fmt(totals.sub)} />
        <Row label="GST" value={fmt(totals.tax)} />
        <Divider style={{ marginVertical: spacing.sm }} />
        <Row label="Grand Total" value={fmt(totals.grand)} bold />
      </Card>

      <Card title="Notes & Terms" style={{ marginBottom: spacing.lg }}>
        <Input label="Internal Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
        <Input label="Terms & Conditions" value={terms} onChangeText={setTerms} multiline numberOfLines={4} />
      </Card>

      <Button title="Create Quotation" onPress={() => save()} loading={isPending} fullWidth size="lg" style={{ marginBottom: spacing['2xl'] }} />
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.totalsRow}>
      <Text style={[styles.totalsLabel, bold && { fontWeight: '900', color: palette.gray900 }]}>{label}</Text>
      <Text style={[styles.totalsVal, bold && { fontSize: fontSize.xl, color: palette.success }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lineCard: { paddingBottom: spacing.sm },
  removeBtn: { color: palette.error, fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing.xs },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.xs },
  totalsLabel: { fontSize: fontSize.sm, color: palette.gray600 },
  totalsVal: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
});

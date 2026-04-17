/**
 * Patti New — 1:1 of web /finance/patti/new.
 * Lets user pick unsettled lots for a farmer, sets commission % + expenses,
 * calculates net payout, then creates a journal voucher and marks lots as settled.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi } from '@/api/db';
import { palette, spacing, fontSize, radius } from '@/theme';

export function PattiNewScreen({ route, navigation }: any) {
  const farmerId: string = route.params?.farmerId;
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  const [commissionPct, setCommissionPct] = useState('6');
  const [otherExp, setOtherExp] = useState('0');

  const { data: farmer } = useQuery({
    queryKey: ['patti-farmer', farmerId],
    queryFn: async () => {
      const { data, error } = await mandi().from('contacts').select('*').eq('id', farmerId).single();
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!farmerId,
  });

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['patti-lots', orgId, farmerId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('*, item:commodities(name), sale_items(amount, qty, rate, unit)')
        .eq('organization_id', orgId!)
        .eq('contact_id', farmerId)
        .eq('arrival_type', 'commission')
        .neq('status', 'settled')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId && !!farmerId,
  });

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const grossTotal = useMemo(() => {
    return lots
      .filter((l: any) => selected.includes(l.id))
      .reduce((sum: number, lot: any) => {
        const v = (lot.sale_items ?? []).reduce(
          (s: number, i: any) => s + (Number(i.amount) || 0),
          0,
        );
        return sum + v;
      }, 0);
  }, [lots, selected]);

  const commissionVal = (grossTotal * (parseFloat(commissionPct) || 0)) / 100;
  const netPayable = grossTotal - commissionVal - (parseFloat(otherExp) || 0);

  const { mutate: settle, isPending } = useMutation({
    mutationFn: async () => {
      if (selected.length === 0) throw new Error('Select at least one lot');
      // 1. Journal voucher
      const { error: vErr } = await mandi()
        .from('vouchers')
        .insert({
          organization_id: orgId,
          type: 'journal',
          date: new Date().toISOString().split('T')[0],
          narration: `Farmer Patti for ${farmer?.name} - Lots: ${selected.length} - Net ₹${netPayable.toFixed(2)}`,
        });
      if (vErr) throw new Error(vErr.message);
      // 2. Mark lots settled
      const { error: lErr } = await mandi()
        .from('lots')
        .update({ status: 'settled' })
        .in('id', selected);
      if (lErr) throw new Error(lErr.message);
    },
    onSuccess: () => {
      toast.show('Patti generated. Farmer account updated.', 'success');
      qc.invalidateQueries({ queryKey: ['farmer-settlements', orgId] });
      qc.invalidateQueries({ queryKey: ['patti-lots', orgId, farmerId] });
      qc.invalidateQueries({ queryKey: ['lots', orgId] });
      navigation.goBack();
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <Screen scroll padded keyboard backgroundColor={palette.gray50}>
      <Header title={`Patti — ${farmer?.name ?? '...'}`} onBack={() => navigation.goBack()} />

      <Card title="Unsettled Trading Lots" style={{ marginBottom: spacing.lg }}>
        {isLoading ? (
          <ActivityIndicator color={palette.primary} />
        ) : lots.length === 0 ? (
          <Text style={styles.empty}>No unsettled lots for this farmer.</Text>
        ) : (
          lots.map((lot: any) => {
            const v = (lot.sale_items ?? []).reduce(
              (s: number, i: any) => s + (Number(i.amount) || 0),
              0,
            );
            const isSelected = selected.includes(lot.id);
            return (
              <TouchableOpacity
                key={lot.id}
                onPress={() => toggle(lot.id)}
                style={[styles.lot, isSelected && styles.lotSelected]}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                  {isSelected && <Text style={styles.tick}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lotCode}>{lot.lot_code}</Text>
                  <Text style={styles.lotMeta}>
                    {lot.item?.name} · {new Date(lot.created_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.lotValue}>{fmt(v)}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </Card>

      <Card title="Settlement Calculation" style={{ marginBottom: spacing.lg }}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total Gross Value</Text>
          <Text style={styles.summaryVal}>{fmt(grossTotal)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Commission %"
              value={commissionPct}
              onChangeText={setCommissionPct}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Other Exp (₹)"
              value={otherExp}
              onChangeText={setOtherExp}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <Divider style={{ marginVertical: spacing.md }} />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Commission</Text>
          <Text style={[styles.summaryVal, { color: palette.warning }]}>−{fmt(commissionVal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Other Expenses</Text>
          <Text style={[styles.summaryVal, { color: palette.warning }]}>
            −{fmt(parseFloat(otherExp) || 0)}
          </Text>
        </View>
        <Divider style={{ marginVertical: spacing.md }} />
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { fontSize: fontSize.md, fontWeight: '700' }]}>
            Net Payout
          </Text>
          <Text style={[styles.summaryVal, { fontSize: fontSize['2xl'], color: palette.success }]}>
            {fmt(netPayable)}
          </Text>
        </View>
      </Card>

      <Button
        title={`Final Settle & Generate Patti (${selected.length})`}
        onPress={() => settle()}
        loading={isPending}
        disabled={selected.length === 0}
        fullWidth
        size="lg"
        style={{ marginBottom: spacing['2xl'] }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', color: palette.gray500, padding: spacing.lg },
  lot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.gray200,
    marginBottom: spacing.sm,
  },
  lotSelected: { borderColor: palette.primary, backgroundColor: palette.primaryLight },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: palette.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  tick: { color: palette.white, fontSize: 14, fontWeight: '900' },
  lotCode: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
  lotMeta: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  lotValue: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginVertical: spacing.xs,
  },
  summaryLabel: { fontSize: fontSize.sm, color: palette.gray600 },
  summaryVal: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
});

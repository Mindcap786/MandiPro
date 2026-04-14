/**
 * Lot Detail Screen
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '@/navigation/types';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider } from '@/components/ui';
import { LoadingOverlay } from '@/components/feedback';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<InventoryStackParamList, 'LotDetail'>;

export function LotDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;

  const { data: lot, isLoading } = useQuery({
    queryKey: ['lot', id],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('lots')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const fmt = (n: number | undefined) =>
    n != null ? `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';

  if (isLoading) return <LoadingOverlay message="Loading lot..." />;

  return (
    <Screen scroll padded keyboard={false}>
      <Header title={lot?.lot_code ?? 'Lot Detail'} onBack={() => navigation.goBack()} />

      <Card title="Stock" style={{ marginBottom: spacing.lg }}>
        <Row align="between">
          <Text style={styles.label}>Status</Text>
          <Badge
            label={lot?.status ?? ''}
            variant={lot?.status === 'active' ? 'success' : lot?.status === 'sold' ? 'info' : 'error'}
          />
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Initial Qty</Text>
          <Text style={styles.value}>{lot?.initial_qty} {lot?.unit}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Current Qty</Text>
          <Text style={[styles.value, { color: palette.primary, fontWeight: '700' }]}>
            {lot?.current_qty} {lot?.unit}
          </Text>
        </Row>
        {lot?.variety && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Variety</Text>
              <Text style={styles.value}>{lot.variety}</Text>
            </Row>
          </>
        )}
        {lot?.grade && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Grade</Text>
              <Text style={styles.value}>{lot.grade}</Text>
            </Row>
          </>
        )}
        {lot?.storage_location && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Storage</Text>
              <Text style={styles.value}>{lot.storage_location}</Text>
            </Row>
          </>
        )}
      </Card>

      <Card title="Pricing" style={{ marginBottom: spacing.lg }}>
        <Row align="between">
          <Text style={styles.label}>Supplier Rate</Text>
          <Text style={styles.value}>{fmt(lot?.supplier_rate)}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Sale Price</Text>
          <Text style={[styles.value, { color: palette.success }]}>{fmt(lot?.sale_price)}</Text>
        </Row>
        {lot?.commission_percent != null && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Commission</Text>
              <Text style={styles.value}>{lot.commission_percent}%</Text>
            </Row>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, color: palette.gray500 },
  value: { fontSize: fontSize.md, color: palette.gray900, fontWeight: '500' },
});

/**
 * Purchase / Voucher Detail Screen
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PurchaseStackParamList } from '@/navigation/types';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider } from '@/components/ui';
import { LoadingOverlay } from '@/components/feedback';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'PurchaseDetail'>;

export function PurchaseDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;

  const { data: voucher, isLoading } = useQuery({
    queryKey: ['voucher', id],
    queryFn: async () => {
      const { data, error } = await core()
        .from('vouchers')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const fmt = (n: number) =>
    `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (isLoading) return <LoadingOverlay message="Loading voucher..." />;

  return (
    <Screen scroll padded keyboard={false}>
      <Header title="Payment Details" onBack={() => navigation.goBack()} />

      <Card title="Voucher" style={{ marginBottom: spacing.lg }}>
        <Row align="between">
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{voucher?.date}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Voucher No.</Text>
          <Text style={styles.value}>#{voucher?.voucher_no}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Type</Text>
          <Badge label={voucher?.type ?? ''} variant="warning" />
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Amount</Text>
          <Text style={[styles.value, styles.amount]}>{fmt(voucher?.amount ?? 0)}</Text>
        </Row>
        {voucher?.discount_amount ? (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Discount</Text>
              <Text style={styles.value}>{fmt(voucher.discount_amount)}</Text>
            </Row>
          </>
        ) : null}
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Locked</Text>
          <Badge label={voucher?.is_locked ? 'Yes' : 'No'} variant={voucher?.is_locked ? 'default' : 'success'} />
        </Row>
        {voucher?.narration && (
          <>
            <Divider />
            <Text style={styles.label}>Narration</Text>
            <Text style={[styles.value, { marginTop: 4 }]}>{voucher.narration}</Text>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, color: palette.gray500 },
  value: { fontSize: fontSize.md, color: palette.gray900, fontWeight: '500' },
  amount: { color: palette.error, fontSize: fontSize.xl, fontWeight: '700' },
});

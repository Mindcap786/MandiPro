/**
 * Sale Detail Screen — Full sale view with items, amounts, and status.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider, Button } from '@/components/ui';
import { LoadingOverlay } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<SalesStackParamList, 'SaleDetail'>;

const statusVariant: Record<string, any> = {
  draft: 'default', confirmed: 'info', invoiced: 'success',
};

export function SaleDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('sales')
        .select(`
          *,
          sale_items(*, item:item_id(name)),
          buyer:buyer_id(name, phone)
        `)
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const fmt = (n: number) =>
    `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (isLoading) return <LoadingOverlay message="Loading sale..." />;

  return (
    <Screen scroll padded backgroundColor={palette.gray50}>
      <Header 
        title="Sale Details" 
        onBack={() => navigation.goBack()} 
        right={
          <Button 
            title="Print" 
            variant="outline" 
            size="sm" 
            onPress={() => {
              const url = `https://app.mandipro.com/sales/invoice/${sale.id}`;
              Linking.openURL(url);
            }} 
          />
        }
      />

      <Card style={styles.card}>
        <Row align="between">
          <View>
            <Text style={styles.buyerLabel}>Buyer</Text>
            <Text style={styles.buyerName}>{sale?.buyer?.name || 'Walk-in'}</Text>
            {sale?.buyer?.phone && <Text style={styles.buyerPhone}>{sale.buyer.phone}</Text>}
          </View>
          <Badge label={sale?.status ?? ''} variant={statusVariant[sale?.status ?? 'draft']} />
        </Row>
        
        <Divider style={{ marginVertical: spacing.lg }} />
        
        <Row align="between">
          <View>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{sale?.sale_date}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.label}>Payment</Text>
            <Text style={[styles.value, { textTransform: 'capitalize' }]}>{sale?.payment_mode}</Text>
          </View>
        </Row>
      </Card>

      <Card title="Inventory Items" style={styles.card}>
        {(sale?.sale_items ?? []).length === 0 && (
          <Text style={styles.empty}>No items recorded</Text>
        )}
        {(sale?.sale_items ?? []).map((item: any, idx: number) => (
          <View key={item.id}>
            <Row align="between" style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.item?.name || 'Item'}</Text>
                <Text style={styles.itemRate}>{item.quantity} Qty @ {fmt(item.rate)}</Text>
              </View>
              <Text style={styles.itemTotal}>{fmt(item.total_price)}</Text>
            </Row>
            {idx < (sale?.sale_items?.length || 0) - 1 && <Divider />}
          </View>
        ))}
      </Card>

      <Card title="Amounts" style={styles.card}>
        <Row align="between">
          <Text style={styles.label}>Total Qty</Text>
          <Text style={styles.value}>{sale?.total_qty}</Text>
        </Row>
        <Divider />
        {sale?.discount_amount ? (
          <>
            <Row align="between">
              <Text style={styles.label}>Discount</Text>
              <Text style={[styles.value, { color: palette.error }]}>-{fmt(sale.discount_amount)}</Text>
            </Row>
            <Divider />
          </>
        ) : null}
        <Row align="between">
          <Text style={[styles.label, styles.totalLabel]}>Total Amount</Text>
          <Text style={styles.totalValue}>{fmt(sale?.total_amount ?? 0)}</Text>
        </Row>
        {sale?.gst_amount ? (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>GST</Text>
              <Text style={styles.value}>{fmt(sale.gst_amount)}</Text>
            </Row>
          </>
        ) : null}
      </Card>

      {sale?.notes && (
        <Card title="Notes" style={styles.card}>
          <Text style={styles.notes}>{sale.notes}</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg, borderRadius: radius.xl, ...shadows.sm },
  buyerLabel: { fontSize: 10, color: palette.gray500, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  buyerName: { fontSize: fontSize.lg, fontWeight: '800', color: palette.gray900 },
  buyerPhone: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  label: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '600', marginBottom: 2 },
  value: { fontSize: fontSize.sm, color: palette.gray900, fontWeight: '700' },
  empty: { fontSize: fontSize.sm, color: palette.gray400, textAlign: 'center', padding: spacing.lg },
  itemRow: { paddingVertical: spacing.md },
  itemName: { fontSize: fontSize.md, fontWeight: '700', color: palette.gray900 },
  itemRate: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2, fontWeight: '500' },
  itemTotal: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  totalLabel: { fontWeight: '700', color: palette.gray900, fontSize: fontSize.md },
  totalValue: { fontSize: 24, fontWeight: '900', color: palette.primary },
  notes: { fontSize: fontSize.sm, color: palette.gray700, lineHeight: 20 },
});

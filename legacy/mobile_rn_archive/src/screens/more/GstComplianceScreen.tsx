/**
 * GST Compliance Screen
 * View monthly GST liability based on Sales and Returns.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<MoreStackParamList, 'GstCompliance'>;

export function GstComplianceScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: sales = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['gst-sales', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('sales')
        .select(`
          id, bill_no, sale_date, total_amount, 
          cgst_amount, sgst_amount, igst_amount, gst_total,
          buyer:buyer_id(name, gst_number)
        `)
        .eq('organization_id', orgId!)
        .gt('gst_total', 0)
        .order('sale_date', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  const renderItem = ({ item }: { item: any }) => {
    return (
      <View style={styles.card}>
        <Row align="between" style={{ marginBottom: spacing.xs }}>
          <Text style={styles.date}>{format(new Date(item.sale_date), 'dd MMM yyyy')}</Text>
          <Text style={styles.bill}>Bill #{item.bill_no}</Text>
        </Row>
        <Text style={styles.buyer}>{item.buyer?.name}</Text>
        <Text style={styles.gstNo}>GSTIN: {item.buyer?.gst_number || 'Unregistered'}</Text>

        <View style={styles.taxBox}>
          <Row align="between">
            <Text style={styles.taxLabel}>Taxable Amount</Text>
            <Text style={styles.taxVal}>{fmt(item.total_amount - item.gst_total)}</Text>
          </Row>
          <Row align="between">
            <Text style={styles.taxLabel}>Total GST</Text>
            <Text style={styles.taxVal}>{fmt(item.gst_total)}</Text>
          </Row>
          <View style={styles.divider} />
          <Row align="between">
            <Text style={styles.taxLabel}>Invoice Total</Text>
            <Text style={[styles.taxVal, { color: palette.primary, fontWeight: '900' }]}>
              {fmt(item.total_amount)}
            </Text>
          </Row>
        </View>
      </View>
    );
  };

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="GST Compliance (GSTR-1)" onBack={() => navigation.goBack()} />
      <FlatList
        data={sales}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No GST sales found.</Text> : null
        }
        renderItem={renderItem}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  date: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '600' },
  bill: { fontSize: fontSize.xs, fontWeight: '700', color: palette.primary },
  buyer: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  gstNo: { fontSize: fontSize.xs, color: palette.gray500, fontStyle: 'italic', marginBottom: spacing.sm },
  taxBox: { backgroundColor: palette.gray50, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray100 },
  taxLabel: { fontSize: fontSize.xs, color: palette.gray600 },
  taxVal: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray900 },
  divider: { height: 1, backgroundColor: palette.gray200, marginVertical: spacing.xs },
  empty: { textAlign: 'center', color: palette.gray400, marginTop: spacing.xl, fontStyle: 'italic' }
});

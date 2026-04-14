/**
 * Delivery Challans List — 1:1 of web /delivery-challans.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize } from '@/theme';

export function DeliveryChallansListScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');

  const { data = [], isRefetching, refetch } = useQuery({
    queryKey: ['delivery-challans', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('delivery_challans')
        .select('*, contact:contacts(name, city), sales_order:sales_orders(order_number)')
        .eq('organization_id', orgId!)
        .order('challan_date', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(
    () =>
      data.filter(
        (c: any) =>
          !search ||
          c.challan_number?.toLowerCase().includes(search.toLowerCase()) ||
          c.contact?.name?.toLowerCase().includes(search.toLowerCase()),
      ),
    [data, search],
  );

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <Header
        title="Delivery Challans"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('DeliveryChallanCreate')}>
            <Text style={styles.addBtn}>+ New</Text>
          </TouchableOpacity>
        }
      />
      <View style={{ padding: spacing.lg }}>
        <SearchInput placeholder="Search challan or party..." value={search} onChangeText={setSearch} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={styles.empty}>No challans found.</Text>}
        renderItem={({ item }: any) => (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.challan_number}</Text>
                <Text style={styles.sub}>
                  {item.contact?.name ?? 'Unknown'} · {new Date(item.challan_date).toLocaleDateString('en-IN')}
                </Text>
                {item.sales_order?.order_number && (
                  <Text style={styles.linkedSo}>Linked: {item.sales_order.order_number}</Text>
                )}
              </View>
              <Badge label={item.status?.toUpperCase() || 'DRAFT'} variant="info" />
            </View>
            {item.vehicle_number && (
              <Text style={styles.vehicle}>Vehicle: {item.vehicle_number}</Text>
            )}
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { color: palette.primary, fontWeight: '700', fontSize: fontSize.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900 },
  sub: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  linkedSo: { fontSize: fontSize.xs, color: palette.primary, marginTop: 2 },
  vehicle: { fontSize: fontSize.xs, color: palette.gray500, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100 },
  empty: { textAlign: 'center', color: palette.gray500, padding: spacing['2xl'] },
});

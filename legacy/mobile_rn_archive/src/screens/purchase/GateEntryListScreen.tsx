import React, { useState } from 'react';
import { FlatList, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PurchaseStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'GateEntryList'>;

const PAGE_SIZE = 20;

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
}

export function GateEntryListScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data, fetchNextPage, hasNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['gate-entries', orgId],
    queryFn: async ({ pageParam = 0 }) => {
      const { data, error } = await mandi()
        .from('gate_entries')
        .select(`
          id, token_no, vehicle_number, entry_time, exit_time, status,
          party:party_id(name)
        `)
        .eq('organization_id', orgId!)
        .order('entry_time', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    getNextPageParam: (last, all) =>
      last.length === PAGE_SIZE ? all.flat().length : undefined,
    enabled: !!orgId,
    initialPageParam: 0,
  });

  const items = data?.pages.flat() ?? [];

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header
        title="Gate Entries"
        onBack={() => navigation.goBack()}
        right={
          <Button title="+ New" onPress={() => navigation.navigate('GateEntryCreate')} size="sm" />
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No gate entries"
              message="Record incoming vehicles at the gate"
              actionLabel="New Gate Entry"
              onAction={() => navigation.navigate('GateEntryCreate')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Row align="between">
              <View style={{ flex: 1 }}>
                <Text style={styles.tokenNo}>Token #{item.token_no}</Text>
                <Text style={styles.vehicleNo}>{item.vehicle_number}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge 
                  label={item.status} 
                  variant={item.status === 'in_mandi' ? 'warning' : 'success'} 
                />
              </View>
            </Row>
            <View style={styles.detailsRow}>
              <Text style={styles.partyName}>
                {(item as any).party?.name ? `From: ${(item as any).party?.name}` : 'No party attached'}
              </Text>
              <Text style={styles.time}>{formatDate(item.entry_time)}</Text>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['4xl'], backgroundColor: palette.gray50 },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  tokenNo: { fontSize: fontSize.xs, color: palette.primary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  vehicleNo: { fontSize: fontSize.lg, fontWeight: '800', color: palette.gray900, textTransform: 'uppercase' },
  detailsRow: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: palette.gray100 },
  partyName: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray700 },
  time: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
});

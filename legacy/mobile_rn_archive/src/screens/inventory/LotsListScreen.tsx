/**
 * Lots List Screen — Active inventory with search and status filter.
 */

import React, { useState, useEffect } from 'react';
import { FlatList, TouchableOpacity, Text, View, StyleSheet, RefreshControl } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<InventoryStackParamList, 'LotsList'>;
const PAGE_SIZE = 20;

export function LotsListScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching, refetch } = useInfiniteQuery({
    queryKey: ['lots', orgId, debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => {
      let q = mandi()
        .from('lots')
        .select(`
          id, lot_code, current_qty, unit, status, variety, grade,
          item:item_id(name)
        `)
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (debouncedSearch) {
        q = q.ilike('lot_code', `%${debouncedSearch}%`);
      }

      const { data, error } = await q;
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
        title="Lots"
        right={<Button title="Commodities" onPress={() => navigation.navigate('CommoditiesList')} size="sm" variant="outline" />}
      />
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <SearchInput placeholder="Search lot code..." value={search} onChangeText={setSearch} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['4xl'] }}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl 
            refreshing={isFetching && !isFetchingNextPage} 
            onRefresh={refetch} 
            tintColor={palette.primary} 
          />
        }
        ListEmptyComponent={
          !isLoading ? <EmptyState title="No lots found" message="Lots appear when arrivals are recorded" /> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('LotDetail', { id: item.id })}
            activeOpacity={0.7}
          >
            <Card padded elevated style={styles.card}>
              <Row align="between">
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{(item as any).item?.name || 'Unknown Item'}</Text>
                  <Text style={styles.code}>{item.lot_code}</Text>
                </View>
                <Badge
                  label={item.status}
                  variant={item.status === 'active' ? 'success' : item.status === 'sold' ? 'info' : 'error'}
                />
              </Row>
              <Row align="between" style={{ marginTop: spacing.md }}>
                <Text style={styles.qty}>
                  {item.current_qty} {item.unit}
                </Text>
                {(item.variety || item.grade) && (
                  <Text style={styles.meta}>
                    {[item.variety, item.grade].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </Row>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderLeftColor: palette.primary },
  itemName: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  code: { fontSize: 10, fontWeight: '600', color: palette.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  qty: { fontSize: fontSize.lg, fontWeight: '900', color: palette.primary },
  meta: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '600' },
});

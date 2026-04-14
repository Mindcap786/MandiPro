/**
 * Arrivals List Screen
 */

import React, { useState, useEffect } from 'react';
import { FlatList, TouchableOpacity, Text, View, StyleSheet, RefreshControl } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PurchaseStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'ArrivalsList'>;

const PAGE_SIZE = 20;

export function ArrivalsListScreen({ navigation }: Props) {
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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching, refetch } =
    useInfiniteQuery({
      queryKey: ['arrivals', orgId, debouncedSearch],
      queryFn: async ({ pageParam = 0 }) => {
        const { data, error } = await mandi()
          .from('arrivals')
          .select(`
            id, 
            arrival_date, 
            bill_no, 
            contact_bill_no,
            status, 
            vehicle_number,
            metadata,
            party:party_id(name)
          `)
          .eq('organization_id', orgId!)
          .order('arrival_date', { ascending: false })
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
        title="Arrivals"
        right={<Button title="+ New" onPress={() => navigation.navigate('ArrivalCreate')} size="sm" />}
      />
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <SearchInput placeholder="Search arrivals..." value={search} onChangeText={setSearch} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
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
          !isLoading ? (
            <EmptyState
              title="No arrivals yet"
              message="Record your first arrival"
              actionLabel="New Arrival"
              onAction={() => navigation.navigate('ArrivalCreate')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('ArrivalDetail', { id: item.id })}
            activeOpacity={0.7}
          >
            <Card padded elevated style={styles.card}>
              <Row align="between">
                <View>
                  <Text style={styles.party}>{(Array.isArray(item.party) ? item.party[0] : item.party)?.name || 'Walk-in'}</Text>
                  <Text style={styles.item}>{item.metadata?.item_name || 'Generic Arrival'}</Text>
                  <Text style={styles.date}>{item.arrival_date}</Text>
                </View>
                <Badge
                  label={item.status}
                  variant={item.status === 'completed' ? 'success' : item.status === 'confirmed' ? 'info' : 'default'}
                />
              </Row>
              <View style={styles.footer}>
                {item.bill_no && (
                  <View style={styles.tag}>
                    <Text style={styles.tagText}>#{item.contact_bill_no || item.bill_no}</Text>
                  </View>
                )}
                {item.vehicle_number && (
                   <View style={styles.tag}>
                    <Text style={styles.tagText}>{item.vehicle_number}</Text>
                  </View>
                )}
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftWidth: 4, borderLeftColor: palette.primary },
  date: { fontSize: 10, color: palette.gray500, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  party: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  item: { fontSize: fontSize.sm, fontWeight: '600', color: palette.gray600, marginTop: 1 },
  footer: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  tag: { backgroundColor: palette.gray100, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  tagText: { fontSize: 10, fontWeight: '700', color: palette.gray600 },
});

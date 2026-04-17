/**
 * Commodities List Screen
 */

import React, { useState, useEffect } from 'react';
import { FlatList, TouchableOpacity, Text, StyleSheet, View, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header } from '@/components/layout';
import { Card } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<InventoryStackParamList, 'CommoditiesList'>;

export function CommoditiesListScreen({ navigation }: Props) {
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

  const { data: commodities = [], isFetching, refetch } = useQuery({
    queryKey: ['commodities', orgId, debouncedSearch],
    queryFn: async () => {
      let q = mandi()
        .from('commodities')
        .select('id, name, local_name, default_unit')
        .eq('organization_id', orgId!)
        .order('name');
      
      if (debouncedSearch) {
        q = q.ilike('name', `%${debouncedSearch}%`);
      }

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header title="Commodity Master" onBack={() => navigation.goBack()} />

      <View style={styles.searchBar}>
        <SearchInput
          placeholder="Search items..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={commodities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl 
            refreshing={isFetching} 
            onRefresh={refetch} 
            tintColor={palette.primary} 
          />
        }
        ListEmptyComponent={
          !isFetching ? (
            <EmptyState 
              title="No commodities found" 
              message="Add commodities in settings to track inventory" 
            />
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('CommodityDetail', { id: item.id })}
            activeOpacity={0.7}
          >
            <Card padded elevated style={styles.card}>
              <View style={styles.cardContent}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.local_name && <Text style={styles.local}>{item.local_name}</Text>}
                </View>
                <View style={styles.unitBadge}>
                  <Text style={styles.unitText}>{item.default_unit}</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: { padding: spacing.lg, paddingBottom: spacing.sm, backgroundColor: palette.white },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['4xl'] },
  card: { borderLeftWidth: 4, borderLeftColor: palette.primary },
  cardContent: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  local: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2, fontWeight: '600' },
  unitBadge: { backgroundColor: palette.primary + '15', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  unitText: { fontSize: 10, fontWeight: '800', color: palette.primary, textTransform: 'uppercase' },
});

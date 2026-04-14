/**
 * Contacts Screen — Farmers, buyers, suppliers, transporters.
 * FIXES:
 *  1. Added "+ New Contact" button in header
 *  2. Added contact type filter tabs
 *  3. "Add first contact" CTA on empty state
 *  4. Improved card design with phone call tap
 *  5. Shows inactive contacts with muted style
 */

import React, { useState } from 'react';
import {
  FlatList,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Linking,
  RefreshControl,
} from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Button } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Contacts'>;

const PAGE_SIZE = 30;

const TYPE_TABS = ['all', 'buyer', 'farmer', 'supplier', 'transporter'] as const;
type TypeTab = typeof TYPE_TABS[number];

const typeVariant: Record<string, any> = {
  farmer: 'success',
  buyer: 'info',
  supplier: 'warning',
  transporter: 'default',
  employee: 'default',
};

const typeIcons: Record<string, string> = {
  farmer: '🌾',
  buyer: '🛒',
  supplier: '🏭',
  transporter: '🚛',
  employee: '👔',
};

export function ContactsScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<TypeTab>('all');

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['contacts', orgId, search, activeType],
    queryFn: async ({ pageParam = 0 }) => {
      let q = core()
        .from('contacts')
        .select('id, name, contact_type, phone, is_active, gstin')
        .eq('organization_id', orgId!)
        .order('name')
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (search) q = q.ilike('name', `%${search}%`);
      if (activeType !== 'all') q = q.eq('contact_type', activeType);

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
        title="Contacts"
        onBack={() => navigation.goBack()}
        right={
          // ✅ FIX: Add button was missing
          <Button
            title="+ New"
            onPress={() => navigation.navigate('ContactCreate')}
            size="sm"
          />
        }
      />

      {/* Search */}
      <View style={styles.searchBar}>
        <SearchInput
          placeholder="Search contacts..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ✅ FIX: Type filter tabs were missing */}
      <View style={styles.tabBar}>
        {TYPE_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveType(tab)}
            style={[styles.tab, activeType === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeType === tab && styles.tabTextActive]}>
              {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
              title="No contacts found"
              message={
                activeType !== 'all'
                  ? `No ${activeType}s added yet`
                  : 'Add farmers, buyers and suppliers'
              }
              actionLabel="Add Contact"
              onAction={() => navigation.navigate('ContactCreate')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('ContactDetail', { id: item.id })}
            activeOpacity={0.72}
          >
            <View style={[styles.card, !item.is_active && styles.cardInactive]}>
              <Row align="between">
                <Row gap={spacing.md} style={{ flex: 1 }}>
                  <View style={[styles.avatarBox, { opacity: item.is_active ? 1 : 0.5 }]}>
                    <Text style={styles.avatarIcon}>
                      {typeIcons[item.contact_type] ?? '👤'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.name, !item.is_active && { color: palette.gray400 }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {item.phone ? (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation?.();
                          Linking.openURL(`tel:${item.phone}`);
                        }}
                      >
                        <Text style={styles.phone}>{item.phone}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.noPhone}>No phone</Text>
                    )}
                  </View>
                </Row>
                <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                  <Badge
                    label={item.contact_type}
                    variant={typeVariant[item.contact_type] ?? 'default'}
                  />
                  {!item.is_active && (
                    <Text style={styles.inactiveLabel}>Inactive</Text>
                  )}
                </View>
              </Row>
              {item.gstin && (
                <Text style={styles.gstinText}>GST: {item.gstin}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: palette.white,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: palette.white,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
    flexWrap: 'wrap',
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: palette.gray100,
  },
  tabActive: { backgroundColor: palette.primary },
  tabText: { fontSize: fontSize.sm, fontWeight: '500', color: palette.gray600 },
  tabTextActive: { color: palette.white },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing['4xl'],
    backgroundColor: palette.gray50,
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  cardInactive: {
    opacity: 0.7,
    borderStyle: 'dashed',
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: palette.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIcon: { fontSize: 20 },
  name: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: palette.gray900,
  },
  phone: {
    fontSize: fontSize.sm,
    color: palette.primary,
    marginTop: 2,
    textDecorationLine: 'underline',
  },
  noPhone: {
    fontSize: fontSize.sm,
    color: palette.gray400,
    marginTop: 2,
    fontStyle: 'italic',
  },
  gstinText: {
    fontSize: fontSize.xs,
    color: palette.gray400,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  inactiveLabel: {
    fontSize: fontSize.xs,
    color: palette.gray400,
    fontStyle: 'italic',
  },
});

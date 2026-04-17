/**
 * Sales List Screen — Paginated list of sales with search, status filter, and buyer names.
 * FIXES:
 *  1. Search was set but never passed to query — now uses .ilike()
 *  2. Buyer ID was shown raw — now joins contact name
 *  3. Added status filter tab bar (All | Draft | Confirmed | Invoiced)
 *  4. Premium card design with formatted dates
 */

import React, { useState, useEffect } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Badge, Button, Card } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { EmptyState } from '@/components/feedback';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<SalesStackParamList, 'SalesList'>;

const PAGE_SIZE = 20;

const STATUS_TABS = ['all', 'draft', 'confirmed', 'invoiced'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const statusVariant: Record<string, any> = {
  draft: 'default',
  confirmed: 'info',
  invoiced: 'success',
};

const statusLabel: Record<string, string> = {
  all: 'All',
  draft: 'Draft',
  confirmed: 'Confirmed',
  invoiced: 'Invoiced',
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function SalesListScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [activeStatus, setActiveStatus] = useState<StatusTab>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isFetching, refetch } =
    useInfiniteQuery({
      queryKey: ['sales', orgId, debouncedSearch, activeStatus],
      queryFn: async ({ pageParam = 0 }) => {
        let q = mandi()
          .from('sales')
          .select(
            `id, sale_date, total_amount, total_qty, status, payment_mode, discount_amount,
             buyer:buyer_id(name)`
          )
          .eq('organization_id', orgId!)
          .order('sale_date', { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE - 1);

        // ✅ FIX: search was never applied to query before
        // ✅ FIX: debounced search
        if (debouncedSearch.trim()) {
          q = q.ilike('notes', `%${debouncedSearch}%`);
        }

        // ✅ FIX: status filter
        if (activeStatus !== 'all') {
          q = q.eq('status', activeStatus);
        }

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data ?? [];
      },
      getNextPageParam: (lastPage, allPages) =>
        lastPage.length === PAGE_SIZE ? allPages.flat().length : undefined,
      enabled: !!orgId,
      initialPageParam: 0,
    });

  const items = data?.pages.flat() ?? [];
  const fmt = (n: number) =>
    `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false}>
      <Header
        title="Sales"
        right={
          <Button title="+ New Sale" onPress={() => navigation.navigate('SaleCreate')} size="sm" />
        }
      />

      {/* Search */}
      <View style={styles.searchBar}>
        <SearchInput
          placeholder="Search sales..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Status Filter Tabs */}
      <View style={styles.tabBar}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveStatus(tab)}
            style={[styles.tab, activeStatus === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeStatus === tab && styles.tabTextActive]}>
              {statusLabel[tab]}
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
        refreshControl={<RefreshControl refreshing={isFetching && !isFetchingNextPage} onRefresh={refetch} tintColor={palette.primary} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No sales found"
              message={
                activeStatus !== 'all'
                  ? `No ${activeStatus} sales yet`
                  : 'Create your first sale to get started'
              }
              actionLabel="New Sale"
              onAction={() => navigation.navigate('SaleCreate')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('SaleDetail', { id: item.id })}
            activeOpacity={0.75}
          >
            <View style={styles.card}>
              <Row align="between">
                <View style={styles.cardLeft}>
                  {/* ✅ FIX: Show buyer name, not raw UUID */}
                  <Text style={styles.buyerName}>
                    {(item as any).buyer?.name ?? 'Unknown Buyer'}
                  </Text>
                  <Text style={styles.date}>{formatDate(item.sale_date)}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.amount}>{fmt(item.total_amount ?? 0)}</Text>
                  <Badge label={item.status} variant={statusVariant[item.status]} />
                </View>
              </Row>
              <View style={styles.cardFooter}>
                <Text style={styles.meta}>
                  {item.total_qty ?? 0} units · {item.payment_mode?.charAt(0).toUpperCase()}{item.payment_mode?.slice(1)}
                </Text>
                {item.discount_amount > 0 && (
                  <Text style={styles.discount}>-{fmt(item.discount_amount)} disc.</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          isFetchingNextPage ? (
            <Text style={styles.loadingMore}>Loading more...</Text>
          ) : null
        }
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
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: palette.gray100,
  },
  tabActive: {
    backgroundColor: palette.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: palette.gray600,
  },
  tabTextActive: {
    color: palette.white,
  },
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
    ...shadows.md,
    borderWidth: 1,
    borderColor: palette.gray100,
  },
  cardLeft: { flex: 1, marginRight: spacing.md },
  cardRight: { alignItems: 'flex-end', gap: spacing.xs },
  buyerName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: palette.gray900,
  },
  date: {
    fontSize: fontSize.sm,
    color: palette.gray500,
    marginTop: 2,
  },
  amount: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.primary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  meta: {
    fontSize: fontSize.sm,
    color: palette.gray500,
  },
  discount: {
    fontSize: fontSize.sm,
    color: palette.error,
    fontWeight: '500',
  },
  loadingMore: {
    textAlign: 'center',
    color: palette.gray400,
    padding: spacing.lg,
  },
});

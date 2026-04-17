/**
 * Quotations List — 1:1 of web /quotations.
 * Lists public.quotations with status filter, search, status transitions, delete.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Button, Badge } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize, radius } from '@/theme';

const STATUSES = ['all', 'draft', 'sent', 'accepted', 'rejected', 'expired'] as const;
const STATUS_VARIANT: Record<string, any> = {
  draft: 'default',
  sent: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
};

export function QuotationsListScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data = [], isRefetching, refetch } = useQuery({
    queryKey: ['quotations', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('quotations')
        .select('*, buyer:contacts!buyer_id(id, name), items:quotation_items(id)')
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(
    () =>
      data.filter((q: any) => {
        const matchSearch =
          !search ||
          String(q.quotation_no).includes(search) ||
          q.buyer?.name?.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || q.status === statusFilter;
        return matchSearch && matchStatus;
      }),
    [data, search, statusFilter],
  );

  const { mutate: changeStatus } = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await pub()
        .from('quotations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', orgId] });
      toast.show('Status updated', 'success');
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  const { mutate: del } = useMutation({
    mutationFn: async (id: string) => {
      const { error: e1 } = await pub().from('quotation_items').delete().eq('quotation_id', id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await pub().from('quotations').delete().eq('id', id);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', orgId] });
      toast.show('Deleted', 'success');
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  });

  const fmt = (n: number) => `₹${(n || 0).toLocaleString('en-IN')}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <Header
        title="Quotations"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('QuotationCreate')}>
            <Text style={styles.addBtn}>+ New</Text>
          </TouchableOpacity>
        }
      />
      <View style={{ padding: spacing.lg }}>
        <SearchInput placeholder="Search Quote # or Buyer..." value={search} onChangeText={setSearch} />
        <View style={styles.tabs}>
          {STATUSES.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setStatusFilter(s)}
              style={[styles.tab, statusFilter === s && styles.tabActive]}
            >
              <Text style={[styles.tabText, statusFilter === s && styles.tabTextActive]}>
                {s.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={styles.empty}>No quotations found.</Text>}
        renderItem={({ item }: any) => (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.qno}>QTN-{item.quotation_no}</Text>
                <Text style={styles.buyer}>{item.buyer?.name ?? 'Unknown buyer'}</Text>
              </View>
              <Badge label={(item.status || 'draft').toUpperCase()} variant={STATUS_VARIANT[item.status] || 'default'} />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {new Date(item.quotation_date).toLocaleDateString('en-IN')} ·{' '}
                {item.items?.length || 0} items
              </Text>
              <Text style={styles.amount}>{fmt(item.grand_total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              {item.status === 'draft' && (
                <Button
                  title="Mark Sent"
                  variant="outline"
                  size="sm"
                  onPress={() => changeStatus({ id: item.id, status: 'sent' })}
                  style={{ flex: 1 }}
                />
              )}
              {item.status === 'sent' && (
                <>
                  <Button
                    title="Accept"
                    variant="outline"
                    size="sm"
                    onPress={() => changeStatus({ id: item.id, status: 'accepted' })}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Reject"
                    variant="outline"
                    size="sm"
                    onPress={() => changeStatus({ id: item.id, status: 'rejected' })}
                    style={{ flex: 1 }}
                  />
                </>
              )}
              {(item.status === 'draft' || item.status === 'rejected' || item.status === 'expired') && (
                <Button
                  title="Delete"
                  variant="outline"
                  size="sm"
                  onPress={() =>
                    Alert.alert('Delete?', 'This cannot be undone.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => del(item.id) },
                    ])
                  }
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { color: palette.primary, fontWeight: '700', fontSize: fontSize.md },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.md },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.gray200,
  },
  tabActive: { backgroundColor: palette.gray900, borderColor: palette.gray900 },
  tabText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray600 },
  tabTextActive: { color: palette.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qno: { fontSize: fontSize.lg, fontWeight: '900', color: palette.gray900 },
  buyer: { fontSize: fontSize.sm, color: palette.gray600, marginTop: 2 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
  },
  meta: { fontSize: fontSize.xs, color: palette.gray500 },
  amount: { fontSize: fontSize.lg, fontWeight: '900', color: palette.gray900 },
  empty: { textAlign: 'center', color: palette.gray500, padding: spacing['2xl'] },
});

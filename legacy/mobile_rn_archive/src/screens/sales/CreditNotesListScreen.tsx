/**
 * Credit/Debit Notes List — 1:1 of web /credit-notes.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen, Header } from '@/components/layout';
import { Card, Badge } from '@/components/ui';
import { SearchInput } from '@/components/forms';
import { useAuthStore } from '@/stores/auth-store';
import { pub } from '@/api/db';
import { palette, spacing, fontSize, radius } from '@/theme';

const TYPES = ['all', 'credit', 'debit'];

export function CreditNotesListScreen({ navigation }: any) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { data = [], isRefetching, refetch } = useQuery({
    queryKey: ['credit-notes', orgId],
    queryFn: async () => {
      const { data, error } = await pub()
        .from('credit_debit_notes')
        .select('*, contact:contacts(id, name)')
        .eq('organization_id', orgId!)
        .order('note_date', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const filtered = useMemo(
    () =>
      data.filter((n: any) => {
        const matchSearch =
          !search ||
          n.note_number?.toLowerCase().includes(search.toLowerCase()) ||
          n.contact?.name?.toLowerCase().includes(search.toLowerCase());
        const matchType =
          typeFilter === 'all' ||
          (typeFilter === 'credit' && n.note_type === 'Credit Note') ||
          (typeFilter === 'debit' && n.note_type === 'Debit Note');
        return matchSearch && matchType;
      }),
    [data, search, typeFilter],
  );

  const cTotal = data
    .filter((n: any) => n.note_type === 'Credit Note')
    .reduce((s: number, n: any) => s + Number(n.amount || 0), 0);
  const dTotal = data
    .filter((n: any) => n.note_type === 'Debit Note')
    .reduce((s: number, n: any) => s + Number(n.amount || 0), 0);

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  return (
    <Screen scroll={false} padded={false} keyboard={false} backgroundColor={palette.gray50}>
      <Header
        title="Credit / Debit Notes"
        onBack={() => navigation.goBack()}
        right={
          <TouchableOpacity onPress={() => navigation.navigate('CreditNoteCreate')}>
            <Text style={styles.addBtn}>+ New</Text>
          </TouchableOpacity>
        }
      />
      <View style={{ padding: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
          <Card style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>CREDIT NOTES</Text>
            <Text style={[styles.kpiValue, { color: palette.success }]}>{fmt(cTotal)}</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text style={styles.kpiLabel}>DEBIT NOTES</Text>
            <Text style={[styles.kpiValue, { color: palette.warning }]}>{fmt(dTotal)}</Text>
          </Card>
        </View>
        <SearchInput placeholder="Search note # or party..." value={search} onChangeText={setSearch} />
        <View style={styles.tabs}>
          {TYPES.map((t) => (
            <TouchableOpacity key={t} onPress={() => setTypeFilter(t)} style={[styles.tab, typeFilter === t && styles.tabActive]}>
              <Text style={[styles.tabText, typeFilter === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: spacing['4xl'] }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={styles.empty}>No notes found.</Text>}
        renderItem={({ item }: any) => (
          <Card style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.note_number}</Text>
                <Text style={styles.sub}>
                  {item.contact?.name ?? 'Unknown'} · {new Date(item.note_date).toLocaleDateString('en-IN')}
                </Text>
                {item.reason && <Text style={styles.reason}>Reason: {item.reason}</Text>}
              </View>
              <Badge label={item.note_type === 'Credit Note' ? 'CREDIT' : 'DEBIT'} variant={item.note_type === 'Credit Note' ? 'success' : 'warning'} />
            </View>
            <Text style={styles.amount}>{fmt(item.amount || 0)}</Text>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: { color: palette.primary, fontWeight: '700', fontSize: fontSize.md },
  kpiLabel: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700' },
  kpiValue: { fontSize: fontSize.xl, fontWeight: '900', marginTop: spacing.xs },
  tabs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.gray200 },
  tabActive: { backgroundColor: palette.gray900, borderColor: palette.gray900 },
  tabText: { fontSize: fontSize.xs, fontWeight: '700', color: palette.gray600 },
  tabTextActive: { color: palette.white },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900 },
  sub: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  reason: { fontSize: fontSize.xs, color: palette.gray600, marginTop: 4 },
  amount: { fontSize: fontSize.lg, fontWeight: '900', color: palette.gray900, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100, textAlign: 'right' },
  empty: { textAlign: 'center', color: palette.gray500, padding: spacing['2xl'] },
});

/**
 * Banks Master Data Screen
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Banks'>;

export function BanksScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: banks = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['banks', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('accounts')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('type', 'bank');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Row align="between" style={{ marginBottom: spacing.xs }}>
        <Text style={styles.name}>{item.name}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.is_active ? 'ACTIVE' : 'INACTIVE'}</Text>
        </View>
      </Row>
      <Text style={styles.code}>Code: {item.code || 'N/A'}</Text>
      <Text style={styles.balance}>Current Balance: ₹{item.current_balance || 0}</Text>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Banks" onBack={() => navigation.goBack()} />
      <FlatList
        data={banks}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No bank accounts listed.</Text> : null
        }
        renderItem={renderItem}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  name: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  code: { fontSize: fontSize.xs, color: palette.gray500, marginBottom: spacing.sm },
  balance: { fontSize: fontSize.sm, fontWeight: '700', color: palette.primary },
  badge: { backgroundColor: palette.successLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900', color: palette.successDark },
  empty: { textAlign: 'center', color: palette.gray400, marginTop: spacing.xl, fontStyle: 'italic' }
});

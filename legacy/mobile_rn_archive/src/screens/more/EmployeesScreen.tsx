/**
 * Employees Screen
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

type Props = NativeStackScreenProps<MoreStackParamList, 'Employees'>;

export function EmployeesScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: employees = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['employees', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('contacts')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('contact_type', 'employee')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Row align="between">
        <Text style={styles.name}>{item.name}</Text>
        <View style={[styles.badge, { backgroundColor: item.is_active ? palette.successLight : palette.gray200 }]}>
          <Text style={[styles.badgeText, { color: item.is_active ? palette.success : palette.gray500 }]}>
            {item.is_active ? 'ACTIVE' : 'INACTIVE'}
          </Text>
        </View>
      </Row>
      <Text style={styles.phone}>{item.phone || 'No phone'}</Text>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Employees" onBack={() => navigation.goBack()} />
      <FlatList
        data={employees}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No employees recorded.</Text> : null
        }
        renderItem={renderItem}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  name: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  phone: { fontSize: fontSize.xs, color: palette.gray500, marginTop: spacing.xs },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  empty: { textAlign: 'center', color: palette.gray400, marginTop: spacing.xl, fontStyle: 'italic' }
});

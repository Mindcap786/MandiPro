/**
 * Team Access Screen
 */
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'TeamAccess'>;

export function TeamAccessScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: team = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['team-members', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('team_members')
        .select(`
          id, role, status, joined_at,
          user:user_id(full_name, email)
        `)
        .eq('organization_id', orgId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <Row align="between">
        <View>
          <Text style={styles.name}>{item.user?.full_name || 'Pending User'}</Text>
          <Text style={styles.email}>{item.user?.email || 'No Email provided'}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: item.status === 'active' ? palette.successLight : palette.gray200 }]}>
          <Text style={[styles.badgeText, { color: item.status === 'active' ? palette.success : palette.gray500 }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </Row>
      <View style={styles.roleBox}>
        <Text style={styles.role}>Role: {item.role}</Text>
      </View>
    </View>
  );

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Team Access" onBack={() => navigation.goBack()} />
      <FlatList
        data={team}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No team members found.</Text> : null
        }
        renderItem={renderItem}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  name: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  email: { fontSize: fontSize.xs, color: palette.gray500, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  roleBox: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: palette.gray100 },
  role: { fontSize: fontSize.xs, fontWeight: '700', color: palette.primary, textTransform: 'uppercase' },
  empty: { textAlign: 'center', color: palette.gray400, marginTop: spacing.xl, fontStyle: 'italic' }
});

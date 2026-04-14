/**
 * Commodity Detail Screen
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { InventoryStackParamList } from '@/navigation/types';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Divider } from '@/components/ui';
import { LoadingOverlay } from '@/components/feedback';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<InventoryStackParamList, 'CommodityDetail'>;

export function CommodityDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;

  const { data: commodity, isLoading } = useQuery({
    queryKey: ['commodity', id],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('commodities')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (isLoading) return <LoadingOverlay message="Loading commodity..." />;

  return (
    <Screen scroll padded keyboard={false}>
      <Header title={commodity?.name ?? 'Commodity'} onBack={() => navigation.goBack()} />

      <Card title="Details" style={{ marginBottom: spacing.lg }}>
        <Row align="between">
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{commodity?.name}</Text>
        </Row>
        {commodity?.local_name && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Local Name</Text>
              <Text style={styles.value}>{commodity.local_name}</Text>
            </Row>
          </>
        )}
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Default Unit</Text>
          <Text style={styles.value}>{commodity?.default_unit}</Text>
        </Row>
        {commodity?.shelf_life_days != null && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Shelf Life</Text>
              <Text style={styles.value}>{commodity.shelf_life_days} days</Text>
            </Row>
          </>
        )}
        {commodity?.critical_age_days != null && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Critical Age</Text>
              <Text style={styles.value}>{commodity.critical_age_days} days</Text>
            </Row>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, color: palette.gray500 },
  value: { fontSize: fontSize.md, color: palette.gray900, fontWeight: '500' },
});

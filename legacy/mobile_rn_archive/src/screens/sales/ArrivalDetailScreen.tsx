/**
 * Arrival Detail Screen
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SalesStackParamList } from '@/navigation/types';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider } from '@/components/ui';
import { LoadingOverlay } from '@/components/feedback';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<SalesStackParamList, 'ArrivalDetail'>;

export function ArrivalDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;

  const { data: arrival, isLoading } = useQuery({
    queryKey: ['arrival', id],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('arrivals')
        .select(`
          *,
          party:party_id(name, city, phone),
          metadata
        `)
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (isLoading) return <LoadingOverlay message="Loading arrival..." />;

  return (
    <Screen scroll padded keyboard={false}>
      <Header title="Arrival Details" onBack={() => navigation.goBack()} />

      <Card title="Details" style={{ marginBottom: spacing.lg }}>
        <Row align="between">
          <Text style={styles.label}>Arrival Date</Text>
          <Text style={styles.value}>{arrival?.arrival_date}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Farmer / Party</Text>
          <Text style={styles.value}>{(Array.isArray(arrival?.party) ? arrival?.party[0] : arrival?.party)?.name || 'Walk-in'}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Item</Text>
          <Text style={styles.value}>{arrival?.metadata?.item_name || 'N/A'}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Type</Text>
          <Text style={[styles.value, { textTransform: 'capitalize' }]}>{arrival?.arrival_type}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Status</Text>
          <Badge
            label={arrival?.status ?? ''}
            variant={arrival?.status === 'completed' ? 'success' : 'info'}
          />
        </Row>
        {arrival?.bill_no && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Bill No.</Text>
              <Text style={styles.value}>#{arrival.bill_no}</Text>
            </Row>
          </>
        )}
        {arrival?.vehicle_number && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Vehicle</Text>
              <Text style={styles.value}>{arrival.vehicle_number}</Text>
            </Row>
          </>
        )}
        {arrival?.metadata?.qty && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Quantity</Text>
              <Text style={styles.value}>{arrival.metadata.qty} {arrival.metadata.unit || ''}</Text>
            </Row>
          </>
        )}
        {arrival?.reference_no && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Reference</Text>
              <Text style={styles.value}>{arrival.reference_no}</Text>
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

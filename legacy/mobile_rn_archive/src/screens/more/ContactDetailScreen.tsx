import React from 'react';
import { Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Badge, Divider } from '@/components/ui';
import { LoadingOverlay } from '@/components/feedback';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'ContactDetail'>;

export function ContactDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', id],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  if (isLoading) return <LoadingOverlay message="Loading contact..." />;

  return (
    <Screen scroll padded keyboard={false}>
      <Header title={contact?.name ?? 'Contact'} onBack={() => navigation.goBack()} />

      <Card title="Contact Details" style={{ marginBottom: spacing.lg }}>
        <Row align="between">
          <Text style={styles.label}>Type</Text>
          <Badge label={contact?.contact_type ?? ''} variant="info" />
        </Row>
        {contact?.phone && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Phone</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${contact.phone}`)}>
                <Text style={[styles.value, { color: palette.primary }]}>{contact.phone}</Text>
              </TouchableOpacity>
            </Row>
          </>
        )}
        {contact?.email && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{contact.email}</Text>
            </Row>
          </>
        )}
        {contact?.mandi_license_no && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>License No.</Text>
              <Text style={styles.value}>{contact.mandi_license_no}</Text>
            </Row>
          </>
        )}
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Active</Text>
          <Badge label={contact?.is_active ? 'Active' : 'Inactive'} variant={contact?.is_active ? 'success' : 'default'} />
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: fontSize.sm, color: palette.gray500 },
  value: { fontSize: fontSize.md, color: palette.gray900, fontWeight: '500' },
});

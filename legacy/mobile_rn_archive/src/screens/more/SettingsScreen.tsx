/**
 * Settings Screen — Org details, theme, support info.
 */

import React from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Divider, Badge } from '@/components/ui';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'SettingsGeneral'>;

export function SettingsScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const org = profile?.organization;

  return (
    <Screen scroll padded keyboard={false}>
      <Header title="Settings" onBack={() => navigation.goBack()} />

      {/* Organization */}
      <Card title="Organization" style={styles.card}>
        <Row align="between">
          <Text style={styles.label}>Name</Text>
          <Text style={styles.value}>{org?.name}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Subscription</Text>
          <Badge
            label={org?.subscription_tier ?? ''}
            variant={org?.status === 'active' ? 'success' : 'warning'}
          />
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Status</Text>
          <Badge
            label={org?.status ?? ''}
            variant={org?.status === 'active' ? 'success' : org?.status === 'trial' ? 'info' : 'error'}
          />
        </Row>
        {org?.gstin && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>GSTIN</Text>
              <Text style={styles.value}>{org.gstin}</Text>
            </Row>
          </>
        )}
        {org?.phone && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Phone</Text>
              <Text style={styles.value}>{org.phone}</Text>
            </Row>
          </>
        )}
        {org?.currency_code && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Currency</Text>
              <Text style={styles.value}>{org.currency_code}</Text>
            </Row>
          </>
        )}
        {org?.timezone && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Timezone</Text>
              <Text style={styles.value}>{org.timezone}</Text>
            </Row>
          </>
        )}
      </Card>

      {/* Enabled Modules */}
      {(org?.enabled_modules?.length ?? 0) > 0 && (
        <Card title="Enabled Modules" style={styles.card}>
          <View style={styles.moduleList}>
            {org!.enabled_modules!.map((mod) => (
              <Badge key={mod} label={mod} variant="info" style={{ marginRight: spacing.xs, marginBottom: spacing.xs }} />
            ))}
          </View>
        </Card>
      )}

      {/* Market Settings */}
      <Card title="Market Configuration" style={styles.card}>
        <Row align="between">
          <Text style={styles.label}>Market Fee</Text>
          <Text style={styles.value}>{org?.market_fee_percent ?? 0}%</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Commission</Text>
          <Text style={styles.value}>{org?.nirashrit_percent ?? 0}%</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Misc Fee</Text>
          <Text style={styles.value}>{org?.misc_fee_percent ?? 0}%</Text>
        </Row>
      </Card>

      {/* Support */}
      <Card title="Support" style={styles.card}>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:support@mandipro.app')}>
          <Row align="between">
            <Text style={styles.label}>Email Support</Text>
            <Text style={[styles.value, { color: palette.primary }]}>support@mandipro.app</Text>
          </Row>
        </TouchableOpacity>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, color: palette.gray500 },
  value: { fontSize: fontSize.md, color: palette.gray900, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  moduleList: { flexDirection: 'row', flexWrap: 'wrap' },
});

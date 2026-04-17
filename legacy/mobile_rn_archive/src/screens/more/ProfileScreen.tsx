/**
 * Profile Screen — User profile details.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Divider, Badge, Avatar, Button } from '@/components/ui';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const { profile, signOut } = useAuthStore();

  return (
    <Screen scroll padded keyboard={false}>
      <Header title="Profile" onBack={() => navigation.goBack()} />

      {/* Avatar + Name */}
      <View style={styles.avatarSection}>
        <Avatar name={profile?.full_name ?? undefined} size="lg" />
        <Text style={styles.name}>{profile?.full_name ?? 'User'}</Text>
        <Text style={styles.email}>{profile?.email}</Text>
        {profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
      </View>

      <Card title="Account" style={styles.card}>
        <Row align="between">
          <Text style={styles.label}>Role</Text>
          <Badge label={profile?.role ?? ''} variant="info" />
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Domain</Text>
          <Text style={styles.value}>{profile?.business_domain}</Text>
        </Row>
        <Divider />
        <Row align="between">
          <Text style={styles.label}>Organization</Text>
          <Text style={styles.value} numberOfLines={1}>{profile?.organization?.name}</Text>
        </Row>
        {profile?.admin_status && (
          <>
            <Divider />
            <Row align="between">
              <Text style={styles.label}>Admin Status</Text>
              <Badge
                label={profile.admin_status}
                variant={profile.admin_status === 'active' ? 'success' : 'error'}
              />
            </Row>
          </>
        )}
      </Card>

      <Button
        title="Sign Out"
        onPress={signOut}
        variant="destructive"
        fullWidth
        size="lg"
        style={{ marginBottom: spacing['2xl'] }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatarSection: { alignItems: 'center', paddingVertical: spacing['2xl'] },
  name: { fontSize: fontSize.xl, fontWeight: '700', color: palette.gray900, marginTop: spacing.md },
  email: { fontSize: fontSize.sm, color: palette.gray500, marginTop: spacing.xs },
  username: { fontSize: fontSize.sm, color: palette.primary, marginTop: 2 },
  card: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, color: palette.gray500 },
  value: { fontSize: fontSize.md, color: palette.gray900, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
});

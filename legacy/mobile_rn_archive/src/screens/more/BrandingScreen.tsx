/**
 * Branding Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'Branding'>;

export function BrandingScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: org, isLoading } = useQuery({
    queryKey: ['org-branding', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('organizations')
        .select('*')
        .eq('id', orgId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Branding" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Business Branding</Text>
          
          <View style={styles.logoContainer}>
            {org?.logo_url ? (
              <Image source={{ uri: org.logo_url }} style={styles.logo} resizeMode="contain" />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}>
                <Text style={styles.logoText}>{org?.name?.charAt(0) || 'M'}</Text>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Organization Name</Text>
            <Text style={styles.value}>{org?.name}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Theme Color</Text>
            <View style={styles.colorRow}>
              <View style={[styles.colorCircle, { backgroundColor: org?.theme_color || palette.primary }]} />
              <Text style={styles.value}>{org?.theme_color || 'Default (Blue)'}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.note}>Note: To update your logo or theme color, please use the MandiPro Web Portal.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.primary, marginBottom: spacing.lg },
  logoContainer: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 100, height: 100, borderRadius: radius.md },
  logoPlaceholder: { backgroundColor: palette.gray100, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.gray200, borderStyle: 'dashed' },
  logoText: { fontSize: 40, fontWeight: '900', color: palette.gray400 },
  field: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: fontSize.sm, color: palette.gray900, fontWeight: '600' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colorCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: palette.gray200 },
  note: { marginTop: spacing.lg, textAlign: 'center', color: palette.gray500, fontSize: fontSize.xs, fontStyle: 'italic', paddingHorizontal: spacing.lg }
});

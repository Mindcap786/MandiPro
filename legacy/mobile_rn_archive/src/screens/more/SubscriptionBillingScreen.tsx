/**
 * Subscription & Billing Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Badge } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';
import { format } from 'date-fns';

type Props = NativeStackScreenProps<MoreStackParamList, 'SubscriptionBilling'>;

export function SubscriptionBillingScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['org-subscription', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('organizations')
        .select(`
          status,
          trial_ends_at,
          subscription_plan
        `)
        .eq('id', orgId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const getStatusVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'success';
      case 'trial': return 'warning';
      case 'expired': return 'error';
      default: return 'default';
    }
  };

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Subscription & Billing" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current Plan</Text>
          
          <Row align="between" style={styles.planHeader}>
            <Text style={styles.planName}>{subscription?.subscription_plan || 'Free Trial'}</Text>
            <Badge 
              label={subscription?.status?.toUpperCase() || 'UNKNOWN'} 
              variant={getStatusVariant(subscription?.status)} 
            />
          </Row>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{subscription?.status || 'N/A'}</Text>
          </View>

          {subscription?.trial_ends_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Trial Ends On</Text>
              <Text style={styles.infoValue}>
                {format(new Date(subscription.trial_ends_at), 'dd MMM yyyy')}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={styles.sectionTitle}>Usage Limits</Text>
          <Text style={styles.subText}>Your current plan supports unlimited transactions during the beta period.</Text>
        </View>

        <Text style={styles.note}>Note: To upgrade your plan or view invoices, please visit the MandiPro Web Portal.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.primary, marginBottom: spacing.md },
  planHeader: { marginBottom: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.gray100 },
  planName: { fontSize: fontSize.xl, fontWeight: '900', color: palette.gray900 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  infoLabel: { fontSize: fontSize.sm, color: palette.gray500, fontWeight: '600' },
  infoValue: { fontSize: fontSize.sm, color: palette.gray900, fontWeight: '700' },
  subText: { fontSize: fontSize.sm, color: palette.gray600, lineHeight: 20 },
  note: { marginTop: spacing.lg, textAlign: 'center', color: palette.gray500, fontSize: fontSize.xs, fontStyle: 'italic', paddingHorizontal: spacing.lg }
});

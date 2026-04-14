import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FinanceStackParamList } from '@/navigation/types';
import { Screen, Header } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<FinanceStackParamList, 'FinanceHub'>;

const FINANCE_OPTIONS = [
  {
    id: 'daybook',
    title: 'Day Book',
    subtitle: 'Daily transaction summary',
    icon: '📖',
    screen: 'DayBook',
    color: '#EEF2FF',
    iconColor: '#4F46E5',
  },
  {
    id: 'ledger',
    title: 'Party Ledger',
    subtitle: 'Individual account statements',
    icon: '👤',
    screen: 'Ledger',
    color: '#ECFDF5',
    iconColor: '#059669',
  },
  {
    id: 'receipts',
    title: 'Receipts',
    subtitle: 'Inward cash/bank',
    icon: '📥',
    screen: 'Receipts',
    color: '#F0F9FF',
    iconColor: '#0284C7',
  },
  {
    id: 'payments',
    title: 'Payments',
    subtitle: 'Outward cash/bank',
    icon: '📤',
    screen: 'Payments',
    color: '#FEF2F2',
    iconColor: '#DC2626',
  },
  {
    id: 'cheques',
    title: 'Cheque Mgmt',
    subtitle: 'Clearance & Tracking',
    icon: '💳',
    screen: 'ChequeMgmt',
    color: '#FFF7ED',
    iconColor: '#EA580C',
  },
  {
    id: 'gst',
    title: 'GST / Taxes',
    subtitle: 'Compliance & Reports',
    icon: '🛡️',
    screen: 'GstCompliance',
    color: '#F5F3FF',
    iconColor: '#7C3AED',
  },
];

export function FinanceHubScreen({ navigation }: Props) {
  return (
    <Screen scroll={false} padded={false} backgroundColor={palette.gray50}>
      <Header title="Finance Hub" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Financial Control</Text>
        <View style={styles.grid}>
          {FINANCE_OPTIONS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.actionCard}
              activeOpacity={0.7}
              onPress={() => navigation.navigate(item.screen as any)}
            >
              <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                <Text style={[styles.icon, { color: item.iconColor }]}>{item.icon}</Text>
              </View>
              <Text style={styles.actionTitle}>{item.title}</Text>
              <Text style={styles.actionSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Global Summary Card Placeholder */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Cash in Hand</Text>
            <Text style={styles.summaryValue}>₹--,---</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Bank Balance</Text>
            <Text style={styles.summaryValue}>₹--,---</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '900', color: palette.gray900, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  actionCard: { width: '47.5%', backgroundColor: palette.white, padding: spacing.lg, borderRadius: radius.xl, ...shadows.sm, borderWidth: 1, borderColor: palette.gray100 },
  iconBox: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  icon: { fontSize: 20 },
  actionTitle: { fontSize: fontSize.sm, fontWeight: '800', color: palette.gray900 },
  actionSubtitle: { fontSize: 10, color: palette.gray500, marginTop: 2, fontWeight: '600' },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: radius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.md,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  summaryValue: { color: palette.white, fontSize: fontSize.lg, fontWeight: '900', marginTop: 4 },
  divider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: spacing.lg },
});

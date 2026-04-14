import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PurchaseStackParamList } from '@/navigation/types';
import { Screen, Header } from '@/components/layout';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'PurchaseHub'>;

const PURCHASE_OPTIONS = [
  {
    id: 'gate',
    title: 'Gate Entry',
    subtitle: 'Tokens & Inbound',
    icon: '🔨',
    screen: 'GateEntryList',
    color: '#F0F9FF',
    iconColor: '#0284C7',
  },
  {
    id: 'arrivals',
    title: 'Arrivals',
    subtitle: 'Stock Inventory',
    icon: '🚛',
    screen: 'ArrivalsList',
    color: '#F5F3FF',
    iconColor: '#7C3AED',
  },
  {
    id: 'bills',
    title: 'Purchase Bills',
    subtitle: 'Supplier Invoices',
    icon: '🧾',
    screen: 'PurchaseList',
    color: '#FFF7ED',
    iconColor: '#EA580C',
  },
  {
    id: 'payments',
    title: 'Supp. Payments',
    subtitle: 'Cash & Bank Out',
    icon: '💸',
    screen: 'SupplierPayments',
    color: '#ECFDF5',
    iconColor: '#059669',
  },
];

export function PurchaseHubScreen({ navigation }: Props) {
  return (
    <Screen scroll={false} padded={false} backgroundColor={palette.gray50}>
      <Header title="Purchase Hub" />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Operations</Text>
        <View style={styles.grid}>
          {PURCHASE_OPTIONS.map((item) => (
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

        <TouchableOpacity 
          style={styles.dayBookBanner}
          onPress={() => navigation.navigate('DayBook' as any)}
        >
          <View style={styles.bannerContent}>
            <Text style={styles.bannerIcon}>📖</Text>
            <View>
              <Text style={styles.bannerTitle}>Review Day Book</Text>
              <Text style={styles.bannerSubtitle}>Summary of all today's purchases</Text>
            </View>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
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
  dayBookBanner: {
    backgroundColor: palette.white,
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.sm,
    borderWidth: 1,
    borderColor: palette.gray100,
    marginTop: spacing.md,
  },
  bannerContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  bannerIcon: { fontSize: 24 },
  bannerTitle: { fontSize: fontSize.md, fontWeight: '800', color: palette.gray900 },
  bannerSubtitle: { fontSize: 10, color: palette.gray500, fontWeight: '600' },
  chevron: { fontSize: 24, color: palette.gray300, fontWeight: '300' },
});

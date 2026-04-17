/**
 * More Menu Screen — Perfect 1:1 Map of Web Application Sidebar
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { Screen, Header, Row } from '@/components/layout';
import { Avatar, Badge } from '@/components/ui';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreMenu'>;

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  icon: string;
  label: string;
  screen: keyof MoreStackParamList;
  params?: any;
  accent?: string;
}

const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Finance & Reports',
    items: [
      {
        icon: '💵',
        label: 'Payments & Receipts',
        screen: 'Receipts',
        accent: palette.success,
      },
      {
        icon: '📈',
        label: 'Trading P&L',
        screen: 'TradingPl',
        params: { title: 'Trading P&L' },
        accent: palette.primary,
      },
    ],
  },
  {
    title: 'Master Data',
    items: [
      {
        icon: '👥',
        label: 'Customers & Vendors',
        screen: 'Contacts',
        accent: palette.warning,
      },
      {
        icon: '🏦',
        label: 'Banks',
        screen: 'Banks',
        params: { title: 'Banks' },
        accent: palette.info,
      },
      {
        icon: '💼',
        label: 'Employees',
        screen: 'Employees',
        params: { title: 'Employees' },
        accent: palette.gray600,
      },
      {
        icon: '🔐',
        label: 'Team Access',
        screen: 'TeamAccess',
        params: { title: 'Team Access' },
        accent: palette.primary,
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        icon: '⚙️',
        label: 'General Settings',
        screen: 'SettingsGeneral',
        accent: palette.gray500,
      },
      {
        icon: '📋',
        label: 'Field Governance',
        screen: 'FieldsGovernance',
        params: { title: 'Field Governance' },
        accent: palette.primary,
      },
      {
        icon: '📱',
        label: 'Bank Details',
        screen: 'BankDetails',
        params: { title: 'Bank Details' },
        accent: palette.info,
      },
      {
        icon: '🎨',
        label: 'Branding',
        screen: 'Branding',
        params: { title: 'Branding' },
        accent: palette.success,
      },
      {
        icon: '💳',
        label: 'Subscription & Billing',
        screen: 'SubscriptionBilling',
        params: { title: 'Subscription & Billing' },
        accent: palette.warning,
      },
      {
        icon: '🛡️',
        label: 'Compliance',
        screen: 'Compliance',
        params: { title: 'Compliance' },
        accent: palette.error,
      },
    ],
  },
];

const subStatusVariant: Record<string, any> = {
  trial: 'warning',
  active: 'success',
  grace_period: 'warning',
  suspended: 'error',
  expired: 'error',
};

export function MoreMenuScreen({ navigation }: Props) {
  const { profile, signOut } = useAuthStore();
  const org = profile?.organization;

  return (
    <Screen scroll padded={false} keyboard={false} backgroundColor={palette.gray50}>
      {/* Premium Profile Header */}
      <View style={styles.profileCard}>
        <Row align="between">
          <Row gap={spacing.lg} style={{ flex: 1 }}>
            <Avatar name={profile?.full_name ?? undefined} size="lg" />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName} numberOfLines={1}>
                {profile?.full_name ?? 'User'}
              </Text>
              <Text style={styles.profileRole} numberOfLines={1}>
                {profile?.role?.charAt(0).toUpperCase()}{profile?.role?.slice(1)} ·{' '}
                {org?.name}
              </Text>
              {org?.status && (
                <View style={{ marginTop: spacing.xs }}>
                  <Badge
                    label={org.status === 'trial' ? `Trial` : org.status}
                    variant={subStatusVariant[org.status] ?? 'default'}
                  />
                </View>
              )}
            </View>
          </Row>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            style={styles.editBtn}
          >
            <Text style={styles.editBtnText}>View</Text>
          </TouchableOpacity>
        </Row>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.menuItem,
                    idx < section.items.length - 1 && styles.menuItemBorder,
                  ]}
                  onPress={() => navigation.navigate(item.screen as any, item.params)}
                  activeOpacity={0.65}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.accent + '18' }]}>
                    <Text style={styles.menuIcon}>{item.icon}</Text>
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>🚪  Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>MandiPro · v1.0</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    backgroundColor: palette.primary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.xl,
  },
  profileName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.white,
  },
  profileRole: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
  },
  editBtnText: {
    color: palette.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: palette.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: palette.gray100,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: palette.gray100,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: { fontSize: 18 },
  menuText: { flex: 1 },
  menuLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: palette.gray900,
  },
  chevron: {
    fontSize: fontSize.xl,
    color: palette.gray300,
    fontWeight: '300',
  },
  signOutBtn: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.errorLight,
    marginBottom: spacing.lg,
  },
  signOutText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: palette.error,
  },
  version: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: palette.gray400,
    marginBottom: spacing.xl,
  },
});

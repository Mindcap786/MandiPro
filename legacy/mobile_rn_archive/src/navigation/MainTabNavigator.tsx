/**
 * Main Tab Navigator — Bottom tabs for authenticated users.
 * Tabs: Dashboard | Sales | Purchase | Inventory | More
 */

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import { MainTabParamList } from './types';
import { palette, fontSize } from '@/theme';

// Stack navigators for each tab
import { SalesNavigator } from './SalesNavigator';
import { PurchaseNavigator } from './PurchaseNavigator';
import { InventoryNavigator } from './InventoryNavigator';
import { FinanceNavigator } from './FinanceNavigator';
import { MoreNavigator } from './MoreNavigator';

// Direct screen (no sub-stack needed)
import { DashboardScreen } from '@/screens/dashboard/DashboardScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const iconMap: Record<string, string> = {
    Dashboard: '🏠',
    Sales: '💰',
    Purchase: '🛒',
    Inventory: '📦',
    Finance: '📊',
    More: '⚙️',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {iconMap[label] ?? '\u{25CF}'}
    </Text>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.gray400,
        tabBarLabelStyle: styles.tabLabel,
        tabBarStyle: styles.tabBar,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Sales" component={SalesNavigator} />
      <Tab.Screen name="Purchase" component={PurchaseNavigator} />
      <Tab.Screen name="Inventory" component={InventoryNavigator} />
      <Tab.Screen name="Finance" component={FinanceNavigator} />
      <Tab.Screen name="More" component={MoreNavigator} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: palette.gray100,
    backgroundColor: palette.white,
    height: 60,
    paddingBottom: 6,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});

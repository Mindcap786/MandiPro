import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreStackParamList } from './types';

import { MoreMenuScreen } from '@/screens/more/MoreMenuScreen';
import { FinanceScreen } from '@/screens/more/FinanceScreen';
import { ReceiptsScreen } from '@/screens/more/ReceiptsScreen';
import { LedgerScreen } from '@/screens/more/LedgerScreen';
import { ContactsScreen } from '@/screens/more/ContactsScreen';
import { ContactDetailScreen } from '@/screens/more/ContactDetailScreen';
import { ContactCreateScreen } from '@/screens/more/ContactCreateScreen';
import { ReportsScreen } from '@/screens/more/ReportsScreen';
import { SettingsScreen } from '@/screens/more/SettingsScreen';
import { ProfileScreen } from '@/screens/more/ProfileScreen';
import { PaymentsScreen } from '@/screens/more/PaymentsScreen';
import { DayBookScreen } from '@/screens/more/DayBookScreen';
import { ChequeMgmtScreen } from '@/screens/more/ChequeMgmtScreen';
import { GstComplianceScreen } from '@/screens/more/GstComplianceScreen';
import { BalanceSheetScreen } from '@/screens/more/BalanceSheetScreen';
import { TradingPlScreen } from '@/screens/more/TradingPlScreen';
import { BanksScreen } from '@/screens/more/BanksScreen';
import { EmployeesScreen } from '@/screens/more/EmployeesScreen';
import { TeamAccessScreen } from '@/screens/more/TeamAccessScreen';
import { FieldsGovernanceScreen } from '@/screens/more/FieldsGovernanceScreen';
import { BankDetailsScreen } from '@/screens/more/BankDetailsScreen';
import { BrandingScreen } from '@/screens/more/BrandingScreen';
import { SubscriptionBillingScreen } from '@/screens/more/SubscriptionBillingScreen';
import { ComplianceScreen } from '@/screens/more/ComplianceScreen';
import { PlaceholderScreen } from '@/components/layout';

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} />
      
      {/* Finance */}
      <Stack.Screen name="FinanceOverview" component={FinanceScreen} />
      <Stack.Screen name="Ledger" component={LedgerScreen} />
      <Stack.Screen name="Receipts" component={ReceiptsScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="DayBook" component={DayBookScreen} />
      <Stack.Screen name="ChequeMgmt" component={ChequeMgmtScreen} />
      <Stack.Screen name="GstCompliance" component={GstComplianceScreen} />
      <Stack.Screen name="BalanceSheet" component={BalanceSheetScreen} />
      <Stack.Screen name="TradingPl" component={TradingPlScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      
      {/* Master Data */}
      <Stack.Screen name="Contacts" component={ContactsScreen} />
      <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
      <Stack.Screen name="ContactCreate" component={ContactCreateScreen} />
      <Stack.Screen name="Banks" component={BanksScreen} />
      <Stack.Screen name="Employees" component={EmployeesScreen} />
      <Stack.Screen name="TeamAccess" component={TeamAccessScreen} />
      
      {/* Settings */}
      <Stack.Screen name="SettingsGeneral" component={SettingsScreen} />
      <Stack.Screen name="FieldsGovernance" component={FieldsGovernanceScreen} />
      <Stack.Screen name="BankDetails" component={BankDetailsScreen} />
      <Stack.Screen name="Branding" component={BrandingScreen} />
      <Stack.Screen name="SubscriptionBilling" component={SubscriptionBillingScreen} />
      <Stack.Screen name="Compliance" component={ComplianceScreen} />
      
      {/* User */}
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Placeholder" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
}

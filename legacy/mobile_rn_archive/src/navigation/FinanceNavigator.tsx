import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FinanceStackParamList } from './types';
import { FinanceHubScreen } from '@/screens/finance/FinanceHubScreen';
import { DayBookScreen } from '@/screens/finance/DayBookScreen';
import { LedgerScreen } from '@/screens/finance/LedgerScreen';
import { VoucherCreateScreen } from '@/screens/finance/VoucherCreateScreen';
import { PlaceholderScreen } from '@/components/layout';

const Stack = createNativeStackNavigator<FinanceStackParamList>();

export function FinanceNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="FinanceHub" component={FinanceHubScreen} />
      <Stack.Screen name="DayBook" component={DayBookScreen} />
      <Stack.Screen name="Ledger" component={LedgerScreen} />
      <Stack.Screen name="Receipts" component={VoucherCreateScreen} />
      <Stack.Screen name="Payments" component={VoucherCreateScreen} />
      <Stack.Screen name="ChequeMgmt" component={PlaceholderScreen} initialParams={{ title: 'Cheque Management' }} />
      <Stack.Screen name="GstCompliance" component={PlaceholderScreen} initialParams={{ title: 'GST / Taxes' }} />
      <Stack.Screen name="BalanceSheet" component={PlaceholderScreen} initialParams={{ title: 'Balance Sheet' }} />
    </Stack.Navigator>
  );
}

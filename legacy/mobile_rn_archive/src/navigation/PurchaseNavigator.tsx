import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PurchaseStackParamList } from './types';

import { PurchaseHubScreen } from '@/screens/purchase/PurchaseHubScreen';
import { PurchaseListScreen } from '@/screens/purchase/PurchaseListScreen';
import { PurchaseCreateScreen } from '@/screens/purchase/PurchaseCreateScreen';
import { PurchaseDetailScreen } from '@/screens/purchase/PurchaseDetailScreen';
import { ArrivalsListScreen } from '@/screens/sales/ArrivalsListScreen';
import { ArrivalDetailScreen } from '@/screens/sales/ArrivalDetailScreen';
import { ArrivalCreateScreen } from '@/screens/sales/ArrivalCreateScreen';
import { GateEntryListScreen } from '@/screens/purchase/GateEntryListScreen';
import { GateEntryCreateScreen } from '@/screens/purchase/GateEntryCreateScreen';
import { PlaceholderScreen } from '@/components/layout';

const Stack = createNativeStackNavigator<PurchaseStackParamList>();

export function PurchaseNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="PurchaseHub" component={PurchaseHubScreen} />
      <Stack.Screen name="ArrivalsList" component={ArrivalsListScreen} />
      <Stack.Screen name="ArrivalDetail" component={ArrivalDetailScreen} />
      <Stack.Screen name="ArrivalCreate" component={ArrivalCreateScreen} />
      <Stack.Screen name="PurchaseList" component={PurchaseListScreen} />
      <Stack.Screen name="PurchaseCreate" component={PurchaseCreateScreen} />
      <Stack.Screen name="PurchaseDetail" component={PurchaseDetailScreen} />
      
      {/* Gate Entry stubs pointing to Placeholder for now */}
      <Stack.Screen name="GateEntryList" component={GateEntryListScreen} />
      <Stack.Screen name="GateEntryCreate" component={GateEntryCreateScreen} />

      {/* 1:1 Parity Submenus */}
      <Stack.Screen name="SupplierPayments" component={PlaceholderScreen} initialParams={{ title: 'Supplier Payments' }} />
      <Stack.Screen name="DayBook" component={PlaceholderScreen} initialParams={{ title: 'Day Book' }} />
    </Stack.Navigator>
  );
}

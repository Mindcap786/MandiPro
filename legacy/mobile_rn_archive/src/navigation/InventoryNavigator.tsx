import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InventoryStackParamList } from './types';

import { InventoryHubScreen } from '@/screens/inventory/InventoryHubScreen';
import { LotsListScreen } from '@/screens/inventory/LotsListScreen';
import { LotDetailScreen } from '@/screens/inventory/LotDetailScreen';
import { CommoditiesListScreen } from '@/screens/inventory/CommoditiesListScreen';
import { CommodityDetailScreen } from '@/screens/inventory/CommodityDetailScreen';
import { StockQuickEntryScreen } from '@/screens/inventory/StockQuickEntryScreen';
import { PlaceholderScreen } from '@/components/layout';

const Stack = createNativeStackNavigator<InventoryStackParamList>();

export function InventoryNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="InventoryHub" component={InventoryHubScreen} />
      <Stack.Screen name="LotsList" component={LotsListScreen} />
      <Stack.Screen name="LotDetail" component={LotDetailScreen} />
      <Stack.Screen name="CommoditiesList" component={CommoditiesListScreen} />
      <Stack.Screen name="CommodityDetail" component={CommodityDetailScreen} />
      <Stack.Screen name="StockQuickEntry" component={StockQuickEntryScreen} />
    </Stack.Navigator>
  );
}

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SalesStackParamList } from './types';

import { SalesHubScreen } from '@/screens/sales/SalesHubScreen';
import { SalesListScreen } from '@/screens/sales/SalesListScreen';
import { SaleDetailScreen } from '@/screens/sales/SaleDetailScreen';
import { SaleCreateScreen } from '@/screens/sales/SaleCreateScreen';
import { PosScreen } from '@/screens/sales/PosScreen';
import { ReturnsScreen } from '@/screens/sales/ReturnsScreen';
import { BulkLotSaleScreen } from '@/screens/sales/BulkLotSaleScreen';
import { QuotationsListScreen } from '@/screens/sales/QuotationsListScreen';
import { QuotationCreateScreen } from '@/screens/sales/QuotationCreateScreen';
import { SalesOrdersListScreen } from '@/screens/sales/SalesOrdersListScreen';
import { SalesOrderCreateScreen } from '@/screens/sales/SalesOrderCreateScreen';
import { DeliveryChallansListScreen } from '@/screens/sales/DeliveryChallansListScreen';
import { DeliveryChallanCreateScreen } from '@/screens/sales/DeliveryChallanCreateScreen';
import { CreditNotesListScreen } from '@/screens/sales/CreditNotesListScreen';
import { CreditNoteCreateScreen } from '@/screens/sales/CreditNoteCreateScreen';
import { PlaceholderScreen } from '@/components/layout';

const Stack = createNativeStackNavigator<SalesStackParamList>();

export function SalesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="SalesHub" component={SalesHubScreen} />
      <Stack.Screen name="SalesList" component={SalesListScreen} />
      <Stack.Screen name="SaleDetail" component={SaleDetailScreen} />
      <Stack.Screen name="SaleCreate" component={SaleCreateScreen} />
      <Stack.Screen name="Pos" component={PosScreen} />
      <Stack.Screen name="Returns" component={ReturnsScreen} />
      
      {/* 1:1 Parity Screens */}
      <Stack.Screen name="BulkLotSale" component={BulkLotSaleScreen} /> 
      <Stack.Screen name="QuotationsList" component={QuotationsListScreen} />
      <Stack.Screen name="QuotationCreate" component={QuotationCreateScreen} />
      <Stack.Screen name="SalesOrdersList" component={SalesOrdersListScreen} />
      <Stack.Screen name="SalesOrderCreate" component={SalesOrderCreateScreen} />
      <Stack.Screen name="DeliveryChallansList" component={DeliveryChallansListScreen} />
      <Stack.Screen name="DeliveryChallanCreate" component={DeliveryChallanCreateScreen} />
      <Stack.Screen name="CreditNotesList" component={CreditNotesListScreen} />
      <Stack.Screen name="CreditNoteCreate" component={CreditNoteCreateScreen} />
    </Stack.Navigator>
  );
}

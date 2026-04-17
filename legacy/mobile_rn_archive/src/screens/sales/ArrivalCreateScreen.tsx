/**
 * Arrival Create Screen
 * FIXES:
 * 1. Added optional Lot Creation directly from Arrival.
 * 2. Added Commodity/Item selection.
 * 3. Validation for lot details if creating a lot.
 */

import React, { useState } from 'react';
import { StyleSheet, View, Text, Switch, SwitchChangeEvent, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { SalesStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, core } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Card, Button, Divider } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing, fontSize, radius } from '@/theme';

type Props = NativeStackScreenProps<SalesStackParamList, 'ArrivalCreate'>;

function formatDateForDB(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ArrivalCreateScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [arrivalType, setArrivalType] = useState('farmer');
  const [partyId, setPartyId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  
  // Lot creation state
  const [createLot, setCreateLot] = useState(false);
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [supplierRate, setSupplierRate] = useState('');
  const [salePrice, setSalePrice] = useState('');

  const { data: suppliers = [] } = useQuery({
    queryKey: ['contacts-suppliers', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name, contact_type')
        .eq('organization_id', orgId!)
        .in('contact_type', ['farmer', 'supplier'])
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['inventory-items', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('items')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const generateLotCode = () => {
    return `LOT-${new Date().getTime().toString().slice(-6)}`;
  };

  const { mutate: createArrival, isPending } = useMutation({
    mutationFn: async () => {
      if (arrivalType !== 'direct' && !partyId) {
        throw new Error('Please select a party');
      }
      
      if (createLot) {
        if (!itemId) throw new Error('Please select an item for the lot');
        if (!qty || parseFloat(qty) <= 0) throw new Error('Please enter a valid quantity');
      }

      // Create Arrival
      const { data: arrival, error: arrError } = await mandi()
        .from('arrivals')
        .insert({
          organization_id: orgId,
          arrival_date: formatDateForDB(new Date()),
          arrival_type: arrivalType,
          party_id: partyId || null,
          vehicle_number: vehicleNumber.trim() || null,
          reference_no: referenceNo.trim() || null,
          status: 'completed', // auto-complete if creating lot
        })
        .select()
        .single();
        
      if (arrError) throw new Error(arrError.message);

      // Create Lot if requested
      if (createLot) {
        const lotCode = generateLotCode();
        const { error: lotErr } = await mandi()
          .from('lots')
          .insert({
            organization_id: orgId,
            item_id: itemId,
            arrival_id: arrival.id,
            lot_code: lotCode,
            initial_qty: parseFloat(qty),
            current_qty: parseFloat(qty),
            unit: unit,
            supplier_rate: supplierRate ? parseFloat(supplierRate) : null,
            sale_price: salePrice ? parseFloat(salePrice) : null,
            status: 'active',
          });
          
        if (lotErr) throw new Error(`Arrival created, but lot failed: ${lotErr.message}`);
      }

      return arrival;
    },
    onSuccess: (arrival) => {
      toast.show(`Arrival ${createLot ? '& Lot ' : ''}recorded successfully`, 'success');
      qc.invalidateQueries({ queryKey: ['arrivals', orgId] });
      if (createLot) {
        qc.invalidateQueries({ queryKey: ['lots', orgId] });
        qc.invalidateQueries({ queryKey: ['lots-active', orgId] });
      }
      navigation.replace('ArrivalDetail', { id: arrival.id });
    },
    onError: (err: Error) => toast.show(err.message, 'error'),
  });

  const typeOptions = [
    { label: 'Farmer', value: 'farmer' },
    { label: 'Direct', value: 'direct' },
    { label: 'Supplier', value: 'supplier' },
  ];

  const partyOptions = suppliers.map((s) => ({ label: s.name, value: s.id }));
  const itemOptions = items.map((i) => ({ label: i.name, value: i.id }));

  return (
    <Screen scroll padded keyboard>
      <Header title="New Arrival" onBack={() => navigation.goBack()} />

      <Card title="Arrival Details" style={styles.card}>
        <Select label="Arrival Type" options={typeOptions} value={arrivalType} onChange={setArrivalType} required />
        {arrivalType !== 'direct' && (
          <Select label="Party *" options={partyOptions} value={partyId} onChange={setPartyId} placeholder="Select party..." required />
        )}
        <Input label="Vehicle Number" placeholder="MH 12 AB 1234" value={vehicleNumber} onChangeText={setVehicleNumber} autoCapitalize="characters" />
        <Input label="Reference No." placeholder="Optional" value={referenceNo} onChangeText={setReferenceNo} />
      </Card>

      <Card style={styles.card}>
        <Row align="between" style={{ paddingVertical: spacing.sm }}>
          <Text style={styles.toggleLabel}>Create Lot from Arrival?</Text>
          <Switch value={createLot} onValueChange={setCreateLot} trackColor={{ true: palette.primary }} />
        </Row>
        
        {createLot && (
          <View style={{ marginTop: spacing.md }}>
            <Divider />
            <View style={{ marginTop: spacing.md }} />
            <Select label="Commodity / Item *" options={itemOptions} value={itemId} onChange={setItemId} placeholder="Select item..." required />
            
            <Row gap={spacing.md}>
              <View style={{ flex: 1 }}>
                <Input label="Quantity *" placeholder="0" value={qty} onChangeText={setQty} keyboardType="decimal-pad" required />
              </View>
              <View style={{ flex: 1 }}>
                <Select label="Unit" options={[{label:'Kg', value:'kg'}, {label:'Ton', value:'ton'}, {label:'Box', value:'box'}, {label:'Bag', value:'bag'}]} value={unit} onChange={setUnit} />
              </View>
            </Row>

            <Row gap={spacing.md}>
              <View style={{ flex: 1 }}>
                <Input label="Supplier Rate (₹)" placeholder="0.00" value={supplierRate} onChangeText={setSupplierRate} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Sale Price (₹)" placeholder="0.00" value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" />
              </View>
            </Row>
          </View>
        )}
      </Card>

      <Button 
        title={createLot ? "Save Arrival & Create Lot" : "Create Arrival"} 
        onPress={() => createArrival()} 
        loading={isPending} 
        fullWidth 
        size="lg" 
        style={{ marginBottom: spacing['2xl'] }} 
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  toggleLabel: { fontSize: fontSize.md, fontWeight: '600', color: palette.gray900 },
});

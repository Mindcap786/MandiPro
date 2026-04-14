import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PurchaseStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi, core } from '@/api/db';
import { Screen, Header } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing } from '@/theme';

type Props = NativeStackScreenProps<PurchaseStackParamList, 'GateEntryCreate'>;

export function GateEntryCreateScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [partyId, setPartyId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-gate', orgId],
    queryFn: async () => {
      const { data, error } = await core()
        .from('contacts')
        .select('id, name')
        .eq('organization_id', orgId!)
        .in('contact_type', ['farmer', 'supplier', 'transporter'])
        .eq('status', 'active')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { mutate: createGateEntry, isPending } = useMutation({
    mutationFn: async () => {
      if (!vehicleNumber.trim()) throw new Error('Vehicle number is required');

      // Simple pseudo-random token generation matching web format
      const tokenNo = `T-${Math.floor(1000 + Math.random() * 9000)}`;

      const { data, error } = await mandi()
        .from('gate_entries')
        .insert({
          organization_id: orgId,
          vehicle_number: vehicleNumber.trim().toUpperCase(),
          party_id: partyId || null,
          driver_name: driverName.trim() || null,
          driver_phone: driverPhone.trim() || null,
          token_no: tokenNo,
          entry_time: new Date().toISOString(),
          status: 'in_mandi',
        })
        .select()
        .single();
        
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (data) => {
      toast.show(`Gate Entry ${data.token_no} recorded ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['gate-entries', orgId] });
      navigation.goBack();
    },
    onError: (err: Error) => toast.show(err.message, 'error'),
  });

  const contactOptions = contacts.map(c => ({ label: c.name, value: c.id }));

  return (
    <Screen scroll padded keyboard>
      <Header title="New Gate Entry" onBack={() => navigation.goBack()} />

      <Card title="Vehicle Information" style={styles.card}>
        <Input 
          label="Vehicle Number *" 
          placeholder="e.g. MH 12 AB 1234" 
          value={vehicleNumber} 
          onChangeText={setVehicleNumber}
          autoCapitalize="characters"
          required
        />
      </Card>

      <Card title="Party & Driver Details" style={styles.card}>
        <Select 
          label="Associated Party" 
          options={contactOptions} 
          value={partyId} 
          onChange={setPartyId} 
          placeholder="Select Farmer/Supplier... (Optional)"
        />
        <Input 
          label="Driver Name" 
          placeholder="Optional" 
          value={driverName} 
          onChangeText={setDriverName} 
        />
        <Input 
          label="Driver Phone" 
          placeholder="Optional" 
          value={driverPhone} 
          onChangeText={setDriverPhone}
          keyboardType="phone-pad"
        />
      </Card>

      <Button 
        title="Record Gate Entry" 
        onPress={() => createGateEntry()} 
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
});

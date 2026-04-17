/**
 * Contact Create Screen — Add new contacts (farmers, buyers, suppliers, transporters).
 * CRITICAL GAP: This entire screen was missing. Web has contacts with full CRUD.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { core } from '@/api/db';
import { Screen, Header } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import { Input, Select } from '@/components/forms';
import { palette, spacing, fontSize } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'ContactCreate'>;

const contactTypes = [
  { label: 'Farmer', value: 'farmer' },
  { label: 'Buyer', value: 'buyer' },
  { label: 'Supplier', value: 'supplier' },
  { label: 'Transporter', value: 'transporter' },
  { label: 'Employee', value: 'employee' },
];

interface FormErrors {
  name?: string;
  phone?: string;
  gstin?: string;
  mandi_license_no?: string;
}

export function ContactCreateScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const toast = useToastStore();
  const qc = useQueryClient();

  const [contactType, setContactType] = useState('farmer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [mandiLicenseNo, setMandiLicenseNo] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    // Name: required, min 2
    if (!name.trim() || name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    // Phone: optional but if provided must be 10 digits (Indian mobile)
    if (phone && !/^\d{10}$/.test(phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Enter a valid 10-digit phone number';
    }

    // GSTIN: optional but if provided must be 15 chars exactly
    if (gstin && gstin.trim().length !== 15) {
      newErrors.gstin = 'GSTIN must be exactly 15 characters';
    }

    // Mandi License: max 20 chars (matching web validation)
    if (mandiLicenseNo && mandiLicenseNo.trim().length > 20) {
      newErrors.mandi_license_no = 'License number must be at most 20 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const { mutate: createContact, isPending } = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed');

      const { data, error } = await core()
        .from('contacts')
        .insert({
          organization_id: orgId,
          contact_type: contactType,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim().toLowerCase() || null,
          gstin: gstin.trim() || null,
          mandi_license_no: mandiLicenseNo.trim() || null,
          address_line1: address.trim() || null,
          notes: notes.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A contact with this name or phone already exists');
        }
        throw new Error(error.message);
      }
      return data;
    },
    onSuccess: (contact) => {
      toast.show(`${name} added successfully ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['contacts', orgId] });
      navigation.replace('ContactDetail', { id: contact.id });
    },
    onError: (err: Error) => {
      if (err.message !== 'Validation failed') {
        toast.show(err.message, 'error');
      }
    },
  });

  return (
    <Screen scroll padded keyboard>
      <Header title="New Contact" onBack={() => navigation.goBack()} />

      <Card title="Contact Type" style={styles.card}>
        <Select
          label="Type *"
          options={contactTypes}
          value={contactType}
          onChange={setContactType}
          required
        />
      </Card>

      <Card title="Basic Information" style={styles.card}>
        <Input
          label="Full Name *"
          placeholder="Enter full name"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
          }}
          autoCapitalize="words"
          error={errors.name}
          required
        />

        <Input
          label="Phone Number"
          placeholder="10-digit mobile number"
          value={phone}
          onChangeText={(v) => {
            setPhone(v);
            if (errors.phone) setErrors((e) => ({ ...e, phone: undefined }));
          }}
          keyboardType="phone-pad"
          error={errors.phone}
          maxLength={10}
        />

        <Input
          label="Email"
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </Card>

      <Card title="Business Details" style={styles.card}>
        <Input
          label="GSTIN"
          placeholder="15-character GST number"
          value={gstin}
          onChangeText={(v) => {
            setGstin(v.toUpperCase());
            if (errors.gstin) setErrors((e) => ({ ...e, gstin: undefined }));
          }}
          autoCapitalize="characters"
          maxLength={15}
          error={errors.gstin}
        />

        {(contactType === 'farmer' || contactType === 'buyer') && (
          <Input
            label="Mandi License No."
            placeholder="Max 20 characters"
            value={mandiLicenseNo}
            onChangeText={(v) => {
              setMandiLicenseNo(v);
              if (errors.mandi_license_no) setErrors((e) => ({ ...e, mandi_license_no: undefined }));
            }}
            maxLength={20}
            error={errors.mandi_license_no}
            hint="Mandi market license number"
          />
        )}

        <Input
          label="Address"
          placeholder="Full address"
          value={address}
          onChangeText={setAddress}
          multiline
          numberOfLines={2}
        />
      </Card>

      <Card title="Additional" style={styles.card}>
        <Input
          label="Notes"
          placeholder="Internal notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </Card>

      <Button
        title="Save Contact"
        onPress={() => createContact()}
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

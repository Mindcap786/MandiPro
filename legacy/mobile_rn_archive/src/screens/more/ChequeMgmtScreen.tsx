/**
 * Cheque Management Screen
 * Tracks pending cheques and provides actions to clear/bounce them.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MoreStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores/auth-store';
import { useToastStore } from '@/stores/toast-store';
import { mandi } from '@/api/db';
import { Screen, Header, Row } from '@/components/layout';
import { Button, Badge } from '@/components/ui';
import { format } from 'date-fns';
import { palette, spacing, fontSize, radius, shadows } from '@/theme';

type Props = NativeStackScreenProps<MoreStackParamList, 'ChequeMgmt'>;

export function ChequeMgmtScreen({ navigation }: Props) {
  const { profile } = useAuthStore();
  const orgId = profile?.organization_id;
  const qc = useQueryClient();
  const toast = useToastStore();

  const { data: cheques = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['cheques', orgId],
    queryFn: async () => {
      const { data, error } = await mandi()
        .from('vouchers')
        .select(`
          id, voucher_no, type, date, amount, narration,
          cheque_no, cheque_date, cheque_status, bank_name
        `)
        .eq('organization_id', orgId!)
        .not('cheque_no', 'is', null)
        .order('date', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  const { mutate: updateStatus, isPending } = useMutation({
    mutationFn: async ({ id, status, isCleared }: { id: string, status: string, isCleared: boolean }) => {
      const { error } = await mandi()
        .from('vouchers')
        .update({ cheque_status: status, is_cleared: isCleared })
        .eq('id', id);
      if (error) throw new Error(error.message);
      
      // If we're marking it as cleared, it theoretically needs to update the ledger as well.
      // But keeping it simple for UI MVP since `cheque_status` controls frontend display.
    },
    onSuccess: () => {
      toast.show('Cheque Updated', 'success');
      qc.invalidateQueries({ queryKey: ['cheques'] });
      qc.invalidateQueries({ queryKey: ['day-book'] });
    },
    onError: (err: Error) => toast.show(err.message, 'error')
  });

  const handleAction = (id: string, currentStatus: string) => {
    if (currentStatus === 'Cleared') return;
    Alert.alert('Cheque Status', 'Update the status of this cheque:', [
      { text: 'Mark as Cleared', onPress: () => updateStatus({ id, status: 'Cleared', isCleared: true }) },
      { text: 'Mark as Bounced', onPress: () => updateStatus({ id, status: 'Bounced', isCleared: false }), style: 'destructive' },
      { text: 'Cancel', style: 'cancel' }
    ]);
  };

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  const renderItem = ({ item }: { item: any }) => {
    const isPending = item.cheque_status === 'Pending';
    const isCleared = item.cheque_status === 'Cleared';
    const isBounced = item.cheque_status === 'Bounced';
    
    return (
      <View style={styles.card}>
        <Row align="between" style={styles.headerRow}>
          <Text style={styles.date}>{format(new Date(item.date), 'dd MMM yyyy')}</Text>
          <Badge 
            label={item.cheque_status || 'Pending'} 
            variant={isCleared ? 'success' : isBounced ? 'error' : 'warning'} 
            size="sm"
          />
        </Row>
        
        <Text style={styles.vchText}>VCH #{item.voucher_no} • {item.type.toUpperCase()}</Text>
        <Text style={styles.amt}>{fmt(item.amount)}</Text>
        
        <View style={styles.chequeBox}>
          <Text style={styles.chequeLabel}>Cheque No: <Text style={styles.chequeVal}>{item.cheque_no}</Text></Text>
          <Text style={styles.chequeLabel}>Bank: <Text style={styles.chequeVal}>{item.bank_name || 'N/A'}</Text></Text>
          {item.cheque_date && <Text style={styles.chequeLabel}>Date: <Text style={styles.chequeVal}>{format(new Date(item.cheque_date), 'dd MMM yyyy')}</Text></Text>}
        </View>

        {isPending && (
          <Button 
            title="Update Status" 
            variant="outline" 
            size="sm" 
            style={{ marginTop: spacing.md }}
            onPress={() => handleAction(item.id, item.cheque_status)}
            loading={isPending}
          />
        )}
      </View>
    );
  };

  return (
    <Screen padded={false} backgroundColor={palette.gray50}>
      <Header title="Cheque Management" onBack={() => navigation.goBack()} />
      <FlatList
        data={cheques}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing['4xl'] }}
        onRefresh={refetch}
        refreshing={isRefetching}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No cheques found.</Text> : null
        }
        renderItem={renderItem}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: palette.white, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: palette.gray200, ...shadows.sm },
  headerRow: { marginBottom: spacing.xs },
  date: { fontSize: fontSize.xs, color: palette.gray500, fontWeight: '600' },
  vchText: { fontSize: fontSize.sm, fontWeight: '700', color: palette.gray700 },
  amt: { fontSize: fontSize.xl, fontWeight: '900', color: palette.primary, marginVertical: spacing.xs },
  chequeBox: { backgroundColor: palette.gray50, padding: spacing.sm, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: palette.gray100 },
  chequeLabel: { fontSize: fontSize.xs, color: palette.gray500, marginBottom: 2 },
  chequeVal: { color: palette.gray900, fontWeight: '700' },
  empty: { textAlign: 'center', color: palette.gray400, marginTop: spacing.xl, fontStyle: 'italic' }
});

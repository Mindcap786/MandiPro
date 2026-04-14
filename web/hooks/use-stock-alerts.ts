import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/components/auth/auth-provider'
import { useToast } from '@/hooks/use-toast'

export type AlertSeverity = 'medium' | 'high' | 'critical' | 'emergency';
export type AlertType = 'AGING_WARNING' | 'AGING_CRITICAL' | 'LOW_STOCK' | 'CRITICAL_STOCK' | 'OUT_OF_STOCK' | 'VALUE_AT_RISK';

export interface StockAlert {
    id: string;
    organization_id: string;
    alert_type: AlertType;
    severity: AlertSeverity;
    commodity_id: string | null;
    commodity_name: string;
    associated_lot_id: string | null;
    location_name: string | null;
    current_value: number;
    threshold_value: number;
    unit: string | null;
    is_seen: boolean;
    seen_at: string | null;
    is_resolved: boolean;
    resolved_at: string | null;
    created_at: string;
}

export function useStockAlerts() {
    const { profile } = useAuth();
    const orgId = profile?.organization_id;
    const { toast } = useToast();

    const [alerts, setAlerts] = useState<StockAlert[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // UNREAD COUNT = Not Seen
    const unreadCount = alerts.filter(a => !a.is_seen).length;

    const fetchAlerts = useCallback(async () => {
        if (!orgId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('stock_alerts')
                .select('*')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setAlerts(data as StockAlert[]);
        } catch (err: any) {
            console.error("Error fetching stock alerts:", err);
        } finally {
            setIsLoading(false);
        }
    }, [orgId]);

    // Initial Load
    useEffect(() => {
        if (orgId) {
            fetchAlerts();
        } else {
            setIsLoading(false);
        }
    }, [orgId, fetchAlerts]);

    // Realtime Subscription
    useEffect(() => {
        if (!orgId) return;

        const channel = supabase
            .channel(`stock-alerts-${orgId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'stock_alerts',
                    filter: `organization_id=eq.${orgId}`,
                },
                (payload) => {
                    const newAlert = payload.new as StockAlert;
                    setAlerts((prev) => [newAlert, ...prev]);

                    let titleStr = '';
                    switch (newAlert.alert_type) {
                        case 'OUT_OF_STOCK': titleStr = '❌ Out of Stock Alert'; break;
                        case 'CRITICAL_STOCK': titleStr = '🚨 Critical Stock Alert'; break;
                        case 'AGING_CRITICAL': titleStr = '🚨 Critical Aging Alert'; break;
                        default: titleStr = '⚠️ Stock Alert';
                    }

                    toast({
                        title: titleStr,
                        description: `${newAlert.commodity_name}: ${newAlert.current_value} ${newAlert.unit}`,
                        variant: newAlert.severity === 'critical' || newAlert.severity === 'emergency' ? 'destructive' : 'default',
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'stock_alerts',
                    filter: `organization_id=eq.${orgId}`,
                },
                (payload) => {
                    const updated = payload.new as StockAlert;
                    setAlerts((prev) => prev.map(a => a.id === updated.id ? updated : a));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [orgId, toast]);

    const resolveAlert = async (id: string) => {
        if (!orgId) return;
        setAlerts((prev) => prev.map(a => a.id === id ? { ...a, is_resolved: true, is_seen: true } : a));

        const { error } = await supabase
            .from('stock_alerts')
            .update({ 
                is_resolved: true, 
                resolved_at: new Date().toISOString(),
                is_seen: true,
                seen_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) {
            console.error("Failed to resolve alert", error);
            await fetchAlerts();
        }
    };

    const markAllSeen = async () => {
        if (!orgId) return;
        const unseenIds = alerts.filter(a => !a.is_seen).map(a => a.id);
        if (unseenIds.length === 0) return;

        setAlerts((prev) => prev.map(a => !a.is_seen ? { ...a, is_seen: true, seen_at: new Date().toISOString() } : a));

        const { error } = await supabase
            .from('stock_alerts')
            .update({ is_seen: true, seen_at: new Date().toISOString() })
            .in('id', unseenIds);

        if (error) {
            console.error("Failed to mark all as seen", error);
            await fetchAlerts();
        }
    };

    const markAllResolved = async () => {
        if (!orgId) return;
        const unreadIds = alerts.filter(a => !a.is_resolved).map(a => a.id);
        if (unreadIds.length === 0) return;

        setAlerts((prev) => prev.map(a => ({ ...a, is_resolved: true, is_seen: true })));

        const { error } = await supabase
            .from('stock_alerts')
            .update({ 
                is_resolved: true, 
                resolved_at: new Date().toISOString(),
                is_seen: true,
                seen_at: new Date().toISOString()
            })
            .in('id', unreadIds);

        if (error) {
            console.error("Failed to mark all as resolved", error);
            await fetchAlerts();
        }
    };

    return {
        alerts,
        unreadCount,
        isLoading,
        resolveAlert,
        markAllSeen,
        markAllResolved,
        refresh: fetchAlerts
    };
}

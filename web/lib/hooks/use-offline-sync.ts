"use client";

import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

export function useOfflineSync(organizationId?: string) {
    const isOnline = useOnlineStatus();
    const { toast } = useToast();
    const [isSyncing, setIsSyncing] = useState(false);

    // 1. Sync Loop (Push Pending Sales)
    useEffect(() => {
        if (isOnline && organizationId) {
            pushPendingSales();
        }
    }, [isOnline, organizationId]);

    // 2. Master Data Pull (On Load)
    useEffect(() => {
        if (isOnline && organizationId) {
            pullMasterData();
        }
    }, [organizationId, isOnline]);

    const pushPendingSales = async () => {
        setIsSyncing(true);
        const pendingSales = await db.sales.where('sync_status').equals('pending').toArray();

        if (pendingSales.length === 0) {
            setIsSyncing(false);
            return;
        }

        toast({ title: "Syncing...", description: `Uploading ${pendingSales.length} offline sales.` });

        // Parallel flush — idempotency key (sale.id) guarantees server-side dedup
        // if the same sale is retried after a partial failure.
        const results = await Promise.allSettled(
            pendingSales.map(async (sale) => {
                const { error } = await supabase
                    .schema('mandi')
                    .rpc('confirm_sale_transaction', {
                        p_organization_id: organizationId,
                        p_buyer_id: sale.contact_id,
                        p_sale_date: String(sale.sale_date).split('T')[0],
                        p_payment_mode: 'credit',
                        p_total_amount: sale.total_amount,
                        p_items: sale.items,
                        p_idempotency_key: sale.id,
                    });
                if (error) throw error;
                await db.sales.update(sale.id, { sync_status: 'synced' });
            })
        );

        const failed = results.filter(r => r.status === 'rejected');
        await Promise.all(
            pendingSales
                .filter((_, i) => results[i].status === 'rejected')
                .map(sale => {
                    console.error("Sync Failed for Sale", sale.id);
                    return db.sales.update(sale.id, { sync_status: 'failed' });
                })
        );

        if (failed.length > 0) {
            toast({ title: "Sync Partial", description: `${pendingSales.length - failed.length} uploaded, ${failed.length} failed — will retry.`, variant: "destructive" });
        } else {
            toast({ title: "Sync Complete", description: "All offline data uploaded." });
        }
        setIsSyncing(false);
    };

    const pullMasterData = async () => {
        // Simple overwrite strategy for now
        const { data: contacts } = await supabase
            .schema('mandi')
            .from('contacts')
            .select('id, name, type, city')
            .eq('organization_id', organizationId);

        if (contacts) {
            await db.contacts.bulkPut(contacts);
        }
    };

    return { isOnline, isSyncing };
}

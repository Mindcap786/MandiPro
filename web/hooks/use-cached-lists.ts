'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cacheGet, cacheSet, cacheIsStale } from '@/lib/data-cache';

/**
 * Custom hooks for data fetching with localized, session-safe caching.
 * Uses lib/data-cache under the hood to ensure instant loading.
 */

export function useCachedParties(orgId: string | undefined, type?: string) {
    const key = type ? `contacts_${type}` : 'contacts_all';
    const [data, setData] = useState<any[]>(() => orgId ? (cacheGet(key, orgId) || []) : []);
    const [loading, setLoading] = useState<boolean>(data.length === 0);

    useEffect(() => {
        if (!orgId) return;

        const fetchData = async () => {
            if (cacheIsStale(key, orgId) || !cacheGet(key, orgId)) {
                let query = supabase.from('contacts').select('*').eq('organization_id', orgId).eq('status', 'active');
                if (type) query = query.eq('contact_type', type);

                const { data: result } = await query;
                if (result) {
                    cacheSet(key, orgId, result);
                    setData(result);
                }
            } else {
                setData(cacheGet(key, orgId) || []);
            }
            setLoading(false);
        };

        fetchData();
        
        // Listen for smart-refresh
        const handleRefresh = () => fetchData();
        window.addEventListener('smart-refresh', handleRefresh);
        return () => window.removeEventListener('smart-refresh', handleRefresh);
    }, [orgId, type]);

    return { data, loading };
}

export function useCachedItems(orgId: string | undefined) {
    const key = 'items_all';
    const [data, setData] = useState<any[]>(() => orgId ? (cacheGet(key, orgId) || []) : []);
    const [loading, setLoading] = useState<boolean>(data.length === 0);

    useEffect(() => {
        if (!orgId) return;

        const fetchData = async () => {
            if (cacheIsStale(key, orgId) || !cacheGet(key, orgId)) {
                const { data: result } = await supabase.from('items').select('*').eq('organization_id', orgId).order('name');
                if (result) {
                    cacheSet(key, orgId, result);
                    setData(result);
                }
            } else {
                setData(cacheGet(key, orgId) || []);
            }
            setLoading(false);
        };

        fetchData();
        
        const handleRefresh = () => fetchData();
        window.addEventListener('smart-refresh', handleRefresh);
        return () => window.removeEventListener('smart-refresh', handleRefresh);
    }, [orgId]);

    return { data, loading };
}

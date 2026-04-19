'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { cacheGet, cacheSet, cacheIsStale, cacheDelete } from '@/lib/data-cache';

/**
 * Cached list hooks — stale-while-revalidate pattern.
 *
 * Every hook:
 *   1. Returns cached data synchronously on first render (zero flicker on revisit).
 *   2. Refetches in the background if the entry is stale for its tier.
 *   3. Listens to the `smart-refresh` window event to force a refresh.
 *   4. Exposes a `refresh()` callback to use after writes (busts the cache first).
 *
 * TTL is resolved from the cache key prefix inside lib/data-cache.ts:
 *   STATIC (24h) — contacts_, items_, units_, parties_, commodities_, locations_, employees_
 *   SEMI   (5m)  — stock_, cheques_, outstanding_, lots_, warehouse_, inventory_
 *   LIVE   (30s) — daybook_, dashboard, finance_summary_, trend_, activity_
 */

type QueryFn<T> = () => Promise<{ data: T[] | null; error?: any }>;

interface UseCachedResult<T> {
    data: T[];
    loading: boolean;
    error: any | null;
    refresh: () => Promise<void>;
}

function useCachedList<T = any>(
    cacheKey: string,
    orgId: string | undefined,
    queryFn: QueryFn<T>,
): UseCachedResult<T> {
    const [data, setData] = useState<T[]>(() => (orgId ? (cacheGet<T[]>(cacheKey, orgId) || []) : []));
    const [loading, setLoading] = useState<boolean>(() => data.length === 0);
    const [error, setError] = useState<any | null>(null);

    // Hold latest queryFn in a ref so effect deps stay stable (org-only).
    const queryFnRef = useRef(queryFn);
    queryFnRef.current = queryFn;

    const fetchNow = useCallback(async () => {
        if (!orgId) return;
        try {
            const { data: result, error: err } = await queryFnRef.current();
            if (err) { setError(err); return; }
            if (result) {
                cacheSet(cacheKey, orgId, result);
                setData(result);
                setError(null);
            }
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }, [cacheKey, orgId]);

    const refresh = useCallback(async () => {
        if (!orgId) return;
        cacheDelete(cacheKey, orgId);
        await fetchNow();
    }, [cacheKey, orgId, fetchNow]);

    useEffect(() => {
        if (!orgId) return;

        // Hydrate from cache
        const cached = cacheGet<T[]>(cacheKey, orgId);
        if (cached && cached.length) {
            setData(cached);
            setLoading(false);
        }

        // Revalidate if stale
        if (cacheIsStale(cacheKey, orgId)) {
            fetchNow();
        } else {
            setLoading(false);
        }

        // External invalidation hook
        const handleRefresh = () => fetchNow();
        window.addEventListener('smart-refresh', handleRefresh);
        return () => window.removeEventListener('smart-refresh', handleRefresh);
    }, [cacheKey, orgId, fetchNow]);

    return { data, loading, error, refresh };
}

// ── Concrete list hooks ────────────────────────────────────────────────────
// Each one is a thin wrapper around useCachedList with the right cache key
// and query. Selects are explicit to avoid bloated payloads.

export function useCachedParties(orgId: string | undefined, type?: string) {
    const key = type ? `contacts_${type}` : 'contacts_all';
    return useCachedList<any>(key, orgId, async () => {
        let q = supabase
            .from('contacts')
            .select('*')
            .eq('organization_id', orgId)
            .eq('status', 'active');
        if (type) q = q.eq('contact_type', type);
        return await q;
    });
}

export function useCachedItems(orgId: string | undefined) {
    return useCachedList<any>('items_all', orgId, async () =>
        await supabase
            .from('items')
            .select('*')
            .eq('organization_id', orgId)
            .order('name')
    );
}

/**
 * Farmers / suppliers list from mandi.contacts with contact_type='supplier'.
 * Used by: /farmers page.
 */
export function useCachedFarmers(orgId: string | undefined) {
    return useCachedList<any>('contacts_supplier', orgId, async () =>
        await supabase
            .schema('mandi')
            .from('contacts')
            .select('*')
            .eq('contact_type', 'supplier')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
    );
}

/**
 * Employees list. Used by: /employees page.
 */
export function useCachedEmployees(orgId: string | undefined) {
    return useCachedList<any>('employees_all', orgId, async () =>
        await supabase
            .schema('mandi')
            .from('employees')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
    );
}

/**
 * Storage locations / warehouse list. Used by: /warehouse page.
 */
export function useCachedWarehouses(orgId: string | undefined) {
    return useCachedList<any>('locations_storage', orgId, async () =>
        await supabase
            .schema('mandi')
            .from('storage_locations')
            .select('*')
            .eq('organization_id', orgId)
            .order('name')
    );
}

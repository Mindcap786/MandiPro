
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useFeature(key: string, orgId?: string) {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkFeature();
    }, [key, orgId]);

    const checkFeature = async () => {
        try {
            // Secure RPC Check
            const { data } = await supabase.rpc('check_feature_enabled', {
                p_key: key,
                p_org_id: orgId || null
            });
            setEnabled(!!data);
        } catch (e) {
            console.error(`Failed to check feature ${key}:`, e);
            setEnabled(false); // Fail closed
        } finally {
            setLoading(false);
        }
    };

    return { enabled, loading };
}

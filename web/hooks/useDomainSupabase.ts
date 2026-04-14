import { useMemo } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/database.types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Returns a globally memoized Supabase client scoped to the user's active domain schema (mandi or wholesale).
 */
export const useDomainSupabase = () => {
    const { profile } = useAuth();

    return useMemo(() => {
        // Default to mandi if unresolved, else map wholesaler to 'wholesale' schema
        const schema: 'mandi' = 'mandi';

        return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
            db: { schema }
        } as any);
    }, [profile?.business_domain]);
};

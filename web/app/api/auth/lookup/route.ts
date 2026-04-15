import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Server-side route using SERVICE ROLE to look up emails by username
export async function POST(request: Request) {
    try {
        const { username, identifier } = await request.json();
        const searchVal = identifier || username;

        if (!searchVal) {
            return NextResponse.json({ error: 'Identifier required' }, { status: 400 });
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Case-insensitive lookup for username, email, or full_name
        const { data: profiles, error } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('email')
            .or(`username.ilike.${searchVal},email.eq.${searchVal},full_name.ilike.${searchVal}`)
            .limit(1);

        const profile = profiles && profiles.length > 0 ? profiles[0] : null;

        if (error) throw error;
        
        if (!profile) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json({ email: profile.email });

    } catch (error: any) {
        console.error('[Auth Lookup] Error:', error.message);
        return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
    }
}

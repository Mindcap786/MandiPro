import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { orgId, updates } = body;

        if (!orgId) {
            return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
        }

        // Using service role key bypasses RLS and browser constraints
        const { error } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .update(updates)
            .eq('id', orgId);

        if (error) {
            console.error('[Branding Update DB Error]:', error);
            throw new Error(error.message);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[Branding Update Error]:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

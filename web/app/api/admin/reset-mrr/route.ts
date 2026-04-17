import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error } = await supabaseAdmin
        .schema('core')
        .from('subscriptions')
        .update({ mrr_amount: 0 })
        .neq('id', 'dummy'); // match all

    return NextResponse.json({ success: !error, error });
}

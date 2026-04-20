import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'reset_mrr');
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

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

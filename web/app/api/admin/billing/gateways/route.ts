import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
    const auth = await verifyAdminAccess(request, 'billing', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const { data, error } = await supabaseAdmin
            .schema('core')
            .from('payment_config')
            .select('*');

        if (error) throw error;
        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const auth = await verifyAdminAccess(request, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const body = await request.json();
        const { gateway, config, is_active } = body;

        if (!gateway) {
            return NextResponse.json({ error: 'Missing gateway name' }, { status: 400 });
        }

        // If this gateway is being activated, deactivate others first
        if (is_active) {
            await supabaseAdmin
                .schema('core')
                .from('payment_config')
                .update({ is_active: false })
                .neq('gateway', gateway);
        }

        // Upsert the config
        const { data, error } = await supabaseAdmin
            .schema('core')
            .from('payment_config')
            .upsert({ 
                gateway, 
                config, 
                is_active,
                updated_at: new Date().toISOString()
            }, { onConflict: 'gateway' })
            .select();

        if (error) throw error;
        return NextResponse.json({ message: 'Gateway config updated', data });
    } catch (e: any) {
        console.error('[Admin Gateways API] Update error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

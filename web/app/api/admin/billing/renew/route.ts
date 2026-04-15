import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { invalidateSubscriptionCache } from '@/lib/subscription-guard';
import { verifyAdminAccess } from '@/lib/admin-auth';

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
        const {
            organization_id,
            plan_id,
            billing_cycle,
            payment_amount,
            payment_gateway = 'manual'
        } = body;

        if (!organization_id) {
            return NextResponse.json({ error: 'Missing organization ID' }, { status: 400 });
        }

        // Use the database RPC for atomic, consistent renewal
        const { data, error } = await supabaseAdmin.rpc('process_subscription_renewal', {
            p_org_id: organization_id,
            p_payment_amount: payment_amount || null,
            p_payment_gateway: payment_gateway,
            p_billing_cycle: billing_cycle || null,
            p_plan_id: plan_id || null
        });

        if (error) throw error;

        // Bust subscription cache so next check reflects new state instantly
        invalidateSubscriptionCache(organization_id);

        return NextResponse.json({
            message: 'Subscription renewed successfully',
            ...data
        });
    } catch (e: any) {
        console.error('[Billing Renew API] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

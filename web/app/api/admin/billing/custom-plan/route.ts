import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const body = await req.json();
        const { 
            organization_id, 
            name, 
            price_monthly, 
            max_web_users, 
            max_mobile_users, 
            storage_gb 
        } = body;

        if (!organization_id || !name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Create the Custom Plan
        const { data: newPlan, error: planError } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .insert({
                name,
                display_name: `Custom: ${name}`,
                price_monthly,
                max_web_users,
                max_mobile_users,
                storage_gb_included: storage_gb,
                is_custom: true,
                tenant_id: organization_id,
                is_active: true
            })
            .select()
            .single();

        if (planError) throw planError;

        // 2. Update Organization Tier
        const { error: orgError } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .update({ subscription_tier: 'custom' })
            .eq('id', organization_id);

        if (orgError) throw orgError;

        // 3. Update or Create Subscription
        // First check if a subscription exists
        const { data: existingSub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id')
            .eq('organization_id', organization_id)
            .maybeSingle();

        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        if (existingSub) {
            const { error: subError } = await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update({
                    plan_id: newPlan.id,
                    mrr_amount: price_monthly,
                    status: 'active',
                    current_period_end: periodEnd,
                    next_invoice_date: periodEnd,
                    grace_period_ends_at: null,
                    suspended_at: null,
                    retry_count: 0
                })
                .eq('id', existingSub.id);

            if (subError) throw subError;
        } else {
            // Create fresh subscription
            const { error: subError } = await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .insert({
                    organization_id,
                    plan_id: newPlan.id,
                    mrr_amount: price_monthly,
                    status: 'active',
                    billing_cycle: 'monthly',
                    current_period_end: periodEnd,
                    next_invoice_date: periodEnd
                });

            if (subError) throw subError;
        }

        // Sync organization limits and status
        await supabaseAdmin
            .schema('core')
            .from('organizations')
            .update({
                status: 'active',
                is_active: true,
                max_web_users: max_web_users || 5,
                max_mobile_users: max_mobile_users || 5
            })
            .eq('id', organization_id);

        return NextResponse.json({ message: 'Custom plan created and assigned successfully', plan_id: newPlan.id });

    } catch (e: any) {
        console.error('Custom Plan Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/subscription/current
// Returns the full subscription state for the authenticated tenant
// Used by hooks/use-subscription.ts and billing screen

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
        if (userError || !user) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        // Get profile to find org_id
        const { data: profile } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('organization_id')
            .eq('id', user.id)
            .single();

        if (!profile?.organization_id) {
            return NextResponse.json({ error: 'No organization found' }, { status: 404 });
        }

        const orgId = profile.organization_id;

        // Use the new get_subscription_state function for complete data
        const { data: subState, error: stateError } = await supabaseAdmin.rpc(
            'get_subscription_state',
            { p_org_id: orgId }
        );

        if (stateError) {
            console.error('[subscription/current] RPC error:', stateError);
        }

        // Fetch raw subscription row for additional fields
        const { data: subscription } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select(`
                id, status, plan_id, billing_cycle, plan_interval,
                trial_starts_at, trial_ends_at, trial_converted,
                current_period_start, current_period_end, next_invoice_date,
                grace_period_start, grace_period_end, grace_period_ends_at,
                cancel_at_period_end, cancelled_at, cancellation_reason,
                mrr_amount, retry_count, last_payment_at,
                scheduled_plan_id, scheduled_change_at, admin_notes
            `)
            .eq('organization_id', orgId)
            .maybeSingle();

        // Fetch current plan details
        const planId = subscription?.plan_id;
        const { data: plan } = planId
            ? await supabaseAdmin.schema('core').from('app_plans').select('*').eq('id', planId).single()
            : { data: null };

        // Fetch recent invoices
        const { data: invoices } = await supabaseAdmin
            .schema('core')
            .from('saas_invoices')
            .select('id, invoice_number, amount, total, status, invoice_date, paid_at, billing_cycle, period_start, period_end')
            .eq('organization_id', orgId)
            .order('invoice_date', { ascending: false })
            .limit(12);

        // Current usage stats
        const { count: userCount } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('is_active', true);

        const { count: commodityCount } = await supabaseAdmin
            .schema('mandi')
            .from('commodities')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId);

        // This month's transaction count
        const thisMonthStart = new Date();
        thisMonthStart.setDate(1);
        thisMonthStart.setHours(0, 0, 0, 0);

        const { count: txCount } = await supabaseAdmin
            .schema('mandi')
            .from('lots')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .gte('created_at', thisMonthStart.toISOString());

        // Get organization status
        const { data: org } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('name, status, subscription_tier, is_active, trial_ends_at, grace_period_ends_at, max_web_users, max_mobile_users')
            .eq('id', orgId)
            .single();

        return NextResponse.json({
            org_id: orgId,
            state: subState || null,
            subscription: subscription || null,
            plan: plan || null,
            org: org || null,
            usage: {
                users:        userCount || 0,
                commodities:  commodityCount || 0,
                transactions: txCount || 0,
            },
            limits: {
                max_users:        org?.max_web_users || plan?.max_web_users || 2,
                max_commodities:  plan?.max_commodities || 50,
                max_transactions: plan?.max_transactions_per_month || 500,
            },
            invoices: invoices || [],
        });

    } catch (e: any) {
        console.error('[subscription/current] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const body = await req.json();
        const { organization_id, tier, billing_cycle, expiry_date, grace_period_ends_at, is_downgrade, max_web_users, max_mobile_users, rbac_matrix } = body;

        if (!organization_id || !tier) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Fetch the Plan details to get default limits
        const { data: plan, error: planErr } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('*')
            .ilike('name', tier)
            .single();

        if (planErr || !plan) throw new Error(`Selected plan tier '${tier}' not found`);

        // Use specifically overridden limits from the UI if provided, otherwise fallback to standard plan limits
        const maxWeb = max_web_users !== undefined ? max_web_users : (plan.max_web_users || 0);
        const maxMobile = max_mobile_users !== undefined ? max_mobile_users : (plan.max_mobile_users || 0);

        // 2. Update the Organization Subscription and Limits
        const updateData: any = {
            subscription_tier: tier,
            trial_ends_at: expiry_date,
            max_web_users: maxWeb,
            max_mobile_users: maxMobile,
        };

        // Persist grace period on org table directly for easy access
        if (grace_period_ends_at !== undefined) {
            updateData.grace_period_ends_at = grace_period_ends_at || null;
        }

        // Include rbac_matrix if provided
        if (rbac_matrix) {
            updateData.rbac_matrix = rbac_matrix;
        }

        const { error: orgError } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .update(updateData)
            .eq('id', organization_id);

        if (orgError) throw orgError;

        // 2b. Sync the subscriptions table with updated plan details
        const subUpdateData: any = {
            plan_id: plan.id,
            mrr_amount: billing_cycle === 'yearly'
                ? (plan.price_yearly || plan.price_monthly * 12)
                : plan.price_monthly,
            status: 'active'
        };

        if (billing_cycle) subUpdateData.billing_cycle = billing_cycle;
        if (expiry_date) {
            subUpdateData.current_period_end = expiry_date;
            subUpdateData.next_invoice_date = expiry_date;
        }
        if (grace_period_ends_at) {
            subUpdateData.grace_period_ends_at = grace_period_ends_at;
        }

        // Upsert: update existing or create new subscription
        const { data: existingSub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id')
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (existingSub) {
            const { error: subErr } = await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update(subUpdateData)
                .eq('id', existingSub.id);
            if (subErr) throw subErr;
        } else {
            const { error: subErr } = await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .insert({
                    organization_id,
                    ...subUpdateData,
                    billing_cycle: billing_cycle || 'monthly',
                    current_period_end: expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    next_invoice_date: expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                });
            if (subErr) throw subErr;
        }

        // 3. Strict Compliance: Enforcement of limits if necessary
        const { data: profiles, error: profileErr } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('id, role, user_type')
            .eq('organization_id', organization_id)
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (profileErr) throw profileErr;

        if (profiles) {
            // Separate into Web and Mobile users
            const webUsers = profiles.filter(p => p.user_type !== 'mobile' || !p.user_type);
            const mobileUsers = profiles.filter(p => p.user_type === 'mobile');

            const deactivateIds: string[] = [];

            // Enforce Web Limits (Strictly keep the first 'maxWeb' users, ensuring Tenant Admin is protected)
            if (maxWeb >= 0 && webUsers.length > maxWeb) {
                // Find all excess web users, prioritizing keeping the Tenant Admin
                const toKeep = webUsers.slice(0, maxWeb);
                const toDeactivate = webUsers.slice(maxWeb);
                deactivateIds.push(...toDeactivate.map(u => u.id));
            }

            // Enforce Mobile Limits
            if (maxMobile >= 0 && mobileUsers.length > maxMobile) {
                const toDeactivate = mobileUsers.slice(maxMobile);
                deactivateIds.push(...toDeactivate.map(u => u.id));
            }

            if (deactivateIds.length > 0) {
                const { error: deactiveErr } = await supabaseAdmin
                    .schema('core')
                    .from('profiles')
                    .update({ is_active: false })
                    .in('id', deactivateIds);
                
                if (deactiveErr) throw deactiveErr;
            }
        }

        return NextResponse.json({ message: 'Subscription updated and compliance enforced' });

    } catch (e: any) {
        console.error('Subscription Update Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

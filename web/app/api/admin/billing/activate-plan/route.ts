import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { NextRequest, NextResponse } from 'next/server';
import { invalidateSubscriptionCache } from '@/lib/subscription-guard';

// POST: Super admin / platform admin activates any plan for any tenant
// Supports: standard plans, custom plans, custom expiry dates
// Automatically syncs: subscription, organization, limits, modules, invoices, alerts
export async function POST(request: NextRequest) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        // Verify admin access (super_admin, platform_admin, or finance_admin)
        const auth = await verifyAdminAccess(request, 'billing', 'manage');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const body = await request.json();
        const {
            organization_id,
            plan_id,
            billing_cycle = 'monthly',
            custom_expiry,
            notes
        } = body;

        if (!organization_id || !plan_id) {
            return NextResponse.json(
                { error: 'organization_id and plan_id are required' },
                { status: 400 }
            );
        }

        // Validate organization exists
        const { data: org, error: orgErr } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('id, name, status')
            .eq('id', organization_id)
            .single();

        if (orgErr || !org) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        // Validate plan exists and is active
        const { data: plan, error: planErr } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('id, name, display_name, is_active')
            .eq('id', plan_id)
            .single();

        if (planErr || !plan) {
            return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
        }

        if (!plan.is_active) {
            return NextResponse.json({ error: 'Plan is not active' }, { status: 400 });
        }

        // Use database RPC for atomic activation
        const { data, error } = await supabaseAdmin.rpc('activate_plan_for_tenant', {
            p_org_id: organization_id,
            p_plan_id: plan_id,
            p_billing_cycle: billing_cycle,
            p_custom_expiry: custom_expiry || null,
            p_admin_notes: notes || `Activated by admin: ${auth.profile?.full_name || 'Unknown'}`
        });

        if (error) throw error;

        // Bust subscription cache so next check reflects new state instantly
        invalidateSubscriptionCache(organization_id);

        // Log admin audit
        await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
            admin_id: auth.profile?.id,
            action_type: 'PLAN_ACTIVATED',
            module: 'billing',
            target_id: organization_id,
            before_data: { org_name: org.name, previous_status: org.status },
            after_data: { plan_name: plan.display_name, billing_cycle, ...data }
        });

        return NextResponse.json({
            success: true,
            message: `Plan "${plan.display_name}" activated for "${org.name}"`,
            ...data
        });

    } catch (e: any) {
        console.error('[Admin Activate Plan] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET: List all available plans for activation (including custom plans)
export async function GET(request: NextRequest) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const auth = await verifyAdminAccess(request, 'billing', 'read');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { searchParams } = new URL(request.url);
        const orgId = searchParams.get('organization_id');

        // Get all active plans
        let query = supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        // If org specified, also include custom plans for that tenant
        if (orgId) {
            query = supabaseAdmin
                .schema('core')
                .from('app_plans')
                .select('*')
                .eq('is_active', true)
                .or(`is_custom.eq.false,tenant_id.eq.${orgId}`)
                .order('sort_order', { ascending: true });
        }

        const { data: plans, error } = await query;
        if (error) throw error;

        return NextResponse.json(plans);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

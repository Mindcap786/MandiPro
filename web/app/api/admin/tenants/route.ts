import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

// Server-side route that uses the SERVICE ROLE KEY to bypass RLS
// This allows the super admin to see ALL organizations (not just their own)
export async function GET(request: NextRequest) {
    const auth = await verifyAdminAccess(request, 'tenants', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { searchParams } = new URL(request.url);
    const shouldSync = searchParams.get('sync') === 'true';

    // 1. Trigger Lifecycle & Billing (Optional manual override)
    if (shouldSync) {
        try {
            await Promise.all([
                supabaseAdmin.rpc('manage_tenant_lifecycle'),
                supabaseAdmin.rpc('generate_recurring_invoices')
            ]);
        } catch (e) {
            console.error('Manual sync failed:', e);
        }
    }

    // 2. Fetch all organizations
    const { data: orgs, error: orgError } = await supabaseAdmin
        .schema('core')
        .from('organizations')
        .select('id, name, subscription_tier, is_active, created_at, tenant_type, settings')
        .order('created_at', { ascending: false });

    if (orgError) {
        console.error('[Admin Tenants API] Org fetch error:', orgError);
        return NextResponse.json({ error: orgError.message }, { status: 500 });
    }

    // 3. Fetch subscriptions via core.organization_subscriptions (correct table/schema)
    const { data: subscriptions } = await supabaseAdmin
        .schema('core')
        .from('organization_subscriptions')
        .select('organization_id, status, current_period_end, trial_ends_at, plan_id');

    const subMap: Record<string, any> = {};
    for (const sub of subscriptions || []) {
        subMap[sub.organization_id] = sub;
    }

    // 4. Fetch profiles for owner lookup
    const { data: profiles } = await supabaseAdmin
        .schema('core')
        .from('profiles')
        .select('id, organization_id, role, full_name, email');

    const profileList: any[] = profiles || [];

    // 5. Find the primary owner for each org and flatten subscription data
    const processed = (orgs || []).map((org: any) => {
        const orgProfiles = profileList.filter((p: any) => p.organization_id === org.id);
        const owner =
            orgProfiles.find((p: any) => p.role === 'tenant_admin') ||
            orgProfiles.find((p: any) => p.role === 'owner') ||
            orgProfiles[0] ||
            null;

        const sub = subMap[org.id];
        const status = sub?.status || (org.is_active ? 'active' : 'suspended');
        const trial_ends_at = sub?.trial_ends_at || null;
        const current_period_end = sub?.current_period_end || null;

        return {
            ...org,
            owner,
            profiles: orgProfiles,
            status,
            trial_ends_at,
            current_period_end,
            subscription_tier: org.subscription_tier || 'basic',
        };
    });

    return NextResponse.json(processed);
}

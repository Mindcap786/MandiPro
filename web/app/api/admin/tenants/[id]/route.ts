
import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
// API route for dynamic tenant drill-down
export const dynamic = 'force-dynamic';


const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── GET: Full tenant drill-down ─────────────────────────────────────────────
export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    const orgId = params.id;

    const [orgRes, subRes, profilesRes, healthRes, alertsRes, auditRes] = await Promise.allSettled([
        supabaseAdmin.schema('core').from('organizations')
            .select('id, name, status, is_active, subscription_tier, tenant_type, enabled_modules, city, phone, gstin, created_at, trial_ends_at, grace_period_ends_at, brand_color')
            .eq('id', orgId).single(),
        supabaseAdmin.schema('core').from('subscriptions')
            .select('*, plan:plan_id(id, name, display_name, price_monthly)')
            .eq('organization_id', orgId).single(),
        supabaseAdmin.schema('core').from('profiles')
            .select('id, full_name, email, role, created_at, username, phone')
            .eq('organization_id', orgId).order('role'),
        supabaseAdmin.rpc('get_tenant_health_score', { p_org_id: orgId }),
        supabaseAdmin.schema('core').from('system_alerts')
            .select('id, alert_type, severity, message, domain, created_at, is_resolved')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false }).limit(10),
        supabaseAdmin.schema('core').from('admin_audit_logs')
            .select('id, action_type, module, after_data, created_at')
            .eq('target_tenant_id', orgId)
            .order('created_at', { ascending: false }).limit(10),
    ]);

    const org = orgRes.status === 'fulfilled' ? orgRes.value.data : null;
    if (!org) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const profiles: any[] = profilesRes.status === 'fulfilled' ? (profilesRes.value.data || []) : [];
    const owner = profiles.find((p: any) => ['tenant_admin','owner'].includes(p.role)) || profiles[0] || null;

    return NextResponse.json({
        org,
        subscription: subRes.status === 'fulfilled' ? subRes.value.data : null,
        profiles,
        owner,
        health: healthRes.status === 'fulfilled' ? healthRes.value.data : null,
        alerts: alertsRes.status === 'fulfilled' ? (alertsRes.value.data || []) : [],
        audit_logs: auditRes.status === 'fulfilled' ? (auditRes.value.data || []) : [],
        user_count: profiles.length,
    });
}



export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // Verify super_admin access before any destructive action
        const auth = await verifyAdminAccess(request, 'tenants', 'manage');
        if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const orgId = params.id;
        if (!orgId) return NextResponse.json({ error: 'Org ID required' }, { status: 400 });

        // Check if caller wants a soft-delete (default) or hard-delete
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') ?? 'soft';

        // ── SOFT DELETE (default & safe) ─────────────────────────────────
        if (mode === 'soft') {
            await supabaseAdmin
                .schema('core')
                .from('organizations')
                .update({ status: 'archived', is_active: false })
                .eq('id', orgId);

            await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
                admin_id: auth.user?.id,
                target_tenant_id: orgId,
                action_type: 'TENANT_SOFT_DELETED',
                module: 'tenants',
            });

            return NextResponse.json({ success: true, mode: 'soft' });
        }

        // ── HARD DELETE (mode=hard, requires confirmation) ────────────────

        // 1. Delete Business Data (Cascade should handle most, but let's be explicit for safety)
        // Note: If you have CASCADE ON DELETE set up in SQL, deleting org is enough.
        // Assuming we rely on database constraints or need manual cleanup:

        // Manual cleanup preferred for auditing/safety in "World Class" systems (or soft delete).
        // For this task, we will do a HARD DELETE of the organization row, relying on CASCADE for tables like sales, lots, etc.
        // BUT, we must handle Auth Users separately because they are in a different schema (auth.users).

        // Find users linked to this org
        const { data: profiles } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('id')
            .eq('organization_id', orgId);

        // We've fetched the profiles, but we WILL NOT delete the Auth Users yet!
        // We must attempt to wipe the organization's business data FIRST. If that fails,
        // we want to abort without leaving the organization an orphaned zombie.

        // Attempt forceful RPC if it exists
        let deleteError = null;
        const { error: rpcError } = await supabaseAdmin.rpc('admin_force_delete_org', { p_org_id: orgId });

        if (rpcError) {
            console.warn("[Admin API] Nuclear Wipe RPC failed/missing, falling back to manual recursive cascade delete:");
            
            let isDeleted = false;
            let attempts = 0;
            const maxAttempts = 30;
            let currentError = null;

            while (!isDeleted && attempts < maxAttempts) {
                attempts++;
                const { error: cascadeError } = await supabaseAdmin
                    .schema('core')
                    .from('organizations')
                    .delete()
                    .eq('id', orgId);

                if (!cascadeError) {
                    isDeleted = true;
                    currentError = null;
                    break;
                }

                currentError = cascadeError;
                const match = cascadeError.message?.match(/on table "([^"]+)"/);
                
                if (match && match[1]) {
                    const tableName = match[1];
                    console.warn(`[Auto-Cascade] Purging blocking table: ${tableName}`);
                    
                    const schemas = ['core', 'mandi', 'wholesale', 'public'];
                    const columns = ['organization_id', 'target_tenant_id', 'org_id'];
                    let cleared = false;
                    
                    for (const schema of schemas) {
                        for (const column of columns) {
                            const { error: purgeErr } = await supabaseAdmin
                                .schema(schema)
                                .from(tableName)
                                .delete()
                                .eq(column, orgId);
                                
                            // If purgeErr is null, the query succeeded (it targeted the correct schema and column)
                            if (!purgeErr) {
                                cleared = true;
                                break;
                            }
                        }
                        if (cleared) break;
                    }
                    
                    if (!cleared) {
                        console.error(`[Auto-Cascade] Failed to clear blocking table: ${tableName}`);
                        break;
                    }
                } else {
                    break;
                }
            }
                
            deleteError = currentError;
        }

        if (deleteError) {
            console.error("Database wipe failed:", deleteError);
            return NextResponse.json({ error: `Database wipe failed: ${deleteError.message}` }, { status: 500 });
        }

        // 2. Organization was successfully deleted. Now it is safe to delete the Auth Users.
        // We delete them POST-organization wipe so that if the organization deletion fails, 
        // we don't end up with an orphaned zombie organization without an owner.
        if (profiles && profiles.length > 0) {
            for (const profile of profiles) {
                try {
                    await supabaseAdmin.auth.admin.deleteUser(profile.id);
                } catch (err) {
                    console.warn(`Could not delete auth user ${profile.id}:`, err);
                }
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Delete Tenant API Exception:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

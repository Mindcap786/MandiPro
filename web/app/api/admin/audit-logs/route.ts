import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'audit_logs', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch admin audit logs with joined org name
    const { data: logs, error } = await supabaseAdmin
        .schema('core')
        .from('admin_audit_logs')
        .select(`
            id, admin_id, action_type, module, before_data, after_data,
            ip_address, user_agent, created_at,
            target_org:target_tenant_id (id, name)
        `)
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        console.error('[Audit Logs API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with admin email from auth.users via profiles
    const adminIds = Array.from(new Set((logs || []).map((l: any) => l.admin_id).filter(Boolean)));
    let profiles: any[] = [];
    if (adminIds.length > 0) {
        const { data: profs } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('id, email, full_name')
            .in('id', adminIds);
        profiles = profs || [];
    }

    const profileMap = Object.fromEntries(profiles.map((p: any) => [p.id, p]));

    const enriched = (logs || []).map((log: any) => ({
        ...log,
        actor: profileMap[log.admin_id] || null,
    }));

    return NextResponse.json(enriched);
}

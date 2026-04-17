import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'security', 'read');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    const supabaseAdmin = access.supabaseAdmin!;

    const { data: sessions, error } = await supabaseAdmin.rpc('get_active_sessions');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'security', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;

    const body = await req.json();
    const { action, session_id, user_id, organization_id } = body;

    let auditDetails = {};
    if (action === 'terminate_session' && session_id) {
        const { error } = await supabaseAdmin.schema('core').rpc('admin_terminate_session', { p_session_id: session_id });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        auditDetails = { terminated_session: session_id };
    } else if (action === 'terminate_user' && user_id) {
        if (user_id === actingAdmin.id) return NextResponse.json({ error: 'Cannot force logout yourself' }, { status: 403 });
        const { error } = await supabaseAdmin.schema('core').rpc('admin_terminate_user_sessions', { p_user_id: user_id });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        auditDetails = { terminated_user: user_id };
    } else if (action === 'terminate_tenant' && organization_id) {
        const { error } = await supabaseAdmin.schema('core').rpc('admin_force_logout_tenant', { p_org_id: organization_id });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        auditDetails = { terminated_tenant: organization_id };
    } else {
        return NextResponse.json({ error: 'Invalid action or missing ID' }, { status: 400 });
    }

    await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
        action_type: 'SESSION_TERMINATED',
        module: 'security',
        before_data: { acting_admin: actingAdmin.email, action },
        after_data: auditDetails
    });

    return NextResponse.json({ success: true, message: `Action ${action} executed` });
}

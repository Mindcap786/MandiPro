import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
// Static export: API routes must declare generateStaticParams for dynamic segments
export const dynamic = 'force-static';
export async function generateStaticParams() { return []; }


export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const access = await verifyAdminAccess(req, 'admins', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;
    const targetId = params.id;

    const body = await req.json();
    const { action, role } = body; // action can be 'lock', 'unlock', 'suspend', 'reactivate', 'change_role'

    // Prevent self-lockout
    if (targetId === actingAdmin.id && ['lock', 'suspend', 'change_role'].includes(action)) {
        return NextResponse.json({ error: 'Cannot perform this action on your own account' }, { status: 403 });
    }

    // Protection Check
    const { data: targetProfile } = await supabaseAdmin.schema('core').from('profiles').select('email, role').eq('id', targetId).single();
    if (!targetProfile) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    if (targetProfile.role === 'super_admin' && actingAdmin.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only Super Admins can manage other Super Admins' }, { status: 403 });
    }

    let updateData: any = {};
    let auditAction = '';

    switch (action) {
        case 'lock':
            updateData = { admin_status: 'locked', locked_until: new Date(Date.now() + 86400000).toISOString() }; 
            auditAction = 'ADMIN_LOCKED';
            break;
        case 'unlock':
            updateData = { admin_status: 'active', failed_login_attempts: 0, locked_until: null };
            auditAction = 'ADMIN_UNLOCKED';
            break;
        case 'suspend':
            updateData = { admin_status: 'suspended' };
            auditAction = 'ADMIN_SUSPENDED';
            break;
        case 'reactivate':
            updateData = { admin_status: 'active', failed_login_attempts: 0, locked_until: null };
            auditAction = 'ADMIN_REACTIVATED';
            break;
        case 'change_role':
            if (!role) return NextResponse.json({ error: 'Missing role' }, { status: 400 });
            if (role === 'super_admin' && actingAdmin.role !== 'super_admin') {
                return NextResponse.json({ error: 'Cannot elevate to super_admin' }, { status: 403 });
            }
            updateData = { role };
            auditAction = 'ADMIN_ROLE_CHANGED';
            break;
        case 'update_rbac':
            if (!body.rbac_matrix) return NextResponse.json({ error: 'Missing rbac_matrix' }, { status: 400 });
            updateData = { rbac_matrix: body.rbac_matrix };
            auditAction = 'ADMIN_RBAC_UPDATED';
            break;
        default:
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }


    const { error } = await supabaseAdmin.schema('core').from('profiles').update(updateData).eq('id', targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Revoke sessions immediately if locking or suspending
    if (['lock', 'suspend'].includes(action)) {
        // We update the session_version to force logout in middleware
        await supabaseAdmin.schema('core').from('profiles').update({ session_version: Math.floor(Date.now() / 1000) }).eq('id', targetId);
    }

    await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
        action_type: auditAction,
        module: 'admins',
        before_data: { acting_admin: actingAdmin.email, target_admin: targetProfile.email, role: targetProfile.role },
        after_data: updateData
    });

    return NextResponse.json({ success: true, message: `Admin ${action} successful` });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const access = await verifyAdminAccess(req, 'admins', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;
    const targetId = params.id;

    if (targetId === actingAdmin.id) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 403 });

    const { data: targetProfile } = await supabaseAdmin.schema('core').from('profiles').select('email, role').eq('id', targetId).single();
    if (!targetProfile) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });

    if (targetProfile.role === 'super_admin' && actingAdmin.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only Super Admins can delete Super Admins' }, { status: 403 });
    }

    // Delete Auth User (cascades to profiles)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
        action_type: 'ADMIN_DELETED',
        module: 'admins',
        before_data: { acting_admin: actingAdmin.email, target_admin: targetProfile.email }
    });

    return NextResponse.json({ success: true });
}

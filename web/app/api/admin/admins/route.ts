import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'admins', 'read');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    
    // We expect access.supabaseAdmin to be present if authorized
    const supabaseAdmin = access.supabaseAdmin!;

    const { data: admins, error } = await supabaseAdmin.schema('core').from('profiles')
        .select(`
            id, full_name, email, role, admin_status, 
            last_login_ip, last_login_time, failed_login_attempts, locked_until, created_at
        `)
        .in('role', ['super_admin', 'platform_admin', 'finance_admin', 'support_admin', 'operations_admin', 'read_only'])
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ admins });
}

export async function POST(req: NextRequest) {
    const access = await verifyAdminAccess(req, 'admins', 'manage');
    if (!access.authorized) return NextResponse.json({ error: access.error }, { status: access.status });
    const supabaseAdmin = access.supabaseAdmin!;
    const actingAdmin = access.profile;

    const body = await req.json();
    const { email, full_name, role, password } = body;

    if (!email || !role || !password) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Protection Check
    if (role === 'super_admin' && actingAdmin.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only Super Admins can create other Super Admins' }, { status: 403 });
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim(),
        password,
        email_confirm: true,
        user_metadata: { role, full_name }
    });

    if (authError || !authUser.user) {
        return NextResponse.json({ error: authError?.message || 'Failed to create auth user' }, { status: 400 });
    }

    // Profile table trigger might exist, so we UPSERT
    const { error: profileError } = await supabaseAdmin.schema('core').from('profiles')
        .upsert({
            id: authUser.user.id,
            email: email.trim(),
            full_name,
            role,
            admin_status: 'active',
            is_active: true
        });

    if (profileError) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    await supabaseAdmin.schema('core').from('admin_audit_logs').insert({
        action_type: 'ADMIN_CREATED',
        module: 'admins',
        before_data: { acting_admin: actingAdmin.email },
        after_data: { created_admin: email, role }
    });

    return NextResponse.json({ success: true, admin: authUser.user });
}

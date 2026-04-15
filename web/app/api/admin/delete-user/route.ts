import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { NextRequest, NextResponse } from 'next/server';

// Server-side route that uses the SERVICE ROLE KEY to perform administrative actions
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userId, organizationId } = body;

        // 0. CHECK ACCESS
        const auth = await verifyAdminAccess(request, 'users', 'delete');
        
        // If not super_admin, check if they are a tenant_admin for their own org
        if (auth.error) {
            const authHeader = request.headers.get('Authorization');
            const token = authHeader?.replace('Bearer ', '');
            if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            
            const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
            if (userError || !user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

            // Check if the user ID being deleted belongs to the same organization
            const { data: targetProfile } = await supabaseAdmin.schema('core').from('profiles').select('organization_id').eq('id', userId).single();
            const { data: adminProfile } = await supabaseAdmin.schema('core').from('profiles').select('organization_id, role, admin_status').eq('id', user.id).single();

            if (!adminProfile) return NextResponse.json({ error: 'Admin profile not found' }, { status: 403 });

            // Enforce Account Status Limits
            if (adminProfile.admin_status === 'suspended') return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
            if (adminProfile.admin_status === 'locked') return NextResponse.json({ error: 'Account locked' }, { status: 403 });

            if (adminProfile.role !== 'tenant_admin' && adminProfile.role !== 'company_admin') {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }

            if (targetProfile?.organization_id !== adminProfile.organization_id || organizationId !== adminProfile.organization_id) {
                return NextResponse.json({ error: 'Forbidden: Cross-tenant deletion blocked' }, { status: 403 });
            }
        }


        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // 1. Verify Requesting User (Optional: Add more strict checks if needed)
        // For now, we assume the middleware or the calling component handles standard auth
        // But we could verify the organizationId matches the user being deleted for extra safety

        console.log(`[Admin Delete User] Revoking access for user ${userId} in org ${organizationId}`);

        // 2. Clear linkage in mandi.employees (Preserve the HR record, just remove system access)
        const { error: unlinkError } = await supabaseAdmin
            .schema('mandi')
            .from('employees')
            .update({ user_id: null })
            .eq('user_id', userId);

        if (unlinkError) {
            console.error('[Admin Delete User] Failed to unlink employee:', unlinkError);
            // We continue anyway to ensure the user is actually deleted
        }

        // 3. Delete from core.profiles
        const { error: profileError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (profileError) {
            console.error('[Admin Delete User] Failed to delete profile:', profileError);
        }

        // 4. Permanently delete from Auth (Bypasses recycling/grace periods)
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (authError) {
            console.error('[Admin Delete User] Auth deletion failed:', authError);
            return NextResponse.json({ error: authError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'User access revoked and account deleted.' });

    } catch (e: any) {
        console.error('[Admin Delete User] Unexpected error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

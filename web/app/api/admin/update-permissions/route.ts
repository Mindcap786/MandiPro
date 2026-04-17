
import { createClient } from '@supabase/supabase-js';
import { verifyAdminAccess } from '@/lib/admin-auth';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { targetUserId, rbacMatrix, userType } = body;

        if (!targetUserId) {
            return NextResponse.json({ error: 'Target User ID is required' }, { status: 400 });
        }

        // 1. VERIFY REQUESTER ACCESS
        const auth = await verifyAdminAccess(request, 'users', 'update');
        
        // If not super_admin, check if they are a tenant_admin for their own org
        if (auth.error) {
            const authHeader = request.headers.get('Authorization');
            const token = authHeader?.replace('Bearer ', '');
            if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            
            const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
            if (userError || !user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

            // Fetch Requester Profile
            const { data: requesterProfile } = await supabaseAdmin
                .schema('core')
                .from('profiles')
                .select('organization_id, role, admin_status')
                .eq('id', user.id)
                .single();
            
            if (!requesterProfile) return NextResponse.json({ error: 'Admin profile not found' }, { status: 403 });

            // Enforce Account Status Limits
            if (requesterProfile.admin_status === 'suspended') return NextResponse.json({ error: 'Account suspended' }, { status: 403 });

            // STRICT ROLE CHECK: Only tenant_admin or owner can manage permissions
            if (requesterProfile.role !== 'tenant_admin' && requesterProfile.role !== 'owner' && requesterProfile.role !== 'company_admin') {
                return NextResponse.json({ error: 'Forbidden: Only administrators can manage team permissions.' }, { status: 403 });
            }

            // Fetch Target User Profile to verify they belong to the same Org
            const { data: targetProfile } = await supabaseAdmin
                .schema('core')
                .from('profiles')
                .select('organization_id, role')
                .eq('id', targetUserId)
                .single();

            if (!targetProfile) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

            // STRICT: tenant_admin and owner accounts are immutable — no one can edit their permissions
            if (targetProfile.role === 'tenant_admin' || targetProfile.role === 'owner') {
                return NextResponse.json({ error: 'Forbidden: Admin account permissions are protected and cannot be modified.' }, { status: 403 });
            }

            if (requesterProfile.organization_id !== targetProfile.organization_id) {
                return NextResponse.json({ error: 'Forbidden: Cross-tenant permission management blocked' }, { status: 403 });
            }
        }

        // 2. Perform Update via Service Role — core.profiles
        const { error: updateError } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .update({ 
                rbac_matrix: rbacMatrix,
                user_type: userType || 'web'
            })
            .eq('id', targetUserId);

        if (updateError) throw updateError;

        // 3. SYNC to mandi.employees — the sidebar reads employeeMatrix from HERE.
        // Without this sync, old false-values in employees.rbac_matrix block access
        // even after profiles.rbac_matrix is updated.
        const { error: empUpdateError } = await supabaseAdmin
            .schema('mandi')
            .from('employees')
            .update({ rbac_matrix: rbacMatrix })
            .eq('user_id', targetUserId);

        // Non-fatal: the employee row may not exist (e.g., mobile-only user)
        if (empUpdateError) {
            console.warn('[Permissions] Could not sync employee matrix:', empUpdateError.message);
        }

        return NextResponse.json({
            success: true,
            message: 'Permissions updated successfully. Ask the user to refresh their browser for instant effect.'
        });

    } catch (error: any) {
        console.error('Permission update failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

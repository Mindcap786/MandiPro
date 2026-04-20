import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const auth = await verifyAdminAccess(request, 'employees', 'delete');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { employeeId, organizationId } = await request.json();

        if (!employeeId) {
            return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
        }

        console.log(`[Admin Delete Employee] Purging employee ${employeeId} in org ${organizationId}`);

        // 1. Fetch employee to check for linked user_id
        const { data: employee, error: fetchError } = await supabaseAdmin
            .schema('mandi')
            .from('employees')
            .select('user_id, name')
            .eq('id', employeeId)
            .single();

        if (fetchError || !employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        // 2. If there is a linked user, purge the Auth/Profile account first
        if (employee.user_id) {
            console.log(`[Admin Delete Employee] Revoking access for linked user ${employee.user_id}`);
            
            // Delete from core.profiles
            await supabaseAdmin
                .schema('core')
                .from('profiles')
                .delete()
                .eq('id', employee.user_id);

            // Delete from Auth
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(employee.user_id);
            if (authError) {
                console.warn('[Admin Delete Employee] Auth deletion failed (might already be gone):', authError.message);
            }
        }

        // 3. Delete from mandi.employees
        const { error: deleteError } = await supabaseAdmin
            .schema('mandi')
            .from('employees')
            .delete()
            .eq('id', employeeId);

        if (deleteError) {
            console.error('[Admin Delete Employee] Failed to delete record:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            message: `Employee ${employee.name} and all associated access have been purged.` 
        });

    } catch (e: any) {
        console.error('[Admin Delete Employee] Unexpected error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

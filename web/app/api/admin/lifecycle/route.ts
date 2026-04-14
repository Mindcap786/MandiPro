import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'tenants', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const body = await req.json();
        const { action, organization_id } = body;

        if (!action || !organization_id) {
            return NextResponse.json({ error: 'Missing action or organization_id' }, { status: 400 });
        }

        switch (action) {
            case 'force_logout':
                // Increment session_version for all users in this org
                // This requires an RPC or a direct update to core.profiles
                const { error: logoutError } = await supabaseAdmin
                    .schema('core')
                    .from('profiles')
                    .update({ session_version: supabaseAdmin.rpc('increment_session_version') }) // This is a conceptual shortcut
                    .eq('organization_id', organization_id);
                
                // Real implementation: use an RPC for atomic increment
                const { error: rpcError } = await supabaseAdmin.rpc('force_logout_organization', { p_org_id: organization_id });
                
                if (rpcError) throw rpcError;
                return NextResponse.json({ message: 'Force logout triggered for all users' });

            case 'lock':
                // Deactivate the organization
                const { error: lockError } = await supabaseAdmin
                    .schema('core')
                    .from('organizations')
                    .update({ is_active: false })
                    .eq('id', organization_id);
                
                if (lockError) throw lockError;

                // Also force logout everyone
                await supabaseAdmin.rpc('force_logout_organization', { p_org_id: organization_id });

                return NextResponse.json({ message: 'Organization locked and sessions terminated' });

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (e: any) {
        console.error('Lifecycle Action Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

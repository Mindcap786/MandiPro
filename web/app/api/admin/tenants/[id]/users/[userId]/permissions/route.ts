import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';
// Static export: nested dynamic API routes need combined params shape
export const dynamic = 'force-static';
// Returns empty array satisfying Next.js static export requirement for both [id] and [userId]
export async function generateStaticParams(): Promise<{ id: string; userId: string }[]> { return []; }


const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string, userId: string } }
) {
    try {
        const auth = await verifyAdminAccess(request, 'permissions', 'write');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { rbac_matrix } = await request.json();
        const { id: orgId, userId } = params;

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin.schema('core')
            .from('profiles')
            .update({ rbac_matrix })
            .eq('id', userId)
            .eq('organization_id', orgId); // Safety check: user must belong to this org

        if (error) throw error;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('User Permissions API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

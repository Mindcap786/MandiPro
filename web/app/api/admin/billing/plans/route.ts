import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { invalidateCache } from '@/lib/server-cache';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function POST(request: NextRequest) {
    const auth = await verifyAdminAccess(request, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const { id, ...updatePayload } = await request.json();

        if (!id) {
            return NextResponse.json({ error: 'Missing plan ID' }, { status: 400 });
        }

        // 1. Update the plan
        const { data, error } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .update(updatePayload)
            .eq('id', id)
            .select();

        if (error) throw error;

        // Bust plan cache so new plan data is fetched on next request
        invalidateCache('plans:');

        return NextResponse.json({ message: 'Plan updated successfully', data });
    } catch (e: any) {
        console.error('[Admin Plans API] Update error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/payments/smepay/status
 * Client polls this to check if the SME Pay payment was completed via webhook
 */
export async function POST(req: Request) {
    try {
        const { orgId, slug } = await req.json();

        if (!orgId) {
            return NextResponse.json({ error: 'Missing orgId' }, { status: 400 });
        }

        // Check the latest smepay payment attempt for this org
        const { data: attempts } = await supabaseAdmin
            .schema('core')
            .from('payment_attempts')
            .select('*')
            .eq('organization_id', orgId)
            .eq('gateway', 'smepay')
            .order('attempted_at', { ascending: false })
            .limit(5);

        const matchingAttempt = attempts?.find((a: any) => {
            if (!slug) return true; // just get latest
            try {
                const meta = typeof a.error_message === 'string' ? JSON.parse(a.error_message) : a.error_message;
                return meta.smepay_slug === slug;
            } catch {
                return false;
            }
        });

        if (!matchingAttempt) {
            return NextResponse.json({ status: 'not_found' });
        }

        return NextResponse.json({
            status: matchingAttempt.status, // 'initiated', 'success', 'failed', 'pending'
            activated: matchingAttempt.status === 'success',
        });

    } catch (e: any) {
        console.error('[SME Pay Status] Error:', e.message);
        return NextResponse.json({ error: 'Status check failed' }, { status: 500 });
    }
}

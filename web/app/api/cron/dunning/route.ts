
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Force dynamic so this route can make DB calls (no static caching)
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
    // ── Cron Authentication ──────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get('Authorization');

    // In production, CRON_SECRET must be set and match.
    // In development (no CRON_SECRET env), allow bypass for testing.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { data, error } = await supabase.rpc('run_dunning_process');

        if (error) throw error;

        return NextResponse.json({
            success: true,
            message: 'Dunning process completed',
            results: data
        });

    } catch (e: any) {
        console.error('[Cron/dunning]', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Current consent document versions — bump these when T&C or Privacy Policy changes.
// All active users will be prompted to re-consent on next login.
const CONSENT_VERSION = 'v1.0';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { user_id, email, consented_to } = body;

        if (!email || !consented_to || !Array.isArray(consented_to)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate that mandatory consents are present
        const mandatory = ['terms', 'privacy', 'data_processing'];
        const missing = mandatory.filter(c => !consented_to.includes(c));
        if (missing.length > 0) {
            return NextResponse.json(
                { error: `Missing mandatory consent: ${missing.join(', ')}` },
                { status: 400 }
            );
        }

        // Extract IP — respect X-Forwarded-For (Vercel/proxy)
        const forwarded = req.headers.get('x-forwarded-for');
        const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || null;
        const userAgent = req.headers.get('user-agent') || null;

        const supabase = createClient(supabaseUrl, serviceKey);

        const { error } = await supabase
            .schema('core')
            .from('user_consent_log')
            .insert({
                user_id:        user_id || null,
                email:          email.toLowerCase().trim(),
                consent_version: CONSENT_VERSION,
                consented_to,
                ip_address:     ip,
                user_agent:     userAgent,
            });

        if (error) throw error;

        return NextResponse.json({ success: true, version: CONSENT_VERSION });
    } catch (e: any) {
        console.error('[ConsentAPI] Error:', e);
        return NextResponse.json({ error: e.message || 'Failed to record consent' }, { status: 500 });
    }
}

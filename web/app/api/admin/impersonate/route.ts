import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
    // Only super_admin can impersonate tenants
    const auth = await verifyAdminAccess(request, 'tenants', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.profile?.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden: Only Super Admins can impersonate tenants' }, { status: 403 });
    }

    try {
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId in request body' }, { status: 400 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // 1. Look up target user directly by ID (most reliable)
        const { data: targetUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (getUserError || !targetUser?.user) {
            return NextResponse.json({ error: 'Target user not found', details: getUserError?.message }, { status: 404 });
        }

        const targetEmail = targetUser.user.email;
        if (!targetEmail) {
            return NextResponse.json({ error: 'Target user has no email address configured' }, { status: 422 });
        }

        // 4. Get org for audit log (non-blocking)
        const { data: targetProfile } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('organization_id')
            .eq('id', userId)
            .maybeSingle();

        // 5. Audit Log (best-effort)
        try {
            await supabaseAdmin.rpc('log_admin_action', {
                p_target_org_id: targetProfile?.organization_id,
                p_action_type: 'IMPERSONATE',
                p_details: {
                    target_user_id: userId,
                    target_email: targetEmail,
                    performed_by: auth.user!.id,
                    performed_by_email: auth.user!.email,
                },
                p_ip_address: 'API'
            });
        } catch (auditErr) {
            console.warn('[Impersonate] Audit log failed (non-blocking):', auditErr);
        }

        // 6. Generate Magic Link for the target user
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: targetEmail,
            options: {
                redirectTo: `${appUrl}/dashboard`,
            }
        });

        if (linkError || !linkData?.properties) {
            console.error('[Impersonate] Link generation failed:', linkError);
            return NextResponse.json({
                error: 'Failed to generate impersonation link',
                details: linkError?.message
            }, { status: 500 });
        }

        const actionLink = (linkData.properties as any).action_link as string;
        if (!actionLink) {
            return NextResponse.json({ error: 'No action link returned from Supabase' }, { status: 500 });
        }

        // 7. Exchange magic link server-side to get real session tokens.
        // By fetching with redirect:manual, Supabase redirects to our app URL with
        // #access_token=...&refresh_token=... in the Location header hash.
        let accessToken: string | null = null;
        let refreshToken: string | null = null;

        try {
            const verifyResponse = await fetch(actionLink, {
                method: 'GET',
                redirect: 'manual',
                headers: { 'User-Agent': 'MandiGrow-Admin-Impersonate/1.0' }
            });

            const location = verifyResponse.headers.get('location') || '';
            console.log('[Impersonate] Verify redirect location:', location.substring(0, 80));
            const hashIndex = location.indexOf('#');
            if (hashIndex !== -1) {
                const hashParams = new URLSearchParams(location.substring(hashIndex + 1));
                accessToken = hashParams.get('access_token');
                refreshToken = hashParams.get('refresh_token');
            }
        } catch (exchangeErr) {
            console.warn('[Impersonate] Server-side token exchange failed:', exchangeErr);
        }

        console.log(`[Impersonate] ${auth.user!.email} -> ${targetEmail}. Tokens: ${!!accessToken}`);

        if (accessToken && refreshToken) {
            // Clean path: caller uses setSession() directly, no URL navigation needed
            return NextResponse.json({
                success: true,
                accessToken,
                refreshToken,
                targetEmail,
            });
        }

        // Fallback: return the magic link URL (frontend must sign out first, then navigate)
        return NextResponse.json({
            success: true,
            impersonateUrl: actionLink,
            targetEmail,
        });

    } catch (e: any) {
        console.error('[Impersonate] Critical error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export async function verifyAdminAccess(req: NextRequest, _resource?: string, _action?: string) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Try Authorization Bearer header first
    const authHeader = req.headers.get('Authorization');
    let token = authHeader ? authHeader.replace('Bearer ', '').trim() : null;

    // Fallback: try to extract the Supabase session from cookies 
    // (for admin pages that call the API without explicit auth headers)
    if (!token) {
        const cookieHeader = req.headers.get('cookie') || '';
        // Supabase stores the session in a cookie named sb-<projectRef>-auth-token
        const cookieMatch = cookieHeader.match(/sb-[a-z]+-auth-token=([^;]+)/);
        if (cookieMatch) {
            try {
                const decoded = decodeURIComponent(cookieMatch[1]);
                const sessionData = JSON.parse(decoded);
                token = sessionData?.access_token || sessionData?.[0]?.access_token || null;
            } catch { /* ignore parse errors */ }
        }
    }

    if (!token) return { error: 'Unauthorized: missing token', status: 401 };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) return { error: 'Invalid Session Token', status: 401 };

    // Check core.profiles for role
    const { data: profile } = await supabaseAdmin
        .schema('core')
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', user.id)
        .single();

    if (!profile) return { error: 'Admin profile not found', status: 403 };

    // Super Admin role check — always granted
    if (profile.role === 'super_admin') {
        return { user, profile, supabaseAdmin, authorized: true };
    }

    // Secondary check: look up in core.super_admins table
    const { data: superAdminRow } = await supabaseAdmin
        .schema('core')
        .from('super_admins')
        .select('id')
        .eq('id', user.id)
        .single();

    if (superAdminRow) {
        return { user, profile, supabaseAdmin, authorized: true };
    }

    return { error: 'Forbidden: Super admin access required', status: 403 };
}

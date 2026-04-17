import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
    try {
        const { email, username } = await request.json();

        if (!email && !username) {
            return NextResponse.json({ error: 'Email or username required' }, { status: 400 });
        }

        const result: { emailTaken: boolean; usernameTaken: boolean; emailVerified?: boolean } = {
            emailTaken: false,
            usernameTaken: false,
        };

        // ── Email Uniqueness Check ──────────────────────────────────────────────
        if (email) {
            const trimmedEmail = email.trim().toLowerCase();

            // First, check auth.users via admin API (source of truth for auth state)
            const listResult = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const authUsers = (listResult.data?.users ?? []) as Array<{ email?: string; email_confirmed_at?: string | null }>;
            const listErr = listResult.error;

            if (!listErr && authUsers.length > 0) {
                const existingAuthUser = authUsers.find(u => u.email?.toLowerCase() === trimmedEmail);

                if (existingAuthUser) {
                    if (existingAuthUser.email_confirmed_at) {
                        // Email verified → this account is fully active, block sign-up
                        result.emailTaken = true;
                        result.emailVerified = true;
                    } else {
                        // Email exists but NOT verified → allow re-signup (resend OTP)
                        result.emailTaken = false;
                        result.emailVerified = false;
                    }
                }
            }
        }

        // ── Username Uniqueness Check ──────────────────────────────────────────
        if (username) {
            const trimmed = username.trim().toLowerCase();

            const { data: existingUsername } = await supabaseAdmin
                .schema('core')
                .from('profiles')
                .select('id')
                .or(`username.ilike.${trimmed},full_name.ilike.${trimmed},email.eq.${trimmed}`)
                .limit(1);

            if (existingUsername && existingUsername.length > 0) {
                result.usernameTaken = true;
            }
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('[Check Unique] Error:', error.message);
        return NextResponse.json({ error: 'Check failed' }, { status: 500 });
    }
}

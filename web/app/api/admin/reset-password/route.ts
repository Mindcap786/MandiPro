import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

// Server-side route that uses the SERVICE ROLE KEY to perform administrative actions
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
    try {
        const auth = await verifyAdminAccess(request, 'users', 'reset_password');
        if (auth.error) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { userId, newPassword } = await request.json();

        if (!userId || !newPassword) {
            return NextResponse.json({ error: 'User ID and New Password are required' }, { status: 400 });
        }

        console.log(`[Admin Password Reset] Resetting password for user ${userId}`);

        // Update the user's password directly in Supabase Auth
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: newPassword }
        );

        if (error) {
            console.error('[Admin Password Reset] Auth update failed:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Password has been reset successfully.' });

    } catch (e: any) {
        console.error('[Admin Password Reset] Unexpected error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

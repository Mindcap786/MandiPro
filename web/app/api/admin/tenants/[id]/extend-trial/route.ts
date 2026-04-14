import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

// POST /api/admin/tenants/[id]/extend-trial
// Super Admin: extend trial by N days, log with admin_user_id

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await verifyAdminAccess(request, 'tenants', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const orgId = params.id;
        const { extend_days, reason } = await request.json();

        if (!extend_days || extend_days < 1) {
            return NextResponse.json({ error: 'extend_days must be >= 1' }, { status: 400 });
        }

        // Get current subscription
        const { data: sub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id, status, trial_ends_at, override_trial_days')
            .eq('organization_id', orgId)
            .single();

        if (!sub) return NextResponse.json({ error: 'No subscription found' }, { status: 404 });

        // Calculate new trial end
        const currentEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
        const newEnd = new Date(Math.max(currentEnd.getTime(), Date.now()));
        newEnd.setDate(newEnd.getDate() + extend_days);

        // Update subscription
        await supabaseAdmin.schema('core').from('subscriptions').update({
            trial_ends_at:      newEnd.toISOString(),
            status:             sub.status === 'trial_expired' ? 'trialing' : sub.status,
            override_trial_days: (sub.override_trial_days || 0) + extend_days,
            updated_at:         new Date().toISOString(),
        }).eq('id', sub.id);

        // Update org trial_ends_at too
        await supabaseAdmin.schema('core').from('organizations').update({
            trial_ends_at: newEnd.toISOString(),
            status:        sub.status === 'trial_expired' ? 'trial' : undefined,
            is_active:     sub.status === 'trial_expired' ? true : undefined,
        }).eq('id', orgId);

        // Log event
        await supabaseAdmin.schema('core').from('subscription_events').insert({
            organization_id: orgId,
            subscription_id: sub.id,
            event_type:      'admin.trial_extended',
            triggered_by:    'admin',
            admin_user_id:   auth.user!.id,
            metadata: {
                extend_days,
                old_trial_end: sub.trial_ends_at,
                new_trial_end: newEnd.toISOString(),
                reason: reason || null,
            }
        });

        // Send notification to tenant
        try {
            const supabaseClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            await supabaseClient.functions.invoke('send-subscription-notification', {
                body: {
                    org_id: orgId,
                    event_type: 'admin.trial_extended',
                    metadata: {
                        extend_days,
                        new_trial_end: newEnd.toISOString()
                    }
                }
            });
        } catch (notifErr) {
            console.error('[extend-trial] Notification error (non-fatal):', notifErr);
        }

        return NextResponse.json({
            success: true,
            message: `Trial extended by ${extend_days} days`,
            new_trial_end: newEnd.toISOString(),
        });

    } catch (e: any) {
        console.error('[admin/extend-trial] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// POST /api/subscription/cancel
// Schedules cancel_at_period_end = true — access until period_end, then expired

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (!user) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const { reason } = body;

        const { data: profile } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('organization_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.organization_id) {
            return NextResponse.json({ error: 'No organization' }, { status: 404 });
        }
        if (profile.role !== 'tenant_admin' && profile.role !== 'super_admin') {
            return NextResponse.json({ error: 'Only admins can cancel subscriptions' }, { status: 403 });
        }

        const orgId = profile.organization_id;

        // Get current subscription
        const { data: sub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id, status, current_period_end, plan_id')
            .eq('organization_id', orgId)
            .single();

        if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 404 });

        // Schedule cancellation at period end
        const { error: cancelErr } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .update({
                cancel_at_period_end: true,
                cancelled_at:         new Date().toISOString(),
                cancellation_reason:  reason || null,
                status:               'cancelled',
                updated_at:           new Date().toISOString(),
            })
            .eq('id', sub.id);

        if (cancelErr) throw cancelErr;

        // Log event
        await supabaseAdmin.schema('core').from('subscription_events').insert({
            organization_id: orgId,
            subscription_id: sub.id,
            event_type:      'subscription.cancelled',
            old_status:      sub.status,
            new_status:      'cancelled',
            triggered_by:    'user',
            admin_user_id:   user.id,
            metadata: {
                reason,
                access_until: sub.current_period_end
            }
        });

        // Send cancellation email
        try {
            const supabaseClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            await supabaseClient.functions.invoke('send-subscription-notification', {
                body: {
                    org_id: orgId,
                    event_type: 'subscription.cancelled',
                    metadata: { period_end: sub.current_period_end }
                }
            });
        } catch (notifErr) {
            console.error('[cancel] Notification error (non-fatal):', notifErr);
        }

        return NextResponse.json({
            success: true,
            message: 'Subscription cancelled. Access continues until period end.',
            access_until: sub.current_period_end,
        });

    } catch (e: any) {
        console.error('[subscription/cancel] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

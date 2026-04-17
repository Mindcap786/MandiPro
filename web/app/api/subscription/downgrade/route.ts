import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// POST /api/subscription/downgrade
// Schedules a downgrade to take effect at current_period_end
// Industry standard: downgrades are NEVER immediate — they apply at renewal

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

        const body = await request.json();
        const { target_plan_id, target_interval } = body;

        if (!target_plan_id) {
            return NextResponse.json({ error: 'target_plan_id is required' }, { status: 400 });
        }

        const { data: profile } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('organization_id, role')
            .eq('id', user.id)
            .single();

        if (!profile?.organization_id) {
            return NextResponse.json({ error: 'No organization' }, { status: 404 });
        }

        const orgId = profile.organization_id;

        // Verify the target plan exists
        const { data: targetPlan } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('id, name, display_name, price_monthly, price_yearly')
            .eq('id', target_plan_id)
            .single();

        if (!targetPlan) {
            return NextResponse.json({ error: 'Target plan not found' }, { status: 404 });
        }

        // Get current subscription
        const { data: sub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id, status, plan_id, current_period_end')
            .eq('organization_id', orgId)
            .single();

        if (!sub) return NextResponse.json({ error: 'No active subscription' }, { status: 404 });

        // Schedule the downgrade
        const { error: schedErr } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .update({
                scheduled_plan_id:   target_plan_id,
                scheduled_interval:  target_interval || 'monthly',
                scheduled_change_at: sub.current_period_end,
                updated_at:          new Date().toISOString(),
            })
            .eq('id', sub.id);

        if (schedErr) throw schedErr;

        // Log event
        await supabaseAdmin.schema('core').from('subscription_events').insert({
            organization_id: orgId,
            subscription_id: sub.id,
            event_type:      'subscription.downgrade_scheduled',
            old_plan_id:     sub.plan_id,
            new_plan_id:     target_plan_id,
            triggered_by:    'user',
            admin_user_id:   user.id,
            metadata: {
                effective_date: sub.current_period_end,
                target_plan_name: targetPlan.display_name || targetPlan.name
            }
        });

        return NextResponse.json({
            success: true,
            message: `Downgrade to ${targetPlan.display_name || targetPlan.name} scheduled for ${sub.current_period_end}`,
            effective_date: sub.current_period_end,
        });

    } catch (e: any) {
        console.error('[subscription/downgrade] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

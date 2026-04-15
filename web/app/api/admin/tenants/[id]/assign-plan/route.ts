import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

// POST /api/admin/tenants/[id]/assign-plan
// Super Admin can assign ANY plan to ANY tenant immediately
// Action is logged with admin_user_id in subscription_events

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    const auth = await verifyAdminAccess(request, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const orgId = params.id;
        const body = await request.json();
        const {
            plan_id,
            interval = 'monthly',
            start_date,
            end_date,
            custom_price,
            gateway = 'admin_manual',
            admin_notes,
            free_plan = false,
        } = body;

        if (!plan_id) {
            return NextResponse.json({ error: 'plan_id is required' }, { status: 400 });
        }

        // Fetch plan
        const { data: plan } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('*')
            .eq('id', plan_id)
            .single();

        if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

        // Get current subscription (before update — for event log)
        const { data: oldSub } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id, status, plan_id')
            .eq('organization_id', orgId)
            .maybeSingle();

        const now = new Date();
        const periodStart = start_date ? new Date(start_date) : now;
        let periodEnd: Date;

        if (end_date) {
            periodEnd = new Date(end_date);
        } else {
            periodEnd = new Date(periodStart);
            if (interval === 'yearly' || interval === 'annual') {
                periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            } else if (interval === 'lifetime') {
                periodEnd = new Date('2099-12-31');
            } else {
                periodEnd.setMonth(periodEnd.getMonth() + 1);
            }
        }

        const newStatus = free_plan ? 'admin_gifted' : 'active';
        const mrr = custom_price
            ? custom_price
            : (interval === 'yearly' || interval === 'annual')
                ? (plan.price_yearly || plan.price_monthly * 12) / 12
                : plan.price_monthly || 0;

        // 1. Update Organization
        await supabaseAdmin
            .schema('core')
            .from('organizations')
            .update({
                subscription_tier:   plan.name?.toLowerCase(),
                status:              'active',
                is_active:           true,
                trial_ends_at:       null,
                current_period_end:  periodEnd.toISOString(),
                max_web_users:       plan.max_web_users || 2,
                max_mobile_users:    plan.max_mobile_users || 0,
            })
            .eq('id', orgId);

        // 2. Upsert Subscription
        const subPayload: any = {
            organization_id:      orgId,
            plan_id:              plan.id,
            plan_interval:        interval,
            billing_cycle:        interval,
            status:               newStatus,
            current_period_start: periodStart.toISOString().split('T')[0],
            current_period_end:   periodEnd.toISOString().split('T')[0],
            next_invoice_date:    periodEnd.toISOString().split('T')[0],
            mrr_amount:           mrr,
            trial_ends_at:        null,
            trial_converted:      true,
            cancel_at_period_end: false,
            cancelled_at:         null,
            admin_assigned_by:    auth.user!.id,
            admin_notes:          admin_notes || null,
        };

        if (oldSub) {
            await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update(subPayload)
                .eq('id', oldSub.id);
        } else {
            await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .insert(subPayload);
        }

        // 3. Log subscription event (immutable)
        await supabaseAdmin.schema('core').from('subscription_events').insert({
            organization_id: orgId,
            event_type:      'admin.plan_assigned',
            old_status:      oldSub?.status || null,
            new_status:      newStatus,
            old_plan_id:     oldSub?.plan_id || null,
            new_plan_id:     plan.id,
            amount:          mrr,
            currency:        'INR',
            triggered_by:    'admin',
            admin_user_id:   auth.user!.id,
            metadata: {
                plan_name:    plan.display_name || plan.name,
                interval,
                period_end:   periodEnd.toISOString(),
                custom_price: custom_price || null,
                gateway,
                notes:        admin_notes || null,
                free_plan,
            }
        });

        // 4. Create invoice if paid
        if ((custom_price || mrr > 0) && !free_plan) {
            const totalAmount = custom_price || (interval === 'yearly' ? plan.price_yearly : plan.price_monthly);
            const GST_RATE = 0.18;
            const subtotal = Math.round(totalAmount / (1 + GST_RATE));
            const tax = totalAmount - subtotal;
            const invoiceNum = `MG-${now.getFullYear()}-${Date.now().toString().slice(-6)}`;

            await supabaseAdmin.schema('core').from('saas_invoices').insert({
                organization_id: orgId,
                invoice_number:  invoiceNum,
                plan_id:         plan.id,
                amount:          totalAmount,
                subtotal,
                tax,
                total:           totalAmount,
                status:          'paid',
                billing_cycle:   interval,
                invoice_date:    now.toISOString(),
                period_start:    periodStart.toISOString().split('T')[0],
                period_end:      periodEnd.toISOString().split('T')[0],
                due_date:        now.toISOString(),
                paid_at:         now.toISOString(),
                currency:        'INR',
                notes:           admin_notes ? `Admin assignment: ${admin_notes}` : 'Admin-assigned plan',
                line_items: [{
                    description: `${plan.display_name || plan.name} — Admin Assigned`,
                    quantity: 1,
                    unit_price: totalAmount,
                    amount: totalAmount,
                    type: 'subscription'
                }]
            });
        }

        // 5. Notify tenant
        try {
            const supabaseClient = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            await supabaseClient.functions.invoke('send-subscription-notification', {
                body: {
                    org_id: orgId,
                    event_type: 'admin.plan_assigned',
                    metadata: {
                        plan_name: plan.display_name || plan.name,
                        period_end: periodEnd.toISOString()
                    }
                }
            });
        } catch (notifErr) {
            console.error('[assign-plan] Notification error (non-fatal):', notifErr);
        }

        return NextResponse.json({
            success: true,
            message: `Plan "${plan.display_name || plan.name}" assigned successfully`,
            period_end: periodEnd.toISOString(),
            status: newStatus,
        });

    } catch (e: any) {
        console.error('[admin/assign-plan] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

type Action = 'upgrade' | 'downgrade' | 'suspend' | 'reactivate' | 'extend_trial' | 'issue_credit' | 'retry_payment' | 'manual_override';

export async function POST(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = adminClient();
    const body = await req.json();
    const { action, organization_id, payload } = body as { action: Action; organization_id: string; payload: any };

    if (!action || !organization_id) {
        return NextResponse.json({ error: 'Missing action or organization_id' }, { status: 400 });
    }

    // Get current subscription
    const { data: sub } = await supabaseAdmin
        .schema('core')
        .from('subscriptions')
        .select('*, app_plans!plan_id(*)')
        .eq('organization_id', organization_id)
        .single();

    const oldValue = sub ? { plan_id: sub.plan_id, status: sub.status, mrr_amount: sub.mrr_amount } : null;

    let result: any = {};

    switch (action) {
        case 'upgrade':
        case 'downgrade': {
            const { new_plan_id, billing_cycle: reqCycle, custom_expiry } = payload || {};
            if (!new_plan_id) return NextResponse.json({ error: 'new_plan_id required' }, { status: 400 });

            // Use database RPC for atomic plan activation with full sync
            const { data: activationResult, error: activationError } = await supabaseAdmin
                .rpc('activate_plan_for_tenant', {
                    p_org_id: organization_id,
                    p_plan_id: new_plan_id,
                    p_billing_cycle: reqCycle || sub?.billing_cycle || 'monthly',
                    p_custom_expiry: custom_expiry || null,
                    p_admin_notes: `${action}: plan changed via admin action`
                });

            if (activationError) throw activationError;

            result = { message: `Plan ${action}d successfully`, ...activationResult };
            break;
        }

        case 'suspend': {
            await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update({ status: 'suspended', suspended_at: new Date().toISOString() })
                .eq('organization_id', organization_id);

            await supabaseAdmin
                .schema('core')
                .from('organizations')
                .update({ is_active: false, status: 'suspended' })
                .eq('id', organization_id);

            result = { message: 'Tenant suspended' };
            break;
        }

        case 'reactivate': {
            // Use renewal RPC for full sync: reactivate org, extend period, clear grace, resolve alerts
            const { data: reactivateResult, error: reactivateError } = await supabaseAdmin
                .rpc('process_subscription_renewal', {
                    p_org_id: organization_id,
                    p_payment_amount: null,
                    p_payment_gateway: 'admin_reactivation',
                    p_billing_cycle: payload?.billing_cycle || null,
                    p_plan_id: payload?.plan_id || null
                });

            if (reactivateError) throw reactivateError;

            result = { message: 'Tenant reactivated', ...reactivateResult };
            break;
        }

        case 'extend_trial': {
            const { days = 14 } = payload || {};
            const newTrialEnd = new Date();
            newTrialEnd.setDate(newTrialEnd.getDate() + days);

            await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update({ trial_ends_at: newTrialEnd.toISOString(), status: 'trialing' })
                .eq('organization_id', organization_id);

            await supabaseAdmin
                .schema('core')
                .from('organizations')
                .update({ trial_ends_at: newTrialEnd.toISOString() })
                .eq('id', organization_id);

            result = { message: `Trial extended by ${days} days until ${newTrialEnd.toDateString()}` };
            break;
        }

        case 'issue_credit': {
            const { amount = 0, reason = 'Manual credit' } = payload || {};
            if (amount <= 0) return NextResponse.json({ error: 'Amount must be > 0' }, { status: 400 });

            // Create a credit invoice
            const invNum = 'CREDIT-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-5);
            await supabaseAdmin
                .schema('core')
                .from('saas_invoices')
                .insert({
                    organization_id,
                    invoice_number: invNum,
                    amount: -amount,
                    subtotal: -amount,
                    tax: 0,
                    total: -amount,
                    status: 'paid',
                    invoice_date: new Date().toISOString(),
                    due_date: new Date().toISOString(),
                    paid_at: new Date().toISOString(),
                    notes: reason,
                    currency: 'INR',
                    line_items: [{ description: reason, quantity: 1, unit_price: -amount, amount: -amount, type: 'credit' }]
                });

            result = { message: `Credit of ₹${amount} issued`, invoice_number: invNum };
            break;
        }

        case 'retry_payment': {
            const { invoice_id } = payload || {};
            if (!invoice_id) return NextResponse.json({ error: 'invoice_id required' }, { status: 400 });

            // Log attempt
            await supabaseAdmin
                .schema('core')
                .from('payment_attempts')
                .insert({
                    invoice_id,
                    organization_id,
                    status: 'pending',
                    amount: payload.amount || 0,
                    gateway: 'manual'
                });

            // Mark invoice as pending retry
            await supabaseAdmin
                .schema('core')
                .from('saas_invoices')
                .update({ status: 'pending', retry_count: (sub?.retry_count || 0) + 1 })
                .eq('id', invoice_id);

            result = { message: 'Payment retry queued' };
            break;
        }

        case 'manual_override': {
            const { field, value } = payload || {};
            if (!field) return NextResponse.json({ error: 'field required' }, { status: 400 });

            const allowedFields = ['mrr_amount', 'billing_cycle', 'status', 'notes', 'next_invoice_date'];
            if (!allowedFields.includes(field)) {
                return NextResponse.json({ error: 'Field not allowed for override' }, { status: 400 });
            }

            await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .update({ [field]: value })
                .eq('organization_id', organization_id);

            result = { message: `Subscription ${field} updated to ${value}` };
            break;
        }

        default:
            return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    // Log billing event
    await supabaseAdmin
        .schema('core')
        .from('billing_events')
        .insert({
            organization_id,
            event_type: action,
            old_value: oldValue,
            new_value: result,
            notes: payload?.notes || null
        });

    return NextResponse.json({ success: true, action, ...result });
}

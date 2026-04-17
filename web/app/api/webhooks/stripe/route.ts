import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { invalidateSubscriptionCache } from '@/lib/subscription-guard';

// Stripe Webhook Handler
// Handles: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted
// Verifies webhook signature, processes payment, triggers instant renewal

export async function POST(request: Request) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const rawBody = await request.text();
        const signature = request.headers.get('stripe-signature');

        // 1. Get Stripe webhook secret from payment_config
        const { data: configData } = await supabaseAdmin
            .schema('core')
            .from('payment_config')
            .select('config')
            .eq('gateway_type', 'stripe')
            .eq('is_active', true)
            .single();

        if (!configData?.config) {
            console.error('[Stripe Webhook] No Stripe config found');
            return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
        }

        // 2. Verify Stripe signature
        let event: Stripe.Event;
        try {
            const stripe = new Stripe(configData.config.secret_key || configData.config.key_secret);
            event = stripe.webhooks.constructEvent(
                rawBody,
                signature || '',
                configData.config.webhook_secret
            );
        } catch (err: any) {
            console.error('[Stripe Webhook] Signature verification failed:', err.message);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        console.log(`[Stripe Webhook] Event: ${event.type}`);

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                const organizationId = session.metadata?.organization_id;
                const planId = session.metadata?.plan_id;
                const billingCycle = session.metadata?.billing_cycle;

                if (!organizationId) {
                    console.warn('[Stripe Webhook] No organization_id in session metadata');
                    return NextResponse.json({ status: 'skipped' });
                }

                const amount = (session.amount_total || 0) / 100;

                const { data, error } = await supabaseAdmin.rpc('process_subscription_renewal', {
                    p_org_id: organizationId,
                    p_payment_amount: amount,
                    p_payment_gateway: 'stripe',
                    p_billing_cycle: billingCycle || null,
                    p_plan_id: planId || null
                });

                if (error) {
                    console.error('[Stripe Webhook] Renewal failed:', error);
                    await supabaseAdmin.schema('core').from('payment_attempts').insert({
                        organization_id: organizationId,
                        status: 'failed',
                        amount,
                        gateway: 'stripe',
                        error_message: error.message
                    });
                    return NextResponse.json({ error: 'Renewal failed' }, { status: 500 });
                }

                invalidateSubscriptionCache(organizationId);
                console.log(`[Stripe Webhook] Checkout complete: ₹${amount} for org ${organizationId}`);
                return NextResponse.json({ status: 'processed', action: 'renewed', ...data });
            }

            case 'invoice.paid': {
                const invoice = event.data.object as Stripe.Invoice;
                const organizationId = invoice.metadata?.organization_id ||
                    (invoice as any).subscription_details?.metadata?.organization_id;

                if (!organizationId) {
                    return NextResponse.json({ status: 'skipped', reason: 'no org id' });
                }

                const amount = (invoice.amount_paid || 0) / 100;

                const { data, error } = await supabaseAdmin.rpc('process_subscription_renewal', {
                    p_org_id: organizationId,
                    p_payment_amount: amount,
                    p_payment_gateway: 'stripe',
                    p_billing_cycle: null,
                    p_plan_id: null
                });

                if (error) console.error('[Stripe Webhook] Invoice paid renewal failed:', error);
                else invalidateSubscriptionCache(organizationId);

                return NextResponse.json({ status: 'processed', action: 'renewed' });
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                const organizationId = invoice.metadata?.organization_id ||
                    (invoice as any).subscription_details?.metadata?.organization_id;

                if (!organizationId) {
                    return NextResponse.json({ status: 'skipped' });
                }

                const amount = (invoice.amount_due || 0) / 100;

                // Log failed payment
                await supabaseAdmin.schema('core').from('payment_attempts').insert({
                    organization_id: organizationId,
                    status: 'failed',
                    amount,
                    gateway: 'stripe',
                    error_message: 'Stripe invoice payment failed'
                });

                // Mark invoices overdue
                await supabaseAdmin.schema('core').from('saas_invoices')
                    .update({ status: 'overdue' })
                    .eq('organization_id', organizationId)
                    .in('status', ['pending']);

                // Alert
                await supabaseAdmin.schema('core').from('system_alerts').insert({
                    organization_id: organizationId,
                    alert_type: 'overdue_payment',
                    severity: 'critical',
                    message: `Payment of ₹${amount} failed via Stripe. Please update your payment method.`,
                    domain: 'mandi'
                });

                await supabaseAdmin.schema('core').from('billing_events').insert({
                    organization_id: organizationId,
                    event_type: 'retry_payment',
                    old_value: { amount, gateway: 'stripe' },
                    new_value: { status: 'failed' },
                    notes: 'Stripe invoice payment failed webhook'
                });

                return NextResponse.json({ status: 'processed', action: 'payment_failed' });
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                const organizationId = subscription.metadata?.organization_id;

                if (!organizationId) {
                    return NextResponse.json({ status: 'skipped' });
                }

                await supabaseAdmin.schema('core').from('billing_events').insert({
                    organization_id: organizationId,
                    event_type: 'suspend',
                    old_value: { gateway: 'stripe' },
                    new_value: { reason: 'subscription_deleted' },
                    notes: 'Stripe subscription deleted via webhook'
                });

                return NextResponse.json({ status: 'processed', action: 'cancellation_noted' });
            }

            default:
                return NextResponse.json({ status: 'ignored', event: event.type });
        }

    } catch (e: any) {
        console.error('[Stripe Webhook] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

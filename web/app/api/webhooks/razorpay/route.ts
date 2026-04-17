import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { invalidateSubscriptionCache } from '@/lib/subscription-guard';

// Razorpay Webhook Handler
// Handles: payment.captured, payment.failed, subscription.charged, subscription.cancelled
// Verifies webhook signature, processes payment, triggers instant renewal

export async function POST(request: Request) {
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-razorpay-signature');

        // 1. Get Razorpay webhook secret from payment_config
        const { data: configData } = await supabaseAdmin
            .schema('core')
            .from('payment_config')
            .select('config')
            .eq('gateway_type', 'razorpay')
            .eq('is_active', true)
            .single();

        if (!configData?.config?.webhook_secret) {
            console.error('[Razorpay Webhook] No webhook secret configured');
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
        }

        // 2. Verify signature
        if (signature) {
            const expectedSignature = crypto
                .createHmac('sha256', configData.config.webhook_secret)
                .update(rawBody)
                .digest('hex');

            if (expectedSignature !== signature) {
                console.error('[Razorpay Webhook] Invalid signature');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }

        const event = JSON.parse(rawBody);
        const eventType = event.event;
        const payload = event.payload;

        console.log(`[Razorpay Webhook] Event: ${eventType}`);

        // 3. Extract organization_id from notes (set during order creation)
        const notes = payload?.payment?.entity?.notes || payload?.subscription?.entity?.notes || {};
        const organizationId = notes.organization_id;

        if (!organizationId) {
            console.warn('[Razorpay Webhook] No organization_id in notes, skipping');
            return NextResponse.json({ status: 'skipped', reason: 'no organization_id' });
        }

        switch (eventType) {
            case 'payment.captured': {
                const amount = (payload.payment.entity.amount || 0) / 100; // Convert paise to INR
                const paymentId = payload.payment.entity.id;

                // Instant renewal via database RPC
                const { data, error } = await supabaseAdmin.rpc('process_subscription_renewal', {
                    p_org_id: organizationId,
                    p_payment_amount: amount,
                    p_payment_gateway: 'razorpay',
                    p_billing_cycle: notes.billing_cycle || null,
                    p_plan_id: notes.plan_id || null
                });

                if (error) {
                    console.error('[Razorpay Webhook] Renewal failed:', error);
                    // Log failed attempt
                    await supabaseAdmin.schema('core').from('payment_attempts').insert({
                        organization_id: organizationId,
                        status: 'failed',
                        amount,
                        gateway: 'razorpay',
                        error_message: error.message
                    });
                    return NextResponse.json({ error: 'Renewal failed' }, { status: 500 });
                }

                invalidateSubscriptionCache(organizationId);
                console.log(`[Razorpay Webhook] Payment captured: ₹${amount} for org ${organizationId}`);
                return NextResponse.json({ status: 'processed', action: 'renewed', ...data });
            }

            case 'payment.failed': {
                const amount = (payload.payment.entity.amount || 0) / 100;
                const errorDesc = payload.payment.entity.error_description || 'Payment failed';

                // Log failed attempt
                await supabaseAdmin.schema('core').from('payment_attempts').insert({
                    organization_id: organizationId,
                    status: 'failed',
                    amount,
                    gateway: 'razorpay',
                    error_message: errorDesc
                });

                // Update invoice retry count
                const { data: invoice } = await supabaseAdmin
                    .schema('core')
                    .from('saas_invoices')
                    .select('id, retry_count')
                    .eq('organization_id', organizationId)
                    .in('status', ['pending', 'overdue'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (invoice) {
                    await supabaseAdmin.schema('core').from('saas_invoices')
                        .update({
                            status: 'overdue',
                            retry_count: (invoice.retry_count || 0) + 1
                        })
                        .eq('id', invoice.id);
                }

                // Generate alert
                await supabaseAdmin.schema('core').from('system_alerts').insert({
                    organization_id: organizationId,
                    alert_type: 'overdue_payment',
                    severity: 'critical',
                    message: `Payment of ₹${amount} failed: ${errorDesc}. Please retry or update payment method.`,
                    domain: 'mandi'
                });

                // Log billing event
                await supabaseAdmin.schema('core').from('billing_events').insert({
                    organization_id: organizationId,
                    event_type: 'retry_payment',
                    old_value: { amount, gateway: 'razorpay' },
                    new_value: { status: 'failed', error: errorDesc },
                    notes: 'Razorpay payment failed webhook'
                });

                console.log(`[Razorpay Webhook] Payment failed for org ${organizationId}: ${errorDesc}`);
                return NextResponse.json({ status: 'processed', action: 'payment_failed' });
            }

            case 'subscription.cancelled': {
                // Razorpay subscription cancelled - enter grace period
                await supabaseAdmin.schema('core').from('billing_events').insert({
                    organization_id: organizationId,
                    event_type: 'suspend',
                    old_value: { gateway: 'razorpay' },
                    new_value: { reason: 'subscription_cancelled' },
                    notes: 'Razorpay subscription cancelled via webhook'
                });

                // Don't immediately suspend - lifecycle function will handle grace period
                console.log(`[Razorpay Webhook] Subscription cancelled for org ${organizationId}`);
                return NextResponse.json({ status: 'processed', action: 'cancellation_noted' });
            }

            default:
                console.log(`[Razorpay Webhook] Unhandled event: ${eventType}`);
                return NextResponse.json({ status: 'ignored', event: eventType });
        }

    } catch (e: any) {
        console.error('[Razorpay Webhook] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

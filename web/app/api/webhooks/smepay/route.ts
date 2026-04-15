import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateSmepayOrder } from '@/lib/smepay';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

type SmepayWebhookBody = {
    order_id?: string;
    external_reference_id?: string;
    payment_status?: string;
    transaction_id?: string;
    amount?: number | string;
};

/**
 * Resolve the SMEPay webhook secret.
 * Prefer env var (same shape as Razorpay/Stripe). Fall back to the
 * `core.payment_config` table for operators who rotate keys from the admin UI.
 */
async function resolveSmepayWebhookSecret(): Promise<string | null> {
    const envSecret = process.env.SMEPAY_WEBHOOK_SECRET;
    if (envSecret && envSecret.length > 0) return envSecret;

    const { data } = await supabaseAdmin
        .schema('core')
        .from('payment_config')
        .select('config')
        .eq('gateway_type', 'smepay')
        .eq('is_active', true)
        .maybeSingle<{ config: { webhook_secret?: string } | null }>();

    return data?.config?.webhook_secret ?? null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
    try {
        const aBuf = Buffer.from(a, 'hex');
        const bBuf = Buffer.from(b, 'hex');
        if (aBuf.length !== bBuf.length) return false;
        return crypto.timingSafeEqual(aBuf, bBuf);
    } catch {
        return false;
    }
}

/**
 * POST /api/webhooks/smepay
 * Callback from SME Pay when payment status changes.
 * Only activates the subscription when:
 *   1. `x-smepay-signature` header is present
 *   2. HMAC-SHA256(raw body, webhook_secret) matches the signature
 * Idempotent: replays on an already-successful attempt are a no-op.
 */
export async function POST(req: Request) {
    try {
        // ── 1. Read raw body (needed for signature verification) ────────────
        const rawBody = await req.text();
        const signature =
            req.headers.get('x-smepay-signature') ||
            req.headers.get('x-webhook-signature') ||
            '';

        // ── 2. Verify signature ─────────────────────────────────────────────
        const webhookSecret = await resolveSmepayWebhookSecret();
        if (!webhookSecret) {
            console.error('[SME Pay Webhook] Missing SMEPAY_WEBHOOK_SECRET (env or payment_config)');
            return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
        }

        if (!signature) {
            console.error('[SME Pay Webhook] Missing x-smepay-signature header');
            return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
        }

        const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
        const signatureValid = timingSafeEqualHex(expected, signature.trim().toLowerCase());

        if (!signatureValid) {
            // Audit the rejection so tampered requests are visible.
            await supabaseAdmin
                .schema('core')
                .from('payment_attempts')
                .insert({
                    organization_id: null,
                    amount: 0,
                    gateway: 'smepay_webhook_rejected',
                    status: 'failed',
                    attempted_at: new Date().toISOString(),
                    error_message: JSON.stringify({
                        reason: 'invalid_signature',
                        received_signature_prefix: signature.slice(0, 12),
                    }),
                });
            console.error('[SME Pay Webhook] Invalid signature');
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // ── 3. Parse body (post-verification) ───────────────────────────────
        const body: SmepayWebhookBody = JSON.parse(rawBody);
        console.log('[SME Pay Webhook] Verified payload for order', body.order_id);

        const { order_id, external_reference_id, payment_status, transaction_id, amount } = body;

        if (!order_id && !external_reference_id) {
            return NextResponse.json({ error: 'Missing order identifier' }, { status: 400 });
        }

        const searchId = order_id || external_reference_id;

        // Find matching payment attempt — look at BOTH initiated and already-success
        // rows so replays resolve to the same attempt and short-circuit as no-ops.
        type AttemptRow = {
            id: string;
            organization_id: string;
            status: string;
            amount: number | null;
            error_message: string | Record<string, unknown> | null;
        };
        const { data: attempts } = await supabaseAdmin
            .schema('core')
            .from('payment_attempts')
            .select('id, organization_id, status, amount, error_message')
            .eq('gateway', 'smepay')
            .in('status', ['initiated', 'success'])
            .order('attempted_at', { ascending: false })
            .limit(50);

        const parseMeta = (raw: AttemptRow['error_message']): Record<string, unknown> => {
            if (!raw) return {};
            if (typeof raw === 'object') return raw;
            try { return JSON.parse(raw); } catch { return {}; }
        };

        const matchingAttempt = (attempts as AttemptRow[] | null)?.find((a) => {
            const meta = parseMeta(a.error_message);
            return (
                meta.smepay_order_id === searchId ||
                meta.local_order_id === searchId ||
                (transaction_id && meta.transaction_id === transaction_id)
            );
        });

        if (!matchingAttempt) {
            console.warn('[SME Pay Webhook] No matching payment attempt for:', searchId);
            return NextResponse.json({ received: true, matched: false });
        }

        // ── Idempotency guard ────────────────────────────────────────────────
        // If this attempt is already marked success, a replay must not re-run
        // activation side-effects (coupon increment, invoice generation, etc.).
        if (matchingAttempt.status === 'success') {
            console.log('[SME Pay Webhook] Replay detected — already success, no-op for attempt', matchingAttempt.id);
            return NextResponse.json({ received: true, matched: true, idempotent: true });
        }

        const meta = parseMeta(matchingAttempt.error_message);
        const orgId = matchingAttempt.organization_id;
        const planId = String(meta.plan_id ?? '');
        const billingCycle = (meta.billing_cycle as string | undefined) || 'monthly';
        const couponCode = (meta.coupon_code as string | undefined) || null;

        // ── 4. DevSecOps Zero-Trust Validation ──────────────────────────────
        // We DO NOT trust the webhook payload alone. We verify against the SMEPay server endpoint.
        let isSuccess = false;
        try {
            const validationStatus = await validateSmepayOrder(searchId as string);
            console.log(`[SME Pay Webhook] API Validation returned:`, validationStatus.payment_status);
            isSuccess = ['SUCCESS', 'COMPLETED', 'CAPTURED'].includes(validationStatus.payment_status?.toUpperCase() ?? '');
        } catch (validationErr: any) {
            console.error('[SME Pay Webhook] Server-to-Server validation failed:', validationErr.message);
            // Log rejection
            await supabaseAdmin
                .schema('core')
                .from('payment_attempts')
                .update({ 
                    status: 'failed',
                    error_message: JSON.stringify({ reason: 'api_validation_failed', detail: validationErr.message })
                })
                .eq('id', matchingAttempt.id);
            
            return NextResponse.json({ error: 'Order validation failed' }, { status: 403 });
        }

        if (isSuccess) {
            // Update attempt to success
            await supabaseAdmin
                .schema('core')
                .from('payment_attempts')
                .update({ status: 'success' })
                .eq('id', matchingAttempt.id);

            // Delegate activation to the canonical activate route logic
            const expiryDays = billingCycle === 'yearly' ? 365 : 30;
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setDate(periodEnd.getDate() + expiryDays);

            // Resolve plan
            const { data: plan } = await supabaseAdmin
                .schema('core')
                .from('app_plans')
                .select('*')
                .or(`name.ilike.${planId},id.eq.${planId}`)
                .maybeSingle();

            if (plan) {
                // Activate organization
                await supabaseAdmin
                    .schema('core')
                    .from('organizations')
                    .update({
                        subscription_tier: plan.name?.toLowerCase() || planId,
                        billing_cycle: billingCycle,
                        current_period_end: periodEnd.toISOString(),
                        status: 'active',
                        is_active: true,
                        trial_ends_at: null,
                        enabled_modules: plan.enabled_modules || ['mandi', 'finance', 'crm'],
                        max_web_users: plan.max_web_users || 2,
                        max_mobile_users: plan.max_mobile_users || 1,
                        updated_at: now.toISOString(),
                    })
                    .eq('id', orgId);

                // Upsert subscription
                await supabaseAdmin
                    .schema('core')
                    .from('subscriptions')
                    .upsert({
                        organization_id: orgId,
                        plan_id: plan.id,
                        status: 'active',
                        billing_cycle: billingCycle,
                        current_period_start: now.toISOString().split('T')[0],
                        current_period_end: periodEnd.toISOString().split('T')[0],
                        next_invoice_date: periodEnd.toISOString().split('T')[0],
                        last_payment_at: now.toISOString(),
                        mrr_amount: billingCycle === 'yearly' ? (plan.price_yearly || 0) / 12 : (plan.price_monthly || 0),
                        trial_ends_at: null,
                        retry_count: 0,
                    }, { onConflict: 'organization_id', ignoreDuplicates: false });
            }

            // Increment coupon usage
            if (couponCode) {
                const { data: coupon } = await supabaseAdmin
                    .schema('core')
                    .from('subscription_coupons')
                    .select('id, current_uses')
                    .eq('code', couponCode)
                    .maybeSingle();
                if (coupon) {
                    await supabaseAdmin
                        .schema('core')
                        .from('subscription_coupons')
                        .update({ current_uses: (coupon.current_uses || 0) + 1 })
                        .eq('id', coupon.id);
                }
            }

            // Log billing event
            try {
                await supabaseAdmin
                    .schema('core')
                    .from('billing_events')
                    .insert({
                        organization_id: orgId,
                        event_type: 'payment_received',
                        new_value: JSON.stringify({
                            gateway: 'smepay', amount: amount || matchingAttempt.amount,
                            transaction_id, plan_id: planId, billing_cycle: billingCycle,
                        }),
                        notes: `SME Pay payment confirmed. Order: ${order_id}`,
                    });
            } catch (_) { /* non-fatal — billing event log */ }

            console.log(`[SME Pay Webhook] ✅ Activated org ${orgId} on plan ${planId}`);
        } else {
            await supabaseAdmin
                .schema('core')
                .from('payment_attempts')
                .update({ status: payment_status === 'FAILED' ? 'failed' : 'pending' })
                .eq('id', matchingAttempt.id);

            console.log(`[SME Pay Webhook] Payment status ${payment_status} for org ${orgId}`);
        }

        return NextResponse.json({ received: true, matched: true, activated: isSuccess });

    } catch (e: any) {
        console.error('[SME Pay Webhook] Error:', e.message);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}

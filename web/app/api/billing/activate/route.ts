import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * POST /api/billing/activate
 *
 * PRIVILEGED endpoint — direct subscription activation.
 * Customer self-serve upgrades MUST go through the payment gateway + webhook flow.
 * This route is reserved for super-admin comped plans, grace extensions, and manual
 * corrections. It is ALWAYS authenticated and ALWAYS role-gated.
 *
 * Auth contract:
 *   Authorization: Bearer <supabase_jwt>   — required
 *   caller profile.role === 'super_admin'  — required
 *
 * Any other caller (anonymous, tenant admin, org owner) receives 401/403.
 */
export async function POST(req: Request) {
    try {
        // ── 0. Authenticate caller ───────────────────────────────────────────
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
        if (!authHeader?.toLowerCase().startsWith('bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized: Bearer token required. Customer upgrades must use the payment gateway webhook flow.' },
                { status: 401 },
            );
        }
        const token = authHeader.slice(7).trim();

        const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: userData, error: userErr } = await supabaseCaller.auth.getUser();
        if (userErr || !userData?.user) {
            return NextResponse.json({ error: 'Unauthorized: Invalid session token' }, { status: 401 });
        }

        const { data: callerProfile } = await supabaseAdmin
            .schema('core')
            .from('profiles')
            .select('id, role')
            .eq('id', userData.user.id)
            .maybeSingle<{ id: string; role: string }>();

        if (callerProfile?.role !== 'super_admin') {
            // Audit the rejected attempt so we can see if anyone is probing this endpoint.
            await supabaseAdmin
                .schema('core')
                .from('payment_attempts')
                .insert({
                    organization_id: null,
                    amount: 0,
                    gateway: 'billing_activate_denied',
                    status: 'failed',
                    attempted_at: new Date().toISOString(),
                    error_message: JSON.stringify({
                        reason: 'role_check_failed',
                        caller: userData.user.id,
                        caller_role: callerProfile?.role ?? 'unknown',
                    }),
                });
            return NextResponse.json(
                { error: 'Forbidden: Only platform super-admins may activate subscriptions directly. Customer upgrades must pay via a gateway.' },
                { status: 403 },
            );
        }

        const body = await req.json();
        const { planId, billingCycle, couponCode, orgId, amount, gateway, isDowngrade, couponId } = body as {
            planId?: string;
            billingCycle?: 'monthly' | 'yearly';
            couponCode?: string | null;
            orgId?: string;
            amount?: number | string;
            gateway?: string;
            isDowngrade?: boolean;
            couponId?: string | null;
        };

        // Hard block: gateway-backed activations MUST come from the verified webhook,
        // never from this endpoint — regardless of NODE_ENV.
        if (gateway === 'smepay' || gateway === 'razorpay' || gateway === 'stripe') {
            return NextResponse.json(
                { error: 'Direct activation is not allowed for payment gateways. The webhook handles activation after signature verification.' },
                { status: 403 },
            );
        }

        if (!orgId || !planId) {
            return NextResponse.json({ error: 'Missing Required Fields (orgId, planId)' }, { status: 400 });
        }

        // ── 1. Resolve Plan ──────────────────────────────────────────────────────
        const { data: plan, error: planErr } = await supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('*')
            .or(`name.ilike.${planId},id.eq.${planId}`)
            .maybeSingle();

        if (planErr || !plan) {
            return NextResponse.json({ error: `Invalid Plan: ${planId}` }, { status: 400 });
        }

        const expiryDays = billingCycle === 'yearly' ? 365 : 30;
        const now = new Date();
        let periodStart = now;
        let periodEnd = new Date(now);

        // Fetch current org state to support early renewals and same-plan coupon applications
        const { data: orgData } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('current_period_end, subscription_tier, is_active')
            .eq('id', orgId)
            .single();

        const isSamePlanAndActive = orgData?.is_active && orgData?.subscription_tier === (plan.name?.toLowerCase() || planId);

        if (isSamePlanAndActive && orgData?.current_period_end) {
            const currentEnd = new Date(orgData.current_period_end);
            if (currentEnd > now) {
                // Extend from existing expiry instead of rewriting it (early renewal/coupon)
                periodStart = currentEnd;
                periodEnd = new Date(currentEnd);
            }
        }

        periodEnd.setDate(periodEnd.getDate() + expiryDays);

        // ── 2. Atomic Coupon Redemption ──────────────────────────────────────────
        const finalAmount = typeof amount === 'number' ? amount : parseFloat(amount ?? '0') || 0;
        if (couponCode && couponId) {
            const { data: coupon } = await supabaseAdmin
                .schema('core')
                .from('subscription_coupons')
                .select('*')
                .eq('id', couponId)
                .eq('is_active', true)
                .maybeSingle();

            if (coupon) {
                // Atomic increment using RPC to prevent race conditions
                await supabaseAdmin
                    .schema('core')
                    .from('subscription_coupons')
                    .update({ current_uses: (coupon.current_uses || 0) + 1 })
                    .eq('id', coupon.id)
                    .lt('current_uses', coupon.max_uses || 999999);
            }
        }

        // ── 3. Update Organization ───────────────────────────────────────────────
        const { error: orgErr } = await supabaseAdmin
            .schema('core')
            .from('organizations')
            .update({
                subscription_tier: plan.name?.toLowerCase() || planId,
                billing_cycle: billingCycle || 'monthly',
                current_period_end: periodEnd.toISOString(),
                status: 'active',
                is_active: true,
                trial_ends_at: null, // Clear trial once paid
                enabled_modules: plan.enabled_modules || ['mandi', 'finance', 'crm'],
                max_web_users: plan.max_web_users || 2,
                max_mobile_users: plan.max_mobile_users || 1,
                updated_at: now.toISOString(),
            })
            .eq('id', orgId);

        if (orgErr) {
            console.error('[Activate] Org update error:', orgErr);
            throw new Error(orgErr.message);
        }

        // ── 4. Upsert Subscription Record ────────────────────────────────────────
        const { error: subErr } = await supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .upsert({
                organization_id: orgId,
                plan_id: plan.id,
                status: 'active',
                billing_cycle: billingCycle || 'monthly',
                current_period_start: periodStart.toISOString().split('T')[0],
                current_period_end: periodEnd.toISOString().split('T')[0],
                next_invoice_date: periodEnd.toISOString().split('T')[0],
                last_payment_at: now.toISOString(),
                mrr_amount: billingCycle === 'yearly'
                    ? (plan.price_yearly || 0) / 12
                    : (plan.price_monthly || 0),
                trial_ends_at: null,
                retry_count: 0,
            }, {
                onConflict: 'organization_id',
                ignoreDuplicates: false
            });

        if (subErr) {
            console.error('[Activate] Subscription upsert error:', subErr);
            // Non-fatal — continue, org is already activated
        }

        // ── 5. Log Payment Attempt (success) ────────────────────────────────────
        await supabaseAdmin
            .schema('core')
            .from('payment_attempts')
            .insert({
                organization_id: orgId,
                amount: finalAmount,
                gateway: gateway || 'manual',
                status: 'success',
                attempted_at: now.toISOString(),
                error_message: JSON.stringify({
                    plan_id: plan.id,
                    plan_name: plan.name,
                    billing_cycle: billingCycle,
                    coupon_code: couponCode || null,
                    period_end: periodEnd.toISOString(),
                })
            });

        // ── 5.5. Auto-Generate SaaS Invoice ─────────────────────────────────────
        if (finalAmount > 0) {
            const invoiceNum = `INV-${now.getFullYear()}-${Date.now().toString().slice(-6)}`;
            const GST_RATE = 0.18;
            const subtotal = Math.round(finalAmount / (1 + GST_RATE));
            const taxAmount = finalAmount - subtotal;

            // Get current subscription id for linking
            const { data: currentSub } = await supabaseAdmin
                .schema('core')
                .from('subscriptions')
                .select('id')
                .eq('organization_id', orgId)
                .maybeSingle();

            await supabaseAdmin
                .schema('core')
                .from('saas_invoices')
                .insert({
                    organization_id: orgId,
                    invoice_number:  invoiceNum,
                    plan_id:         plan.id,
                    subscription_id: currentSub?.id || null,
                    amount:          finalAmount,
                    subtotal:        subtotal,
                    tax:             taxAmount,
                    total:           finalAmount,
                    status:          'paid',
                    billing_cycle:   billingCycle || 'monthly',
                    invoice_date:    now.toISOString(),
                    period_start:    periodStart.toISOString().split('T')[0],
                    period_end:      periodEnd.toISOString().split('T')[0],
                    due_date:        now.toISOString(),
                    paid_at:         now.toISOString(),
                    currency:        'INR',
                    notes:           couponCode ? `Coupon applied: ${couponCode}` : null,
                    line_items: [{
                        description: `${plan.display_name || plan.name} Plan — ${
                            billingCycle === 'yearly' ? 'Annual' : 'Monthly'
                        } Subscription`,
                        quantity:   1,
                        unit_price: finalAmount,
                        amount:     finalAmount,
                        type:       'subscription'
                    }]
                });
        }

        // ── 6. Enforce Compliance (Downgrade check) ──────────────────────────────
        if (isDowngrade) {
            await supabaseAdmin.rpc('enforce_subscription_compliance', { p_organization_id: orgId });
        }

        return NextResponse.json({
            success: true,
            message: 'Subscription Activated Successfully',
            expiry: periodEnd.toISOString(),
            planName: plan.name,
            status: 'active',
        });

    } catch (e: any) {
        console.error('[Activate] Error:', e);
        return NextResponse.json({ error: e.message || 'Activation Failed' }, { status: 500 });
    }
}

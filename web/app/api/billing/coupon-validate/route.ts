import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: Request) {
    try {
        const { code, planId, cycle, amount } = await request.json();

        if (!code) {
            return NextResponse.json({ isValid: false, message: 'Coupon code is required' }, { status: 400 });
        }

        const { data: coupon, error } = await supabaseAdmin
            .schema('core')
            .from('subscription_coupons')
            .select('*')
            .eq('code', code.trim().toUpperCase())
            .eq('is_active', true)
            .maybeSingle();

        if (error || !coupon) {
            return NextResponse.json({ isValid: false, message: 'Invalid coupon code. Please check and try again.' });
        }

        // ── Expiry Check ────────────────────────────────────────────────────────
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
            return NextResponse.json({ isValid: false, message: 'This coupon has expired.' });
        }

        // ── Usage Limit Check ───────────────────────────────────────────────────
        if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) {
            return NextResponse.json({ isValid: false, message: 'This coupon has reached its usage limit.' });
        }

        // ── Plan Targeting Check ────────────────────────────────────────────────
        if (coupon.applicable_plans && coupon.applicable_plans.length > 0 && planId) {
            const planSlug = planId.toString().toLowerCase();
            const planMatch = coupon.applicable_plans.some((p: string) =>
                p.toLowerCase() === planSlug
            );
            if (!planMatch) {
                return NextResponse.json({ isValid: false, message: `This coupon is not valid for the ${planId} plan.` });
            }
        }

        // ── Billing Cycle Check ─────────────────────────────────────────────────
        if (coupon.applicable_cycles && coupon.applicable_cycles.length > 0 && cycle) {
            const cycleMatch = coupon.applicable_cycles.some((c: string) =>
                c.toLowerCase() === cycle.toLowerCase()
            );
            if (!cycleMatch) {
                return NextResponse.json({ isValid: false, message: `This coupon is only valid for ${coupon.applicable_cycles.join('/')} billing.` });
            }
        }

        // ── Minimum Amount Check ────────────────────────────────────────────────
        if (coupon.min_amount && amount != null && parseFloat(amount) < coupon.min_amount) {
            return NextResponse.json({ isValid: false, message: `This coupon requires a minimum order of ₹${coupon.min_amount}.` });
        }

        // ── Calculate Discount ──────────────────────────────────────────────────
        const discountType = coupon.discount_type === 'percentage' ? 'percentage' : 'flat';
        const discountAmount = parseFloat(coupon.discount_amount);

        let discountMessage = '';
        if (discountType === 'percentage') {
            discountMessage = `${discountAmount}% discount applied!`;
        } else {
            discountMessage = `₹${discountAmount} flat discount applied!`;
        }

        return NextResponse.json({
            isValid: true,
            amount: discountAmount,
            type: discountType,
            message: discountMessage,
            couponId: coupon.id,
            description: coupon.description || discountMessage,
        });

    } catch (e: any) {
        console.error('[Coupon Validate] Error:', e.message);
        return NextResponse.json({ isValid: false, message: 'Failed to validate coupon. Please try again.' }, { status: 500 });
    }
}

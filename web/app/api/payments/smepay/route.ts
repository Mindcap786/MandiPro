import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSmepayOrder, initiateSmepayPayment } from '@/lib/smepay';
import { v4 as uuidv4 } from 'uuid';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/payments/smepay
 * Creates an SME Pay order and initiates payment, returning QR code + UPI links
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { orgId, planId, billingCycle, amount, customerEmail, customerName, couponCode } = body;

        if (!orgId || !planId || !amount || !customerEmail) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const uniqueOrderId = `MP-${orgId.slice(0, 8)}-${uuidv4().slice(0, 8)}`;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL 
            || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        const callbackUrl = `${appUrl}/api/webhooks/smepay`;

        // Step 1: Create Order
        const orderResult = await createSmepayOrder({
            amount: String(amount),
            orderId: uniqueOrderId,
            callbackUrl,
            customerEmail,
            customerName: customerName || 'MandiGrow User',
        });

        if (!orderResult.status) {
            throw new Error(orderResult.message || 'Failed to create SME Pay order');
        }

        // Step 2: Initiate Payment (get QR + UPI links)
        const paymentResult = await initiateSmepayPayment(orderResult.slug);

        if (!paymentResult.status) {
            throw new Error(paymentResult.message || 'Failed to initiate SME Pay payment');
        }

        // Step 3: Log the payment attempt
        await supabaseAdmin
            .schema('core')
            .from('payment_attempts')
            .insert({
                organization_id: orgId,
                amount: parseFloat(amount),
                gateway: 'smepay',
                status: 'initiated',
                attempted_at: new Date().toISOString(),
                error_message: JSON.stringify({
                    smepay_order_id: orderResult.order_id,
                    smepay_slug: orderResult.slug,
                    local_order_id: uniqueOrderId,
                    plan_id: planId,
                    billing_cycle: billingCycle,
                    coupon_code: couponCode || null,
                    transaction_id: paymentResult.transaction_id,
                }),
            });

        return NextResponse.json({
            success: true,
            orderId: orderResult.order_id,
            slug: orderResult.slug,
            localOrderId: uniqueOrderId,
            transactionId: paymentResult.transaction_id,
            paymentLink: paymentResult.payment_url || paymentResult.payment_link,
            qrCode: paymentResult.qr_code,
            expiresAt: paymentResult.expires_at,
            intents: paymentResult.intents,
            paymentStatus: paymentResult.payment_status,
        });

    } catch (e: any) {
        console.error('[SME Pay] Error:', e.message);
        return NextResponse.json({ error: e.message || 'SME Pay payment failed' }, { status: 500 });
    }
}

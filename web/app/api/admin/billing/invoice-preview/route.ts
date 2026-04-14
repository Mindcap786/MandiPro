import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { organization_id, plan_id, billing_cycle = 'monthly', extra_users = 0, storage_gb = 0 } = body;

    if (!organization_id || !plan_id) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch plan
    const { data: plan, error: planError } = await supabaseAdmin
        .schema('core')
        .from('app_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

    if (planError || !plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Fetch org
    const { data: org } = await supabaseAdmin
        .schema('core')
        .from('organizations')
        .select('id, name, subscription_tier')
        .eq('id', organization_id)
        .single();

    // Build line items
    const lineItems = [];
    const basePrice = billing_cycle === 'yearly' ? (plan.price_yearly || plan.price_monthly * 12) : plan.price_monthly;

    lineItems.push({
        description: `${plan.display_name} Plan — ${billing_cycle === 'yearly' ? 'Annual' : 'Monthly'} Subscription`,
        quantity: 1,
        unit_price: basePrice,
        amount: basePrice,
        type: 'base'
    });

    let extraUserAmount = 0;
    if (extra_users > 0 && plan.price_per_user > 0) {
        extraUserAmount = extra_users * plan.price_per_user;
        lineItems.push({
            description: `Additional Users (${extra_users} users × ₹${plan.price_per_user}/user)`,
            quantity: extra_users,
            unit_price: plan.price_per_user,
            amount: extraUserAmount,
            type: 'per_user'
        });
    }

    let storageAmount = 0;
    const extraStorage = Math.max(0, storage_gb - plan.storage_gb_included);
    if (extraStorage > 0 && plan.price_per_gb > 0) {
        storageAmount = extraStorage * plan.price_per_gb;
        lineItems.push({
            description: `Additional Storage (${extraStorage.toFixed(1)} GB × ₹${plan.price_per_gb}/GB)`,
            quantity: extraStorage,
            unit_price: plan.price_per_gb,
            amount: storageAmount,
            type: 'storage'
        });
    }

    const subtotal = basePrice + extraUserAmount + storageAmount;
    const tax = 0;
    const total = subtotal + tax;

    const now = new Date();

    return NextResponse.json({
        organization: org,
        plan: {
            id: plan.id,
            name: plan.name,
            display_name: plan.display_name,
            billing_cycle,
            price_monthly: plan.price_monthly,
            price_yearly: plan.price_yearly,
        },
        line_items: lineItems,
        subtotal,
        tax,
        total,
        period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
        period_end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
        currency: 'INR',
        generated_at: now.toISOString()
    });
}

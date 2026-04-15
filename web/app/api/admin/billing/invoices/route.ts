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

export async function GET(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = adminClient();

    const { data: invoices, error } = await supabaseAdmin
        .schema('core')
        .from('saas_invoices')
        .select('*')
        .order('invoice_date', { ascending: false })
        .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch orgs and plans for enrichment
    const orgIds = Array.from(new Set((invoices || []).map((i: any) => i.organization_id)));
    const planIds = Array.from(new Set((invoices || []).map((i: any) => i.plan_id).filter(Boolean)));


    const [{ data: orgs }, { data: plans }] = await Promise.all([
        supabaseAdmin.schema('core').from('organizations').select('id, name').in('id', orgIds as string[]),
        supabaseAdmin.schema('core').from('app_plans').select('id, name, display_name').in('id', planIds as string[])
    ]);

    const orgMap = Object.fromEntries((orgs || []).map((o: any) => [o.id, o]));
    const planMap = Object.fromEntries((plans || []).map((p: any) => [p.id, p]));

    const enriched = (invoices || []).map((inv: any) => ({
        ...inv,
        org: orgMap[inv.organization_id] || null,
        plan: planMap[inv.plan_id] || null,
    }));

    return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'manage');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = adminClient();
    const body = await req.json();
    const { organization_id, plan_id, period_start, period_end, notes } = body;

    if (!organization_id || !plan_id) {
        return NextResponse.json({ error: 'organization_id and plan_id are required' }, { status: 400 });
    }

    // Fetch plan details
    const { data: plan, error: planError } = await supabaseAdmin
        .schema('core')
        .from('app_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

    if (planError || !plan) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Generate invoice number
    const count = await supabaseAdmin.schema('core').from('saas_invoices').select('id', { count: 'exact', head: true });
    const invNum = 'INV-' + new Date().getFullYear() + '-' + String((count.count || 0) + 1).padStart(4, '0');

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 7);

    const lineItems = [
        {
            description: `${plan.display_name} Plan — Monthly Subscription`,
            quantity: 1,
            unit_price: plan.price_monthly,
            amount: plan.price_monthly
        }
    ];

    const { data: invoice, error: invError } = await supabaseAdmin
        .schema('core')
        .from('saas_invoices')
        .insert({
            organization_id,
            plan_id,
            invoice_number: invNum,
            period_start: period_start || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
            period_end: period_end || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
            amount: plan.price_monthly,
            subtotal: plan.price_monthly,
            tax: 0,
            total: plan.price_monthly,
            status: 'pending',
            invoice_date: now.toISOString(),
            due_date: dueDate.toISOString(),
            currency: 'INR',
            line_items: lineItems,
            notes: notes || null
        })
        .select()
        .single();

    if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

    return NextResponse.json({ success: true, invoice });
}

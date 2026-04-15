import { createClient } from '@supabase/supabase-js';
import { NextResponse, NextRequest } from 'next/server';
import { cached, TTL } from '@/lib/server-cache';
import { verifyAdminAccess } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
    const auth = await verifyAdminAccess(req, 'billing', 'read');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch all subscriptions with plan + org info (cached 10s for repeated dashboard loads)
    const { data: subs, error: subError } = await cached(
        'billing_stats:subs',
        async () => supabaseAdmin
            .schema('core')
            .from('subscriptions')
            .select('id, organization_id, mrr_amount, status, plan_id, billing_cycle, created_at, suspended_at, next_invoice_date')
            .order('created_at', { ascending: false }),
        TTL.SHORT
    );

    if (subError) {
        return NextResponse.json({ error: subError.message }, { status: 500 });
    }

    // Fetch plans (cached 1m — rarely changes)
    const { data: plans } = await cached(
        'plans:active_list',
        async () => supabaseAdmin
            .schema('core')
            .from('app_plans')
            .select('id, name, display_name, price_monthly, sort_order')
            .eq('is_active', true)
            .order('sort_order'),
        TTL.MEDIUM
    );

    // Fetch all orgs for tenant count (cached 10s)
    const { data: orgs } = await cached(
        'billing_stats:orgs',
        async () => supabaseAdmin
            .schema('core')
            .from('organizations')
            .select('id, name, subscription_tier, is_active, created_at'),
        TTL.SHORT
    );

    // Fetch invoices for trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const { data: invoices } = await supabaseAdmin
        .schema('core')
        .from('saas_invoices')
        .select('amount, total, status, invoice_date, paid_at, organization_id')
        .gte('invoice_date', sixMonthsAgo.toISOString())
        .order('invoice_date', { ascending: true });

    const activeSubs = (subs || []).filter((s: any) => s.status === 'active');
    const suspendedSubs = (subs || []).filter((s: any) => s.status === 'suspended');
    const trialingSubs = (subs || []).filter((s: any) => s.status === 'trialing');
    const gracePeriodSubs = (subs || []).filter((s: any) => s.status === 'grace_period');

    // Alert counts: expiring within 7 days
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);
    const expiringTrials = trialingSubs.filter((s: any) => {
        if (!s.trial_ends_at) return false;
        const t = new Date(s.trial_ends_at);
        return t >= now && t <= sevenDaysFromNow;
    }).length;
    const expiringSubs = activeSubs.filter((s: any) => {
        if (!s.next_invoice_date) return false;
        const t = new Date(s.next_invoice_date);
        return t >= now && t <= sevenDaysFromNow;
    }).length;

    // MRR
    const mrr = activeSubs.reduce((sum: number, s: any) => sum + (Number(s.mrr_amount) || 0), 0);
    const arr = mrr * 12;

    // ARPU
    const arpu = activeSubs.length > 0 ? mrr / activeSubs.length : 0;

    // Churn: suspended / total
    const totalSubs = (subs || []).length;
    const churnRate = totalSubs > 0 ? ((suspendedSubs.length / totalSubs) * 100).toFixed(1) : '0.0';

    // Plan distribution
    const planMap = Object.fromEntries((plans || []).map((p: any) => [p.id, p]));
    const planDist: Record<string, { name: string; display_name: string; count: number; mrr: number }> = {};
    for (const sub of activeSubs) {
        const plan = planMap[sub.plan_id];
        if (!plan) continue;
        if (!planDist[plan.name]) {
            planDist[plan.name] = { name: plan.name, display_name: plan.display_name, count: 0, mrr: 0 };
        }
        planDist[plan.name].count += 1;
        planDist[plan.name].mrr += Number(sub.mrr_amount) || 0;
    }

    // Revenue trend — group paid invoices by month
    const trendMap: Record<string, number> = {};
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        trendMap[key] = 0;
        months.push(key);
    }
    for (const inv of invoices || []) {
        if (inv.status === 'paid') {
            const d = new Date(inv.invoice_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (trendMap[key] !== undefined) {
                trendMap[key] += Number(inv.total || inv.amount) || 0;
            }
        }
    }
    const revenueTrend = months.map(m => ({
        month: m,
        label: new Date(m + '-01').toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        revenue: trendMap[m]
    }));

    // Pending revenue
    const pendingRevenue = (invoices || [])
        .filter((i: any) => i.status === 'pending')
        .reduce((sum: number, i: any) => sum + (Number(i.total || i.amount) || 0), 0);

    return NextResponse.json({
        mrr,
        arr,
        arpu,
        churn_rate: parseFloat(churnRate),
        active_tenants: activeSubs.length,
        total_tenants: (orgs || []).length,
        suspended_count: suspendedSubs.length,
        pending_revenue: pendingRevenue,
        plan_distribution: Object.values(planDist),
        revenue_trend: revenueTrend,
        plans: plans || [],
        // Alert dashboard counts
        alert_counts: {
            expiring_trials:   expiringTrials,
            expiring_subs:     expiringSubs,
            grace_period:      gracePeriodSubs.length,
            suspended:         suspendedSubs.length,
            trialing:          trialingSubs.length,
        }
    });
}

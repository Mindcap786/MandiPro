/**
 * GET /api/admin/metrics
 *
 * Platform-level dashboard metrics for super_admin.
 * Returns: tenant counts, MRR/ARR, risk signals (churn, negative stock/ledger), health score.
 *
 * Replaces the 4 separate raw Supabase queries in admin/page.tsx fetchAll().
 * Secured: super_admin role only.
 */
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function createAdminServerClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

function createServiceClient() {
  const { createClient } = require('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface PlatformMetrics {
  total_mandis: number
  active_mandis: number
  trial_mandis: number
  grace_period_mandis: number
  suspended_mandis: number
  churn_risk_count: number
  negative_stock_count: number
  negative_ledger_count: number
  mrr: number
  arr: number
  health_score: number
  recent_audit_count: number
  critical_alerts_count: number
  system_status: 'healthy' | 'degraded' | 'critical'
}

export async function GET() {
  // Auth check
  const supabase = createAdminServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .schema('core')
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Use service role for cross-tenant reads
  const admin = createServiceClient()

  const [
    orgCountsRes,
    stockAlertsRes,
    ledgerAlertsRes,
    mrrRes,
    auditCountRes,
  ] = await Promise.allSettled([
    // Tenant counts by status
    admin.schema('core').from('organizations')
      .select('status', { count: 'exact', head: false })
      .neq('status', 'deleted'),

    // Negative stock lots
    admin.schema('mandi').from('lots')
      .select('id', { count: 'exact', head: true })
      .lt('current_qty', 0),

    // Negative ledger entries (unusual double-entry violations)
    admin.schema('mandi').from('ledger')
      .select('id', { count: 'exact', head: true })
      .lt('debit', 0),

    // MRR from active app_plans via subscriptions
    admin.schema('core').from('subscriptions')
      .select('plan:app_plans(price_monthly)')
      .eq('status', 'active'),

    // Audit count for last 24h
    admin.schema('core').from('audit_log' as never)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
  ])

  // Parse org counts
  const orgs = orgCountsRes.status === 'fulfilled' ? (orgCountsRes.value.data || []) as Array<{ status: string }> : []
  const total_mandis = orgs.length
  const active_mandis = orgs.filter(o => o.status === 'active').length
  const trial_mandis = orgs.filter(o => ['trial', 'trialing'].includes(o.status)).length
  const grace_period_mandis = orgs.filter(o => o.status === 'grace_period').length
  const suspended_mandis = orgs.filter(o => o.status === 'suspended').length
  const churn_risk_count = grace_period_mandis + suspended_mandis

  // Stock + ledger alerts
  const negative_stock_count = stockAlertsRes.status === 'fulfilled' ? (stockAlertsRes.value.count ?? 0) : 0
  const negative_ledger_count = ledgerAlertsRes.status === 'fulfilled' ? (ledgerAlertsRes.value.count ?? 0) : 0

  // MRR
  let mrr = 0
  if (mrrRes.status === 'fulfilled' && mrrRes.value.data) {
    mrr = (mrrRes.value.data as Array<{ plan?: { price_monthly?: number } }>).reduce(
      (s, sub) => s + Number(sub.plan?.price_monthly ?? 0), 0
    )
  }
  const arr = mrr * 12

  // Audit count
  const recent_audit_count = auditCountRes.status === 'fulfilled' ? (auditCountRes.value.count ?? 0) : 0

  // Health score (simple heuristic)
  const critical_alerts_count = negative_stock_count + negative_ledger_count
  const health_score = Math.max(0, 100 - (critical_alerts_count * 2) - (churn_risk_count * 1))
  const system_status: PlatformMetrics['system_status'] =
    health_score >= 85 ? 'healthy' : health_score >= 70 ? 'degraded' : 'critical'

  const metrics: PlatformMetrics = {
    total_mandis, active_mandis, trial_mandis, grace_period_mandis, suspended_mandis,
    churn_risk_count, negative_stock_count, negative_ledger_count,
    mrr, arr, health_score, recent_audit_count, critical_alerts_count, system_status,
  }

  return NextResponse.json(metrics, {
    headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' }
  })
}

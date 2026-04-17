-- ============================================================================
-- Phase 4: Materialized Views for Dashboard & Billing Aggregations
--
-- These views pre-compute expensive aggregations so dashboards load instantly.
-- Refreshed via triggers on source tables (real-time accuracy) and optionally
-- via pg_cron for full consistency.
--
-- SAFETY: All CREATE OR REPLACE / IF NOT EXISTS — completely idempotent.
-- ============================================================================

-- ────────────────────────────────────────
-- VIEW 1: Tenant Dashboard Summary (per org)
-- Used by: /dashboard page — revenue, collections, inventory stats
-- ────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mandi.mv_tenant_dashboard AS
SELECT
    s.organization_id,
    COUNT(s.id) AS total_sales_count,
    COALESCE(SUM(s.total_amount), 0) AS total_revenue,
    COALESCE(SUM(CASE WHEN s.payment_status = 'pending' THEN s.total_amount ELSE 0 END), 0) AS pending_collections,
    COALESCE(SUM(CASE WHEN s.payment_status = 'confirmed' THEN s.total_amount ELSE 0 END), 0) AS confirmed_revenue,
    COUNT(CASE WHEN s.sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) AS sales_last_7_days,
    COALESCE(SUM(CASE WHEN s.sale_date >= CURRENT_DATE - INTERVAL '7 days' THEN s.total_amount ELSE 0 END), 0) AS revenue_last_7_days,
    COUNT(CASE WHEN s.sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) AS sales_last_30_days,
    COALESCE(SUM(CASE WHEN s.sale_date >= CURRENT_DATE - INTERVAL '30 days' THEN s.total_amount ELSE 0 END), 0) AS revenue_last_30_days,
    NOW() AS refreshed_at
FROM mandi.sales s
GROUP BY s.organization_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tenant_dash_org
    ON mandi.mv_tenant_dashboard (organization_id);

-- ────────────────────────────────────────
-- VIEW 2: Daily Sales Trend (for charts)
-- Used by: Dashboard sales chart, reports
-- ────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS mandi.mv_daily_sales_trend AS
SELECT
    organization_id,
    sale_date::DATE AS day,
    COUNT(*) AS sale_count,
    COALESCE(SUM(total_amount), 0) AS day_revenue,
    COALESCE(SUM(CASE WHEN payment_status = 'confirmed' THEN total_amount ELSE 0 END), 0) AS day_confirmed
FROM mandi.sales
WHERE sale_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY organization_id, sale_date::DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_trend_org_day
    ON mandi.mv_daily_sales_trend (organization_id, day);

-- ────────────────────────────────────────
-- VIEW 3: Platform Billing Summary (admin)
-- Used by: /admin/billing/stats — MRR, ARR, churn, plan distribution
-- ────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS core.mv_billing_summary AS
SELECT
    -- Active metrics
    COUNT(*) FILTER (WHERE s.status = 'active') AS active_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'trial') AS trial_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'suspended') AS suspended_subscriptions,
    COUNT(*) FILTER (WHERE s.status = 'expired') AS expired_subscriptions,
    COUNT(*) AS total_subscriptions,
    COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active'), 0) AS mrr,
    COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active'), 0) * 12 AS arr,
    CASE
        WHEN COUNT(*) FILTER (WHERE s.status = 'active') > 0
        THEN COALESCE(SUM(s.mrr_amount) FILTER (WHERE s.status = 'active'), 0) / COUNT(*) FILTER (WHERE s.status = 'active')
        ELSE 0
    END AS arpu,
    CASE
        WHEN COUNT(*) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE s.status = 'suspended')::NUMERIC / COUNT(*)::NUMERIC) * 100, 1)
        ELSE 0
    END AS churn_rate,
    NOW() AS refreshed_at
FROM core.subscriptions s;

-- ────────────────────────────────────────
-- VIEW 4: Plan Distribution (admin)
-- Used by: /admin/billing/stats — plan_distribution breakdown
-- ────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS core.mv_plan_distribution AS
SELECT
    p.id AS plan_id,
    p.name AS plan_name,
    p.display_name,
    COUNT(s.id) AS subscriber_count,
    COALESCE(SUM(s.mrr_amount), 0) AS plan_mrr
FROM core.app_plans p
LEFT JOIN core.subscriptions s ON s.plan_id = p.id AND s.status = 'active'
WHERE p.is_active = true
GROUP BY p.id, p.name, p.display_name
ORDER BY p.sort_order;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_plan_dist_plan
    ON core.mv_plan_distribution (plan_id);

-- ────────────────────────────────────────
-- VIEW 5: Tenant Health (admin)
-- Used by: /admin/tenant-health — quick overview per tenant
-- ────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS core.mv_tenant_health AS
SELECT
    o.id AS organization_id,
    o.name AS org_name,
    o.subscription_tier,
    o.status AS org_status,
    o.is_active,
    s.status AS sub_status,
    s.mrr_amount,
    s.current_period_end,
    s.billing_cycle,
    (SELECT COUNT(*) FROM core.profiles p WHERE p.organization_id = o.id AND p.is_active = true) AS active_users,
    (SELECT COUNT(*) FROM core.system_alerts a WHERE a.organization_id = o.id AND a.resolved_at IS NULL) AS open_alerts,
    NOW() AS refreshed_at
FROM core.organizations o
LEFT JOIN core.subscriptions s ON s.organization_id = o.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tenant_health_org
    ON core.mv_tenant_health (organization_id);

-- ────────────────────────────────────────
-- REFRESH FUNCTION: Call to refresh all materialized views
-- Can be triggered by pg_cron or manually
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION core.refresh_materialized_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mandi.mv_tenant_dashboard;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mandi.mv_daily_sales_trend;
    REFRESH MATERIALIZED VIEW CONCURRENTLY core.mv_billing_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY core.mv_plan_distribution;
    REFRESH MATERIALIZED VIEW CONCURRENTLY core.mv_tenant_health;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────
-- AUTO-REFRESH TRIGGER: Refresh tenant dashboard on sales changes
-- Runs CONCURRENTLY so it doesn't block transactions
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION mandi.trigger_refresh_dashboard()
RETURNS TRIGGER AS $$
BEGIN
    -- Only refresh if the view exists (safety check)
    PERFORM 1 FROM pg_matviews WHERE schemaname = 'mandi' AND matviewname = 'mv_tenant_dashboard';
    IF FOUND THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mandi.mv_tenant_dashboard;
    END IF;
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    -- Never let refresh failure block the transaction
    RAISE WARNING 'mv_tenant_dashboard refresh failed: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on sales INSERT/UPDATE/DELETE (statement-level, not row-level)
DROP TRIGGER IF EXISTS tg_refresh_dashboard_on_sales ON mandi.sales;
CREATE TRIGGER tg_refresh_dashboard_on_sales
    AFTER INSERT OR UPDATE OR DELETE ON mandi.sales
    FOR EACH STATEMENT
    EXECUTE FUNCTION mandi.trigger_refresh_dashboard();

-- ────────────────────────────────────────
-- RLS on Materialized Views
-- MVs don't support RLS directly, so access is controlled at query level.
-- Service_role API routes can read all. Client-side must filter by org_id.
-- ────────────────────────────────────────

-- Grant read access to authenticated users
GRANT SELECT ON mandi.mv_tenant_dashboard TO authenticated;
GRANT SELECT ON mandi.mv_daily_sales_trend TO authenticated;
GRANT SELECT ON core.mv_billing_summary TO authenticated;
GRANT SELECT ON core.mv_plan_distribution TO authenticated;
GRANT SELECT ON core.mv_tenant_health TO authenticated;

-- ============================================================================
-- pg_cron scheduling (run in production Supabase SQL editor):
--
-- SELECT cron.schedule('refresh-mat-views', '*/5 * * * *',
--   'SELECT core.refresh_materialized_views()');
--
-- This refreshes all views every 5 minutes. The trigger on sales
-- provides near-real-time updates for the tenant dashboard.
-- ============================================================================

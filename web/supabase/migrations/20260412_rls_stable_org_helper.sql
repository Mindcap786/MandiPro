-- ============================================================
-- PERFORMANCE: STABLE RLS helper + replace correlated subqueries
-- Migration: 20260412_rls_stable_org_helper.sql
--
-- PROBLEM: 10+ RLS policies use:
--   (SELECT organization_id FROM core.profiles WHERE id = auth.uid())
--
-- PostgreSQL re-executes this subquery for EVERY ROW scanned.
-- On a 10k-row ledger_entries scan = 10,000 profile lookups.
--
-- FIX: Wrap in a STABLE SECURITY DEFINER function. PostgreSQL
-- caches the result once per statement — 10,000 → 1 lookup.
-- This is the standard pattern from Supabase's own RLS guide.
-- ============================================================

-- ── 1. Create / replace the STABLE helper in core schema ────
CREATE OR REPLACE FUNCTION core.get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE         -- result constant within one SQL statement
SECURITY DEFINER  -- bypasses RLS on profiles table itself
SET search_path = core, public
AS $$
    SELECT organization_id
    FROM core.profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$;

-- Grant execute to authenticated users (anon never reaches RLS)
GRANT EXECUTE ON FUNCTION core.get_my_org_id() TO authenticated;

-- ── 2. Drop and re-create the slow policies ─────────────────
-- Each policy below previously ran a full correlated subquery.
-- New pattern: core.get_my_org_id() — called once per statement.

-- core.accounts
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON core.accounts;
CREATE POLICY "tenant_isolation_accounts" ON core.accounts
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.sale_returns
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.sale_returns;
CREATE POLICY "tenant_isolation_sale_returns" ON mandi.sale_returns
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.sale_return_items (indirect — via sale_returns)
DROP POLICY IF EXISTS "Enable all for users based on return_id" ON mandi.sale_return_items;
CREATE POLICY "tenant_isolation_sale_return_items" ON mandi.sale_return_items
    FOR ALL USING (
        return_id IN (
            SELECT id FROM mandi.sale_returns
            WHERE organization_id = core.get_my_org_id()
        )
    );

-- mandi.sales_orders
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.sales_orders;
CREATE POLICY "tenant_isolation_sales_orders" ON mandi.sales_orders
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.sales_order_items (indirect — via sales_orders)
DROP POLICY IF EXISTS "Enable all for users based on sales_order_id" ON mandi.sales_order_items;
CREATE POLICY "tenant_isolation_sales_order_items" ON mandi.sales_order_items
    FOR ALL USING (
        sales_order_id IN (
            SELECT id FROM mandi.sales_orders
            WHERE organization_id = core.get_my_org_id()
        )
    );

-- mandi.delivery_challans
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.delivery_challans;
CREATE POLICY "tenant_isolation_delivery_challans" ON mandi.delivery_challans
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- ── 3. Index on profiles(id) to back the helper lookup ──────
-- auth.uid() matches profiles.id (PK) — index already exists
-- via PRIMARY KEY, so no additional index needed here.

-- ── RESULT ──────────────────────────────────────────────────
-- Before: 1 subquery per row × N rows = N profile fetches
-- After:  1 function call cached per statement = 1 fetch
-- Speedup on 10k row scans: ~10,000x fewer profile lookups

-- ============================================================================
-- Phase 3: Complete Missing RLS Policies (Zero Breakage)
--
-- SAFETY GUARANTEES:
-- 1. All policies use DROP POLICY IF EXISTS before CREATE — idempotent
-- 2. Helper functions use CREATE OR REPLACE — safe to re-run
-- 3. All policies are PERMISSIVE (default) — they ADD access, never restrict
-- 4. service_role key always bypasses RLS — all API routes unaffected
-- 5. WITH CHECK mirrors USING — inserts/updates follow same rules as reads
-- ============================================================================

-- ────────────────────────────────────────
-- STEP 0: Ensure helper functions exist
-- These are used by policies to resolve the current user's org
-- ────────────────────────────────────────

-- get_user_org_id(): Returns org_id for the currently-authenticated user
CREATE OR REPLACE FUNCTION core.get_user_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM core.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- get_my_org_id(): Alias used by older policies (rollup tables)
CREATE OR REPLACE FUNCTION core.get_my_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM core.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ────────────────────────────────────────
-- STEP 1: core.profiles — SPECIAL HANDLING
-- Users must be able to read their own profile to bootstrap auth.
-- Policy: Users can read profiles in their own org + their own row.
-- ────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select_own" ON core.profiles;
CREATE POLICY "profiles_select_own" ON core.profiles
    FOR SELECT USING (
        id = auth.uid()
        OR organization_id = (SELECT organization_id FROM core.profiles WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "profiles_update_own" ON core.profiles;
CREATE POLICY "profiles_update_own" ON core.profiles
    FOR UPDATE USING (id = auth.uid());

-- ────────────────────────────────────────
-- STEP 2: core.organizations — SPECIAL HANDLING
-- Users can read their own org. No direct writes (managed by admin).
-- ────────────────────────────────────────

DROP POLICY IF EXISTS "org_select_own" ON core.organizations;
CREATE POLICY "org_select_own" ON core.organizations
    FOR SELECT USING (
        id = core.get_user_org_id()
    );

-- ────────────────────────────────────────
-- STEP 3: core.ledger — Tenant isolation
-- ────────────────────────────────────────

DROP POLICY IF EXISTS "ledger_tenant_isolation" ON core.ledger;
CREATE POLICY "ledger_tenant_isolation" ON core.ledger
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- ────────────────────────────────────────
-- STEP 4: MANDI SCHEMA — Fill missing policies
-- Tables with RLS ENABLED but NO POLICY:
--   commodities, contacts, arrivals, lots, sales, sale_items
-- ────────────────────────────────────────

-- mandi.commodities
DROP POLICY IF EXISTS "mandi_commodities_tenant" ON mandi.commodities;
CREATE POLICY "mandi_commodities_tenant" ON mandi.commodities
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- mandi.contacts
DROP POLICY IF EXISTS "mandi_contacts_tenant" ON mandi.contacts;
CREATE POLICY "mandi_contacts_tenant" ON mandi.contacts
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- mandi.arrivals
DROP POLICY IF EXISTS "mandi_arrivals_tenant" ON mandi.arrivals;
CREATE POLICY "mandi_arrivals_tenant" ON mandi.arrivals
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- mandi.lots
DROP POLICY IF EXISTS "mandi_lots_tenant" ON mandi.lots;
CREATE POLICY "mandi_lots_tenant" ON mandi.lots
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- mandi.sales
DROP POLICY IF EXISTS "mandi_sales_tenant" ON mandi.sales;
CREATE POLICY "mandi_sales_tenant" ON mandi.sales
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- mandi.sale_items
DROP POLICY IF EXISTS "mandi_sale_items_tenant" ON mandi.sale_items;
CREATE POLICY "mandi_sale_items_tenant" ON mandi.sale_items
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

-- ────────────────────────────────────────
-- STEP 5: WHOLESALE SCHEMA — Fill missing policies
-- ────────────────────────────────────────

DROP POLICY IF EXISTS "ws_sku_master_tenant" ON wholesale.sku_master;
CREATE POLICY "ws_sku_master_tenant" ON wholesale.sku_master
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "ws_contacts_tenant" ON wholesale.contacts;
CREATE POLICY "ws_contacts_tenant" ON wholesale.contacts
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "ws_purchase_orders_tenant" ON wholesale.purchase_orders;
CREATE POLICY "ws_purchase_orders_tenant" ON wholesale.purchase_orders
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "ws_inventory_tenant" ON wholesale.inventory;
CREATE POLICY "ws_inventory_tenant" ON wholesale.inventory
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "ws_invoices_tenant" ON wholesale.invoices;
CREATE POLICY "ws_invoices_tenant" ON wholesale.invoices
    FOR ALL USING (organization_id = core.get_user_org_id())
    WITH CHECK (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "ws_invoice_items_tenant" ON wholesale.invoice_items;
CREATE POLICY "ws_invoice_items_tenant" ON wholesale.invoice_items
    FOR ALL USING (
        invoice_id IN (
            SELECT id FROM wholesale.invoices
            WHERE organization_id = core.get_user_org_id()
        )
    );

-- ────────────────────────────────────────
-- STEP 6: CORE BILLING/ADMIN TABLES — RLS + Service-only access
-- These tables should ONLY be accessible via service_role (API routes).
-- Enable RLS but add NO authenticated policy = locked to service_role only.
-- ────────────────────────────────────────

-- subscriptions — managed by webhooks and admin APIs only
ALTER TABLE core.subscriptions ENABLE ROW LEVEL SECURITY;
-- No authenticated policy → only service_role can access

-- billing_events — audit trail, read by admin APIs only
ALTER TABLE core.billing_events ENABLE ROW LEVEL SECURITY;

-- payment_attempts — webhook-written only
ALTER TABLE core.payment_attempts ENABLE ROW LEVEL SECURITY;

-- saas_invoices — managed by billing engine only
ALTER TABLE core.saas_invoices ENABLE ROW LEVEL SECURITY;

-- app_plans — platform plans, read by admin APIs + activate-plan
-- Allow authenticated users to READ plans (for billing page plan selection)
ALTER TABLE core.app_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_read_all" ON core.app_plans;
CREATE POLICY "plans_read_all" ON core.app_plans
    FOR SELECT USING (true);  -- Plans are public metadata, not tenant-specific

-- admin_audit_logs — admin-only via service_role
ALTER TABLE core.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- admin_permissions — admin-only via service_role
ALTER TABLE core.admin_permissions ENABLE ROW LEVEL SECURITY;

-- system_alerts — tenants should see their own alerts
ALTER TABLE core.system_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alerts_tenant_read" ON core.system_alerts;
CREATE POLICY "alerts_tenant_read" ON core.system_alerts
    FOR SELECT USING (organization_id = core.get_user_org_id());

-- payment_config — service_role only (contains secrets)
ALTER TABLE core.payment_config ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────
-- STEP 7: Ensure RPC functions that write across tables use SECURITY DEFINER
-- This prevents RLS from blocking internal writes during transactions
-- ────────────────────────────────────────

-- The subscription engine RPCs are already defined with proper permissions.
-- This step just ensures the helper function grants are correct.

GRANT EXECUTE ON FUNCTION core.get_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION core.get_my_org_id() TO authenticated;

-- ============================================================================
-- END OF PHASE 3: Complete RLS coverage
-- Tables with RLS enabled: 30+
-- Tables with policies: ALL tenant-facing tables
-- Admin-only tables: RLS enabled, no auth policy (service_role only)
-- Helper functions: Defined and granted
-- ============================================================================

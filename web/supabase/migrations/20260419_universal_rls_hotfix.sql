-- ============================================================
-- PERFORMANCE HOTFIX V2: Robust PL/pgSQL RLS helper
-- Origin: User request to resolve infinite spinner on POS checkout 
-- Description: Switching from standard SQL COALESCE to strict PL/pgSQL 
-- IF/ELSE blocks. This prevents the PostgreSQL Query Optimizer from 
-- prematurely evaluating subqueries (the SubPlan bug) and ensures 
-- casting exceptions are safely caught natively instead of crashing Checkouts.
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_my_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_org_id uuid;
BEGIN
    -- 1. Try native Auth JWT helper (Safest)
    BEGIN
        v_org_id := (auth.jwt() -> 'claims' ->> 'organization_id')::uuid;
        IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;
        
        v_org_id := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;
        IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;
        
        v_org_id := (auth.jwt() ->> 'organization_id')::uuid;
        IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;
    EXCEPTION WHEN OTHERS THEN END;

    -- 2. Try REST request setting (PostgREST environment)
    BEGIN
        v_org_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'claims' ->> 'organization_id')::uuid;
        IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;
        
        v_org_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'organization_id')::uuid;
        IF v_org_id IS NOT NULL THEN RETURN v_org_id; END IF;
    EXCEPTION WHEN OTHERS THEN END;

    -- 3. FINAL SAFE FALLBACK (Runs ONLY if token is 100% missing, like in RPC)
    SELECT organization_id INTO v_org_id FROM core.profiles WHERE id = auth.uid() LIMIT 1;
    RETURN v_org_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION core.get_my_org_id() TO authenticated;

-- ============================================================
-- 2. UNIVERSAL POLICY UPDATES
-- ============================================================

-- core.accounts
DROP POLICY IF EXISTS "tenant_isolation_accounts" ON core.accounts;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON core.accounts;
CREATE POLICY "tenant_isolation_accounts" ON core.accounts
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- core.profiles
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON core.profiles;
DROP POLICY IF EXISTS "tenant_isolation_profiles" ON core.profiles;
CREATE POLICY "tenant_isolation_profiles" ON core.profiles
    FOR ALL USING (organization_id = core.get_my_org_id());

-- mandi.ledger_entries (CRITICAL PERFORMANCE)
DROP POLICY IF EXISTS "tenant_isolation_ledger_entries" ON mandi.ledger_entries;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.ledger_entries;
CREATE POLICY "tenant_isolation_ledger_entries" ON mandi.ledger_entries
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.vouchers
DROP POLICY IF EXISTS "tenant_isolation_vouchers" ON mandi.vouchers;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.vouchers;
CREATE POLICY "tenant_isolation_vouchers" ON mandi.vouchers
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.sales
DROP POLICY IF EXISTS "tenant_isolation_sales" ON mandi.sales;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.sales;
CREATE POLICY "tenant_isolation_sales" ON mandi.sales
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.arrivals
DROP POLICY IF EXISTS "tenant_isolation_arrivals" ON mandi.arrivals;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.arrivals;
CREATE POLICY "tenant_isolation_arrivals" ON mandi.arrivals
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.lots
DROP POLICY IF EXISTS "tenant_isolation_lots" ON mandi.lots;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.lots;
CREATE POLICY "tenant_isolation_lots" ON mandi.lots
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());

-- mandi.contacts
DROP POLICY IF EXISTS "tenant_isolation_contacts" ON mandi.contacts;
DROP POLICY IF EXISTS "Enable all for users based on organization_id" ON mandi.contacts;
CREATE POLICY "tenant_isolation_contacts" ON mandi.contacts
    FOR ALL USING (organization_id = core.get_my_org_id())
    WITH CHECK (organization_id = core.get_my_org_id());


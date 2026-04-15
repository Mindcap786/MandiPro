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

-- ============================================================
-- PERFORMANCE HOTFIX: Robust RLS helper
-- Origin: User request to resolve infinite spinner on POS checkout 
-- Description: The original RLS helper relied on querying the profiles 
-- table, creating thousands of nested queries. This hotfix utilizes Custom JWT Claims 
-- for lighting-fast resolution, while retaining a robust DB lookup fallback 
-- for secure RPC invocations where JWT contexts are stripped.
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        -- 1. Try FAST path: Read from JWT first (Speed Boost for UI Lookups)
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'claims' ->> 'organization_id')::uuid,
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'organization_id')::uuid,
        (auth.jwt() -> 'claims' ->> 'organization_id')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid,
        
        -- 2. Try SAFE path: Fallback to database lookup if inside a secure RPC or missing context
        (SELECT organization_id FROM core.profiles WHERE id = auth.uid() LIMIT 1)
    );
$$;

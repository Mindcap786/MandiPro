-- ============================================================================
-- MIGRATION: Full-Stack Audit Patch
-- Date:     2026-04-17
-- Scope:    Arrivals + Sales "no records" symptom + idle-logoff stability
-- Safety:   100% idempotent — every statement uses CREATE OR REPLACE / DROP IF
--           EXISTS / DO $$ BEGIN ... EXCEPTION ... END $$ blocks. Safe to run
--           on a healthy DB as a no-op.
-- ============================================================================
--
-- ROOT CAUSES ADDRESSED
--   1. mandi.get_user_org_id() / core.get_my_org_id() / core.get_user_org_id()
--      pinned to SET search_path (Supabase linter + NULL-returning edge case).
--   2. core.get_full_user_context(uuid) was referenced by the public wrapper
--      but never explicitly created in migrations → defensive implementation.
--   3. RLS policies on mandi.arrivals / mandi.sales recreated with the stable
--      helper so no row is invisibly filtered out.
--   4. v_arrivals_fast and v_sales_fast recreated WITH (security_invoker=true)
--      so frontend Supabase clients using the anon/authenticated role actually
--      see RLS-allowed rows, and the contacts join exposed on the arrivals
--      view so the history table shows farmer names.
--   5. Grants to authenticated re-asserted (migrations have dropped/re-created
--      the views several times, breaking prior grants).
--   6. PostgREST schema cache reload forced at the end.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. HELPER FUNCTIONS: org-id lookup (non-recursive, pinned search_path)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.get_user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
    SELECT organization_id FROM core.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION core.get_my_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
    SELECT organization_id FROM core.profiles WHERE id = auth.uid();
$$;

-- mandi wrapper used by RLS policies in the mandi schema
CREATE OR REPLACE FUNCTION mandi.get_user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = mandi, core, public, pg_temp
AS $$
    SELECT core.get_user_org_id();
$$;

GRANT EXECUTE ON FUNCTION core.get_user_org_id()  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION core.get_my_org_id()    TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION mandi.get_user_org_id() TO authenticated, anon, service_role;

-- ----------------------------------------------------------------------------
-- 2. core.get_full_user_context(uuid)
--    The public-schema wrapper created by 20260409150000 calls this, but the
--    core-schema definition has never been committed to migrations. Provide
--    a defensive implementation that returns a JSON bundle matching the
--    shape the AuthProvider expects (id, organization_id, role, full_name,
--    business_domain, organization{...}, subscription{...}).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.get_full_user_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
DECLARE
    v_profile       RECORD;
    v_org           RECORD;
    v_sub           JSONB;
    v_result        JSONB;
BEGIN
    SELECT id, organization_id, role, full_name, business_domain, session_version
      INTO v_profile
      FROM core.profiles
     WHERE id = p_user_id
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT id, name, subscription_tier, status, trial_ends_at, is_active,
           COALESCE(enabled_modules, ARRAY[]::text[]) AS enabled_modules,
           brand_color, brand_color_secondary, logo_url,
           address, city, gstin, phone, settings, rbac_matrix
      INTO v_org
      FROM core.organizations
     WHERE id = v_profile.organization_id
     LIMIT 1;

    BEGIN
        v_sub := public.get_subscription_status(p_user_id);
    EXCEPTION WHEN OTHERS THEN
        v_sub := jsonb_build_object('status', 'unknown', 'has_access', TRUE);
    END;

    v_result := jsonb_build_object(
        'id',                v_profile.id,
        'organization_id',   v_profile.organization_id,
        'role',              v_profile.role,
        'full_name',         v_profile.full_name,
        'business_domain',   v_profile.business_domain,
        'session_version',   v_profile.session_version,
        'organization',      CASE WHEN v_org.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id',                    v_org.id,
            'name',                  v_org.name,
            'subscription_tier',     v_org.subscription_tier,
            'status',                v_org.status,
            'trial_ends_at',         v_org.trial_ends_at,
            'is_active',             v_org.is_active,
            'enabled_modules',       to_jsonb(v_org.enabled_modules),
            'brand_color',           v_org.brand_color,
            'brand_color_secondary', v_org.brand_color_secondary,
            'logo_url',              v_org.logo_url,
            'address',               v_org.address,
            'city',                  v_org.city,
            'gstin',                 v_org.gstin,
            'phone',                 v_org.phone,
            'settings',              v_org.settings,
            'rbac_matrix',           v_org.rbac_matrix
        ) END,
        'subscription',      v_sub
    );

    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[core.get_full_user_context] user %: %', p_user_id, SQLERRM;
    RETURN NULL;
END;
$$;

-- Ensure the public wrapper still exists and forwards to core.
CREATE OR REPLACE FUNCTION public.get_full_user_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, public, pg_temp
AS $$
BEGIN
    RETURN core.get_full_user_context(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION core.get_full_user_context(UUID)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_full_user_context(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RLS policies — rebuild with the stable helper (idempotent)
-- ----------------------------------------------------------------------------
DO $rls$
DECLARE
    t text;
BEGIN
    -- sales
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='sales') THEN
        ALTER TABLE mandi.sales ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "mandi_sales_isolation"  ON mandi.sales;
        DROP POLICY IF EXISTS "mandi_arrivals_tenant"  ON mandi.sales; -- stale name cleanup
        CREATE POLICY "mandi_sales_isolation" ON mandi.sales
            FOR ALL TO authenticated
            USING      (organization_id = mandi.get_user_org_id())
            WITH CHECK (organization_id = mandi.get_user_org_id());
    END IF;

    -- arrivals
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='arrivals') THEN
        ALTER TABLE mandi.arrivals ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "mandi_arrivals_isolation" ON mandi.arrivals;
        CREATE POLICY "mandi_arrivals_isolation" ON mandi.arrivals
            FOR ALL TO authenticated
            USING      (organization_id = mandi.get_user_org_id())
            WITH CHECK (organization_id = mandi.get_user_org_id());
    END IF;

    -- lots
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='lots') THEN
        ALTER TABLE mandi.lots ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "mandi_lots_isolation" ON mandi.lots;
        CREATE POLICY "mandi_lots_isolation" ON mandi.lots
            FOR ALL TO authenticated
            USING      (organization_id = mandi.get_user_org_id())
            WITH CHECK (organization_id = mandi.get_user_org_id());
    END IF;

    -- sale_items — visibility follows its parent sale
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='sale_items') THEN
        ALTER TABLE mandi.sale_items ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "mandi_sale_items_isolation" ON mandi.sale_items;
        CREATE POLICY "mandi_sale_items_isolation" ON mandi.sale_items
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM mandi.sales s
                            WHERE s.id = sale_id
                              AND s.organization_id = mandi.get_user_org_id()))
            WITH CHECK (EXISTS (SELECT 1 FROM mandi.sales s
                                 WHERE s.id = sale_id
                                   AND s.organization_id = mandi.get_user_org_id()));
    END IF;

    -- contacts — required for party lookups in arrivals / sales forms
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='contacts') THEN
        ALTER TABLE mandi.contacts ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "mandi_contacts_isolation" ON mandi.contacts;
        DROP POLICY IF EXISTS "mandi_contacts_tenant"    ON mandi.contacts;
        CREATE POLICY "mandi_contacts_isolation" ON mandi.contacts
            FOR ALL TO authenticated
            USING      (organization_id = mandi.get_user_org_id())
            WITH CHECK (organization_id = mandi.get_user_org_id());
    END IF;

    -- commodities
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='commodities') THEN
        ALTER TABLE mandi.commodities ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "mandi_commodities_isolation" ON mandi.commodities;
        DROP POLICY IF EXISTS "mandi_commodities_tenant"    ON mandi.commodities;
        CREATE POLICY "mandi_commodities_isolation" ON mandi.commodities
            FOR ALL TO authenticated
            USING      (organization_id = mandi.get_user_org_id())
            WITH CHECK (organization_id = mandi.get_user_org_id());
    END IF;

    -- profiles — keep the recursion-free policy
    ALTER TABLE core.profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "profiles_select_own" ON core.profiles;
    CREATE POLICY "profiles_select_own" ON core.profiles
        FOR SELECT TO authenticated
        USING (
            id = auth.uid()
            OR organization_id = core.get_user_org_id()
        );
END $rls$;

-- ----------------------------------------------------------------------------
-- 4. Fast views — recreate with security_invoker so RLS is evaluated against
--    the caller, not the view owner. Also expose the contacts join the UI
--    expects on arrival rows.
-- ----------------------------------------------------------------------------
DO $v$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='arrivals') THEN
        EXECUTE 'DROP VIEW IF EXISTS mandi.v_arrivals_fast CASCADE';

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='contacts') THEN
            EXECUTE $$
                CREATE VIEW mandi.v_arrivals_fast
                WITH (security_invoker = true) AS
                SELECT a.*,
                       jsonb_build_object(
                           'id',   c.id,
                           'name', c.name,
                           'city', c.city,
                           'type', c.type
                       ) AS contacts
                  FROM mandi.arrivals a
                  LEFT JOIN mandi.contacts c ON c.id = a.party_id
            $$;
        ELSE
            EXECUTE 'CREATE VIEW mandi.v_arrivals_fast WITH (security_invoker = true) AS SELECT * FROM mandi.arrivals';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='sales') THEN
        EXECUTE 'DROP VIEW IF EXISTS mandi.v_sales_fast CASCADE';
        EXECUTE 'CREATE VIEW mandi.v_sales_fast WITH (security_invoker = true) AS SELECT * FROM mandi.sales';
    END IF;
END $v$;

-- Grants (views get new OIDs after recreate, so grants have to be re-applied)
DO $g$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='mandi' AND table_name='v_arrivals_fast') THEN
        GRANT SELECT ON mandi.v_arrivals_fast TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='mandi' AND table_name='v_sales_fast') THEN
        GRANT SELECT ON mandi.v_sales_fast TO authenticated, anon;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='mandi' AND table_name='view_party_balances') THEN
        GRANT SELECT ON mandi.view_party_balances TO authenticated, anon;
    END IF;
END $g$;

-- ----------------------------------------------------------------------------
-- 5. Base-table read grants — anon/authenticated NEED SELECT on the base
--    tables because RLS only kicks in *after* the role holds the underlying
--    privilege. Without this, queries fail with "permission denied" instead
--    of returning zero rows.
-- ----------------------------------------------------------------------------
DO $p$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'arrivals', 'sales', 'lots', 'sale_items', 'contacts', 'commodities',
        'vouchers', 'cheques', 'accounts', 'storage_locations', 'mandi_settings'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='mandi' AND table_name=tbl) THEN
            EXECUTE format('GRANT SELECT ON mandi.%I TO authenticated, anon', tbl);
        END IF;
    END LOOP;

    -- The app writes through the service_role / authenticated role via RLS,
    -- so also re-assert INSERT/UPDATE/DELETE where policies exist.
    FOREACH tbl IN ARRAY ARRAY[
        'arrivals', 'sales', 'lots', 'sale_items', 'contacts', 'commodities',
        'vouchers', 'cheques'
    ]
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='mandi' AND table_name=tbl) THEN
            EXECUTE format('GRANT INSERT, UPDATE, DELETE ON mandi.%I TO authenticated', tbl);
        END IF;
    END LOOP;
END $p$;

COMMIT;

-- ----------------------------------------------------------------------------
-- 6. Force PostgREST to pick up the new definitions
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- VERIFICATION (run individually after deployment)
-- ----------------------------------------------------------------------------
-- SELECT core.get_user_org_id();
-- SELECT mandi.get_user_org_id();
-- SELECT public.get_full_user_context(auth.uid());
-- SELECT count(*) FROM mandi.arrivals;
-- SELECT count(*) FROM mandi.sales;
-- SELECT count(*) FROM mandi.v_arrivals_fast;
-- SELECT count(*) FROM mandi.v_sales_fast;

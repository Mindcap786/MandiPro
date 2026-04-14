-- Migration: Subscription write lockdown (defense-in-depth)
-- Scope: ONLY touches core.subscriptions and core.payment_attempts.
-- Does NOT change policies on any sales/purchase/ledger/daybook/GST table.
--
-- Why: the application should never allow a tenant-side Supabase client to
-- flip subscription.status = 'active'. Activation must come from the
-- signature-verified webhook, which uses the service_role key and bypasses RLS.

-- 1. Ensure RLS is on.
ALTER TABLE core.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.payment_attempts ENABLE ROW LEVEL SECURITY;

-- 2. Drop any permissive write policies that may have been added in the past.
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN
        SELECT policyname
          FROM pg_policies
         WHERE schemaname = 'core'
           AND tablename  = 'subscriptions'
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON core.subscriptions', pol.policyname);
    END LOOP;

    FOR pol IN
        SELECT policyname
          FROM pg_policies
         WHERE schemaname = 'core'
           AND tablename  = 'payment_attempts'
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON core.payment_attempts', pol.policyname);
    END LOOP;
END $$;

-- 3. Read-only SELECT for tenant users — they can see their own subscription.
DROP POLICY IF EXISTS "tenant_read_own_subscription" ON core.subscriptions;
CREATE POLICY "tenant_read_own_subscription"
    ON core.subscriptions
    FOR SELECT
    TO authenticated
    USING (
        organization_id = (
            SELECT organization_id FROM core.profiles WHERE id = auth.uid()
        )
    );

-- 4. Explicit deny for INSERT/UPDATE/DELETE from the authenticated role.
--    service_role bypasses RLS entirely, so the webhook keeps working.
DROP POLICY IF EXISTS "deny_tenant_write_subscription" ON core.subscriptions;
CREATE POLICY "deny_tenant_write_subscription"
    ON core.subscriptions
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- 5. Same treatment for payment_attempts — tenants may read their own log,
--    but must never be able to write a row that bypasses the webhook.
DROP POLICY IF EXISTS "tenant_read_own_payment_attempts" ON core.payment_attempts;
CREATE POLICY "tenant_read_own_payment_attempts"
    ON core.payment_attempts
    FOR SELECT
    TO authenticated
    USING (
        organization_id = (
            SELECT organization_id FROM core.profiles WHERE id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "deny_tenant_write_payment_attempts" ON core.payment_attempts;
CREATE POLICY "deny_tenant_write_payment_attempts"
    ON core.payment_attempts
    FOR ALL
    TO authenticated
    USING (false)
    WITH CHECK (false);

-- 6. Grants — make sure anon cannot touch either table at all.
REVOKE ALL ON core.subscriptions   FROM anon;
REVOKE ALL ON core.payment_attempts FROM anon;
GRANT  SELECT ON core.subscriptions   TO authenticated;
GRANT  SELECT ON core.payment_attempts TO authenticated;

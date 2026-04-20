-- Migration: 20260420_fix_self_signup_org_provisioning.sql
-- Description: Fixes the self-service signup flow so that users who register
--              via /login (signup tab) actually get an organization, trial, and
--              subscription provisioned automatically.
--
-- Before this fix:
--   - Public signup sends raw_user_meta_data = { full_name, username, org_name, phone, ... }
--   - handle_new_user() reads raw_user_meta_data->>'organization_id' (which is NULL for self-signup)
--   - Profile is inserted with organization_id = NULL
--   - User lands on /dashboard with no org → empty state, no trial, no subscription
--
-- After this fix:
--   - When metadata contains org_name AND has NO organization_id, we INSERT into
--     core.organizations first. The existing trg_auto_create_trial trigger then
--     auto-creates the subscription, which in turn fires sync_org_subscription_status
--     to set is_active=true, trial_ends_at, subscription_tier on the org.
--   - Profile is then inserted with the new organization_id and role='owner'.
--
-- Does NOT change behavior for:
--   - Admin-provisioned path (/api/admin/provision): metadata includes organization_id
--     and role='tenant_admin' → the new branch is skipped entirely.
--   - Invite accept path: runs a separate RPC after signup → no change.
--
-- Downstream triggers relied upon (NOT modified):
--   - trg_auto_create_trial ON core.organizations → core.auto_create_trial_subscription()
--   - trg_sync_org_subscription_status ON core.subscriptions → core.sync_org_subscription_status()

-- ============================================================
-- 1. REPLACE handle_new_user() with self-signup branch added
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core
AS $$
DECLARE
    v_org_id       UUID;
    v_org_name     TEXT;
    v_meta_role    TEXT;
    v_final_role   TEXT;
BEGIN
    -- ─── Safely parse organization_id from metadata ──────────────────────
    BEGIN
        IF (NEW.raw_user_meta_data->>'organization_id') IS NOT NULL
           AND (NEW.raw_user_meta_data->>'organization_id') <> '' THEN
            v_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
        ELSE
            v_org_id := NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_org_id := NULL;
    END;

    v_org_name  := NULLIF(TRIM(NEW.raw_user_meta_data->>'org_name'), '');
    v_meta_role := NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '');

    -- ─── NEW BRANCH: self-signup org bootstrap ───────────────────────────
    -- Fires only when:
    --   1. User provided an org_name (they're signing up, not being invited)
    --   2. No organization_id was passed (not an admin-provisioned signup)
    --   3. No profile already exists for this user (idempotency guard)
    IF v_org_id IS NULL
       AND v_org_name IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM core.profiles WHERE id = NEW.id)
    THEN
        BEGIN
            INSERT INTO core.organizations (
                name,
                tenant_type
            )
            VALUES (
                v_org_name,
                'mandi'
            )
            RETURNING id INTO v_org_id;
            -- trg_auto_create_trial now creates the subscription row,
            -- which fires sync_org_subscription_status to set
            -- status='trial', is_active=true, trial_ends_at, subscription_tier.
        EXCEPTION WHEN OTHERS THEN
            -- Never fail the auth signup; log and fall through to the
            -- orgless profile insert (user can be assigned to an org later).
            RAISE WARNING 'handle_new_user: org bootstrap failed for % (org_name=%): %',
                NEW.id, v_org_name, SQLERRM;
            v_org_id := NULL;
        END;
    END IF;

    -- ─── Decide final role ───────────────────────────────────────────────
    -- 1. Use metadata role if explicitly set (admin-provisioned path).
    -- 2. If the self-signup branch above created an org, the user IS the owner.
    -- 3. If some other caller passed an organization_id, default to 'staff'.
    -- 4. Otherwise, minimal 'authenticated'.
    v_final_role := COALESCE(
        v_meta_role,
        CASE
            WHEN v_org_name IS NOT NULL AND v_org_id IS NOT NULL THEN 'owner'
            WHEN v_org_id IS NOT NULL                             THEN 'staff'
            ELSE                                                        'authenticated'
        END
    );

    -- ─── Insert profile ──────────────────────────────────────────────────
    INSERT INTO core.profiles (id, full_name, email, phone, username, role, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        LOWER(NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '')),
        v_final_role,
        v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, core.profiles.full_name),
        email     = COALESCE(EXCLUDED.email,     core.profiles.email),
        phone     = COALESCE(EXCLUDED.phone,     core.profiles.phone),
        username  = COALESCE(EXCLUDED.username,  core.profiles.username)
        -- role and organization_id intentionally NOT updated on conflict.
    ;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 2. TRIGGER BINDING — keep existing INSERT-only trigger
--    (DO NOT drop/recreate — this is the same as 20260418)
-- ============================================================
-- Intentionally a no-op; the existing on_auth_user_created trigger
-- created in 20260418_fix_auth_trigger_insert_only.sql already points
-- at public.handle_new_user(). CREATE OR REPLACE FUNCTION above
-- updates the body in place without touching the trigger binding.

-- ============================================================
-- 3. VERIFY (run these SELECTs separately after the migration)
-- ============================================================
-- Run AFTER the migration to confirm everything is wired:
--
--   -- a) trigger still bound to the function
--   SELECT tgname, tgenabled, pg_get_triggerdef(oid)
--   FROM pg_trigger
--   WHERE tgname = 'on_auth_user_created';
--
--   -- b) function body contains the self-signup branch
--   SELECT position('NEW BRANCH: self-signup org bootstrap' IN pg_get_functiondef('public.handle_new_user'::regproc)) > 0
--       AS self_signup_branch_present;

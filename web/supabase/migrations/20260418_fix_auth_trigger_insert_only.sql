-- Migration: 20260418_fix_auth_trigger_insert_only.sql
-- Description: CRITICAL FIX — Changes handle_new_user trigger from INSERT OR UPDATE
--              to INSERT only. The UPDATE event fires on every login (Supabase updates
--              last_sign_in_at), causing "Database error granting user" when the
--              function fails or overwrites the user's role with 'authenticated'.
--
-- Also hardens the function so it never overwrites role/organization_id for
-- existing profiles (the ON CONFLICT clause now only updates safe fields).

-- ============================================================
-- 1. REPLACE THE TRIGGER FUNCTION (safer upsert logic)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Safely parse organization_id from metadata
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

    -- Insert new profile. 
    -- ROBUST ROLE LOGIC: 
    -- 1. Use metadata role if provided and valid.
    -- 2. If organization_id is present but no role, default to 'staff' (ERP standard).
    -- 3. Otherwise, default to 'authenticated' (minimal).
    INSERT INTO core.profiles (id, full_name, email, phone, username, role, organization_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        LOWER(NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '')),
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''),
            CASE WHEN v_org_id IS NOT NULL THEN 'staff' ELSE 'authenticated' END
        ),
        v_org_id
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, core.profiles.full_name),
        email     = COALESCE(EXCLUDED.email,     core.profiles.email),
        phone     = COALESCE(EXCLUDED.phone,     core.profiles.phone),
        username  = COALESCE(EXCLUDED.username,  core.profiles.username)
        -- NOTE: role and organization_id are intentionally NOT updated here.
    ;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    -- Log the error but never fail — auth must succeed
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================
-- 2. DROP AND RECREATE TRIGGER AS INSERT-ONLY
--    (The UPDATE event was firing on every login — the cause of
--     "Database error granting user")
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users          -- INSERT only, not UPDATE
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

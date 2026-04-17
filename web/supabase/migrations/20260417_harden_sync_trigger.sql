-- Migration: 20260417_harden_sync_trigger.sql
-- Description: Makes the handle_new_user trigger safer against missing metadata

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core
AS $$
DECLARE
    v_has_public_profiles BOOLEAN;
    v_org_id UUID;
BEGIN
  -- 1. Safely parse organization_id
  BEGIN
    IF (NEW.raw_user_meta_data->>'organization_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'organization_id') != '' THEN
        v_org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;
    ELSE
        v_org_id := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_org_id := NULL;
  END;

  -- 2. Sync to core.profiles (Primary for MandiPro)
  INSERT INTO core.profiles (id, full_name, email, phone, username, role, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    LOWER(NEW.raw_user_meta_data->>'username'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'authenticated'),
    v_org_id
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    organization_id = EXCLUDED.organization_id;

  -- 3. Sync to public.profiles ONLY IF it exists
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') INTO v_has_public_profiles;
  
  IF v_has_public_profiles THEN
      INSERT INTO public.profiles (id, full_name, email, phone, username)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.email,
        NEW.raw_user_meta_data->>'phone',
        LOWER(NEW.raw_user_meta_data->>'username')
      )
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        username = EXCLUDED.username;
  END IF;

  RETURN NEW;
END;
$$;

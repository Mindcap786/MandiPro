-- Migration: 20260417_add_profile_contact_and_sync.sql
-- Description: Adds phone/username to core.profiles and implements auth sync trigger
-- Robust version: Handles cases where public.profiles might not exist

DO $$
BEGIN
    -- 1. Add columns to core.profiles if missing (This is the primary table)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'phone') THEN
        ALTER TABLE core.profiles ADD COLUMN phone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'username') THEN
        ALTER TABLE core.profiles ADD COLUMN username TEXT;
    END IF;

    -- 2. Add columns to public.profiles ONLY IF it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'phone') THEN
            ALTER TABLE public.profiles ADD COLUMN phone TEXT;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username') THEN
            ALTER TABLE public.profiles ADD COLUMN username TEXT;
        END IF;
    END IF;
END $$;

-- 3. Ensure case-insensitive uniqueness on username in core
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_profiles_username_unique ON core.profiles (LOWER(username)) WHERE username IS NOT NULL;

-- 4. Create uniqueness on public.profiles ONLY IF it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_pub_profiles_username_unique') THEN
            CREATE UNIQUE INDEX idx_pub_profiles_username_unique ON public.profiles (LOWER(username)) WHERE username IS NOT NULL;
        END IF;
    END IF;
END $$;


-- 5. Create/Replace the sync trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, core
AS $$
DECLARE
    v_has_public_profiles BOOLEAN;
BEGIN
  -- Sync to core.profiles (Primary for MandiPro)
  INSERT INTO core.profiles (id, full_name, email, phone, username, role, organization_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    LOWER(NEW.raw_user_meta_data->>'username'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'authenticated'),
    (NEW.raw_user_meta_data->>'organization_id')::UUID
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    username = EXCLUDED.username,
    role = EXCLUDED.role,
    organization_id = EXCLUDED.organization_id;

  -- Sync to public.profiles ONLY IF it exists
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

-- 6. Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 7. Backfill existing data from auth.users metadata to core.profiles
UPDATE core.profiles p
SET 
  username = LOWER(u.raw_user_meta_data->>'username'),
  phone = u.raw_user_meta_data->>'phone'
FROM auth.users u
WHERE p.id = u.id AND (p.username IS NULL OR p.phone IS NULL);

-- 8. Backfill to public.profiles ONLY IF it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
        UPDATE public.profiles p
        SET 
          username = LOWER(u.raw_user_meta_data->>'username'),
          phone = u.raw_user_meta_data->>'phone'
        FROM auth.users u
        WHERE p.id = u.id AND (p.username IS NULL OR p.phone IS NULL);
    END IF;
END $$;

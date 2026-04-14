-- Add username column to core.profiles if not exists, with unique constraint
-- This supports the registration flow where users pick a unique username

DO $$
BEGIN
    -- Add column to core.profiles if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'core' AND table_name = 'profiles' AND column_name = 'username'
    ) THEN
        ALTER TABLE core.profiles ADD COLUMN username TEXT;
    END IF;

    -- Add column to public.profiles if missing (mirror table)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN username TEXT;
    END IF;
END $$;

-- Add unique constraint on core.profiles.username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_profiles_username_unique
    ON core.profiles (LOWER(username))
    WHERE username IS NOT NULL;

-- Add unique constraint on public.profiles.username
CREATE UNIQUE INDEX IF NOT EXISTS idx_pub_profiles_username_unique
    ON public.profiles (LOWER(username))
    WHERE username IS NOT NULL;

-- Add unique constraint on email too (prevent duplicate registrations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_profiles_email_unique
    ON core.profiles (LOWER(email))
    WHERE email IS NOT NULL;

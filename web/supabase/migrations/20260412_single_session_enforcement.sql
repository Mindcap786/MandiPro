-- Migration: 20260412_single_session_enforcement.sql
-- Description: Adds active_session_token to core.profiles AND enables Supabase
--              Realtime on the table so the AuthProvider eviction listener works.
--
-- IMPORTANT: Run this entire script in the Supabase SQL Editor.
--
-- How single-session works after this migration:
--   1. Every login calls POST /api/auth/new-session
--   2. That API generates a new UUID → writes to active_session_token
--   3. It also calls supabase.auth.admin.signOut(jwt, 'others') → kills old JWTs
--   4. Open sessions detect the UUID change via Realtime or 30-second polling
--   5. Mismatch → auto sign-out with "replaced on another device" message

-- ── Step 1: Add the column ────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'core'
          AND table_name   = 'profiles'
          AND column_name  = 'active_session_token'
    ) THEN
        ALTER TABLE core.profiles
            ADD COLUMN active_session_token UUID DEFAULT gen_random_uuid();

        COMMENT ON COLUMN core.profiles.active_session_token IS
            'Rotated on every login via /api/auth/new-session. '
            'Used to detect and evict sessions replaced by a newer login elsewhere.';
    END IF;
END $$;

-- ── Step 2: Enable Supabase Realtime on core.profiles ────────────────────────
-- Realtime is disabled by default on non-public schemas.
-- This makes the AuthProvider WebSocket listener receive UPDATE events instantly.
ALTER TABLE core.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
    -- Add to the Realtime publication if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname   = 'supabase_realtime'
          AND schemaname = 'core'
          AND tablename  = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE core.profiles;
    END IF;
END $$;

-- ── Step 3: Ensure service_role can update this column (it already can, but  ─
--            be explicit so future RLS changes don't accidentally block it)
-- (service_role bypasses RLS by design — this is just documentation)

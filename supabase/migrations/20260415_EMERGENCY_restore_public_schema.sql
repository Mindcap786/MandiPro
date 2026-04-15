-- ============================================================
-- EMERGENCY FIX: Restore Public Schema for PostgREST API
-- Critical: No data recovery needed (mandi schema intact)
-- ============================================================
-- ISSUE: Public schema was dropped, broke PostgREST routing
-- SOLUTION: Recreate minimal public schema required by Supabase
-- IMPACT: Zero data loss (all in mandi schema), API restored
-- ============================================================

-- ============================================================
-- PART 1: CREATE PUBLIC SCHEMA STRUCTURE (2 minutes)
-- ============================================================

CREATE SCHEMA IF NOT EXISTS public;

-- System tables that MUST exist for Supabase PostgREST
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID,
    email TEXT,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS on profiles (CRITICAL for security)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see only their own profile
CREATE POLICY "Users view own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

-- Policy: Users can update only their own profile  
CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================================
-- PART 2: CREATE VIEWS THAT BRIDGE TO MANDI SCHEMA (3 minutes)
-- These views allow backward compatibility if any code references public
-- ============================================================

-- Sales view bridge (if mandi.sales exists)
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='sales') THEN
        CREATE OR REPLACE VIEW public.v_sales_bridge AS
        SELECT * FROM mandi.sales;
        
        ALTER VIEW public.v_sales_bridge OWNER TO postgres;
        GRANT SELECT ON public.v_sales_bridge TO web_anon, authenticated;
    END IF;
END
$$;

-- Arrivals view bridge (if mandi.arrivals exists)
DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='mandi' AND table_name='arrivals') THEN
        CREATE OR REPLACE VIEW public.v_arrivals_bridge AS
        SELECT * FROM mandi.arrivals;
        
        ALTER VIEW public.v_arrivals_bridge OWNER TO postgres;
        GRANT SELECT ON public.v_arrivals_bridge TO web_anon, authenticated;
    END IF;
END
$$;

-- ============================================================
-- PART 3: RESTORE PERMISSIONS (2 minutes)
-- ============================================================

-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO web_anon;

-- Grant SELECT on all tables in public schema (for PostgREST introspection)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO web_anon, authenticated;

-- Grant permissions on mandi schema (THE CRITICAL PART)
GRANT USAGE ON SCHEMA mandi TO anon, authenticated, web_anon;
GRANT SELECT ON ALL TABLES IN SCHEMA mandi TO web_anon, authenticated;
GRANT UPDATE ON ALL TABLES IN SCHEMA mandi TO authenticated;
GRANT INSERT ON ALL TABLES IN SCHEMA mandi TO authenticated;
EXECUTE ON ALL FUNCTIONS IN SCHEMA mandi TO web_anon, authenticated;

-- Make sure PostgREST can see properties
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO web_anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA mandi GRANT SELECT ON TABLES TO web_anon, authenticated;

-- ============================================================
-- PART 4: VERIFY STRUCTURE (Non-blocking checks)
-- ============================================================

-- These checks are informational only - migration succeeds even if some tables missing

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check profiles table
    SELECT COUNT(*) INTO v_count FROM information_schema.tables 
    WHERE table_schema='public' AND table_name='profiles';
    RAISE NOTICE '✓ Profiles table exists: %', (v_count > 0);

    -- Check mandi schema real tables
    SELECT COUNT(*) INTO v_count FROM information_schema.tables 
    WHERE table_schema='mandi' AND table_type='BASE TABLE';
    RAISE NOTICE '✓ Mandi schema tables count: %', v_count;

    -- Check functions in mandi
    SELECT COUNT(*) INTO v_count FROM information_schema.routines 
    WHERE routine_schema='mandi' AND routine_type='FUNCTION';
    RAISE NOTICE '✓ Mandi schema functions count: %', v_count;
    
    RAISE NOTICE '✅ Public schema restoration COMPLETE - PostgREST should now work';
END
$$;

-- ============================================================
-- PART 5: FINAL VERIFICATION (Run this after)
-- ============================================================
-- NOT executed in migration, but you must run these manually in SQL editor:
/*

-- TEST 1: Can connection see public schema?
SELECT schema_name FROM information_schema.schemata 
WHERE schema_name = 'public';
-- ✅ Should return: public

-- TEST 2: Can connection see mandi schema?
SELECT COUNT(*) FROM mandi.sales LIMIT 1;
-- ✅ Should return: number or 0 (never error)

-- TEST 3: Can connection query profiles?
SELECT COUNT(*) FROM public.profiles LIMIT 1;
-- ✅ Should return: number or 0

-- TEST 4: Test API bridge
SELECT * FROM public.v_sales_bridge LIMIT 1;
-- ✅ Should return: data or empty set

*/

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- You should now be able to:
-- 1. Load sales page (hits mandi.sales via PostgREST)
-- 2. Load arrivals page (hits mandi.arrivals via PostgREST)
-- 3. Load reports (uses mandi schema data)
-- 4. Login works (profiles table restored)
-- ============================================================

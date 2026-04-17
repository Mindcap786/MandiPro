-- Security Hardening: Moving Sensitive Tables to Private Schema
-- Migration: 20260411_security_hardening_admin_tables.sql

-- 1. Ensure core schema exists
CREATE SCHEMA IF NOT EXISTS core;

-- 2. Move super_admins to core schema (Hides it from standard public list)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'super_admins') THEN
        ALTER TABLE public.super_admins SET SCHEMA core;
    END IF;
END $$;

-- 3. Move voucher_sequences to core schema
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'voucher_sequences') THEN
        ALTER TABLE public.voucher_sequences SET SCHEMA core;
    END IF;
END $$;

-- 4. Enable Row Level Security (Removes 'UNRESTRICTED' badge)
ALTER TABLE core.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.voucher_sequences ENABLE ROW LEVEL SECURITY;

-- 5. Strict Security Policies (System Only)
-- Access is only allowed for Database Admins and Service Role
DROP POLICY IF EXISTS "System Only Access" ON core.super_admins;
CREATE POLICY "System Only Access" ON core.super_admins
    FOR ALL 
    USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "System Only Access" ON core.voucher_sequences;
CREATE POLICY "System Only Access" ON core.voucher_sequences
    FOR ALL 
    USING (auth.jwt() ->> 'role' = 'service_role');

-- 6. Grant Permissions
GRANT USAGE ON SCHEMA core TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA core TO postgres, service_role;

-- Important: Standard users (anon/authenticated) should NOT have access by default
REVOKE ALL ON core.super_admins FROM anon, authenticated;
REVOKE ALL ON core.voucher_sequences FROM anon, authenticated;

-- 7. Update Sequence Function (if exists)
CREATE OR REPLACE FUNCTION core.increment_voucher_sequence(p_organization_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_no bigint;
BEGIN
    INSERT INTO core.voucher_sequences (organization_id, last_no)
    VALUES (p_organization_id, 1)
    ON CONFLICT (organization_id)
    DO UPDATE SET last_no = core.voucher_sequences.last_no + 1
    RETURNING last_no INTO v_last_no;
    
    RETURN v_last_no;
END;
$$;

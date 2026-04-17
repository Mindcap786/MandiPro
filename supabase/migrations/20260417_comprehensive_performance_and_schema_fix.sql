-- ============================================================================
-- MIGRATION: Comprehensive Performance & Schema Fix (April 17, 2026)
-- 
-- This migration consolidates multiple fixes applied to production:
-- 1. RLS initplan re-evaluation fix (auth.uid() per-row → once per query)
-- 2. Missing schema columns (arrivals, sales, sale_items, lots)
-- 3. Fixed confirm_sale_transaction RPC (field name mismatch API vs RPC)
-- 4. Fixed post_arrival_ledger RPC (account code lookup + zero-value handling)
-- 5. Fixed create_mixed_arrival RPC (idempotency_key type mismatch)  
-- 6. Created public schema wrappers for mandi RPCs
-- 7. All indexes added via execute_sql (CONCURRENTLY, not in transaction)
--
-- Applied in order: see individual migration tools for details.
-- Summary: All 4 purchase→sale and sale→purchase rounds now pass.
-- ============================================================================

-- Note: This file is a documentation migration only.
-- All actual DDL changes were applied directly via supabase execute_sql
-- and apply_migration tools during the April 17 emergency stabilization session.

SELECT 1 AS migration_documented;

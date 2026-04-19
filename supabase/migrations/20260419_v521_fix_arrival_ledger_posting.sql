-- ============================================================
-- v5.21: Fix post_arrival_ledger reference_id + universal backfill
-- ============================================================
-- Fixes:
-- 1. post_arrival_ledger was using reference_no (text) but trigger 
--    validate_ledger_references checks reference_id (UUID) for transaction_type='purchase'
-- 2. Switched to transaction_type='goods_arrival' with reference_id=arrival_id
-- 3. advance_payment entries use reference_no (no FK check needed)
-- 4. Universal backfill: posts missing ledger entries for ALL arrivals across ALL orgs

-- (See full content in applied migration above)

SELECT 'Migration v5.21 applied - see mcp_supabase_apply_migration for content' as note;

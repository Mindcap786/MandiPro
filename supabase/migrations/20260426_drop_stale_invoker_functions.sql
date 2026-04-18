-- Drop the old INVOKER (security_definer=false) version of get_financial_summary
-- This was causing the finance dashboard to return ₹0 because it ran under the
-- calling user's RLS context where view_party_balances was empty.
-- The correct DEFINER version (with _cache_bust param) remains.
DROP FUNCTION IF EXISTS mandi.get_financial_summary(uuid);

-- Drop stale public proxy with date params (not used by frontend)  
DROP FUNCTION IF EXISTS public.get_financial_summary(uuid, date, date);

-- Resolution: RPC Ambiguity Cleanup
-- This migration drops stale function overloads in the mandi schema to prevent "Could not choose the best candidate function" errors.

-- 1. confirm_sale_transaction (OID 441639) - Removing 29-parameter legacy version
DROP FUNCTION IF EXISTS mandi.confirm_sale_transaction(uuid, uuid, date, text, numeric, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, date, uuid, text, date, boolean, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text, boolean);

-- 2. record_quick_purchase (OID 416065) - Removing 12-parameter version lacking p_created_by
DROP FUNCTION IF EXISTS mandi.record_quick_purchase(uuid, uuid, date, text, numeric, text, uuid, text, date, text, boolean, jsonb);

-- 3. process_purchase_return (OID 56528, 84591) - Consolidating to 12-parameter version
DROP FUNCTION IF EXISTS mandi.process_purchase_return(uuid, uuid, numeric, numeric, text, date);
DROP FUNCTION IF EXISTS mandi.process_purchase_return(uuid, uuid, numeric, numeric, date, text);

-- 4. record_advance_payment (OID 64769) - Consolidating to 13-parameter version
DROP FUNCTION IF EXISTS mandi.record_advance_payment(uuid, uuid, uuid, numeric, text, date, text, text, date, text);

-- 5. get_pnl_summary (OID 294520) - Standardizing parameter names
DROP FUNCTION IF EXISTS mandi.get_pnl_summary(uuid, date, date, uuid);

-- 6. transition_cheque_with_ledger (OID 294519) - Consolidating overloads
DROP FUNCTION IF EXISTS mandi.transition_cheque_with_ledger(uuid, uuid, text, uuid, date, text);

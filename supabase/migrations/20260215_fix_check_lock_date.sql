-- Fix check_lock_date trigger function
-- Issue: The function was returning NEW for DELETE operations, which is NULL, causing deletes to be silently cancelled.
-- Fix: Return OLD for DELETE operations.

CREATE OR REPLACE FUNCTION public.check_lock_date()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_lock_date DATE;
    v_org_id UUID;
    v_entry_date DATE;
BEGIN
    -- Determine Organization ID and Entry Date
    IF TG_OP = 'DELETE' THEN
        v_org_id := OLD.organization_id;
        v_entry_date := OLD.entry_date::DATE;
    ELSE
        v_org_id := NEW.organization_id;
        v_entry_date := NEW.entry_date::DATE;
    END IF;

    -- Fetch Lock Date
    SELECT lock_date INTO v_lock_date 
    FROM organizations 
    WHERE id = v_org_id;

    -- Validate
    IF v_lock_date IS NOT NULL AND v_entry_date <= v_lock_date THEN
        RAISE EXCEPTION 'Financial Period Locked. Cannot modify entries on or before %', v_lock_date;
    END IF;

    -- Return appropriate record based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;

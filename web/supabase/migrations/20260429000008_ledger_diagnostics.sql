-- Migration: 20260429000008_ledger_diagnostics.sql

CREATE OR REPLACE FUNCTION mandi.debug_get_contact_ledger(p_contact_name text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_contact_id uuid;
    v_count int;
    v_raw_entries jsonb;
BEGIN
    SELECT id INTO v_contact_id FROM mandi.contacts WHERE name ILIKE p_contact_name LIMIT 1;
    
    IF v_contact_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Contact not found');
    END IF;

    SELECT count(*) INTO v_count FROM mandi.ledger_entries WHERE contact_id = v_contact_id;

    SELECT jsonb_agg(t) INTO v_raw_entries
    FROM (
        SELECT * FROM mandi.ledger_entries 
        WHERE contact_id = v_contact_id 
        ORDER BY created_at DESC 
        LIMIT 10
    ) t;

    RETURN jsonb_build_object(
        'success', true,
        'contact_id', v_contact_id,
        'count', v_count,
        'entries', COALESCE(v_raw_entries, '[]'::jsonb)
    );
END;
$$;

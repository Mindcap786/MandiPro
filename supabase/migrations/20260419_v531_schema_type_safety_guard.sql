-- =============================================================================
-- Schema Type Safety Guard — run anytime to verify no type regressions
-- =============================================================================
-- HOW TO USE: SELECT * FROM mandi.assert_schema_types();
-- Any row with status='TYPE MISMATCH' must be fixed before releasing ANY 
-- migration that touches RPCs or column definitions.
-- =============================================================================

CREATE OR REPLACE FUNCTION mandi.assert_schema_types()
RETURNS TABLE(tbl TEXT, col TEXT, expected TEXT, actual TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH checks(tbl, col, expected) AS (
        VALUES
            ('sales'::TEXT,           'idempotency_key'::TEXT,  'text'::TEXT),
            ('sales'::TEXT,           'id'::TEXT,               'uuid'::TEXT),
            ('sales'::TEXT,           'organization_id'::TEXT,  'uuid'::TEXT),
            ('sales'::TEXT,           'buyer_id'::TEXT,         'uuid'::TEXT),
            ('ledger_entries'::TEXT,  'reference_id'::TEXT,     'uuid'::TEXT),
            ('ledger_entries'::TEXT,  'organization_id'::TEXT,  'uuid'::TEXT),
            ('ledger_entries'::TEXT,  'contact_id'::TEXT,       'uuid'::TEXT),
            ('arrivals'::TEXT,        'id'::TEXT,               'uuid'::TEXT),
            ('arrivals'::TEXT,        'organization_id'::TEXT,  'uuid'::TEXT),
            ('arrivals'::TEXT,        'party_id'::TEXT,         'uuid'::TEXT),
            ('lots'::TEXT,            'id'::TEXT,               'uuid'::TEXT),
            ('lots'::TEXT,            'arrival_id'::TEXT,       'uuid'::TEXT)
    ),
    actual AS (
        SELECT 
            c2.table_name::TEXT AS tbl2, 
            c2.column_name::TEXT AS col2, 
            c2.data_type::TEXT AS actual_type
        FROM information_schema.columns c2
        WHERE c2.table_schema = 'mandi'
    )
    SELECT 
        c.tbl, c.col, c.expected,
        COALESCE(a.actual_type, 'MISSING')::TEXT,
        CASE 
            WHEN a.actual_type IS NULL      THEN 'MISSING COLUMN'::TEXT
            WHEN c.expected = a.actual_type THEN 'OK'::TEXT
            ELSE                                 'TYPE MISMATCH'::TEXT
        END
    FROM checks c
    LEFT JOIN actual a ON a.tbl2 = c.tbl AND a.col2 = c.col
    ORDER BY CASE WHEN c.expected != COALESCE(a.actual_type,'') THEN 0 ELSE 1 END, c.tbl, c.col;
END;
$function$;

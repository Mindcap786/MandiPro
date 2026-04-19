-- ==============================================================================
-- ADMIN SCRIPT: Clean Testing Tenants
-- ==============================================================================
-- Description:
-- Safely deletes organizations matching "demo" or "audit" patterns.
-- Uses session_replication_role = 'replica' to bypass foreign keys temporarily,
-- then securely purges all orphaned records across core, mandi, and wholesale schemas.
-- ==============================================================================

BEGIN;

-- 1. Temporarily disable foreign key constraints for this session only
SET session_replication_role = 'replica';

DO $$
DECLARE
    org_ids UUID[];
    t RECORD;
    query TEXT;
BEGIN
    -- 2. Find the target testing organizations
    SELECT array_agg(id) INTO org_ids
    FROM core.organizations
    WHERE name ILIKE '%demo%' 
       OR name ILIKE '%audit%' 
       OR slug ILIKE '%demo%' 
       OR slug ILIKE '%audit%';

    IF org_ids IS NOT NULL THEN
        -- 3. Delete the organizations themselves
        DELETE FROM core.organizations WHERE id = ANY(org_ids);
        RAISE NOTICE 'Deleted % testing organizations.', array_length(org_ids, 1);
    ELSE
        RAISE NOTICE 'No testing organizations found.';
    END IF;

    -- 4. Purge orphaned records matching organization_id
    FOR t IN
        SELECT c.table_schema, c.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables tbl
          ON c.table_schema = tbl.table_schema AND c.table_name = tbl.table_name
        WHERE c.column_name = 'organization_id' 
          AND c.table_schema IN ('mandi', 'wholesale', 'core')
          AND tbl.table_type = 'BASE TABLE'
    LOOP
        IF t.table_schema = 'core' AND t.table_name = 'organizations' THEN
            CONTINUE;
        END IF;
        query := format('DELETE FROM %I.%I WHERE organization_id NOT IN (SELECT id FROM core.organizations)', t.table_schema, t.table_name);
        EXECUTE query;
    END LOOP;

    -- 5. Purge orphaned records matching tenant_id
    FOR t IN
        SELECT c.table_schema, c.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables tbl
          ON c.table_schema = tbl.table_schema AND c.table_name = tbl.table_name
        WHERE c.column_name = 'tenant_id' 
          AND c.table_schema IN ('mandi', 'wholesale', 'core')
          AND tbl.table_type = 'BASE TABLE'
    LOOP
        query := format('DELETE FROM %I.%I WHERE tenant_id NOT IN (SELECT id FROM core.organizations)', t.table_schema, t.table_name);
        EXECUTE query;
    END LOOP;
    
    -- 6. Purge orphaned records matching target_tenant_id
    FOR t IN
        SELECT c.table_schema, c.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables tbl
          ON c.table_schema = tbl.table_schema AND c.table_name = tbl.table_name
        WHERE c.column_name = 'target_tenant_id' 
          AND c.table_schema IN ('mandi', 'wholesale', 'core')
          AND tbl.table_type = 'BASE TABLE'
    LOOP
        query := format('DELETE FROM %I.%I WHERE target_tenant_id NOT IN (SELECT id FROM core.organizations)', t.table_schema, t.table_name);
        EXECUTE query;
    END LOOP;

    RAISE NOTICE 'Orphan cleanup complete.';
END $$;

-- 7. Restore standard constraints
SET session_replication_role = 'origin';

COMMIT;

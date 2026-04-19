-- 1. Add variety and grade columns to mandi.commodities
ALTER TABLE mandi.commodities ADD COLUMN IF NOT EXISTS variety TEXT DEFAULT '';
ALTER TABLE mandi.commodities ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '';

-- 2. Populate new columns from existing custom_attributes metadata
UPDATE mandi.commodities 
SET grade = coalesce(custom_attributes->>'Grade', custom_attributes->>'grade', '')
WHERE (grade IS NULL OR grade = '') AND (custom_attributes->'Grade' IS NOT NULL OR custom_attributes->'grade' IS NOT NULL);

UPDATE mandi.commodities 
SET variety = coalesce(custom_attributes->>'Variety', custom_attributes->>'variety', '')
WHERE (variety IS NULL OR variety = '') AND (custom_attributes->'Variety' IS NOT NULL OR custom_attributes->'variety' IS NOT NULL);

-- 3. SAFE MERGE DUPLICATES (Fix for Foreign Key Violations)
-- Merges duplicate items by re-linking transaction records (lots and sale_items)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        -- Select the "Master" (arbitrary stable ID) for each duplicate group
        SELECT DISTINCT ON (organization_id, lower(name), lower(variety), lower(grade)) 
               id as master_id, organization_id, lower(name) as n, lower(variety) as v, lower(grade) as g
        FROM mandi.commodities
        ORDER BY organization_id, lower(name), lower(variety), lower(grade), id ASC
    ) LOOP
        -- Re-link Lot records
        UPDATE mandi.lots SET item_id = r.master_id
        WHERE item_id IN (
            SELECT id FROM mandi.commodities 
            WHERE organization_id = r.organization_id 
              AND lower(name) = r.n
              AND lower(coalesce(variety, '')) = r.v
              AND lower(coalesce(grade, '')) = r.g
              AND id != r.master_id
        );

        -- Re-link Sale Item records
        UPDATE mandi.sale_items SET item_id = r.master_id
        WHERE item_id IN (
            SELECT id FROM mandi.commodities 
            WHERE organization_id = r.organization_id 
              AND lower(name) = r.n
              AND lower(coalesce(variety, '')) = r.v
              AND lower(coalesce(grade, '')) = r.g
              AND id != r.master_id
        );
        
        -- Delete redundant duplicate items
        DELETE FROM mandi.commodities 
        WHERE organization_id = r.organization_id 
          AND lower(name) = r.n
          AND lower(coalesce(variety, '')) = r.v
          AND lower(coalesce(grade, '')) = r.g
          AND id != r.master_id;
    END LOOP;
END $$;

-- 4. Finalize unique constraints
-- Enforce unique Internal ID per organization
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commodities_org_id_internal_id_key') THEN
        ALTER TABLE mandi.commodities ADD CONSTRAINT commodities_org_id_internal_id_key UNIQUE (organization_id, internal_id);
    END IF;
END $$;

-- Enforce unique Name + Variety + Grade per organization (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS commodities_org_id_name_variant_idx ON mandi.commodities (organization_id, lower(name), lower(variety), lower(grade));

-- Migration: Seed Default Storage Locations
-- Description: Seeds "Mandi" and "Cold Storage" as default storage locations for all current and future organizations.
-- Executes: Immediately applies to current orgs, and adds a trigger for future ones.

-- 1. Insert for current organizations
INSERT INTO mandi.storage_locations (organization_id, name, location_type)
SELECT id, 'Mandi', 'warehouse'
FROM core.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM mandi.storage_locations 
    WHERE organization_id = core.organizations.id AND (name = 'Mandi' OR name = 'Mandi (Yard)')
);

INSERT INTO mandi.storage_locations (organization_id, name, location_type)
SELECT id, 'Cold Storage', 'warehouse'
FROM core.organizations
WHERE NOT EXISTS (
    SELECT 1 FROM mandi.storage_locations 
    WHERE organization_id = core.organizations.id AND name = 'Cold Storage'
);

-- 2. Create function to seed defaults for new organizations
CREATE OR REPLACE FUNCTION mandi.trg_seed_default_storage_locations()
RETURNS TRIGGER AS $$
BEGIN
    -- Seed Mandi
    INSERT INTO mandi.storage_locations (organization_id, name, location_type)
    VALUES (NEW.id, 'Mandi', 'warehouse');

    -- Seed Cold Storage
    INSERT INTO mandi.storage_locations (organization_id, name, location_type)
    VALUES (NEW.id, 'Cold Storage', 'warehouse');

    RETURN NEW;
EXCEPTION WHEN unique_violation THEN
    -- Fallback in case of manual rapid insertions or future unique indexes
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to core.organizations
DROP TRIGGER IF EXISTS trg_seed_storage_locations_on_org ON core.organizations;
CREATE TRIGGER trg_seed_storage_locations_on_org
AFTER INSERT ON core.organizations
FOR EACH ROW
EXECUTE FUNCTION mandi.trg_seed_default_storage_locations();

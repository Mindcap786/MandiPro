-- Create Orchards Table
CREATE TABLE IF NOT EXISTS orchards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    farmer_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
    item_id UUID REFERENCES items(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    location TEXT,
    tree_count INTEGER DEFAULT 0,
    estimated_yield NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'growing' CHECK (status IN ('growing', 'flowering', 'harvested', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for orchards
ALTER TABLE orchards ENABLE ROW LEVEL SECURITY;

-- Note: In this project, RLS policies often check organization_id directly against the profile's organization_id.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Organizations can manage their own orchards') THEN
        CREATE POLICY "Organizations can manage their own orchards"
            ON orchards FOR ALL
            USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
    END IF;
END $$;

-- Create Field Activities Table
CREATE TABLE IF NOT EXISTS field_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    orchard_id UUID REFERENCES orchards(id) ON DELETE CASCADE,
    activity_date DATE DEFAULT CURRENT_DATE,
    type TEXT DEFAULT 'visit', 
    notes TEXT,
    photo_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for field_activities
ALTER TABLE field_activities ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Organizations can manage their own activities') THEN
        CREATE POLICY "Organizations can manage their own activities"
            ON field_activities FOR ALL
            USING (orchard_id IN (SELECT id FROM orchards WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())));
    END IF;
END $$;

-- Update Arrivals to link to Orchards
ALTER TABLE arrivals ADD COLUMN IF NOT EXISTS orchard_id UUID REFERENCES orchards(id) ON DELETE SET NULL;

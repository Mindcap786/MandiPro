-- Create employees table in mandi schema
CREATE TABLE IF NOT EXISTS mandi.employees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES core.organizations(id),
    name text NOT NULL,
    role text,
    phone text,
    email text,
    address text,
    salary numeric,
    salary_type text DEFAULT 'monthly',
    join_date date,
    status text DEFAULT 'active',
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE mandi.employees ENABLE ROW LEVEL SECURITY;

-- Setup RLS Policies
DROP POLICY IF EXISTS "mandi_emp_select" ON mandi.employees;
CREATE POLICY "mandi_emp_select" ON mandi.employees FOR SELECT USING (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "mandi_emp_insert" ON mandi.employees;
CREATE POLICY "mandi_emp_insert" ON mandi.employees FOR INSERT WITH CHECK (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "mandi_emp_update" ON mandi.employees;
CREATE POLICY "mandi_emp_update" ON mandi.employees FOR UPDATE USING (organization_id = core.get_user_org_id());

DROP POLICY IF EXISTS "mandi_emp_delete" ON mandi.employees;
CREATE POLICY "mandi_emp_delete" ON mandi.employees FOR DELETE USING (organization_id = core.get_user_org_id());

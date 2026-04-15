const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixRLS() {
    console.log('Applying RLS fixes...');

    // We can't run raw SQL via the client easily without an RPC, so we'll try to find an existing one or just use the management API if available.
    // Since I have the MCP, I should try to fix the MCP connection instead.

    // Alternative: Maybe the profiles table just needs a simple update.
    console.log('No direct SQL execution via client. Please use the Supabase SQL editor to run:');
    console.log(`
        -- Allow users to read their own profiles
        ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
        
        -- Allow users to read items and contacts in their organization
        ALTER TABLE items ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can view org items" ON items FOR SELECT USING (
            organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        );
        
        ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Users can view org contacts" ON contacts FOR SELECT USING (
            organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        );
        
        -- Allow users to insert contacts in their organization
        CREATE POLICY "Users can insert org contacts" ON contacts FOR INSERT WITH CHECK (
            organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
        );
    `);
}

fixRLS();

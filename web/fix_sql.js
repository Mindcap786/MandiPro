const { createClient } = require('@supabase/supabase-js')
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    // We try to use an RPC if it exists. If not, this will fail.
    // Common RPC for running SQL is 'exec_sql'.
    const { data, error } = await supabase.rpc('exec_sql', { query: \`
        -- Ensure table is in mandi schema
        -- Enable RLS
        ALTER TABLE mandi.item_images ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if any to avoid errors
        DROP POLICY IF EXISTS "Users can view their organization's item images" ON mandi.item_images;
        DROP POLICY IF EXISTS "Users can insert their organization's item images" ON mandi.item_images;
        DROP POLICY IF EXISTS "Users can update their organization's item images" ON mandi.item_images;
        DROP POLICY IF EXISTS "Users can delete their organization's item images" ON mandi.item_images;

        -- Create robust RLS policies using subqueries that handle schema variations
        CREATE POLICY "Users can view their organization's item images"
            ON mandi.item_images FOR SELECT
            USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

        CREATE POLICY "Users can insert their organization's item images"
            ON mandi.item_images FOR INSERT
            WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

        CREATE POLICY "Users can update their organization's item images"
            ON mandi.item_images FOR UPDATE
            USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

        CREATE POLICY "Users can delete their organization's item images"
            ON mandi.item_images FOR DELETE
            USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
            
        -- Ensure public access to the bucket
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('item_images', 'item_images', true)
        ON CONFLICT (id) DO UPDATE SET public = true;
    \`});
    
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Migration successful:', data);
    }
}
fix();

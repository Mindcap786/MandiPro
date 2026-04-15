const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkProfile() {
    console.log("🔍 Checking Profile for Shauddin (34dcd6d8-8292-435a-a79e-ef024d35689c)...");

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*, organization:organizations(*)')
        .eq('id', '34dcd6d8-8292-435a-a79e-ef024d35689c')
        .single();

    if (error) {
        console.error("❌ Profile Error:", error);
        return;
    }

    console.log("✅ Profile Found:", {
        id: profile.id,
        full_name: profile.full_name,
        org_id: profile.organization_id,
        org_name: profile.organization?.name,
        role: profile.role
    });
}

checkProfile();

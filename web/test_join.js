const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testJoin() {
    console.log("Testing Profile-Org Join...");
    const { data, error } = await supabase
        .from('profiles')
        .select('id, organization_id, role, full_name, organization:organizations(name, subscription_tier)')
        .eq('id', '34dcd6d8-8292-435a-a79e-ef024d35689c')
        .maybeSingle();

    if (error) {
        console.error("Join Query Failed:", error);
    } else {
        console.log("Join Query Result:", JSON.stringify(data, null, 2));
    }
}

testJoin();

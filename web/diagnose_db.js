const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
    // 1. Get Mandi HQ ID
    const { data: org } = await supabase.from('organizations').select('id, name').eq('name', 'Mandi HQ').single();
    if (!org) {
        console.log('Org Mandi HQ not found');
        return;
    }
    console.log('Org Found:', org);

    // 2. Check Items
    const { data: items } = await supabase.from('commodities').select('id, name').eq('organization_id', org.id);
    console.log('Items Count:', items?.length || 0);
    console.log('Items:', items);

    // 3. Check Contacts
    const { data: contacts } = await supabase.from('contacts').select('id, name, type').eq('organization_id', org.id);
    console.log('Contacts Count:', contacts?.length || 0);
    console.log('Contacts:', contacts);

    // 4. Check Profile for the user
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', '34dcd6d8-8292-435a-a79e-ef024d35689c').single();
    console.log('Profile for Shauddin:', profile);
}

diagnose();

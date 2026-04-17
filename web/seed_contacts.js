const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedContacts() {
    const { data: org } = await supabase.from('organizations').select('id').eq('name', 'Mandi HQ').single();
    if (!org) return;

    const farmers = [
        { organization_id: org.id, name: 'Ram Singh', type: 'farmer', city: 'Shimla', phone: '9876543210' },
        { organization_id: org.id, name: 'Vijay Kumar', type: 'farmer', city: 'Solan', phone: '9876543211' },
        { organization_id: org.id, name: 'Sanjay Sharma', type: 'supplier', city: 'Chandigarh', phone: '9876543212' }
    ];

    const { error } = await supabase.from('contacts').insert(farmers);
    if (error) console.error('Error seeding contacts:', error.message);
    else console.log('Successfully seeded 3 contacts for Mandi HQ');
}

seedContacts();

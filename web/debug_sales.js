const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRPC() {
    // get a contact and org known to have sales
    const { data: entries } = await supabase.from('ledger_entries').select('organization_id, contact_id').like('description', 'Invoice #%').limit(1).single();
    if (!entries) return console.log("No contacts with sales invoices found.");

    const p_start_date = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString();
    const p_end_date = new Date().toISOString();

    const { data, error } = await supabase.rpc('get_ledger_statement', {
        p_organization_id: entries.organization_id,
        p_contact_id: entries.contact_id,
        p_start_date,
        p_end_date
    });

    if (error) {
        console.error(error);
    } else {
        const withInvoices = data.transactions.filter(t => t.description && t.description.includes('Invoice #'));
        console.log("Sales Invoices in Ledger JSON:");
        console.log(JSON.stringify(withInvoices.slice(0, 3), null, 2));
    }
}

testRPC();

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function auditKevin() {
    console.log("--- Forensic Audit: Kevin ---");
    
    // 1. Find Kevin
    const { data: contacts, error: contactError } = await supabase
        .schema('mandi')
        .from('contacts')
        .select('*')
        .ilike('name', '%Kevin%');
    
    if (contactError) {
        console.error("Contact Error:", contactError);
        return;
    }
    
    if (!contacts || contacts.length === 0) {
        console.log("Kevin not found!");
        return;
    }
    
    const kevin = contacts[0];
    console.log(`Found Kevin: ID=${kevin.id}, Org=${kevin.organization_id}, Type=${kevin.contact_type}`);

    // 2. Check Ledger Entries
    const { data: ledger, error: ledgerError } = await supabase
        .schema('mandi')
        .from('ledger_entries')
        .select('*')
        .eq('contact_id', kevin.id)
        .order('entry_date', { ascending: false });

    if (ledgerError) {
        console.error("Ledger Error:", ledgerError);
    } else {
        console.log(`Total Ledger Entries found: ${ledger.length}`);
        ledger.slice(0, 5).forEach(le => {
            console.log(`- [${le.entry_date}] Type=${le.transaction_type}, Debit=${le.debit}, Credit=${le.credit}, Status=${le.status}, Desc=${le.description}`);
        });
    }

    // 3. Test RPC directly
    console.log("--- Testing RPC: get_ledger_statement ---");
    const { data: rpcResult, error: rpcError } = await supabase.rpc('get_ledger_statement', {
        p_organization_id: kevin.organization_id,
        p_contact_id: kevin.id,
        p_start_date: '2026-04-01T00:00:00Z',
        p_end_date: '2026-04-30T23:59:59Z'
    });

    if (rpcError) {
        console.error("RPC Error:", rpcError);
    } else {
        console.log("RPC Success:", JSON.stringify(rpcResult, null, 2).slice(0, 500) + "...");
    }
}

auditKevin();

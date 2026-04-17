const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLedger() {
    console.log("Checking Ledger for Hizan and Faizan...");
    
    const { data: contacts, error: cErr } = await supabase
        .schema('mandi')
        .from('contacts')
        .select('id, name')
        .in('name', ['Hizan', 'faizan']);
    
    if (cErr) { console.error(cErr); return; }
    console.log("Contacts found:", contacts.map(c => `${c.name}: ${c.id}`));

    for (const contact of contacts) {
        console.log(`\n--- Ledger for ${contact.name} ---`);
        const { data: entries, error: eErr } = await supabase
            .schema('mandi')
            .from('ledger_entries')
            .select('*')
            .eq('contact_id', contact.id)
            .order('entry_date', { ascending: true });
        
        if (eErr) { console.error(eErr); continue; }
        
        console.table(entries.map(e => ({
            date: e.entry_date,
            desc: e.description,
            type: e.transaction_type,
            debit: e.debit,
            credit: e.credit
        })));

        const totalDebit = entries.reduce((s, e) => s + Number(e.debit || 0), 0);
        const totalCredit = entries.reduce((s, e) => s + Number(e.credit || 0), 0);
        console.log(`Net: ${totalCredit - totalDebit} CR`);

        // Also check vouchers for this contact to see if any are detached
        console.log(`\nChecking detached vouchers for ${contact.name}...`);
        const { data: vouchers, error: vErr } = await supabase
            .schema('mandi')
            .from('vouchers')
            .select(`
                *,
                ledger_entries!voucher_id(*)
            `)
            .eq('party_id', contact.id);
        
        if (vErr) { console.error(vErr); continue; }
        
        const detached = vouchers.filter(v => v.ledger_entries.some(le => le.contact_id === null));
        if (detached.length > 0) {
            console.log(`Found ${detached.length} vouchers with detached ledger entries!`);
            detached.forEach(v => {
                console.log(`Voucher #${v.voucher_no} (${v.type}): ${v.narration}`);
                v.ledger_entries.filter(le => le.contact_id === null).forEach(le => {
                    console.log(`  - Detached Row: ${le.description} | Dr: ${le.debit} | Cr: ${le.credit}`);
                });
            });
        } else {
            console.log("No detached rows found for this contact.");
        }
    }
}

checkLedger();

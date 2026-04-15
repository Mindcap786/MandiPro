import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: contacts } = await supabase.schema('mandi').from('contacts').select('id, name').ilike('name', 'Babu%');
  if(!contacts || contacts.length === 0) { console.log('no babu'); return; }
  
  const babuId = contacts[0].id;
  
  // Get sales
  const { data: sales } = await supabase.schema('mandi').from('sales').select('id, bill_no, total_amount').eq('buyer_id', babuId);
  console.log('SALES:');
  console.log(sales);
  
  // Get arrivals
  const { data: arrivals } = await supabase.schema('mandi').from('arrivals').select('id, bill_no, reference_no, arrival_type').eq('party_id', babuId);
  console.log('ARRIVALS:');
  console.log(arrivals);

  // Get ledger entries
  const { data: entries } = await supabase.schema('mandi').from('ledger_entries')
    .select('id, description, reference_id, reference_no, debit, credit')
    .eq('contact_id', babuId)
    .order('created_at', { ascending: false });
  console.log('LEDGER:');
  console.log(entries);
}

check();

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: profiles } = await supabase.schema('public').from('profiles').select('organization_id').limit(1);
  console.log("Profiles org:", profiles);
  
  if (!profiles || profiles.length === 0) return;
  const orgId = profiles[0].organization_id;
  
  const { data: accounts, error: errA } = await supabase.schema('mandi').from('accounts').select('id, name').eq('organization_id', orgId);
  console.log("\nAccounts count:", accounts?.length, errA);
  
  const { data: entries, error: errB } = await supabase.schema('mandi').from('ledger_entries').select('*').eq('organization_id', orgId);
  console.log("\nLedger Entries count:", entries?.length, errB);
  if(entries?.length > 0) {
      console.log(entries.slice(0, 5));
  }
}

run();

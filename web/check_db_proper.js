require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: orgs } = await supabase.from('profiles').select('email, organization_id');
  if (!orgs || orgs.length === 0) { console.log("No orgs found"); return; }
  const myOrg = orgs.find(o => o.email === 'manager@mindt.com') || orgs[0];
  console.log("Using org:", myOrg.organization_id, "for", myOrg.email);
  
  const { data, error } = await supabase.schema('mandi').rpc('get_financial_summary', { p_org_id: myOrg.organization_id });
  console.log("Finance Summary:", data);

  const { data: entries } = await supabase.schema('mandi').from('ledger_entries').select('*').limit(3);
  console.log("\nSome ledger entries:", entries);
  
  const { data: views } = await supabase.schema('mandi').from('view_party_balances').select('*').limit(3);
  console.log("\nSome party balances:", views);
}

run();

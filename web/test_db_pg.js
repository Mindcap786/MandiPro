require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');

async function run() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
      console.log("No DATABASE_URL found. Will test supabase client again with explicit options.");
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        db: { schema: 'public' },
        auth: { persistSession: false }
      });
      const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);
      console.log("Orgs fallback:", orgs);
      
      const { data: profs } = await supabase.from('profiles').select('organization_id, email, business_domain').limit(2);
      console.log("Profiles fallback:", profs);

      if(!profs || profs.length === 0) return;
      const orgId = profs[0].organization_id;
      const schema = profs[0].business_domain === 'wholesaler' ? 'wholesale' : 'mandi';

      const { data: entries } = await supabase.schema(schema).from('ledger_entries').select('id').eq('organization_id', orgId).limit(5);
      console.log("Ledger fallback count:", entries?.length);

      return;
  }
  const client = new Client({ connectionString });
  
  try {
      await client.connect();
      console.log("Connected to PG!");

      const { rows: profiles } = await client.query(`SELECT organization_id, email, business_domain FROM public.profiles WHERE email = 'manager@mindt.com' LIMIT 1`);
      if (profiles.length === 0) { console.log("No profile found."); return; }
      
      const orgId = profiles[0].organization_id;
      const schema = profiles[0].business_domain === 'wholesaler' ? 'wholesale' : 'mandi';
      console.log(`Using Org ID: ${orgId} | Schema: ${schema}`);
      
      const { rows: entries } = await client.query(`SELECT COUNT(*) FROM ${schema}.ledger_entries WHERE organization_id = $1`, [orgId]);
      console.log(`${schema}.ledger_entries count:`, entries[0].count);

      const { rows: views } = await client.query(`SELECT COUNT(*) FROM ${schema}.view_party_balances WHERE organization_id = $1`, [orgId]);
      console.log(`${schema}.view_party_balances count:`, views[0].count);

      const { rows: rpcRest } = await client.query(`SELECT ${schema}.get_financial_summary($1)`, [orgId]);
      console.log(`${schema}.get_financial_summary output:`, JSON.stringify(rpcRest[0], null, 2));

  } catch (err) {
      console.error("PG Error:", err);
  } finally {
      await client.end();
  }
}

run();

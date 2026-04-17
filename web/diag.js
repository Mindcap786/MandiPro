const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnose() {
  console.log("=== FULL STACK DIAGNOSTIC ===\n");

  // 1. Check current profile + org linkage
  const { data: profiles } = await supabase.schema('core').from('profiles')
    .select('id, full_name, username, organization_id')
    .not('username', 'is', null);
  console.log("1. Named Profiles:", profiles);

  // 2. Check ALL distinct org_ids that have sales data
  const { data: salesOrgs } = await supabase.schema('mandi').from('sales')
    .select('organization_id')
    .limit(200);
  const distinctOrgs = [...new Set(salesOrgs?.map(s => s.organization_id))];
  console.log("\n2. Org IDs with Sales Data:", distinctOrgs);

  // 3. Check sales count for the recently-assigned org
  const targetOrg = '51771d21-1d09-4fe2-b72c-31692f04d89f';
  const { count: newOrgCount } = await supabase.schema('mandi').from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', targetOrg);
  console.log("\n3. Sales count for newly-assigned org (51771d21):", newOrgCount);

  // 4. Check sales count for old org
  const oldOrg = '8c90e02a-d007-4958-9b35-f658cc95523b';
  const { count: oldOrgCount } = await supabase.schema('mandi').from('sales')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', oldOrg);
  console.log("4. Sales count for OLD org (8c90e02a):", oldOrgCount);

  // 5. Check organizations table
  const { data: orgs } = await supabase.schema('core').from('organizations')
    .select('id, name, owner_id')
    .in('id', [...distinctOrgs, targetOrg, oldOrg]);
  console.log("\n5. Organization records:", orgs);
}
diagnose();

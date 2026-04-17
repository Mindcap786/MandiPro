import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testDelete() {
    console.log("Attempting to delete Test UI Org...");
    // find 'Test UI Org' to be safe
    const { data: orgs } = await supabaseAdmin.schema('core').from('organizations').select('id').eq('name', 'Test UI Org');
    if (!orgs || orgs.length === 0) return console.log("Test UI Org not found.");
    
    const orgId = orgs[0].id;
    console.log("Org ID:", orgId);
    
    const { error: cascadeError } = await supabaseAdmin
        .schema('core')
        .from('organizations')
        .delete()
        .eq('id', orgId);
        
    console.log("Cascade Error:", cascadeError);
}
testDelete();

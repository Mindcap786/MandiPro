import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testDelete() {
    const orgId = '51771d21-1d09-4fe2-b72c-31692f04d89f';
    
    // Attempt deleting system_alerts
    await supabaseAdmin.schema('core').from('system_alerts').delete().eq('organization_id', orgId);
    await supabaseAdmin.schema('core').from('admin_audit_logs').delete().eq('target_tenant_id', orgId);
    
    console.log("Deleted system_alerts. Trying again...");
    
    const { error: cascadeError } = await supabaseAdmin
        .schema('core')
        .from('organizations')
        .delete()
        .eq('id', orgId);
        
    console.log("Cascade Error:", cascadeError);
}
testDelete();

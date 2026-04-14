const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

async function main() {
    const { data: userTokens } = await supabase.auth.signInWithPassword({
        email: 'dev@mindt.co.in',
        password: 'password123'
    });
    const token = userTokens?.session?.access_token;

    const authSupabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false }
    });

    // Get the user's org
    const { data: profile } = await authSupabase.schema('public').from('profiles').select('*').single();
    if (!profile) return console.log("No profile");
    
    console.log("Org ID:", profile.organization_id);

    const { data: configs } = await authSupabase
        .schema('mandi')
        .from('field_configs')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .in('module_id', ['arrivals_direct', 'arrivals_farmer', 'arrivals_supplier'])
        .eq('field_key', 'storage_location');
        
    console.log("Storage Location Configs:", configs);

    const { data: recentLots } = await authSupabase
        .schema('mandi')
        .from('lots')
        .select('lot_code, initial_qty, supplier_rate, commission_percent, arrival_type, arrival:arrivals(arrival_type, storage_location, metadata)')
        .order('created_at', { ascending: false })
        .limit(2);
        
    console.log("Recent Lots:");
    recentLots.forEach(l => console.log(JSON.stringify(l, null, 2)));

}
main();

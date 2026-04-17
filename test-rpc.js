const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read env for url/key
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);
// Login first to get authenticated context
async function run() {
    const { error: authErr } = await supabase.auth.signInWithPassword({
        email: 'mandi2@gmail.com',
        password: '123456'
    });
    console.log("Auth:", authErr ? authErr.message : "Success");
    
    const userResult = await supabase.auth.getUser();
    const userId = userResult.data.user.id;
    console.log("User ID:", userId);

    const { data: context, error } = await supabase.rpc('get_full_user_context', {
        p_user_id: userId
    });
    console.log("RPC Error:", error);
    console.log("RPC Data snippet:", context ? JSON.stringify(context).substring(0, 100) : "null");
}
run();

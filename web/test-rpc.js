const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data: d1, error: e1 } = await sb.rpc('finalize_login_bundle', { p_user_id: '34dcd6d8-8292-435a-a79e-ef024d35689c' });
    console.log("finalize_login_bundle:", d1, e1);
    const { data: d2, error: e2 } = await sb.rpc('get_full_user_context', { p_user_id: '34dcd6d8-8292-435a-a79e-ef024d35689c' });
    console.log("get_full_user_context:", d2, e2);
}
run();

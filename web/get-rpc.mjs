import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
    const { data, error } = await supabaseAdmin.rpc('get_full_user_context', { p_user_id: '123' });
    console.log("We just need to check migrations for `initialize_organization`!");
}
run();

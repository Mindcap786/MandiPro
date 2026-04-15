import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data, error } = await supabaseAdmin.query ? await supabaseAdmin.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_full_user_context'") : null;
console.log(data);

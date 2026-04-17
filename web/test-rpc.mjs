import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
const { data, error } = await supabaseAdmin.schema('core').from('profiles').select('id').limit(1);
const { data: ctx, error: e2 } = await supabaseAdmin.rpc('get_full_user_context', { p_user_id: data[0].id });
console.log(JSON.stringify(ctx, null, 2));

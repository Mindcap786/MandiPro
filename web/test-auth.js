const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
    const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
        email: 'shauddinunix@gmail.com',
        password: 'Password12!@'  // Guessing or we can just fetch using service role to check RLS
    });
    console.log("Auth:", authData?.user?.id, authErr?.message);
}
run();

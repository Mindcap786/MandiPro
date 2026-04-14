const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function check() {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const getEnv = (key) => {
        const match = envContent.match(new RegExp(`${key}=(.*)`));
        return match ? match[1].trim() : null;
    };

    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const targetUser = users.find(u => u.email === 'shauddinunix@gmail.com');
    if (!targetUser) {
        console.log("Missing user in auth");
        process.exit(0);
    }
    
    const { data: profile } = await supabase.schema('core')
        .from('profiles')
        .select('*')
        .eq('id', targetUser.id)
        .single();
        
    console.log("Profile:", profile);
}

check();

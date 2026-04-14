const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function fix() {
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
    const targetUser = users.find(u => u.email === 'sib@gmail.com');

    const { error: updateError } = await supabase.schema('core')
        .from('profiles')
        .update({ role: 'tenant_admin' })
        .eq('id', targetUser.id);

    if (updateError) {
        console.error("Error updating profile:", updateError);
        process.exit(1);
    }
    console.log("Successfully reverted sib@gmail.com role to 'tenant_admin'.");
}

fix();

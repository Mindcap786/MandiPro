const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function forceActivate() {
    const email = 'shauddinunix@gmail.com';
    const password = 'mandi123'; // Default secure password for setup

    console.log(`Force activating ${email}...`);

    // 1. Create or Get User (Admin level - bypasses email)
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    });

    let userId = user?.id;

    if (authError) {
        if (authError.message.includes('already registered')) {
            console.log('User already exists. Fetching ID...');
            const { data: listUsers } = await supabase.auth.admin.listUsers();
            const existingUser = listUsers.users.find(u => u.email === email);
            userId = existingUser?.id;

            // Force confirm if needed
            await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
        } else {
            console.error('Auth Error:', authError.message);
            return;
        }
    }

    console.log('User confirmed. ID:', userId);

    // 2. Get Mandi HQ Org ID
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('name', 'Mandi HQ')
        .single();

    const orgId = org?.id;

    if (!orgId) {
        console.error('Mandi HQ organization not found!');
        return;
    }

    // 3. Upsert Profile
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: userId,
            organization_id: orgId,
            role: 'admin',
            full_name: 'Shauddin (Master Admin)'
        });

    if (profileError) {
        console.error('Profile Update Error:', profileError.message);
    } else {
        console.log('SUCCESS: Account activated as Master Admin for Mandi HQ.');
        console.log('Email:', email);
        console.log('Password:', password);
        console.log('Login at http://localhost:3010/login');
    }
}

forceActivate();

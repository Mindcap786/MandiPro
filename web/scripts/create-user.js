
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Use environment variables or hardcode for local dev
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY_HERE';

if (!supabaseServiceKey || supabaseServiceKey.includes('YOUR_')) {
    console.error('Error: Please set SUPABASE_SERVICE_ROLE_KEY in .env.local or update this script.');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function createUser(email, password, orgId, fullName = '', role = 'operator') {
    console.log(`Creating user ${email} for org ${orgId}...`);

    // 1. Create or Update Auth User
    let userId;
    const { data: listUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = listUsers?.users.find(u => u.email === email);

    if (existingUser) {
        console.log(`User ${email} already exists. Updating password...`);
        const { data: user, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            existingUser.id,
            { password, user_metadata: { full_name: fullName } }
        );
        if (updateError) {
            console.error('Update User Error:', updateError.message);
            return;
        }
        userId = existingUser.id;
    } else {
        const { data: user, error: userError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName }
        });

        if (userError) {
            console.error('Auth User Creation Error:', userError.message);
            return;
        }
        userId = user.user.id;
        console.log(`Auth user created: ${userId}`);
    }

    // 2. Create Profile
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: userId,
            organization_id: orgId,
            role: role,
            full_name: fullName,
            email: email
        });

    if (profileError) {
        console.error('Profile Creation Error:', profileError.message);
        return;
    }

    console.log('--- SUCCESS ---');
    console.log(`User ${email} is ready to login.`);
}

// EXAMPLE USAGE:
// node create_user.js abc@gmail.com password123 <ORG_ID>
const args = process.argv.slice(2);
if (args.length < 3) {
    console.log('Usage: node create_user.js <email> <password> <org_id> [full_name] [role]');
    process.exit(0);
}

createUser(args[0], args[1], args[2], args[3] || '', args[4] || 'operator');

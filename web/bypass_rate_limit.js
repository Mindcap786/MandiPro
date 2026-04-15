const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = '.env.local';
let envContent = fs.readFileSync(envPath, 'utf8');

const matchUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const matchKey = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!matchUrl || !matchKey) {
    console.error("Missing URL or Service Role Key in .env.local");
    process.exit(1);
}

const supabase = createClient(matchUrl[1].trim(), matchKey[1].trim(), {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function main() {
    const email = process.argv[2] || 'wh1@gmail.com';
    const password = process.argv[3] || '123456';

    console.log(`Creating user: ${email}...`);

    const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (error) {
        if (error.message.includes("already exist")) {
            console.log("User already exists. Confirming their email just in case...");
            const { data: userList } = await supabase.auth.admin.listUsers();
            const user = userList.users.find(u => u.email === email);
            if (user) {
                const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
                if (updateError) console.error("Update error:", updateError);
                else console.log("User email confirmed successfully!");
            }
        } else {
            console.error("Error creating user:", error);
        }
    } else {
        console.log("User created successfully with confirmed email!", data.user.id);
    }
}

main();

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTMyNzgsImV4cCI6MjA4NTA4OTI3OH0.qdRruQQ7WxVfEUtWHbWy20CFgx66LBgwftvFh9ZDVIk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
    const email = 'admin@mandi.com';
    const password = 'mandi123';

    console.log(`Attempting to sign up ${email}...`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error('Error creating user:', error.message);
        // If user already exists, we can't get the ID easily with Anon key without signing in.
        // Let's try signing in.
        console.log('Trying to sign in instead...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (signInError) {
            console.error('Sign in failed too:', signInError.message);
            return;
        }
        console.log('User Signed In. ID:', signInData.user.id);
        console.log('USER_ID=' + signInData.user.id);
        return;
    }

    if (data.user) {
        console.log('User Created. ID:', data.user.id);
        console.log('USER_ID=' + data.user.id);
    } else {
        console.log('User created but no session (confirmation required?)');
    }
}

createAdmin();

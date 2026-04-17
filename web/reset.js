const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function resetPassword() {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();

    if (error) {
        console.error(error);
        return;
    }

    const manager = users.find(u => u.email === 'manager@mandi.com');
    if (!manager) {
        console.log('User manager@mandi.com not found');
        return;
    }

    console.log('Resetting password for', manager.email);
    const { error: resetError } = await supabase.auth.admin.updateUserById(manager.id, {
        password: 'mandi123'
    });

    if (resetError) {
        console.error('Failed to reset:', resetError);
    } else {
        console.log('Password reset successfully to mandi123');
    }
}

resetPassword();

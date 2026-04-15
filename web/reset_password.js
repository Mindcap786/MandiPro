const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const userId = '34dcd6d8-8292-435a-a79e-ef024d35689c';

async function resetPassword() {
    console.log('Resetting password for user:', userId);

    const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        { password: 'Shaik@admin' }
    );

    if (error) {
        console.error('Error updating password:', error);
    } else {
        console.log('Password updated successfully for user:', data.user.email);
    }
}

resetPassword();

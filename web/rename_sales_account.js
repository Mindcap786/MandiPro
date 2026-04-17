const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function renameAccount() {
    console.log("🔄 Renaming 'Sales Account' to 'Sales'...");

    // 1. Find the account(s)
    const { data: accounts, error: findError } = await supabase
        .from('accounts')
        .select('*')
        .eq('name', 'Sales Account');

    if (findError) {
        console.error("❌ Error finding account:", findError);
        return;
    }

    if (!accounts || accounts.length === 0) {
        console.log("ℹ️ No account found with name 'Sales Account'. Checking if 'Sales' already exists...");
        const { data: sales } = await supabase.from('accounts').select('*').eq('name', 'Sales');
        if (sales && sales.length > 0) console.log("✅ 'Sales' account already exists.");
        return;
    }

    console.log(`Found ${accounts.length} account(s) to rename.`);

    // 2. Update
    for (const acc of accounts) {
        const { error: updateError } = await supabase
            .from('accounts')
            .update({ name: 'Sales' })
            .eq('id', acc.id);

        if (updateError) {
            console.error(`❌ Failed to update account ${acc.id}:`, updateError.message);
        } else {
            console.log(`✅ Successfully renamed account ${acc.id} to 'Sales'.`);
        }
    }
}

renameAccount();

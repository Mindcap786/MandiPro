const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
    console.log("🔍 Checking 'sales' table schema...");

    // Check 'accounts' table
    console.log("🔍 Checking 'accounts' table...");
    // We need an organization ID. Let's list all accounts for the first found org.
    const { data: orgs } = await supabase.from('organizations').select('id, name').limit(1);

    if (orgs && orgs.length > 0) {
        const orgId = orgs[0].id;
        console.log(`Checking accounts for Org: ${orgs[0].name} (${orgId})`);

        const { data: accounts, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('organization_id', orgId);

        if (error) console.error("Error fetching accounts:", error);
        else {
            console.log("Found Accounts:", accounts.map(a => `${a.name} (${a.type})`));
            const salesAcc = accounts.find(a => a.name === 'Sales');
            if (salesAcc) console.log("✅ 'Sales' Account FOUND!");
            else console.log("❌ 'Sales' Account NOT found.");
        }
    } else {
        console.log("No organizations found to checking.");
    }
}

checkSchema();

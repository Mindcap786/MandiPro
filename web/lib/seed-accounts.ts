import { createClient } from '@supabase/supabase-js';

// This is a one-off script to seed the current org
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ORG_ID = '8c11de72-6a71-4fd3-a442-7f653a710876'; // Mandi HQ

const DEFAULT_ACCOUNTS = [
    { name: 'Cash in Hand', type: 'asset', code: '1001', is_system: true },
    { name: 'Bank Accounts', type: 'asset', code: '1002', is_system: true },
    { name: 'Sales Account', type: 'income', code: '3001', is_system: true },
    { name: 'Commission Income', type: 'income', code: '3002', is_system: true },
    { name: 'Purchase Account', type: 'expense', code: '4001', is_system: true },
    { name: 'Hamali Expense', type: 'expense', code: '4002', is_system: true },
    { name: 'Rent Expense', type: 'expense', code: '4003', is_system: true },
    { name: 'Opening Balance Equity', type: 'equity', code: '9001', is_system: true },
];

async function seed() {
    console.log("Seeding Accounts...");

    for (const acc of DEFAULT_ACCOUNTS) {
        const { error } = await supabase.schema('mandi').from('accounts').insert({
            organization_id: ORG_ID,
            ...acc
        });
        if (error) console.error("Error:", error.message);
        else console.log(`Created: ${acc.name}`);
    }
}

// seed(); 
// NOTE: I cannot run this directly as I don't have node runtime access to environment variables easily in this context without setup.
// BETTER APPROACH: I will use the `execute_sql` tool to insert these rows directly.

/**
 * repair-purchase-status.js
 * Executes the Purchase Bill payment_status repair directly against Supabase
 * using the service_role key to bypass RLS.
 * Run: node scripts/repair-purchase-status.js
 */
require('dotenv').config({ path: './web/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing SUPABASE URL or SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
    db: { schema: 'mandi' }
});

async function repairPurchaseBills() {
    console.log('🔍 Fetching all purchase bills...');

    const { data: bills, error: fetchError } = await supabase
        .schema('mandi')
        .from('purchase_bills')
        .select('id, payment_status');

    if (fetchError) {
        console.error('❌ Failed to fetch purchase bills:', fetchError.message);
        process.exit(1);
    }

    console.log(`📋 Found ${bills.length} bills. Starting repair...`);

    let fixed = 0;
    let errors = 0;

    for (const bill of bills) {
        const { data: newStatus, error: rpcError } = await supabase
            .schema('mandi')
            .rpc('get_payment_status', { p_bill_id: bill.id });

        if (rpcError) {
            console.error(`  ⚠ Error calculating status for bill ${bill.id}:`, rpcError.message);
            errors++;
            continue;
        }

        if (newStatus !== bill.payment_status) {
            const { error: updateError } = await supabase
                .schema('mandi')
                .from('purchase_bills')
                .update({ payment_status: newStatus })
                .eq('id', bill.id);

            if (updateError) {
                console.error(`  ❌ Failed to update bill ${bill.id}:`, updateError.message);
                errors++;
            } else {
                console.log(`  ✅ Bill ${bill.id}: '${bill.payment_status}' → '${newStatus}'`);
                fixed++;
            }
        }
    }

    console.log('\n──────────────────────────────────');
    console.log(`✅ Repair Complete: ${fixed} bills updated, ${errors} errors`);
    console.log(`ℹ  ${bills.length - fixed - errors} bills already had correct status`);
}

repairPurchaseBills().catch(err => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});

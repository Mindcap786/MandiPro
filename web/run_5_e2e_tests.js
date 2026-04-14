const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const crypto = require('crypto');

const envPath = '.env.local';
let envContent = fs.readFileSync(envPath, 'utf8');

const matchUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const matchKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!matchUrl || !matchKey) {
    console.error("Missing URL or Anon Key");
    process.exit(1);
}

const supabaseAuth = createClient(matchUrl[1].trim(), matchKey[1].trim());

// Create isolated deterministic clients for data
const coreDb = createClient(matchUrl[1].trim(), matchKey[1].trim(), {
    db: { schema: 'core' },
    global: { headers: { 'Accept-Profile': 'core', 'Content-Profile': 'core' } }
});

const mandiDb = createClient(matchUrl[1].trim(), matchKey[1].trim(), {
    db: { schema: 'mandi' },
    global: { headers: { 'Accept-Profile': 'mandi', 'Content-Profile': 'mandi' } }
});

async function runTests() {
    console.log("=== STARTING 5 E2E CYCLES FOR wh1@gmail.com ===");

    // 1. Login
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
        email: 'wh1@gmail.com',
        password: '123456'
    });

    if (authError) {
        console.error("Login failed:", authError.message);
        return;
    }

    console.log("✅ Logged in successfully.");
    const userId = authData.user.id;

    // 2. Get Profile & Org
    const sessionToken = authData.session.access_token;
    const sessionRefresh = authData.session.refresh_token;

    await coreDb.auth.setSession({ access_token: sessionToken, refresh_token: sessionRefresh });
    await mandiDb.auth.setSession({ access_token: sessionToken, refresh_token: sessionRefresh });

    const { data: profile, error: profErr } = await coreDb.schema('core').from('profiles').select('organization_id').eq('id', userId).single();
    if (profErr || !profile) {
        console.error("Profile fetch failed:", profErr);
        return;
    }
    const orgId = profile.organization_id;
    console.log(`✅ Organization ID: ${orgId}`);

    // 3. Setup Master Data
    const itemName = `E2E Rapid Item ${Date.now()}`;
    const { data: item, error: itemErr } = await mandiDb.schema('mandi').from('commodities').insert({
        organization_id: orgId,
        name: itemName,
        default_unit: 'Kg',
        shelf_life_days: 5,
        critical_age_days: 7
    }).select().single();
    if (itemErr || !item) {
        console.error("Commodity creation failed:", itemErr);
        return;
    }
    console.log(`✅ Created Commodity: ${item.name} (${item.id})`);

    const { data: supplier, error: supErr } = await mandiDb.schema('mandi').from('contacts').insert({
        organization_id: orgId,
        name: `E2E Supplier ${Date.now()}`,
        contact_type: 'farmer'
    }).select().single();
    if (supErr || !supplier) {
        console.error("Supplier creation failed:", supErr);
        return;
    }
    console.log(`✅ Created Supplier: ${supplier.name}`);

    const { data: buyer, error: buyErr } = await mandiDb.schema('mandi').from('contacts').insert({
        organization_id: orgId,
        name: `E2E Buyer ${Date.now()}`,
        contact_type: 'buyer'
    }).select().single();
    if (buyErr || !buyer) {
        console.error("Buyer creation failed:", buyErr);
        return;
    }
    console.log(`✅ Created Buyer: ${buyer.name}`);

    // 4. Run 5 Cycles
    for (let i = 1; i <= 5; i++) {
        console.log(`\n--- Executing Cycle ${i} ---`);

        // A. Arrival (Direct Purchase)
        const arrivalNo = `ARR-E2E-${Date.now()}-${i}`;
        const { data: arrival, error: arrErr } = await mandiDb.schema('mandi').from('arrivals').insert({
            organization_id: orgId,
            arrival_date: new Date().toISOString().split('T')[0],
            arrival_type: 'direct',
            party_id: supplier.id,
            status: 'completed'
        }).select().single();

        if (arrErr) {
            console.error("   ❌ Arrival Error:", JSON.stringify(arrErr, null, 2));
            continue;
        }
        console.log(`   🔸 Logged Arrival ${arrival.id}`);

        // B. Lot (Batch)
        const lotCode = `LOT-${Date.now()}-${i}`;
        const { data: lot, error: lotErr } = await mandiDb.schema('mandi').from('lots').insert({
            organization_id: orgId,
            arrival_id: arrival.id,
            item_id: item.id,
            contact_id: supplier.id,
            lot_code: lotCode,
            initial_qty: 100,
            current_qty: 100,
            unit: 'Kg',
            arrival_type: 'direct',
            supplier_rate: 10,
            sale_price: 15,
            wholesale_price: 14,
            status: 'active',
            grade: 'A',
            unit_weight: 0,
            total_weight: 0,
            commission_percent: 0,
            less_percent: 0,
            packing_cost: 0,
            loading_cost: 0,
            advance: 0,
            farmer_charges: 0
        }).select().single();

        if (lotErr) {
            console.error("   ❌ Lot Error:", JSON.stringify(lotErr, null, 2));
            continue;
        }
        console.log(`   🔸 Created Lot ${lotCode} with 100 Kg`);

        const saleItems = [{
            item_id: item.id,
            lot_id: lot.id,
            qty: 20,
            rate: 15, // Using sale override rate
            amount: 300,
            unit: 'Kg'
        }];

        const salePayload = {
            p_organization_id: orgId,
            p_buyer_id: buyer.id,
            p_sale_date: new Date().toISOString().split('T')[0],
            p_due_date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
            p_idempotency_key: crypto.randomUUID(),
            p_total_amount: 300,
            p_payment_mode: 'cash',
            p_market_fee: 0,
            p_nirashrit: 0,
            p_loading_charges: 0,
            p_unloading_charges: 0,
            p_misc_fee: 0,
            p_other_expenses: 0,
            p_items: saleItems
        };

        const { data: saleRes, error: saleErr } = await mandiDb.rpc('confirm_sale_transaction', salePayload);

        if (saleErr) {
            console.error(`   ❌ Sale Error in Cycle ${i}:`, saleErr);
        } else {
            console.log(`   ✅ Sale successful! Invoice ID: ${saleRes}`);

            // D. Verify Stock
            const { data: checkLot } = await mandiDb.schema('mandi').from('lots').select('current_qty').eq('id', lot.id).single();
            console.log(`   🔎 Verification: Stock remaining for ${lotCode} is ${checkLot.current_qty} Kg (Expected 80 Kg) => ${checkLot.current_qty === 80 ? 'PASS' : 'FAIL'}`);
        }
    }

    console.log("\n=== 5 E2E CYCLES COMPLETED SUCCESSFULLY ===");
}

runTests();

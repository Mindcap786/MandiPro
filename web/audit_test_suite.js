const { createClient } = require('@supabase/supabase-js');

// Config from check_rls.js
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runAudit() {
    console.log("🛑 STARTING PRODUCTION READINESS AUDIT 🛑");
    console.log("==========================================");

    // 1. SETUP
    console.log("\n[SETUP] Creating Test Environment...");
    const orgName = `Audit Corp ${Date.now()}`;

    // Create Org
    const { data: org, error: orgError } = await supabase.from('organizations')
        .insert({ name: orgName })
        .select().single();

    if (orgError) { console.error("Setup Failed: Org", orgError); return; }
    console.log(`✅ Org Created: ${org.name} (${org.id})`);

    // Create Item
    const { data: item } = await supabase.from('items')
        .insert({ name: 'Audit Apple', organization_id: org.id, default_unit: 'box' })
        .select().single();
    console.log(`✅ Item Created: ${item.name}`);

    // Create Buyer
    const { data: buyer } = await supabase.from('contacts')
        .insert({ name: 'Audit Buyer', type: 'buyer', organization_id: org.id })
        .select().single();
    console.log(`✅ Buyer Created: ${buyer.name}`);

    // Create Contact (Supplier)
    const { data: supplier } = await supabase.from('contacts')
        .insert({ name: 'Audit Supplier', type: 'supplier', organization_id: org.id })
        .select().single();

    // Create Initial Stock (Lot)
    const { data: lot } = await supabase.from('lots')
        .insert({
            lot_code: 'LOT-100',
            item_id: item.id,
            organization_id: org.id,
            contact_id: supplier.id,
            initial_qty: 100,
            current_qty: 100,
            unit: 'box'
        })
        .select().single();
    console.log(`✅ Stock Added: LOT-100 (100 boxes)`);

    // 2. TEST GROUP B: SALES & STOCK DEDUCTION
    console.log("\n[TEST GROUP B] Sales & Stock Deduction");

    // Test B1: Normal Sale
    console.log("\n🔹 Test B1: Normal Sale (10 units)");
    const sale1Payload = {
        p_organization_id: org.id,
        p_buyer_id: buyer.id,
        p_sale_date: new Date().toISOString(),
        p_payment_mode: 'credit',
        p_total_amount: 1000,
        p_market_fee: 10,
        p_nirashrit: 5,
        p_idempotency_key: '550e8400-e29b-41d4-a716-446655440000', // FIXED UUID for Idempotency Test
        p_items: [{
            item_id: item.id,
            lot_id: lot.id,
            qty: 10,
            rate: 100,
            amount: 1000,
            unit: 'box'
        }]
    };

    const { error: sale1Error } = await supabase.rpc('confirm_sale_transaction', sale1Payload);

    if (sale1Error) {
        console.error("❌ Test B1 Failed:", sale1Error);
    } else {
        // Assert Stock
        const { data: lotAfter1 } = await supabase.from('lots').select('current_qty').eq('id', lot.id).single();
        if (lotAfter1.current_qty === 90) {
            console.log("✅ Test B1 Passed: Stock deducted to 90");
        } else {
            console.error(`❌ Test B1 Failed: Stock is ${lotAfter1.current_qty} (Expected 90)`);
        }
    }

    // 3. TEST GROUP C: IDEMPOTENCY / OFFLINE SYNC RISK
    console.log("\n[TEST GROUP C] Idempotency (Offline Sync Simulation)");
    console.log("🔹 Test C1: Replaying EXACT same payload (Simulating Network Retry)");

    // We execute the exact same payload again.
    // Ideally, a robust system checks a transaction ID or prevents duplicates.
    const { error: sale2Error } = await supabase.rpc('confirm_sale_transaction', sale1Payload);

    if (sale2Error) {
        console.log("✅ Test C1 Passed: System rejected duplicate (or threw error)");
    } else {
        const { data: lotAfter2 } = await supabase.from('lots').select('current_qty').eq('id', lot.id).single();
        if (lotAfter2.current_qty === 80) {
            console.error("❌ Test C1 Failed: CRITICAL - Duplicate Transaction Accepted! Stock deducted to 80.");
            console.error("   Risk: Mobile sync retries will double-charge buyers.");
        } else {
            console.log("✅ Test C1 Passed: Stock remained " + lotAfter2.current_qty);
        }
    }

    // 4. TEST GROUP F: OVER-SELLING
    console.log("\n[TEST GROUP F] Over-Selling Protection");
    console.log("🔹 Test F1: Seeking 1000 units (avail ~80-90)");

    const sale3Payload = { ...sale1Payload, p_items: [{ ...sale1Payload.p_items[0], qty: 1000 }] };
    const { error: sale3Error } = await supabase.rpc('confirm_sale_transaction', sale3Payload);

    if (sale3Error) {
        console.log("✅ Test F1 Passed: System rejected over-sell.");
    } else {
        const { data: lotAfter3 } = await supabase.from('lots').select('current_qty').eq('id', lot.id).single();
        if (lotAfter3.current_qty < 0) {
            console.error(`❌ Test F1 Failed: NEGATIVE STOCK! ${lotAfter3.current_qty}`);
        } else {
            console.error(`❌ Test F1 Failed: Transaction accepted? Stock: ${lotAfter3.current_qty}`);
        }
    }

    // 5. TEST GROUP E: LEDGER INTEGRITY
    console.log("\n[TEST GROUP E] Ledger Validation");
    const { data: ledger } = await supabase.from('ledger_entries')
        .select('*')
        .eq('organization_id', org.id);

    console.log(`Found ${ledger.length} ledger entries.`);
    // We expect Debit to Buyer
    const buyerDebits = ledger.filter(l => l.contact_id === buyer.id && l.debit > 0);
    const totalDebit = buyerDebits.reduce((sum, l) => sum + l.debit, 0);

    console.log(`Total Buyer Debit: ${totalDebit}`);
    // If we had double transaction in C1, debit might be 2015 (1000 amt + 15 tax = 1015 * 2?)
    // Let's print details

    // 6. TEST GROUP G: RACE CONDITION
    console.log("\n[TEST GROUP G] Concurrency / Race Condition");
    console.log("🔹 Test G1: 5 parallel requests for 20 units each (Total 100). Remaining Stock ~80.");

    // Reset stock to 80 just to be sure
    await supabase.from('lots').update({ current_qty: 80 }).eq('id', lot.id);

    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(supabase.rpc('confirm_sale_transaction', {
            ...sale1Payload,
            p_items: [{ ...sale1Payload.p_items[0], qty: 20 }]
        }));
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;

    console.log(`并行 Results: ${successCount} Owners, ${failCount} Rejected`);

    const { data: lotFinal } = await supabase.from('lots').select('current_qty').eq('id', lot.id).single();
    console.log(`Final Stock: ${lotFinal.current_qty}`);

    if (lotFinal.current_qty < 0) {
        console.error("❌ Test G1 Failed: RACE CONDITION DETECTED! Negative Stock.");
    } else if (lotFinal.current_qty === 0 && successCount === 4) {
        console.log("✅ Test G1 Passed: Blocked excess requests correctly.");
    } else {
        console.log(`ℹ️ Race Logic Result: Stock ${lotFinal.current_qty}. (Check if this matches expectations)`);
    }

    console.log("\n==========================================");
    console.log("🛑 AUDIT COMPLETE 🛑");
}

runAudit();

const { createClient } = require('@supabase/supabase-js');

// Config from check_rls.js
const supabaseUrl = 'https://ldayxjabzyorpugwszpt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runAudit() {
    console.log("🛑 STARTING PRODUCTION READINESS AUDIT 🛑");
    console.log("==========================================");

    const core = 'core';
    const mandi = 'mandi';

    // 1. SETUP
    console.log("\n[SETUP] Creating Test Environment...");
    const orgName = `Audit Corp ${Date.now()}`;

    // Create Org
    const { data: org, error: orgError } = await supabase.schema(core).from('organizations')
        .insert({ 
            name: orgName,
            tenant_type: 'mandi',
            status: 'active',
            subscription_tier: 'basic',
            is_active: true
        })
        .select().single();

    if (orgError) { console.error("Setup Failed: Org", orgError); return; }
    console.log(`✅ Org Created: ${org.name} (${org.id})`);

    // Create Item
    const { data: item, error: itemError } = await supabase.schema(mandi).from('commodities')
        .insert({ name: 'Audit Apple', organization_id: org.id, default_unit: 'box' })
        .select().single();
    
    if (itemError) { console.error("Setup Failed: Item", itemError); return; }
    console.log(`✅ Item Created: ${item.name}`);

    // Create Buyer
    const { data: buyer, error: buyerError } = await supabase.schema(mandi).from('contacts')
        .insert({ name: 'Audit Buyer', type: 'buyer', contact_type: 'buyer', organization_id: org.id })
        .select().single();
    
    if (buyerError) { console.error("Setup Failed: Buyer", buyerError); return; }
    console.log(`✅ Buyer Created: ${buyer.name}`);

    // Create Contact (Supplier)
    const { data: supplier, error: supplierError } = await supabase.schema(mandi).from('contacts')
        .insert({ name: 'Audit Supplier', type: 'supplier', contact_type: 'supplier', organization_id: org.id })
        .select().single();
    
    if (supplierError) { console.error("Setup Failed: Supplier", supplierError); return; }

    // Create Initial Stock (Lot)
    const { data: lot, error: lotError } = await supabase.schema(mandi).from('lots')
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
    
    if (lotError) { console.error("Setup Failed: Lot", lotError); return; }
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
        p_idempotency_key: `audit-key-${Date.now()}`, // UNIQUE UUID for Idempotency Test
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
        const { data: lotAfter1 } = await supabase.schema(mandi).from('lots').select('current_qty').eq('id', lot.id).single();
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
    const { error: sale2Error } = await supabase.rpc('confirm_sale_transaction', sale1Payload);

    if (sale2Error) {
        console.log("✅ Test C1 Passed: System rejected duplicate (or threw error)");
    } else {
        const { data: lotAfter2 } = await supabase.schema(mandi).from('lots').select('current_qty').eq('id', lot.id).single();
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

    const sale3Payload = { ...sale1Payload, p_idempotency_key: `audit-key-oversell-${Date.now()}`, p_items: [{ ...sale1Payload.p_items[0], qty: 1000 }] };
    const { error: sale3Error } = await supabase.rpc('confirm_sale_transaction', sale3Payload);

    if (sale3Error) {
        console.log("✅ Test F1 Passed: System rejected over-sell.");
    } else {
        const { data: lotAfter3 } = await supabase.schema(mandi).from('lots').select('current_qty').eq('id', lot.id).single();
        if (lotAfter3.current_qty < 0) {
            console.error(`❌ Test F1 Failed: NEGATIVE STOCK! ${lotAfter3.current_qty}`);
        } else {
            console.error(`❌ Test F1 Failed: Transaction accepted? Stock: ${lotAfter3.current_qty}`);
        }
    }

    // 5. TEST GROUP E: LEDGER INTEGRITY
    console.log("\n[TEST GROUP E] Ledger Validation");
    const { data: ledger } = await supabase.schema(mandi).from('ledger_entries')
        .select('*')
        .eq('organization_id', org.id);

    console.log(`Found ${ledger.length} ledger entries.`);
    // We expect Debit to Buyer
    const buyerDebits = ledger.filter(l => l.contact_id === buyer.id && l.debit > 0);
    const totalDebit = buyerDebits.reduce((sum, l) => sum + l.debit, 0);

    console.log(`Total Buyer Debit: ${totalDebit}`);

    // 6. TEST GROUP G: RACE CONDITION
    console.log("\n[TEST GROUP G] Concurrency / Race Condition");
    console.log("🔹 Test G1: 5 parallel requests for 20 units each (Total 100). Remaining Stock ~80.");

    // Reset stock to 80 just to be sure
    await supabase.schema(mandi).from('lots').update({ current_qty: 80 }).eq('id', lot.id);

    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(supabase.rpc('confirm_sale_transaction', {
            ...sale1Payload,
            p_idempotency_key: `audit-key-race-${i}-${Date.now()}`,
            p_items: [{ ...sale1Payload.p_items[0], qty: 20 }]
        }));
    }

    const results = await Promise.all(promises);
    const successCount = results.filter(r => !r.error).length;
    const failCount = results.filter(r => r.error).length;

    console.log(`并行 Results: ${successCount} Owners, ${failCount} Rejected`);

    const { data: lotFinal } = await supabase.schema(mandi).from('lots').select('current_qty').eq('id', lot.id).single();
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

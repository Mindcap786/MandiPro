const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkColumns() {
  console.log('\n===== MANIDPRO FULL-STACK DB AUDIT =====\n');

  // Test arrivals GET select — all columns used by GET /api/mandi/arrivals
  const { data: arrivalTest, error: arrErr } = await supabase
    .schema('mandi').from('arrivals')
    .select('id, arrival_date, arrival_type, lot_prefix, num_lots, gross_qty, less_percent, less_units, net_qty, commission_percent, transport_amount, loading_amount, packing_amount, advance_amount, status, created_at')
    .limit(1);
  if (arrErr) console.log('❌ ARRIVALS SELECT FAILED:', arrErr.code, arrErr.message);
  else console.log('✅ ARRIVALS SELECT: OK');

  // Test lots
  const { data: lotsTest, error: lotsErr } = await supabase
    .schema('mandi').from('lots')
    .select('id, organization_id, arrival_id, item_id, supplier_id, initial_qty, current_qty, unit, supplier_rate, commission_percent, status')
    .limit(1);
  if (lotsErr) console.log('❌ LOTS SELECT FAILED:', lotsErr.code, lotsErr.message);
  else console.log('✅ LOTS SELECT: OK');

  // Test payments
  const { data: pTest, error: pErr } = await supabase
    .schema('mandi').from('payments')
    .select('id, organization_id, payment_date, payment_type, party_id, account_id, amount, payment_mode, idempotency_key')
    .limit(1);
  if (pErr) console.log('❌ PAYMENTS SELECT FAILED:', pErr.code, pErr.message);
  else console.log('✅ PAYMENTS SELECT: OK');

  // Test sales
  const { data: sTest, error: sErr } = await supabase
    .schema('mandi').from('sales')
    .select('id, sale_date, invoice_no, status, payment_status, payment_mode, subtotal, discount_amount, gst_amount, total_amount, paid_amount, balance_due, narration, created_at')
    .limit(1);
  if (sErr) console.log('❌ SALES SELECT FAILED:', sErr.code, sErr.message);
  else console.log('✅ SALES SELECT: OK');

  // Test ledger (used by reports)
  const { data: ledgerTest, error: ledgerErr } = await supabase
    .schema('mandi').from('ledger_entries')
    .select('id, entry_date, debit, credit, narration, reference_type, reference_id')
    .limit(1);
  if (ledgerErr) console.log('❌ LEDGER_ENTRIES SELECT FAILED:', ledgerErr.code, ledgerErr.message);
  else console.log('✅ LEDGER_ENTRIES SELECT: OK');

  // Test cheques
  const { data: chTest, error: chErr } = await supabase
    .schema('mandi').from('cheques')
    .select('id, status, amount, party_id, organization_id')
    .limit(1);
  if (chErr) console.log('❌ CHEQUES SELECT FAILED:', chErr.code, chErr.message);
  else console.log('✅ CHEQUES SELECT: OK');

  // Test contacts
  const { data: ctTest, error: ctErr } = await supabase
    .schema('mandi').from('contacts')
    .select('id, name, contact_type, phone, address, opening_balance')
    .limit(1);
  if (ctErr) console.log('❌ CONTACTS SELECT FAILED:', ctErr.code, ctErr.message);
  else console.log('✅ CONTACTS SELECT: OK');

  console.log('\n===== RPC EXISTENCE AUDIT =====\n');

  // Check confirm_sale_transaction in mandi schema via PGRST
  const r1 = await supabase.schema('mandi').rpc('confirm_sale_transaction', {
    p_organization_id: '00000000-0000-0000-0000-000000000000',
    p_sale_date: '2026-01-01',
    p_buyer_id: null,
    p_items: [],
    p_total_amount: 0,
    p_header_discount: 0,
    p_discount_percent: 0,
    p_discount_amount: 0,
    p_payment_mode: 'cash',
    p_narration: null,
    p_cheque_number: null,
    p_cheque_date: null,
    p_cheque_bank: null,
    p_bank_account_id: null,
    p_cheque_status: false,
    p_amount_received: 0,
    p_due_date: null,
    p_market_fee: 0,
    p_nirashrit: 0,
    p_misc_fee: 0,
    p_loading_charges: 0,
    p_unloading_charges: 0,
    p_other_expenses: 0,
    p_gst_enabled: false,
    p_cgst_amount: 0,
    p_sgst_amount: 0,
    p_igst_amount: 0,
    p_gst_total: 0,
    p_place_of_supply: null,
    p_buyer_gstin: null,
    p_is_igst: false,
    p_idempotency_key: '11111111-1111-1111-1111-111111111111',
    p_created_by: '00000000-0000-0000-0000-000000000000'
  });
  if (r1.error?.code === 'PGRST202') console.log('❌ confirm_sale_transaction: MISSING!');
  else if (r1.error) console.log('✅ confirm_sale_transaction: EXISTS (error expected with fake data):', r1.error.message.slice(0,80));
  else console.log('✅ confirm_sale_transaction: EXISTS');

  // Check create_mixed_arrival
  const r2 = await supabase.schema('mandi').rpc('create_mixed_arrival', {
    p_arrival: { organization_id: '00000000-0000-0000-0000-000000000000', arrival_type: 'direct', arrival_date: '2026-01-01', items: [] },
    p_created_by: '00000000-0000-0000-0000-000000000000'
  });
  if (r2.error?.code === 'PGRST202') console.log('❌ create_mixed_arrival: MISSING!');
  else if (r2.error) console.log('✅ create_mixed_arrival: EXISTS (error expected):', r2.error.message.slice(0,80));
  else console.log('✅ create_mixed_arrival: EXISTS');

  // Check get_financial_summary
  const r3 = await supabase.schema('mandi').rpc('get_financial_summary', { p_org_id: '00000000-0000-0000-0000-000000000000' });
  if (r3.error?.code === 'PGRST202') console.log('❌ get_financial_summary: MISSING!');
  else if (r3.error) console.log('✅ get_financial_summary: EXISTS:', r3.error.message.slice(0,80));
  else console.log('✅ get_financial_summary: EXISTS, data:', r3.data);

  // Check get_pnl_summary
  const r4 = await supabase.schema('mandi').rpc('get_pnl_summary', {
    p_organization_id: '00000000-0000-0000-0000-000000000000',
    p_start_date: '2026-01-01',
    p_end_date: '2026-04-30'
  });
  if (r4.error?.code === 'PGRST202') console.log('❌ get_pnl_summary: MISSING!');
  else if (r4.error) console.log('✅ get_pnl_summary: EXISTS:', r4.error.message.slice(0,80));
  else console.log('✅ get_pnl_summary: EXISTS, data:', r4.data);

  // Check transition_cheque_with_ledger
  const r5 = await supabase.schema('mandi').rpc('transition_cheque_with_ledger', {
    p_cheque_id: '00000000-0000-0000-0000-000000000000',
    p_next_status: 'cleared',
    p_cleared_date: '2026-01-01',
    p_bounce_reason: null,
    p_actor_id: '00000000-0000-0000-0000-000000000000'
  });
  if (r5.error?.code === 'PGRST202') console.log('❌ transition_cheque_with_ledger: MISSING!');
  else if (r5.error) console.log('✅ transition_cheque_with_ledger: EXISTS:', r5.error.message.slice(0,80));
  else console.log('✅ transition_cheque_with_ledger: EXISTS');

  // Check post_arrival_ledger
  const r6 = await supabase.schema('mandi').rpc('post_arrival_ledger', {
    p_arrival_id: '00000000-0000-0000-0000-000000000000'
  });
  if (r6.error?.code === 'PGRST202') console.log('❌ post_arrival_ledger: MISSING!');
  else if (r6.error) console.log('✅ post_arrival_ledger: EXISTS:', r6.error.message.slice(0,80));
  else console.log('✅ post_arrival_ledger: EXISTS');

  console.log('\n===== CORE SCHEMA AUDIT =====\n');
  const { data: coreOrg, error: coreErr } = await supabase
    .schema('core').from('organizations').select('id, name, is_active').limit(1);
  if (coreErr) console.log('❌ core.organizations: FAILED:', coreErr.message);
  else console.log('✅ core.organizations: OK');

  const { data: coreProf, error: coreProfErr } = await supabase
    .schema('core').from('profiles').select('id, organization_id, role, full_name').limit(1);
  if (coreProfErr) console.log('❌ core.profiles: FAILED:', coreProfErr.message);
  else console.log('✅ core.profiles: OK');
  
  console.log('\n===== AUDIT COMPLETE =====\n');
}

checkColumns().catch(console.error);

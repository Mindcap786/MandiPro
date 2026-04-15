/**
 * ============================================================
 * COMPREHENSIVE HEALTH CHECK SCRIPT (JavaScript/Node.js)
 * Purpose: Verify all API endpoints and data loading from browser
 * Usage: Run in browser console or Node.js environment
 * ============================================================
 */

const SUPABASE_URL = 'https://ldayxjabzyorpugwszpt.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzemx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NzA0MDQzNjYsImV4cCI6MTk4NTk4NDM2Nn0.Jz5XXxEjGBb7C6eoZYYDxmfRJDpkrxJZrMSmSuhnb1A'
const ORG_ID = '619cd49c-8556-4c7d-96ab-9c2939d76ca8'

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
}

// Helper to format output in browser
const log = (message, type = 'info') => {
  const styles = {
    success: 'color: #22c55e; font-weight: bold;',
    error: 'color: #ef4444; font-weight: bold;',
    info: 'color: #3b82f6; font-weight: bold;',
    data: 'color: #8b5cf6;',
    warning: 'color: #f59e0b;'
  }
  console.log(`%c${message}`, styles[type] || styles.info)
}

const logTable = (data) => {
  console.table(data)
}

// Test function
async function testEndpoint(name, schema, table, filters = '', nested = '') {
  results.total++
  const startTime = performance.now()
  
  try {
    log(`\nTesting: ${name}`, 'info')
    
    // Build the query URL
    let query = filters ? `?${filters}` : '?select=*'
    const url = `${SUPABASE_URL}/rest/v1/${schema}/${table}${query}`
    
    // Make the request
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    
    const endTime = performance.now()
    const responseTime = (endTime - startTime).toFixed(2)
    
    // Check status
    if (response.status === 200) {
      const data = await response.json()
      const recordCount = Array.isArray(data) ? data.length : 1
      
      log(`✅ Status: ${response.status} | Records: ${recordCount} | Time: ${responseTime}ms`, 'success')
      
      results.passed++
      results.tests.push({
        name,
        status: '✅ PASS',
        httpCode: response.status,
        records: recordCount,
        time: `${responseTime}ms`
      })
      
      return { success: true, data, count: recordCount }
    } else {
      const error = await response.text()
      log(`❌ Status: ${response.status} | Error: ${error.substring(0, 100)}`, 'error')
      
      results.failed++
      results.tests.push({
        name,
        status: '❌ FAIL',
        httpCode: response.status,
        records: 0,
        time: `${responseTime}ms`
      })
      
      return { success: false, error }
    }
  } catch (error) {
    log(`❌ Exception: ${error.message}`, 'error')
    results.failed++
    results.tests.push({
      name,
      status: '❌ EXCEPTION',
      httpCode: null,
      records: 0,
      time: null
    })
    return { success: false, error: error.message }
  }
}

// Main verification suite
async function runVerification() {
  log('========================================', 'info')
  log('COMPREHENSIVE API & DATA VERIFICATION', 'info')
  log('========================================', 'info')
  
  // ============================================================
  // PHASE 1: BASIC CONNECTIVITY
  // ============================================================
  log('\nPHASE 1: BASIC CONNECTIVITY', 'info')
  log('========================================', 'info')
  
  await testEndpoint('Health Check', 'mandi', 'sales', 'select=id&limit=1')
  
  // ============================================================
  // PHASE 2: SIMPLE TABLE QUERIES
  // ============================================================
  log('\nPHASE 2: TABLE ACCESS (Simple Queries)', 'info')
  log('========================================', 'info')
  
  const salesResult = await testEndpoint('Sales Table', 'mandi', 'sales', 'select=*&limit=10')
  const arrivalsResult = await testEndpoint('Arrivals Table', 'mandi', 'arrivals', 'select=*&limit=10')
  const lotsResult = await testEndpoint('Lots Table', 'mandi', 'lots', 'select=*&limit=10')
  const contactsResult = await testEndpoint('Contacts Table', 'mandi', 'contacts', 'select=*&limit=10')
  const commoditiesResult = await testEndpoint('Commodities Table', 'mandi', 'commodities', 'select=*&limit=10')
  
  // ============================================================
  // PHASE 3: FILTERED QUERIES (BY ORGANIZATION)
  // ============================================================
  log('\nPHASE 3: FILTERED QUERIES (By Organization)', 'info')
  log('========================================', 'info')
  
  await testEndpoint(
    'Sales for Current Org',
    'mandi',
    'sales',
    `select=*&organization_id=eq.${ORG_ID}`
  )
  
  await testEndpoint(
    'Arrivals for Current Org',
    'mandi',
    'arrivals',
    `select=*&organization_id=eq.${ORG_ID}`
  )
  
  await testEndpoint(
    'Lots for Current Org',
    'mandi',
    'lots',
    `select=*&organization_id=eq.${ORG_ID}`
  )
  
  // ============================================================
  // PHASE 4: NESTED QUERIES (WITH JOINS)
  // ============================================================
  log('\nPHASE 4: NESTED QUERIES (With Relationships)', 'info')
  log('========================================', 'info')
  
  // This mimics the actual PageClient.tsx query structure
  const complexQueryFields = 'id,sale_date,sale_number,total_amount,organization_id,buyer_id,contact:contacts!sales_buyer_id_fkey(id,name,contact_type)'
  
  await testEndpoint(
    'Sales with Contacts (Relationship)',
    'mandi',
    'sales',
    `select=${encodeURIComponent(complexQueryFields)}&limit=5`
  )
  
  // ============================================================
  // PHASE 5: CRITICAL PATH QUERIES
  // ============================================================
  log('\nPHASE 5: CRITICAL PATH (Exact App Queries)', 'info')
  log('========================================', 'info')
  
  // Sales with all relationships (like PageClient.tsx does)
  const fullSalesQuery = `select=id,sale_date,sale_number,total_amount,organization_id,contact:contacts!sales_buyer_id_fkey(id,name),sale_items(id,lot_id,quantity,rate,amount),sale_adjustments(id,adjustment_type,amount),vouchers(id,voucher_type),lot:lots(id,lot_number)`
  
  await testEndpoint(
    'Full Sales Query (Like PageClient.tsx)',
    'mandi',
    'sales',
    `${fullSalesQuery}&limit=5&organization_id=eq.${ORG_ID}`
  )
  
  // Lots with commodities (for POS)
  const lotsWithCommodity = `select=id,lot_number,item_id,quantity,organization_id,item:commodities(id,item_name,item_number)`
  
  await testEndpoint(
    'Lots with Commodities (Like POS)',
    'mandi',
    'lots',
    `${lotsWithCommodity}&limit=5&organization_id=eq.${ORG_ID}`
  )
  
  // ============================================================
  // PHASE 6: RELATED TABLES
  // ============================================================
  log('\nPHASE 6: RELATED TABLES', 'info')
  log('========================================', 'info')
  
  await testEndpoint('Sale Items', 'mandi', 'sale_items', 'select=*&limit=10')
  await testEndpoint('Vouchers', 'mandi', 'vouchers', 'select=*&limit=10')
  await testEndpoint('Accounts', 'mandi', 'accounts', 'select=*&limit=10')
  await testEndpoint('Ledger Entries', 'mandi', 'ledger_entries', 'select=*&limit=10')
  
  // ============================================================
  // SUMMARY & RESULTS
  // ============================================================
  log('\n========================================', 'info')
  log('TEST RESULTS SUMMARY', 'info')
  log('========================================', 'info')
  
  log(`\nTotal Tests: ${results.total}`, 'info')
  log(`✅ Passed: ${results.passed}`, 'success')
  log(`❌ Failed: ${results.failed}`, results.failed === 0 ? 'success' : 'error')
  
  const successRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0
  log(`Success Rate: ${successRate}%`, successRate === 100 ? 'success' : 'warning')
  
  // Show detailed table
  log('\nDETAILED TEST RESULTS:', 'info')
  logTable(results.tests)
  
  // Show data summary
  log('\nDATA AVAILABILITY SUMMARY:', 'info')
  const dataChecks = [
    { table: 'Sales', count: salesResult.data?.length || 0 },
    { table: 'Arrivals', count: arrivalsResult.data?.length || 0 },
    { table: 'Lots', count: lotsResult.data?.length || 0 },
    { table: 'Contacts', count: contactsResult.data?.length || 0 },
    { table: 'Commodities', count: commoditiesResult.data?.length || 0 }
  ]
  logTable(dataChecks)
  
  // Final verdict
  log('\n========================================', 'info')
  if (results.failed === 0 && results.passed > 0) {
    log('✅ ALL TESTS PASSED - SYSTEM IS FULLY OPERATIONAL!', 'success')
    return true
  } else if (results.failed > 0) {
    log(`❌ ${results.failed} TEST(S) FAILED - INVESTIGATION NEEDED`, 'error')
    return false
  } else {
    log('⚠️  NO TESTS RAN - CHECK CONFIGURATION', 'warning')
    return false
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runVerification, testEndpoint }
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  window.runHealthCheck = runVerification
  log('✅ Health check loaded! Run: await runHealthCheck()', 'success')
}

/**
 * ============================================================
 * COMPREHENSIVE HEALTH CHECK COMPONENT (React/TypeScript)
 * Purpose: Run verification tests from within the Next.js app
 * Integration: Can be used in a debug page or modal
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'ERROR'
  httpCode?: number
  recordCount: number
  responseTime: number
  error?: string
}

interface TestSummary {
  total: number
  passed: number
  failed: number
  successRate: number
  tests: TestResult[]
  dataAvailability: Record<string, number>
}

/**
 * Run comprehensive health checks for all API endpoints
 */
export async function runHealthCheck(): Promise<TestSummary> {
  const results: TestResult[] = []
  const dataAvailability: Record<string, number> = {}
  
  // Get current organization
  const { data: userProfile } = await supabase.rpc('get_user_org_id')
  
  console.log('🏥 Starting Comprehensive Health Check...')
  console.log(`📊 Testing with Organization ID: ${userProfile}`)
  
  // ============================================================
  // TEST 1: BASIC TABLES
  // ============================================================
  
  const tables = ['sales', 'arrivals', 'lots', 'contacts', 'commodities']
  const basicTableTests = await Promise.all(
    tables.map(table => testBasicTable(table))
  )
  results.push(...basicTableTests)
  
  // ============================================================
  // TEST 2: FILTERED QUERIES (BY ORGANIZATION)
  // ============================================================
  
  if (userProfile) {
    const filteredTests = await Promise.all(
      tables.map(table => testFilteredQuery(table, userProfile))
    )
    results.push(...filteredTests)
  }
  
  // ============================================================
  // TEST 3: CRITICAL PATH QUERIES
  // ============================================================
  
  const sales = await testComplexSalesQuery()
  results.push(sales)
  dataAvailability['Sales'] = sales.recordCount
  
  const lots = await testComplexLotsQuery()
  results.push(lots)
  dataAvailability['Lots'] = lots.recordCount
  
  // ============================================================
  // TEST 4: RELATED TABLES
  // ============================================================
  
  const relatedTables = ['sale_items', 'vouchers', 'accounts', 'ledger_entries']
  const relatedTests = await Promise.all(
    relatedTables.map(table => testBasicTable(table))
  )
  results.push(...relatedTests)
  
  // ============================================================
  // ANALYZE RESULTS
  // ============================================================
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status !== 'PASS').length
  const successRate = results.length > 0 ? (passed / results.length) * 100 : 0
  
  const summary: TestSummary = {
    total: results.length,
    passed,
    failed,
    successRate: parseFloat(successRate.toFixed(1)),
    tests: results,
    dataAvailability
  }
  
  console.log('✅ Health check complete', summary)
  
  return summary
}

/**
 * Test a basic table query
 */
async function testBasicTable(tableName: string): Promise<TestResult> {
  const startTime = performance.now()
  
  try {
    const { data, error, status } = await supabase
      .schema('mandi')
      .from(tableName)
      .select('id')
      .limit(1)
    
    const responseTime = performance.now() - startTime
    
    if (error) {
      return {
        name: `${tableName} (Basic)`,
        status: 'FAIL',
        httpCode: status,
        recordCount: 0,
        responseTime: parseFloat(responseTime.toFixed(2)),
        error: error.message
      }
    }
    
    return {
      name: `${tableName} (Basic)`,
      status: 'PASS',
      httpCode: status,
      recordCount: Array.isArray(data) ? data.length : 0,
      responseTime: parseFloat(responseTime.toFixed(2))
    }
  } catch (error) {
    const responseTime = performance.now() - startTime
    return {
      name: `${tableName} (Basic)`,
      status: 'ERROR',
      recordCount: 0,
      responseTime: parseFloat(responseTime.toFixed(2)),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test filtered query by organization
 */
async function testFilteredQuery(
  tableName: string,
  orgId: string
): Promise<TestResult> {
  const startTime = performance.now()
  
  try {
    const { data, error, status } = await supabase
      .schema('mandi')
      .from(tableName)
      .select('id')
      .eq('organization_id', orgId)
      .limit(100)
    
    const responseTime = performance.now() - startTime
    
    if (error) {
      return {
        name: `${tableName} (Filtered by Org)`,
        status: 'FAIL',
        httpCode: status,
        recordCount: 0,
        responseTime: parseFloat(responseTime.toFixed(2)),
        error: error.message
      }
    }
    
    return {
      name: `${tableName} (Filtered by Org)`,
      status: 'PASS',
      httpCode: status,
      recordCount: Array.isArray(data) ? data.length : 0,
      responseTime: parseFloat(responseTime.toFixed(2))
    }
  } catch (error) {
    const responseTime = performance.now() - startTime
    return {
      name: `${tableName} (Filtered by Org)`,
      status: 'ERROR',
      recordCount: 0,
      responseTime: parseFloat(responseTime.toFixed(2)),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test complex sales query with relationships
 * This mimics the actual PageClient.tsx query structure
 */
async function testComplexSalesQuery(): Promise<TestResult> {
  const startTime = performance.now()
  
  try {
    const { data, error, status } = await supabase
      .schema('mandi')
      .from('sales')
      .select(`
        id,
        sale_date,
        sale_number,
        total_amount,
        organization_id,
        buyer_id,
        contact:contacts!sales_buyer_id_fkey(id, name, contact_type),
        sale_items(id, lot_id, quantity, rate, amount),
        sale_adjustments(id, adjustment_type, amount),
        vouchers(id, voucher_type),
        lot:lots(id, lot_number)
      `)
      .limit(10)
    
    const responseTime = performance.now() - startTime
    
    if (error) {
      return {
        name: 'Sales with Relationships (Critical Path)',
        status: 'FAIL',
        httpCode: status,
        recordCount: 0,
        responseTime: parseFloat(responseTime.toFixed(2)),
        error: error.message
      }
    }
    
    return {
      name: 'Sales with Relationships (Critical Path)',
      status: 'PASS',
      httpCode: status,
      recordCount: Array.isArray(data) ? data.length : 0,
      responseTime: parseFloat(responseTime.toFixed(2))
    }
  } catch (error) {
    const responseTime = performance.now() - startTime
    return {
      name: 'Sales with Relationships (Critical Path)',
      status: 'ERROR',
      recordCount: 0,
      responseTime: parseFloat(responseTime.toFixed(2)),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test complex lots query with commodities
 * This mimics the POS/Quick Purchase queries
 */
async function testComplexLotsQuery(): Promise<TestResult> {
  const startTime = performance.now()
  
  try {
    const { data, error, status } = await supabase
      .schema('mandi')
      .from('lots')
      .select(`
        id,
        lot_number,
        item_id,
        quantity,
        organization_id,
        item:commodities(id, item_name, item_number)
      `)
      .limit(10)
    
    const responseTime = performance.now() - startTime
    
    if (error) {
      return {
        name: 'Lots with Commodities (POS Path)',
        status: 'FAIL',
        httpCode: status,
        recordCount: 0,
        responseTime: parseFloat(responseTime.toFixed(2)),
        error: error.message
      }
    }
    
    return {
      name: 'Lots with Commodities (POS Path)',
      status: 'PASS',
      httpCode: status,
      recordCount: Array.isArray(data) ? data.length : 0,
      responseTime: parseFloat(responseTime.toFixed(2))
    }
  } catch (error) {
    const responseTime = performance.now() - startTime
    return {
      name: 'Lots with Commodities (POS Path)',
      status: 'ERROR',
      recordCount: 0,
      responseTime: parseFloat(responseTime.toFixed(2)),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * React Hook for running health checks with UI
 */
export function useHealthCheck() {
  const [results, setResults] = React.useState<TestSummary | null>(null)
  const [isRunning, setIsRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  
  const run = async () => {
    setIsRunning(true)
    setError(null)
    
    try {
      const summary = await runHealthCheck()
      setResults(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsRunning(false)
    }
  }
  
  return { results, isRunning, error, run }
}

/**
 * React Component for displaying health check results
 */
import React from 'react'

export function HealthCheckComponent() {
  const { results, isRunning, error, run } = useHealthCheck()
  
  return (
    <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
      <h2 className="text-2xl font-bold mb-4">System Health Check</h2>
      
      <button
        onClick={run}
        disabled={isRunning}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {isRunning ? '🔄 Running...' : '▶️ Run Health Check'}
      </button>
      
      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <p>Error: {error}</p>
        </div>
      )}
      
      {results && (
        <div className="mt-6">
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-white rounded border">
              <p className="text-gray-600">Total Tests</p>
              <p className="text-2xl font-bold">{results.total}</p>
            </div>
            <div className="p-4 bg-green-50 rounded border border-green-200">
              <p className="text-gray-600">Passed</p>
              <p className="text-2xl font-bold text-green-600">✅ {results.passed}</p>
            </div>
            <div className={`p-4 rounded border ${results.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-gray-600">Failed</p>
              <p className={`text-2xl font-bold ${results.failed === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {results.failed === 0 ? '✅ 0' : `❌ ${results.failed}`}
              </p>
            </div>
            <div className="p-4 bg-white rounded border">
              <p className="text-gray-600">Success Rate</p>
              <p className={`text-2xl font-bold ${results.successRate === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                {results.successRate}%
              </p>
            </div>
          </div>
          
          <div className="mt-6">
            <h3 className="text-lg font-bold mb-2">Data Availability</h3>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(results.dataAvailability).map(([table, count]) => (
                <div key={table} className="p-2 bg-white rounded border text-sm">
                  <span className="font-semibold">{table}:</span> {count} records
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-6 overflow-x-auto">
            <h3 className="text-lg font-bold mb-2">Detailed Results</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="p-2 text-left">Test Name</th>
                  <th className="p-2 text-center">Status</th>
                  <th className="p-2 text-right">Records</th>
                  <th className="p-2 text-right">Response Time</th>
                </tr>
              </thead>
              <tbody>
                {results.tests.map((test, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="p-2">{test.name}</td>
                    <td className="p-2 text-center font-bold">
                      {test.status === 'PASS' ? '✅' : '❌'} {test.status}
                    </td>
                    <td className="p-2 text-right">{test.recordCount}</td>
                    <td className="p-2 text-right">{test.responseTime}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {results.failed === 0 && (
            <div className="mt-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
              <p className="font-bold">✅ ALL SYSTEMS OPERATIONAL</p>
              <p>All API endpoints are responding correctly and data is accessible.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HealthCheckComponent

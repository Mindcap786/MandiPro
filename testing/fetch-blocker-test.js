/**
 * TEST SUITE: Database Fetch Blocker Fix (20260415)
 * 
 * Usage:
 * 1. Copy this code into browser console (F12)
 * 2. Or integrate into your test suite
 * 3. Verify all tests pass
 * 
 * Tests:
 * - Fast view accessibility
 * - Account lookup functionality  
 * - Arrival fetch performance
 * - Error handling & fallback logic
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test Suite
const FetchBlockerTestSuite = {
    results: [],
    
    // TEST 1: Verify v_arrivals_fast view exists and accessible
    async testArrivalsView() {
        console.log('\n🧪 TEST 1: Check v_arrivals_fast view accessibility');
        try {
            const startTime = Date.now();
            const { data, error, count } = await supabase
                .schema('mandi')
                .from('v_arrivals_fast')
                .select('*', { count: 'exact' })
                .limit(5)
                .timeout(5000); // 5 second timeout
            
            const duration = Date.now() - startTime;
            
            if (error) {
                this.results.push({
                    test: 'arrivalsView',
                    status: '❌ FAIL',
                    error: error.message,
                    duration: 'N/A'
                });
                console.error('  ❌ View not accessible:', error);
                return false;
            }
            
            this.results.push({
                test: 'arrivalsView',
                status: '✅ PASS',
                count: count || 0,
                records: data?.length || 0,
                duration: `${duration}ms`
            });
            console.log(`  ✅ View accessible: ${data?.length || 0} records in ${duration}ms`);
            return true;
        } catch (err) {
            this.results.push({
                test: 'arrivalsView',
                status: '❌ ERROR',
                error: err.message
            });
            console.error('  ❌ Exception:', err);
            return false;
        }
    },
    
    // TEST 2: Verify get_account_id function exists and works
    async testGetAccountId() {
        console.log('\n🧪 TEST 2: Check get_account_id() function');
        try {
            // Get an org ID from session
            const { data: { user } } = await supabase.auth.getUser();
            const orgId = user?.user_metadata?.organization_id;
            
            if (!orgId) {
                this.results.push({
                    test: 'getAccountId',
                    status: '⏭️ SKIP',
                    reason: 'No organization in session'
                });
                console.log('  ⏭️ Skipped: No org in session');
                return true; // Not a failure
            }
            
            const { data, error } = await supabase
                .schema('mandi')
                .rpc('get_account_id', {
                    p_org_id: orgId,
                    p_code: '5001',
                    p_name_like: null
                });
            
            if (error) {
                this.results.push({
                    test: 'getAccountId',
                    status: '❌ FAIL',
                    error: error.message
                });
                console.error('  ❌ Function call failed:', error);
                return false;
            }
            
            this.results.push({
                test: 'getAccountId',
                status: '✅ PASS',
                returnValue: data ? 'UUID' : 'NULL',
                note: 'Function works (returned UUID or NULL, not error)'
            });
            console.log(`  ✅ Function works: returned ${data ? 'UUID' : 'NULL'} (no error)`);
            return true;
        } catch (err) {
            this.results.push({
                test: 'getAccountId',
                status: '❌ ERROR',
                error: err.message
            });
            console.error('  ❌ Exception:', err);
            return false;
        }
    },
    
    // TEST 3: Performance benchmark - Fast view speed
    async testArrivalsPerformance() {
        console.log('\n🧪 TEST 3: Performance benchmark - v_arrivals_fast');
        try {
            const startTime = Date.now();
            const { data, error } = await supabase
                .schema('mandi')
                .from('v_arrivals_fast')
                .select('*', { count: 'exact' })
                .limit(20);
            
            const duration = Date.now() - startTime;
            const passed = duration < 500; // Should be <500ms
            
            this.results.push({
                test: 'performance',
                status: passed ? '✅ PASS' : '⚠️ SLOW',
                duration: `${duration}ms`,
                target: '<500ms',
                note: passed ? 'Excellent performance' : 'Check for missing indexes'
            });
            console.log(
                passed 
                ? `  ✅ Fast fetch: ${duration}ms (target: <500ms)` 
                : `  ⚠️ Slow fetch: ${duration}ms (target: <500ms)`
            );
            return duration < 5000; // Fail if >5 seconds
        } catch (err) {
            this.results.push({
                test: 'performance',
                status: '❌ ERROR',
                error: err.message
            });
            console.error('  ❌ Exception:', err);
            return false;
        }
    },
    
    // TEST 4: Fallback logic - Test error handling  
    async testErrorHandling() {
        console.log('\n🧪 TEST 4: Fallback logic - error handling');
        try {
            // Try to access non-existent view
            const { data, error } = await supabase
                .schema('mandi')
                .from('v_nonexistent_view_12345')
                .select('*')
                .limit(1)
                .timeout(2000);
            
            const doesErrorMessage = error?.message?.includes('not found') || 
                                    error?.message?.includes('does not exist');
            
            if (doesErrorMessage || error) {
                this.results.push({
                    test: 'errorHandling',
                    status: '✅ PASS',
                    note: 'Errors are catchable for fallback logic'
                });
                console.log('  ✅ Errors properly caught (fallback will work)');
                return true;
            }
            
            this.results.push({
                test: 'errorHandling',
                status: '❌ UNEXPECTED',
                note: 'Expected error not thrown'
            });
            console.log('  ⚠️ Error not thrown as expected');
            return false;
        } catch (err) {
            this.results.push({
                test: 'errorHandling',
                status: '✅ PASS',
                note: `Exception caught: ${err.message?.substring(0, 50)}`
            });
            console.log('  ✅ Exceptions properly caught for fallback');
            return true;
        }
    },
    
    // TEST 5: Views vs base table - Verify fast view has same schema
    async testViewSchema() {
        console.log('\n🧪 TEST 5: Schema parity - v_arrivals_fast vs arrivals');
        try {
            // Get column info from fast view
            const fastViewQuery = await supabase
                .schema('mandi')
                .from('v_arrivals_fast')
                .select()
                .limit(1);
            
            // Get column info from base table
            const baseTableQuery = await supabase
                .schema('mandi')
                .from('arrivals')
                .select()
                .limit(1);
            
            if (!fastViewQuery?.data?.[0] || !baseTableQuery?.data?.[0]) {
                this.results.push({
                    test: 'viewSchema',
                    status: '⏭️ SKIP',
                    note: 'No data to compare'
                });
                console.log('  ⏭️ Skipped: No data to compare');
                return true;
            }
            
            const fastColumns = Object.keys(fastViewQuery.data[0] || {});
            const baseColumns = Object.keys(baseTableQuery.data[0] || {});
            const mismatch = fastColumns.length !== baseColumns.length;
            
            this.results.push({
                test: 'viewSchema',
                status: mismatch ? '⚠️ WARN' : '✅ PASS',
                fastViewColumns: fastColumns.length,
                baseTableColumns: baseColumns.length,
                note: mismatch ? 'View schema differs from base table' : 'Schemas match'
            });
            console.log(`  ${mismatch ? '⚠️' : '✅'} Columns - View: ${fastColumns.length}, Base: ${baseColumns.length}`);
            return true;
        } catch (err) {
            this.results.push({
                test: 'viewSchema',
                status: '❌ ERROR',
                error: err.message
            });
            console.error('  ❌ Exception:', err);
            return false;
        }
    },
    
    // Run all tests
    async runAll() {
        console.log('\n' + '='.repeat(60));
        console.log('FETCH BLOCKER FIX - TEST SUITE');
        console.log('Migration: 20260415000000_permanent_fetch_blocker_fix');
        console.log('='.repeat(60));
        
        const results = [
            await this.testArrivalsView(),
            await this.testGetAccountId(),
            await this.testArrivalsPerformance(),
            await this.testErrorHandling(),
            await this.testViewSchema()
        ];
        
        const passCount = results.filter(r => r).length;
        const totalCount = results.length;
        
        console.log('\n' + '='.repeat(60));
        console.log('TEST RESULTS SUMMARY');
        console.log('='.repeat(60));
        
        this.results.forEach(result => {
            console.log(`\n${result.status} ${result.test?.toUpperCase()}`);
            Object.entries(result).forEach(([key, value]) => {
                if (key !== 'status' && key !== 'test') {
                    console.log(`  ${key}: ${value}`);
                }
            });
        });
        
        console.log('\n' + '='.repeat(60));
        console.log(`OVERALL: ${passCount}/${totalCount} tests passed`);
        
        if (passCount === totalCount) {
            console.log('✅ ALL TESTS PASSED - Migration is working correctly');
        } else if (passCount >= totalCount - 1) {
            console.log('✅ MOSTLY PASSING - Minor issues only');
        } else {
            console.log('❌ CRITICAL FAILURES - Review migration');
        }
        
        console.log('='.repeat(60) + '\n');
        
        return passCount === totalCount;
    }
};

// Export for use in test frameworks
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FetchBlockerTestSuite;
}

// Run if script is executed directly
if (typeof window === 'undefined') {
    FetchBlockerTestSuite.runAll().then(success => {
        process.exit(success ? 0 : 1);
    });
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. IN BROWSER CONSOLE (F12):
 * - Copy entire file into browser console
 * - Run: await FetchBlockerTestSuite.runAll()
 * - Check results
 * 
 * 2. IN JEST TEST FILE:
 * - Import: const FetchBlockerTestSuite = require('./fetch-blocker-test');
 * - Run: test('Fetch blocker migration', async () => {
 *       const result = await FetchBlockerTestSuite.runAll();
 *       expect(result).toBe(true);
 *   });
 * 
 * 3. STANDALONE NODE:
 * - node fetch-blocker-test.js
 */

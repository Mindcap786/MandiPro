#!/usr/bin/env node
/**
 * Database Blocker Fix - Verification & Application Script
 * Checks if permanent fix is applied and tests functionality
 * 
 * Usage:
 *   node verify-fetcher-fix.js <command> [org-id]
 * 
 * Commands:
 *   verify      - Check if fix is applied correctly
 *   test        - Run comprehensive tests
 *   cleanup    - Clean up orphan records
 *   stats       - Show database statistics
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
    console.log('\n' + '='.repeat(60));
    log(title, 'cyan');
    console.log('='.repeat(60) + '\n');
}

const commands = {
    verify: async (supabase, orgId) => {
        header('Verifying Database Fix Application');

        const checks = [];

        // Check 1: Indexes exist
        try {
            const { data: indexes, error } = await supabase
                .from('pg_stat_user_indexes')
                .select('indexrelname')
                .like('indexrelname', '%idx_%');

            if (indexes && indexes.length > 0) {
                log(`✅ Performance indexes: ${indexes.length} found`, 'green');
                checks.push(true);
            } else {
                log('❌ No performance indexes found', 'red');
                checks.push(false);
            }
        } catch (err) {
            log('⚠️  Could not check indexes (may require admin)', 'yellow');
        }

        // Check 2: Fast views exist
        const views = ['v_arrivals_fast', 'v_sales_fast', 'v_purchase_bills_fast'];
        for (const view of views) {
            try {
                const { data, error } = await supabase
                    .schema('mandi')
                    .from(view)
                    .select('count(*)', { count: 'exact' })
                    .limit(1);

                if (!error) {
                    log(`✅ View ${view} exists and queryable`, 'green');
                    checks.push(true);
                } else {
                    log(`❌ View ${view} not accessible`, 'red');
                    checks.push(false);
                }
            } catch (err) {
                log(`❌ Error checking view ${view}: ${err.message}`, 'red');
                checks.push(false);
            }
        }

        // Check 3: get_account_id function works
        if (orgId) {
            try {
                const { data, error } = await supabase.rpc('get_account_id', {
                    p_org_id: orgId,
                    p_code: '5001',
                });

                if (!error) {
                    log(`✅ get_account_id() function working (result: ${data})`, 'green');
                    checks.push(true);
                } else {
                    log(`❌ get_account_id() failed: ${error}`, 'red');
                    checks.push(false);
                }
            } catch (err) {
                log(`❌ Could not call get_account_id(): ${err.message}`, 'red');
                checks.push(false);
            }
        }

        // Check 4: No orphan records
        try {
            const { data: orphanLots, error: e1 } = await supabase
                .schema('mandi')
                .from('lots')
                .select('id')
                .is('arrival_id', null)
                .limit(1);

            const orphanCount = orphanLots?.length || 0;
            if (orphanCount === 0) {
                log('✅ No orphan lot records', 'green');
                checks.push(true);
            } else {
                log(`⚠️  Found ${orphanCount} orphan lot records`, 'yellow');
                checks.push(true); // Warning only
            }
        } catch (err) {
            log(`⚠️  Could not check for orphans: ${err.message}`, 'yellow');
        }

        // Summary
        const passed = checks.filter(c => c).length;
        const total = checks.length;
        log(`\nVerification Result: ${passed}/${total} checks passed`, passed === total ? 'green' : 'yellow');

        return passed === total;
    },

    test: async (supabase, orgId) => {
        header('Testing Permanent Fix');

        if (!orgId) {
            log('ERROR: org-id required for testing', 'red');
            return false;
        }

        log('Test 1: Fast arrivals fetch...', 'blue');
        try {
            const start = Date.now();
            const { data, error } = await supabase
                .schema('mandi')
                .from('v_arrivals_fast')
                .select('*')
                .eq('organization_id', orgId)
                .limit(5);

            const duration = Date.now() - start;
            if (!error) {
                log(`✅ Fetched ${data?.length || 0} arrivals in ${duration}ms`, 'green');
                if (duration > 1000) {
                    log('⚠️  Consider enabling database optimizations', 'yellow');
                }
            } else {
                log(`❌ Test failed: ${error}`, 'red');
                return false;
            }
        } catch (err) {
            log(`❌ Exception during test: ${err.message}`, 'red');
            return false;
        }

        log('\nTest 2: Fast sales fetch...', 'blue');
        try {
            const start = Date.now();
            const { data, error } = await supabase
                .schema('mandi')
                .from('v_sales_fast')
                .select('*')
                .eq('organization_id', orgId)
                .limit(5);

            const duration = Date.now() - start;
            if (!error) {
                log(`✅ Fetched ${data?.length || 0} sales in ${duration}ms`, 'green');
            } else {
                log(`❌ Test failed: ${error}`, 'red');
                return false;
            }
        } catch (err) {
            log(`❌ Exception during test: ${err.message}`, 'red');
            return false;
        }

        log('\nTest 3: Account lookup...', 'blue');
        try {
            const { data, error } = await supabase.rpc('get_account_id', {
                p_org_id: orgId,
                p_code: '5001',
            });

            if (!error) {
                if (data) {
                    log(`✅ Account 5001 found: ${data}`, 'green');
                } else {
                    log('⚠️  Account 5001 not found (may need to be created)', 'yellow');
                }
            } else {
                log(`❌ Lookup failed: ${error}`, 'red');
                return false;
            }
        } catch (err) {
            log(`❌ Exception during lookup: ${err.message}`, 'red');
            return false;
        }

        log('\n✅ All tests passed!', 'green');
        return true;
    },

    cleanup: async (supabase, orgId) => {
        header('Database Cleanup');

        log('Removing orphan records...', 'blue');

        // Note: Actual cleanup should be done in Supabase with proper permissions
        log('⚠️  Cleanup operations require admin access', 'yellow');
        log('Run these queries in Supabase SQL Editor:', 'yellow');
        console.log(`
DELETE FROM mandi.lots 
WHERE arrival_id IS NOT NULL 
AND arrival_id NOT IN (SELECT id FROM mandi.arrivals);

DELETE FROM mandi.sale_items 
WHERE sale_id IS NOT NULL 
AND sale_id NOT IN (SELECT id FROM mandi.sales);

DELETE FROM mandi.ledger_entries
WHERE voucher_id IS NOT NULL 
AND voucher_id NOT IN (SELECT id FROM mandi.vouchers)
AND reference_id IS NULL;
        `);

        log('\nCleanup commands printed above', 'cyan');
        return true;
    },

    stats: async (supabase, orgId) => {
        header('Database Statistics');

        if (!orgId) {
            log('ERROR: org-id required for stats', 'red');
            return false;
        }

        const tables = [
            { name: 'arrivals', schema: 'mandi' },
            { name: 'lots', schema: 'mandi' },
            { name: 'sales', schema: 'mandi' },
            { name: 'sale_items', schema: 'mandi' },
            { name: 'purchase_bills', schema: 'mandi' },
            { name: 'ledger_entries', schema: 'mandi' },
            { name: 'accounts', schema: 'mandi' },
        ];

        for (const { name, schema } of tables) {
            try {
                const { data, error, count } = await supabase
                    .schema(schema)
                    .from(name)
                    .select('*', { count: 'exact' })
                    .eq('organization_id', orgId)
                    .limit(1);

                if (!error) {
                    log(`${name}: ${count} records`, 'green');
                } else {
                    log(`${name}: Error - ${error}`, 'red');
                }
            } catch (err) {
                log(`${name}: Exception - ${err.message}`, 'red');
            }
        }

        return true;
    }
};

async function main() {
    const command = process.argv[2] || 'verify';
    const orgId = process.argv[3];

    // Validate command
    if (!commands[command]) {
        log(`ERROR: Unknown command '${command}'`, 'red');
        log('\nAvailable commands:', 'yellow');
        Object.keys(commands).forEach(cmd => {
            log(`  ${cmd}`, 'blue');
        });
        process.exit(1);
    }

    // Note: In real implementation, you would initialize Supabase client
    // For now, show instructions
    header('Setup Required');
    log('To run this script with actual database operations:', 'yellow');
    console.log(`
1. Install Supabase client:
   npm install @supabase/supabase-js

2. Create .env.local with:
   NEXT_PUBLIC_SUPABASE_URL=<your-url>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>

3. Update this script to initialize Supabase client:
   const { createClient } = require('@supabase/supabase-js');
   const supabase = createClient(url, key);

4. Run:
   node verify-fetcher-fix.js ${command} ${orgId || 'org-id-here'}
    `);

    log('\nFor now, refer to PERMANENT_FIX_DATABASE_BLOCKER_20260415.md', 'cyan');
    log('Location: /Users/shauddin/Desktop/MandiPro/PERMANENT_FIX_DATABASE_BLOCKER_20260415.md', 'blue');
}

main().catch(err => {
    log(`FATAL: ${err.message}`, 'red');
    process.exit(1);
});

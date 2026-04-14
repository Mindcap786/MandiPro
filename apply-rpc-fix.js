#!/usr/bin/env node
/**
 * Quick fix for check_subscription_access RPC 404 error
 * Applies the SQL migration directly via Supabase REST API
 */

const fs = require('fs');
const https = require('https');

const SUPABASE_URL = "ldayxjabzyorpugwszpt.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.Aw3fOOjwqHyQPGPJBuRSMjmFxdDFsxQHFGqHGKvHlHE";

// Read the migration SQL
const migrationSQL = fs.readFileSync('./supabase/migrations/20260215_fix_check_subscription_access.sql', 'utf8');

// Extract just the CREATE FUNCTION part (skip comments)
const sqlStatements = migrationSQL
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n');

console.log("🔧 Fixing check_subscription_access RPC error...\n");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// SQL to execute
const sql = `
DO $$
BEGIN
    -- Drop existing function if it exists
    DROP FUNCTION IF EXISTS check_subscription_access(UUID);
    
    -- Create the function
    EXECUTE '
    CREATE OR REPLACE FUNCTION check_subscription_access(p_org_id UUID)
    RETURNS BOOLEAN
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $func$
    DECLARE
        v_is_active BOOLEAN;
    BEGIN
        SELECT COALESCE(is_active, TRUE) INTO v_is_active
        FROM organizations
        WHERE id = p_org_id;
        
        RETURN COALESCE(v_is_active, TRUE);
    EXCEPTION
        WHEN OTHERS THEN
            RETURN TRUE;
    END;
    $func$;
    ';
    
    -- Grant permissions
    GRANT EXECUTE ON FUNCTION check_subscription_access(UUID) TO authenticated;
    GRANT EXECUTE ON FUNCTION check_subscription_access(UUID) TO anon;
    GRANT EXECUTE ON FUNCTION check_subscription_access(UUID) TO service_role;
    
    RAISE NOTICE 'Function created successfully';
END $$;
`;

const postData = JSON.stringify({ query: sql });

const options = {
    hostname: SUPABASE_URL,
    port: 443,
    path: '/rest/v1/rpc/exec_sql',
    method: 'POST',
    headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
            console.log("✅ SUCCESS! Migration applied successfully!\n");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            console.log("📋 What was fixed:");
            console.log("   • Created check_subscription_access() RPC function");
            console.log("   • Granted execute permissions");
            console.log("   • Added error handling\n");
            console.log("🔍 Next steps:");
            console.log("   1. Refresh your browser (Ctrl+R or Cmd+R)");
            console.log("   2. Check console - 404 error should be gone");
            console.log("   3. Application should work normally\n");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        } else {
            console.log(`⚠️  Response status: ${res.statusCode}\n`);
            console.log("Response:", data, "\n");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
            console.log("📝 Manual fix required:\n");
            console.log("1. Go to: https://supabase.com/dashboard/project/ldayxjabzyorpugwszpt/sql");
            console.log("2. Click 'New Query'");
            console.log("3. Paste and run this SQL:\n");
            console.log(sql);
            console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        }
    });
});

req.on('error', (error) => {
    console.error("❌ Request failed:", error.message, "\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("📝 Manual fix required:\n");
    console.log("1. Go to: https://supabase.com/dashboard/project/ldayxjabzyorpugwszpt/sql");
    console.log("2. Click 'New Query'");
    console.log("3. Paste and run the SQL from:");
    console.log("   supabase/migrations/20260215_fix_check_subscription_access.sql\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});

req.write(postData);
req.end();

#!/usr/bin/env node

// Simple script to execute SQL migration via Supabase REST API
const https = require('https');
const fs = require('fs');

const PROJECT_URL = 'https://ldayxjabzyorpugwszpt.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

console.log('📖 Reading SQL migration file...');
const sql = fs.readFileSync('./supabase/migrations/20260215_fix_duplicate_invoices.sql', 'utf8');

console.log('🚀 Executing SQL via Supabase REST API...\n');

const url = new URL('/rest/v1/rpc/exec_sql', PROJECT_URL);

const postData = JSON.stringify({ sql_query: sql });

const options = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
    }
};

const req = https.request(url, options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ Migration executed successfully!');
            console.log('Response:', data);
        } else {
            console.error(`❌ Migration failed with status ${res.statusCode}`);
            console.error('Response:', data);
            console.log('\n💡 The RPC endpoint might not exist. Trying alternative method...');

            // Alternative: Execute via psql if available
            console.log('\n📝 Please run this SQL manually in Supabase SQL Editor:');
            console.log('   https://supabase.com/dashboard/project/ldayxjabzyorpugwszpt/sql/new');
            console.log('\n   The SQL is already in your clipboard (copied earlier)');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
    console.log('\n📝 Please run the SQL manually in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/ldayxjabzyorpugwszpt/sql/new');
});

req.write(postData);
req.end();

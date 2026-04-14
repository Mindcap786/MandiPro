#!/usr/bin/env node

const https = require('https');

const PROJECT_URL = 'ldayxjabzyorpugwszpt.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

console.log('🔍 Investigating duplicate invoices...\n');

// Query to find duplicates
const query = `
select=organization_id,bill_no,id,sale_date,total_amount&order=bill_no.asc,sale_date.asc
`.trim();

const options = {
    hostname: PROJECT_URL,
    path: `/rest/v1/sales?${query}`,
    method: 'GET',
    headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            const sales = JSON.parse(data);

            // Group by bill_no to find duplicates
            const billGroups = {};
            sales.forEach(sale => {
                const key = `${sale.organization_id}-${sale.bill_no}`;
                if (!billGroups[key]) {
                    billGroups[key] = [];
                }
                billGroups[key].push(sale);
            });

            // Find duplicates
            const duplicates = Object.entries(billGroups).filter(([key, sales]) => sales.length > 1);

            if (duplicates.length === 0) {
                console.log('✅ No duplicate invoices found!');
            } else {
                console.log(`❌ Found ${duplicates.length} duplicate invoice number(s):\n`);
                duplicates.forEach(([key, sales]) => {
                    console.log(`Invoice #${sales[0].bill_no}:`);
                    sales.forEach((sale, idx) => {
                        console.log(`  ${idx + 1}. ID: ${sale.id.substring(0, 8)}... | Date: ${sale.sale_date} | Amount: ₹${sale.total_amount}`);
                    });
                    console.log('');
                });

                console.log('\n📝 To fix this, please run the SQL migration manually:');
                console.log('   1. Go to: https://supabase.com/dashboard/project/ldayxjabzyorpugwszpt/sql/new');
                console.log('   2. Paste the SQL (already in clipboard)');
                console.log('   3. Click "Run"');
            }
        } else {
            console.error(`❌ Query failed with status ${res.statusCode}`);
            console.error('Response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
});

req.end();

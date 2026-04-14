#!/usr/bin/env node

const https = require('https');

const PROJECT_URL = 'ldayxjabzyorpugwszpt.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

console.log('🔍 Checking sales records for buyer...\n');

// Get the buyer contact
const getContact = () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PROJECT_URL,
            path: `/rest/v1/contacts?select=id,name&name=eq.buyer`,
            method: 'GET',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data)[0]);
                } else {
                    reject(new Error(`Failed: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
};

// Get sales for the buyer
const getSales = (buyerId) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PROJECT_URL,
            path: `/rest/v1/sales?select=*&buyer_id=eq.${buyerId}&order=sale_date.asc`,
            method: 'GET',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Failed: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
};

async function checkSales() {
    try {
        const buyer = await getContact();
        if (!buyer) {
            console.log('❌ Buyer not found');
            return;
        }

        console.log(`Found buyer: ${buyer.name}\n`);

        const sales = await getSales(buyer.id);

        console.log(`📋 Sales Records (${sales.length} total):\n`);

        sales.forEach((sale, idx) => {
            console.log(`${idx + 1}. Invoice #${sale.bill_no}`);
            console.log(`   Date: ${sale.sale_date?.substring(0, 10)}`);
            console.log(`   Amount: ₹${sale.total_amount}`);
            console.log(`   Payment Mode: ${sale.payment_mode}`);
            console.log(`   ID: ${sale.id.substring(0, 8)}...`);
            console.log('');
        });

        const totalSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
        console.log(`💰 Total Sales Amount: ₹${totalSales}`);
        console.log(`📊 Ledger Balance: ₹3,800`);

        if (totalSales !== 3800) {
            console.log(`\n⚠️  MISMATCH: Sales total (₹${totalSales}) ≠ Ledger balance (₹3,800)`);
            console.log(`   Difference: ₹${Math.abs(totalSales - 3800)}`);
            console.log('\n🔍 This suggests there may be orphan ledger entries.');
        } else {
            console.log('\n✅ Sales total matches ledger balance');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkSales();

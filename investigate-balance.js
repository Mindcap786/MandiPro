#!/usr/bin/env node

const https = require('https');

const PROJECT_URL = 'ldayxjabzyorpugwszpt.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

console.log('🔍 Investigating buyer balance...\n');

// First, get the buyer contact
const getContact = () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PROJECT_URL,
            path: `/rest/v1/contacts?select=id,name,type&name=eq.buyer`,
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
                    reject(new Error(`Failed to get contact: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
};

// Get ledger entries for the buyer
const getLedgerEntries = (contactId) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PROJECT_URL,
            path: `/rest/v1/ledger_entries?select=*&contact_id=eq.${contactId}&order=entry_date.asc`,
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
                    reject(new Error(`Failed to get ledger: ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
};

async function investigate() {
    try {
        const buyer = await getContact();
        if (!buyer) {
            console.log('❌ Buyer contact not found');
            return;
        }

        console.log(`Found buyer: ${buyer.name} (ID: ${buyer.id.substring(0, 8)}...)\n`);

        const ledger = await getLedgerEntries(buyer.id);

        console.log(`📊 Ledger Entries (${ledger.length} total):\n`);

        let balance = 0;
        ledger.forEach((entry, idx) => {
            const debit = entry.debit || 0;
            const credit = entry.credit || 0;
            balance += (debit - credit);

            console.log(`${idx + 1}. Date: ${entry.entry_date?.substring(0, 10) || 'N/A'}`);
            console.log(`   Debit: ₹${debit} | Credit: ₹${credit}`);
            console.log(`   Description: ${entry.description || 'N/A'}`);
            console.log(`   Running Balance: ₹${balance}`);
            console.log('');
        });

        console.log(`\n💰 Final Balance: ₹${balance}`);

        if (balance === 3800) {
            console.log('\n✅ Balance matches the ₹3,800 shown in the UI');
            console.log('\n🔍 This appears to be the correct balance based on ledger entries.');
            console.log('   If you believe this is wrong, please check:');
            console.log('   1. Are there any payments that should have been recorded?');
            console.log('   2. Are there any invoices that should be adjusted or cancelled?');
        } else {
            console.log(`\n⚠️  Balance mismatch! Ledger shows ₹${balance} but UI shows ₹3,800`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

investigate();

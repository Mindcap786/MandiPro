#!/usr/bin/env node
const fs   = require('fs');
const path = require('path');
const https = require('https');

const PAT = 'sbp_66cef7f0fcd1ea2bd3194e131faac951635536ad';
const PROJECT_REF = 'ldayxjabzyorpugwszpt';

// Use Management API to execute SQL
function executeSqlViaMgmt(sql) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ query: sql });
        const req = https.request({
            hostname: 'api.supabase.com',
            path: `/v1/projects/${PROJECT_REF}/database/query`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${PAT}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, res => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                const isOk = res.statusCode >= 200 && res.statusCode < 300;
                resolve({ ok: isOk, status: res.statusCode, body: buf });
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function splitIntoBlocks(sql) {
    // The Management API query endpoint can accept a single massive string,
    // but splitting it makes errors easier to read.
    // However, some DB engines handle multi-statement strings better.
    // Let's just try sending the whole file first.
    return sql.trim();
}

async function main() {
    const migFiles = [
        path.join(__dirname, 'web/supabase/migrations/20260410_add_grace_period.sql'),
        path.join(__dirname, 'web/supabase/migrations/20260411_subscription_lifecycle.sql'),
    ].filter(f => fs.existsSync(f));

    for (const file of migFiles) {
        const name = path.basename(file);
        console.log(`\n📦 Pushing: ${name}`);
        const sql = fs.readFileSync(file, 'utf-8');

        console.log(`   Executing ${Math.round(sql.length/1024)}KB via Management API...`);
        const res = await executeSqlViaMgmt(sql);

        if (res.ok) {
            console.log(`   ✅ Succeeded`);
            // Management API returns empty array for success or results
        } else {
            console.log(`   ❌ Failed with status ${res.status}`);
            try {
                const err = JSON.parse(res.body);
                console.log(`      Error: ${err.message || err.error || res.body}`);
            } catch(e) {
                console.log(`      Body: ${res.body}`);
            }
        }
    }
}

main().catch(console.error);

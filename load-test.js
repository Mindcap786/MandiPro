import http from 'k6/http';
import { check, sleep } from 'k6';

// --- CONFIGURATION ---
const SUPABASE_URL = 'https://ldayxjabzyorpugwszpt.supabase.co'; 
const SUPABASE_SERVICE_ROLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkYXl4amFienlvcnB1Z3dzenB0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTUxMzI3OCwiZXhwIjoyMDg1MDg5Mjc4fQ.j9N0iVbUSAokEhl37vT3kyHIFiPoxDfNbp5rs-ftjFE';

export const options = {
    // Stage 1: Ramp up to 500 concurrent users over 30 seconds
    // Stage 2: Hold 500 users for 10 seconds
    // Stage 3: Ramp down to 0 over 10 seconds
    stages: [
        { duration: '30s', target: 500 },
        { duration: '10s', target: 500 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.01'],    // Less than 1% failure rate
    },
};

export default function () {
    const headers = {
        'apikey': SUPABASE_SERVICE_ROLE,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        'Accept-Profile': 'mandi'
    };

    // 1. Simulating Dashboard Load (Fetching lots)
    const lotsRes = http.get(`${SUPABASE_URL}/rest/v1/lots?select=*&limit=50`, { headers });
    check(lotsRes, {
        'Fetched lots successfully': (r) => r.status === 200,
        'Lots query fast (< 300ms)': (r) => r.timings.duration < 300,
    });

    sleep(1); 

    // 2. Simulating Fetching Sales Data
    const salesRes = http.get(`${SUPABASE_URL}/rest/v1/sales?select=*&limit=20&order=created_at.desc`, { headers });
    check(salesRes, {
        'Fetched sales successfully': (r) => r.status === 200,
        'Sales query fast (< 300ms)': (r) => r.timings.duration < 300,
    });

    sleep(1);

    // 3. Simulating Fetching Ledger Profile (Heavily indexed query)
    const ledgerRes = http.get(`${SUPABASE_URL}/rest/v1/ledger_entries?select=*&limit=100`, { headers });
    check(ledgerRes, {
        'Fetched ledger successfully': (r) => r.status === 200,
        'Ledger query fast (< 400ms)': (r) => r.timings.duration < 400,
    });

    sleep(1);
}

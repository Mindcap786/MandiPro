const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function dump() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const { Client } = require('pg');
    const ENCODED_PASS = encodeURIComponent('Shaik@admin123-');
    // Let me try default pass:
    // If I cant guess the password, I can't use pg directly.
}

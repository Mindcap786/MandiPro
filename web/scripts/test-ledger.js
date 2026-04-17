const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';
console.log("Checking DB variables...");

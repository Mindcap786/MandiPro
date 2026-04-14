const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('http://127.0.0.1:54321', process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'); // Wait, requires anon key.

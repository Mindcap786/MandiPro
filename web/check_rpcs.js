const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres" // Note: need actual DB URL if not set
});

async function run() {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: '.env.local' });
    const connStr = process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL; // wait, needs connection string!
    
    // Let's print the env to see if we have DB url
    console.log("DB URL exists:", !!process.env.DATABASE_URL || !!process.env.SUPABASE_DB_URL);
  } catch (err) {
    console.error(err);
  }
}
run();

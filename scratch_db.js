const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT pg_get_functiondef(oid)
    FROM pg_proc
    WHERE proname = 'confirm_sale_transaction'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'mandi')
  `);
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}
run();

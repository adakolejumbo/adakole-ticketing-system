// Creates tables and demo data. Usage: npm run db:setup  (add --reset to wipe first)
import { getPool } from '../api/_lib/db.js';
import { SCHEMA, DROP } from '../api/_lib/schema.js';
import { seed } from '../api/_lib/seed.js';

const client = await getPool().connect();
try {
  if (process.argv.includes('--reset')) {
    await client.query(DROP);
    console.log('Dropped existing tables.');
  }
  await client.query(SCHEMA);
  console.log('Schema ready.');
  const r = await seed(client);
  console.log(r.message);
  if (r.seeded) console.log('\nSign in as admin@ats.local / Admin123!  (agents and customers use Password123!)');
} finally {
  client.release();
  await getPool().end();
}

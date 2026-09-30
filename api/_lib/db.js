import pg from 'pg';
import { HttpError } from './http.js';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!pool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new HttpError(500, 'DATABASE_URL is not set. Add it to your environment variables.');
    const local = /localhost|127\.0\.0\.1/.test(cs);
    pool = new Pool({ connectionString: cs, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
    pool.on('error', (e) => console.error('Idle database client error', e.message));
  }
  return pool;
}

export const q = (text, params) => getPool().query(text, params);
export const one = async (text, params) => (await q(text, params)).rows[0] || null;
export const many = async (text, params) => (await q(text, params)).rows;

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

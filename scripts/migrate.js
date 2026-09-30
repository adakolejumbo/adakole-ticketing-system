import { readFile } from 'node:fs/promises';
import pool from '../server/db.js';

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Database schema is up to date.');
await pool.end();

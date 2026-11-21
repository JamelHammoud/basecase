import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

export async function database(connectionString) {
  const pool = new Pool({ connectionString, max: 8, statement_timeout: 5000, connectionTimeoutMillis: 5000 });

  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(1340)');
    await client.query(await readFile(new URL('./migrations.sql', import.meta.url), 'utf8'));
  });

  return pool;
}

export async function transaction(pool, run) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await run(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    await client.query('ROLLBACK');

    throw error;
  } finally {
    client.release();
  }
}

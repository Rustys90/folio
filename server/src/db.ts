import { Pool } from 'pg';

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

if (!pool) {
  console.warn(
    '[db] DATABASE_URL is not set — document persistence is disabled. ' +
      'Set it in server/.env to persist synced documents.',
  );
}

/** Create the documents table if it does not exist yet. */
export async function initDb(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS folio_docs (
      name TEXT PRIMARY KEY,
      state BYTEA NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Persist the full encoded state of a document (upsert). */
export async function saveDoc(name: string, state: Uint8Array): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO folio_docs (name, state, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (name) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [name, Buffer.from(state)],
  );
}

/** Load the last persisted state of a document, or null. */
export async function loadDoc(name: string): Promise<Uint8Array | null> {
  if (!pool) return null;
  const { rows } = await pool.query<{ state: Buffer }>(
    'SELECT state FROM folio_docs WHERE name = $1',
    [name],
  );
  const row = rows[0];
  return row ? new Uint8Array(row.state) : null;
}

/** Names of all persisted documents (for /health introspection). */
export async function listDocs(): Promise<string[]> {
  if (!pool) return [];
  const { rows } = await pool.query<{ name: string }>(
    'SELECT name FROM folio_docs ORDER BY updated_at DESC LIMIT 100',
  );
  return rows.map((r) => r.name);
}

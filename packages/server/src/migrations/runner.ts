import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

/**
 * Numbered migrations, applied once and recorded.
 *
 * The first schema was a single file of `IF NOT EXISTS` statements replayed on
 * every boot, which is fine exactly until the second migration exists. Each
 * file now runs inside a transaction and is written to `schema_migrations`, so
 * a half-applied migration rolls back rather than leaving a shape nobody has
 * seen before.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('.', import.meta.url));

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

export interface Migration {
  version: string;
  sql: string;
}

/** Files named `001_init.sql`, applied in filename order. */
export async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (name) => ({
      version: name.replace(/\.sql$/, ''),
      sql: await readFile(new URL(name, import.meta.url), 'utf8'),
    })),
  );
}

async function appliedVersions(db: pg.Pool | pg.PoolClient): Promise<Set<string>> {
  await db.query(CREATE_TABLE);
  const { rows } = await db.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((row) => row.version as string));
}

export async function pendingMigrations(db: pg.Pool | pg.PoolClient): Promise<Migration[]> {
  const applied = await appliedVersions(db);
  return (await loadMigrations()).filter((migration) => !applied.has(migration.version));
}

/** Applies everything outstanding. Returns the versions applied, in order. */
export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  const pending = await pendingMigrations(pool);
  const applied: string[] = [];

  for (const migration of pending) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        migration.version,
      ]);
      await client.query('COMMIT');
      applied.push(migration.version);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${migration.version} failed: ${(error as Error).message}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  return applied;
}

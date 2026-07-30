/** Applies pending migrations and reports what it did. Idempotent. */
import pg from 'pg';
import { loadConfig } from './config.js';
import { runMigrations } from './migrations/runner.js';

const config = loadConfig();
if (!config.databaseUrl) {
  console.error('DATABASE_URL is required to migrate.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  const applied = await runMigrations(pool);
  console.log(
    applied.length === 0
      ? 'Schema is up to date; nothing to apply.'
      : `Applied ${applied.length} migration(s): ${applied.join(', ')}`,
  );
} finally {
  await pool.end();
}

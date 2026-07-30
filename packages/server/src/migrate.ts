/** Applies the schema and seeds the world row. Idempotent. */
import { PostgresRepository } from './adapters/postgres.js';
import { loadConfig } from './config.js';

const config = loadConfig();
if (!config.databaseUrl) {
  console.error('DATABASE_URL is required to migrate.');
  process.exit(1);
}

const repo = new PostgresRepository(config.databaseUrl);
await repo.init();
await repo.close();
console.log('Migrations applied.');

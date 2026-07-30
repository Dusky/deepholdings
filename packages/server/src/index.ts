import { MemoryRepository } from './adapters/memory.js';
import { PostgresRepository } from './adapters/postgres.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startHeartbeat } from './heartbeat.js';
import type { Repository } from './ports.js';

const config = loadConfig();

const repo: Repository = config.databaseUrl
  ? new PostgresRepository(config.databaseUrl)
  : new MemoryRepository();

await repo.init({ autoMigrate: config.autoMigrate });

const app = buildApp({ repo, config });

if (!config.databaseUrl) {
  app.log.warn('DATABASE_URL not set — using the in-memory adapter. State is lost on restart.');
}

const stopHeartbeat = config.runHeartbeat
  ? startHeartbeat(repo, (error) => app.log.error(error, 'heartbeat failed'))
  : () => {};

const shutdown = async () => {
  stopHeartbeat();
  await app.close();
  await repo.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: config.host });

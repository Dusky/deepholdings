import { MemoryRepository } from './adapters/memory.js';
import { PostgresRepository } from './adapters/postgres.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { startHeartbeat } from './heartbeat.js';
import type { Repository } from './ports.js';
import { makeSender } from './push/sender.js';
import { sweepOnce } from './push/sweep.js';

const config = loadConfig();

const repo: Repository = config.databaseUrl
  ? new PostgresRepository(config.databaseUrl)
  : new MemoryRepository();

await repo.init({ autoMigrate: config.autoMigrate });

// Built before the app, because the app needs it: the dev sweep route takes
// the same instance the heartbeat does, so an FcmSender's cached OAuth token
// is shared rather than minted twice. Boot messages go to console because
// there is no request logger yet and this happens exactly once.
const sender = makeSender(config, {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
});

const app = buildApp({ repo, config, sender });

if (!config.databaseUrl) {
  app.log.warn('DATABASE_URL not set — using the in-memory adapter. State is lost on restart.');
}

// The sweep exists because resolution is lazy: a recruit who dies while the
// phone is asleep is not dead on the server until somebody reads them. It
// replays away accounts and writes nothing — see `push/sweep.ts`.
const sweep = config.runSweep
  ? async () => {
      const report = await sweepOnce(repo, sender, (error) =>
        app.log.error(error, 'sweep: one account failed'),
      );
      if (report.pushed > 0 || report.replayed > 0) app.log.info(report, 'death sweep');
    }
  : undefined;

const stopHeartbeat = config.runHeartbeat
  ? startHeartbeat(repo, (error) => app.log.error(error, 'heartbeat failed'), sweep)
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

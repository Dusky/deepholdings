import { MemoryRepository } from './adapters/memory.js';
import { PostgresRepository } from './adapters/postgres.js';
import { buildApp } from './app.js';
import { describeConfig, loadConfig } from './config.js';
import { startHeartbeat } from './heartbeat.js';
import type { Repository } from './ports.js';
import { makeReporter } from './errors.js';
import { KEY_RETENTION_SECONDS } from './idempotency.js';
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

const reporter = makeReporter({ error: (payload, message) => console.error(payload, message) });
const app = buildApp({ repo, config, sender, reporter });

// What this instance is actually running with, redacted. First question of
// every incident; `loadConfig` has already refused anything unsafe.
app.log.info(describeConfig(config), 'configuration');

if (!config.databaseUrl) {
  app.log.warn('DATABASE_URL not set — using the in-memory adapter. State is lost on restart.');
}

// The sweep exists because resolution is lazy: a recruit who dies while the
// phone is asleep is not dead on the server until somebody reads them. It
// replays away accounts and writes nothing — see `push/sweep.ts`.
const sweep = config.runSweep
  ? async () => {
      const report = await sweepOnce(repo, sender, (error) =>
        reporter.report(error, { at: 'sweep' }),
      );
      if (report.pushed > 0 || report.replayed > 0) app.log.info(report, 'death sweep');
      // Piggy-backed on the sweep rather than given a timer of its own: it is
      // one bounded DELETE, and the sweep is already the only scheduled work
      // in the process. Note for `deploy.md`: with RUN_SWEEP=false nothing
      // prunes these.
      const expired = await repo.expireIdempotency(KEY_RETENTION_SECONDS);
      if (expired > 0) app.log.info({ expired }, 'idempotency keys expired');
    }
  : undefined;

const stopHeartbeat = config.runHeartbeat
  ? startHeartbeat(repo, (error) => reporter.report(error, { at: 'heartbeat' }), sweep)
  : () => {};

const shutdown = async () => {
  stopHeartbeat();
  await app.close();
  await repo.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/**
 * An async throw outside a request currently kills the process with a bare
 * stack and no record of it anywhere. Report, then exit non-zero rather than
 * swallowing: the process's state is unknown after one of these, and letting
 * the platform restart something in a known-good state is safer than
 * continuing in one nobody can reason about.
 */
for (const signal of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(signal, (error: unknown) => {
    reporter.report(error, { at: signal });
    process.exit(1);
  });
}

await app.listen({ port: config.port, host: config.host });

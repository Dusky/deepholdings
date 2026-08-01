/**
 * Load check.
 *
 * Two questions, both of which have been answered by assertion rather than by
 * measurement until now:
 *
 *   1. What does one player's read cost? `loadState` resolves every missed
 *      tick inside a transaction, so the answer depends on how long they were
 *      away, and the roadmap wants "resolutions per second before Postgres
 *      complains".
 *   2. What does the death sweep cost? It replays up to `SWEEP_LIMIT` away
 *      accounts every heartbeat. That limit is currently 200 because 200 felt
 *      bounded, which is the kind of number this project has been burned by.
 *
 * Run against a real database. The memory adapter would measure the resolver
 * and nothing else, and the interesting part is the round trips.
 *
 *   DATABASE_URL=postgres://... npm run load -w @deepholdings/server -- --accounts 500
 */
import { MAX_CATCHUP_TICKS } from '@deepholdings/shared';
import { PostgresRepository } from '../src/adapters/postgres.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { NullSender } from '../src/push/port.js';
import { sweepOnce } from '../src/push/sweep.js';
import { loadState } from '../src/service.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: number) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};

const ACCOUNTS = flag('accounts', 500);
const config = loadConfig();
if (!config.databaseUrl) {
  console.error('DATABASE_URL is required: this measures round trips, not arithmetic.');
  process.exit(2);
}

const repo = new PostgresRepository(config.databaseUrl);
await repo.init({ autoMigrate: true });
const app = buildApp({ repo, config });

function stats(samples: number[]): { p50: number; p95: number; p99: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] };
}

const ms = (n: number) => `${n.toFixed(1)}ms`;

async function time<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const value = await fn();
  return [value, performance.now() - started];
}

// ---------------------------------------------------------------- seed

console.log(`seeding ${ACCOUNTS} accounts…`);
const ids: string[] = [];
for (let i = 0; i < ACCOUNTS; i += 1) {
  const auth = await app.inject({
    method: 'POST',
    url: '/v1/auth/device',
    payload: { deviceId: `load-${Date.now()}-${i}` },
  });
  const id = auth.json().account.id as string;
  ids.push(id);
  await repo.savePushToken(id, `load-token-${id}`, 'android');
}

/**
 * Backdate watermarks so there is real work to replay.
 *
 * Staleness is the variable that matters: an account read a minute ago
 * resolves one tick, and one left overnight resolves the whole catch-up
 * window. Spreading across the range measures the distribution a real
 * population produces rather than a best or worst case.
 */
console.log('backdating watermarks…');
for (const [i, id] of ids.entries()) {
  const stale = 1 + Math.floor((i / ids.length) * MAX_CATCHUP_TICKS);
  const record = await repo.getLatestCharacter(id);
  if (!record) continue;
  await repo.saveCharacter({
    ...record,
    character: {
      ...record.character,
      lastResolvedTick: record.character.lastResolvedTick - stale,
      bornTick: record.character.bornTick - stale,
    },
  });
  await repo.markAwayForTesting(id, 3600);
}

// ---------------------------------------------------------------- reads

console.log('\n=== the read path: what one player costs ===');
const reads: number[] = [];
for (const id of ids) {
  const [, took] = await time(() => loadState(repo, id));
  reads.push(took);
}
const r = stats(reads);
console.log(`loadState over ${ACCOUNTS} accounts, staleness spread 1..${MAX_CATCHUP_TICKS} ticks`);
console.log(`  p50 ${ms(r.p50)}  p95 ${ms(r.p95)}  p99 ${ms(r.p99)}  max ${ms(r.max)}`);
console.log(`  ${(1000 / r.p50).toFixed(0)} reads/sec at the median, single connection`);

// A second pass with nothing to resolve: the floor, and what a player who
// checks in twice actually pays the second time.
const warm: number[] = [];
for (const id of ids) {
  const [, took] = await time(() => loadState(repo, id));
  warm.push(took);
}
const w = stats(warm);
console.log(`  already caught up: p50 ${ms(w.p50)}  p99 ${ms(w.p99)}`);

// ---------------------------------------------------------------- sweep

console.log('\n=== the sweep: what the background job costs ===');
// The reads above marked everyone present, so put them back out of the window
// and give them something to replay again.
for (const id of ids) {
  const record = await repo.getLatestCharacter(id);
  if (record) {
    await repo.saveCharacter({
      ...record,
      character: {
        ...record.character,
        lastResolvedTick: record.character.lastResolvedTick - MAX_CATCHUP_TICKS,
        bornTick: record.character.bornTick - MAX_CATCHUP_TICKS,
      },
    });
  }
  await repo.markAwayForTesting(id, 3600);
}

const [candidates, scanned] = await time(() => repo.listSweepCandidates(900, 10_000));
console.log(`candidate scan over ${ACCOUNTS} accounts: ${ms(scanned)} for ${candidates.length} rows`);

const sender = new NullSender();
const [report, swept] = await time(() =>
  sweepOnce(repo, sender, (error) => console.error('sweep error', error)),
);
console.log(
  `sweepOnce: ${ms(swept)} for ${report.replayed} accounts ` +
    `(${ms(swept / Math.max(1, report.replayed))} each), ${report.pushed} pushed`,
);
// Without this the previous line cannot distinguish "cheap" from "idle".
const meanTicks = report.ticksReplayed / Math.max(1, report.replayed);
console.log(
  `  ${report.ticksReplayed} ticks of simulation replayed, ${meanTicks.toFixed(0)} per account` +
    (meanTicks < 1 ? '  <-- NOTHING WAS SIMULATED; the number above is meaningless' : ''),
);
console.log(
  `  a full beat at SWEEP_LIMIT=200 costs about ${ms((swept / Math.max(1, report.replayed)) * 200)}`,
);
console.log(
  `  the heartbeat interval is 300s, so that is ` +
    `${(((swept / Math.max(1, report.replayed)) * 200) / 300_000 * 100).toFixed(3)}% of one worker`,
);

await app.close();
await repo.close();

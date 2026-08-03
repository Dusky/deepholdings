/**
 * Liveness, readiness, and the world clock.
 *
 * The distinction these prove is the whole reason there are two routes: a
 * database that has gone away must take an instance out of rotation, and a
 * background job that has stopped must not.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HEARTBEAT_SECONDS } from '@deepholdings/shared';
import { MemoryRepository } from '../src/adapters/memory.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { worldHealth } from '../src/health.js';
import { RecordingReporter } from '../src/errors.js';
import { adapters } from './adapters.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret' });

for (const { name, make } of adapters) {
  test(`a healthy instance is live, ready, and turning (${name})`, async () => {
    const repo = make();
    await repo.init();
    /**
     * Establish a known clock first. The world is a single shared row, so on
     * Postgres this test inherits whatever the last one left — including, on a
     * rerun, the seventeen-days-ahead row the next test writes. A test that
     * only passes in one order is worse than no test.
     */
    const start = await repo.getWorld();
    await repo.saveWorld({
      ...start,
      nextBeatAt: new Date(Date.now() + HEARTBEAT_SECONDS * 1000).toISOString(),
    });
    const app = buildApp({ repo, config });

    const live = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(live.statusCode, 200);
    assert.deepEqual(live.json(), { ok: true });

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    assert.equal(ready.statusCode, 200);
    const body = ready.json();
    assert.equal(body.database, 'up');
    assert.equal(body.world.stale, false);
    await app.close();
  });

  test(`a world scheduled into the future reads as stale (${name})`, async () => {
    /**
     * The regression test for the incident.
     *
     * A beat landing during a dev fast-forward wrote its next due time from an
     * advanced clock; the offset reset on restart and the world row was left
     * pointing seventeen days ahead with `beat` stuck at 7 — market frozen,
     * guild bar frozen, Ledger countdown reading 25675:52. `beatOnce` now
     * self-heals it. Nothing *reported* it, which is why it lasted seventeen
     * days, and this is the assertion that would have said so on day one.
     */
    const repo = make();
    await repo.init();
    const world = await repo.getWorld();
    await repo.saveWorld({
      ...world,
      nextBeatAt: new Date(Date.now() + 17 * 24 * 3600 * 1000).toISOString(),
    });

    const health = await worldHealth(repo);
    assert.equal(health.stale, true, 'seventeen days ahead is not a healthy clock');
    assert.ok(health.aheadSeconds > 16 * 24 * 3600, `ahead by ${health.aheadSeconds}s`);
    assert.equal(health.overdueSeconds, 0, 'nothing was late; everything was early');
    await repo.close();
  });

  test(`beats that have stopped read as stale (${name})`, async () => {
    const repo = make();
    await repo.init();
    const world = await repo.getWorld();
    await repo.saveWorld({
      ...world,
      nextBeatAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    const health = await worldHealth(repo);
    assert.equal(health.stale, true);
    assert.ok(health.overdueSeconds > HEARTBEAT_SECONDS * 3, `overdue ${health.overdueSeconds}s`);
    await repo.close();
  });

  test(`a missed beat or two is not staleness (${name})`, async () => {
    // The heartbeat checks five times an interval and a slow transaction can
    // skip one. An alert that fires on that teaches people to ignore it.
    const repo = make();
    await repo.init();
    const world = await repo.getWorld();
    await repo.saveWorld({
      ...world,
      nextBeatAt: new Date(Date.now() - HEARTBEAT_SECONDS * 1500).toISOString(),
    });
    assert.equal((await worldHealth(repo)).stale, false);
    await repo.close();
  });
}

/** Storage that has gone away, without needing to stop a real database. */
class UnreachableRepository extends MemoryRepository {
  override async ping(): Promise<void> {
    throw new Error('connection refused');
  }
}

test('storage going away makes an instance unready but still alive', async () => {
  /**
   * The entire distinction between the two routes, in one test.
   *
   * `/health` is what a platform *restarts* on, and restarting a healthy
   * process because its database is briefly away is how a short outage becomes
   * a restart loop. `/ready` is what it *routes* on, and routing to an instance
   * that cannot read is how a short outage becomes errors.
   */
  const repo = new UnreachableRepository();
  await repo.init();
  const reporter = new RecordingReporter();
  const app = buildApp({ repo, config, reporter });

  const live = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(live.statusCode, 200, 'the process is answering; do not restart it');

  const ready = await app.inject({ method: 'GET', url: '/ready' });
  assert.equal(ready.statusCode, 503, 'do not route here');
  assert.deepEqual(ready.json(), { ok: false, database: 'down' });
  assert.equal(reporter.reported.length, 1, 'and somebody was told');
  await app.close();
});

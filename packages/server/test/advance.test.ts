import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { MAX_CATCHUP_TICKS, type StateResponse } from '@deepholdings/shared';
import { MemoryRepository } from '../src/adapters/memory.js';
import { PostgresRepository } from '../src/adapters/postgres.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Repository } from '../src/ports.js';

const dev = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 't', DEV_TOOLS: 'true' });
const off = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 't' });

const databaseUrl = process.env.TEST_DATABASE_URL;
const adapters: { name: string; make: () => Repository }[] = [
  { name: 'memory', make: () => new MemoryRepository() },
  ...(databaseUrl
    ? [{ name: 'postgres', make: () => new PostgresRepository(databaseUrl) as Repository }]
    : []),
];

test('developer time travel is off unless asked for, and impossible in production', () => {
  assert.equal(off.devTools, false, 'off by default');
  assert.equal(dev.devTools, true, 'on when asked for outside production');
  assert.equal(
    loadConfig({ NODE_ENV: 'production', TOKEN_SECRET: 'x', DEV_TOOLS: 'true' }).devTools,
    false,
    'production ignores the environment entirely',
  );
});

for (const adapter of adapters) {
  describe(`advance (${adapter.name})`, () => {
    let repo!: Repository;
    let app!: ReturnType<typeof buildApp>;
    let token = '';

    before(async () => {
      repo = adapter.make();
      await repo.init();
      app = buildApp({ repo, config: dev });
      const auth = await app.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `adv-${Date.now()}-${Math.random()}` },
      });
      token = auth.json().token;
    });

    after(async () => {
      await app.close();
      await repo.close();
    });

    const auth = () => ({ authorization: `Bearer ${token}` });
    const state = async () =>
      (await app.inject({ method: 'GET', url: '/v1/state', headers: auth() })).json() as StateResponse;

    const advance = (hours: number) =>
      app.inject({
        method: 'POST',
        url: '/v1/dev/advance',
        headers: auth(),
        payload: { hours },
      });

    test('a fast-forwarded career is a career that really happened', async () => {
      const before = await state();
      assert.equal(before.devTools, true, 'the client is told the route exists');

      // Six hours: more than one catch-up window, so it exercises chunking.
      const response = await advance(6);
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().ticksAdvanced, 360);

      const after = await state();

      // Service is what the recruit actually worked, not wall-clock since the
      // account was made — otherwise a fortnight of career pays four minutes
      // of pension.
      const served = after.character.lastResolvedTick - after.character.bornTick;
      assert.ok(served >= 360, `served ${served} ticks, expected at least 360`);

      // A journal, not a summary. Advancing more than MAX_CATCHUP_TICKS in one
      // go would produce a recess note and nothing to read.
      assert.ok(after.journal.length > before.journal.length);
      const texts = after.journal.map((entry) => entry.text).join('\n');
      assert.doesNotMatch(texts, /recess/i, 'chunking should avoid the catch-up clamp');

      // And the recruit did something with the time.
      assert.ok(
        after.character.xp > 0 || after.character.level > 1 || after.character.depth > 0,
        'six hours should have moved the recruit somewhere',
      );
    });

    test('chunks stay inside the catch-up window', async () => {
      // Two days in one call: four chunks, all simulated rather than summarised.
      const response = await advance(48);
      assert.equal(response.statusCode, 200);
      const { ticksAdvanced } = response.json();
      assert.ok(ticksAdvanced > MAX_CATCHUP_TICKS, 'more than one window was covered');

      // Either it ran the whole span, or it stopped because somebody died.
      assert.ok(ticksAdvanced === 48 * 60 || response.json().died);
    });

    test('spans it cannot simulate are refused', async () => {
      for (const hours of [0, -1, 0.001, 1000, Number.NaN]) {
        const bad = await advance(hours);
        assert.equal(bad.statusCode, 400, `${hours} hours should be refused`);
      }
    });
  });
}

test('the route does not exist when developer tools are off', async () => {
  const repo = new MemoryRepository();
  await repo.init();
  const app = buildApp({ repo, config: off });
  const auth = await app.inject({
    method: 'POST',
    url: '/v1/auth/device',
    payload: { deviceId: 'no-dev-tools' },
  });
  const headers = { authorization: `Bearer ${auth.json().token}` };

  const response = await app.inject({
    method: 'POST',
    url: '/v1/dev/advance',
    headers,
    payload: { hours: 24 },
  });
  // 404, not 403: an endpoint that refuses still admits it is there.
  assert.equal(response.statusCode, 404);

  const snapshot = (await app.inject({ method: 'GET', url: '/v1/state', headers })).json();
  assert.equal(snapshot.devTools, false, 'and the client is not offered the command');

  await app.close();
  await repo.close();
});

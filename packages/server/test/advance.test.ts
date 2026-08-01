import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { MAX_CATCHUP_TICKS, RETREAT_MAX_PCT, type StateResponse } from '@deepholdings/shared';
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

    test('six advanced hours are six different hours', async () => {
      // The regression this exists for: advancing used to wind the *character*
      // back and let the resolver replay to a fixed now. Every tick is seeded
      // from (characterId, tick), so replaying the same absolute window
      // replayed the same seeds — six one-hour advances simulated the same
      // hour six times. Nothing threw, every other assertion in this file
      // passed, and the death rate measured through the endpoint came out
      // about sixteen times too low.
      //
      // The tell is the journal's span. Six hours of advance must cover six
      // hours of ticks; a treadmill covers one however long you run it.
      const fresh = new MemoryRepository();
      await fresh.init();
      const solo = buildApp({ repo: fresh, config: dev });
      const login = await solo.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: 'treadmill' },
      });
      const headers = { authorization: `Bearer ${login.json().token}` };

      let advanced = 0;
      for (let hour = 0; hour < 6; hour += 1) {
        const res = await solo.inject({
          method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 1 },
        });
        advanced += res.json().ticksAdvanced;
        if (res.json().died) break;
      }

      // The whole file, not the opening page: the last sixty lines say nothing
      // about how much time was covered.
      const opening = (await solo.inject({
        method: 'GET', url: '/v1/state', headers,
      })).json() as StateResponse;
      const all = [...opening.journal];
      for (;;) {
        const page = (await solo.inject({
          method: 'GET', url: `/v1/journal?before=${all[0]?.id ?? 0}`, headers,
        })).json() as { entries: typeof all; hasMore: boolean };
        if (page.entries.length === 0) break;
        all.unshift(...page.entries);
        if (!page.hasMore) break;
      }

      const ticks = all.map((entry) => entry.tick);
      const span = Math.max(...ticks) - Math.min(...ticks);
      assert.ok(
        span >= advanced - 60,
        `${advanced} ticks advanced but the journal only spans ${span} — time is on a loop`,
      );

      await solo.close();
      await fresh.close();
    });

    test('chunks stay inside the catch-up window', async () => {
      // Orders nobody dies under, so this measures chunking rather than
      // mortality — advancing stops at a death, and under the real defaults a
      // recruit can easily be lost inside the first chunk.
      await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: auth(),
        payload: {
          orders: {
            targetDepth: 2,
            retreatPct: RETREAT_MAX_PCT,
            lootPriority: 'gear',
            spendPolicy: 'resupply',
          },
        },
      });

      // Two days in one call: four chunks, all simulated rather than summarised.
      const response = await advance(48);
      assert.equal(response.statusCode, 200);
      const { ticksAdvanced, died } = response.json();
      assert.equal(died, false, 'the safe orders should have survived');
      assert.equal(ticksAdvanced, 48 * 60);
      assert.ok(ticksAdvanced > MAX_CATCHUP_TICKS, 'more than one window was covered');

      const texts = (await state()).journal.map((entry) => entry.text).join('\n');
      assert.doesNotMatch(texts, /recess/i, 'a chunked span is simulated, not summarised');
    });

    test('the default orders are not a dead end', async () => {
      // The old defaults produced a career where nothing changed between hour
      // six and day twenty-nine: Target Depth 3 is exactly what Permit D-2
      // authorises, so the recruit never stalled, never applied for a permit
      // and never descended; and Retreat 28% on Floor 2 never killed anybody,
      // so pension stayed zero and all nineteen unlocks stayed invisible.
      //
      // This asserts the *property*, not the numbers: a player who never opens
      // Form SO-1 must still see the permit ladder move and a pension appear.
      const fresh = new MemoryRepository();
      await fresh.init();
      const solo = buildApp({ repo: fresh, config: dev });
      const auth = await solo.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: 'default-orders' },
      });
      const headers = { authorization: `Bearer ${auth.json().token}` };
      const read = async () =>
        (await solo.inject({ method: 'GET', url: '/v1/state', headers })).json() as StateResponse;

      const start = await read();
      assert.equal(start.ordersFiled, false, 'this officer never files anything');
      const startTier = start.character.permitTier;

      // A week, claiming pensions the way the overlay would.
      let banked = 0;
      for (let day = 0; day < 7; day += 1) {
        await solo.inject({
          method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 24 },
        });
        const now = await read();
        if (now.pendingDeath) {
          banked += now.pendingDeath.pensionAwarded;
          await solo.inject({ method: 'POST', url: '/v1/pension/claim', headers });
        }
      }

      const end = await read();
      assert.ok(
        end.character.permitTier > startTier,
        `permit stuck at D-${end.character.permitTier} after a week on default orders`,
      );

      // This assertion used to fail about one run in eight, and I wrote a
      // comment explaining that death is a rare-event process at the default
      // retreat threshold. It is not. Advancing was replaying one hour on a
      // loop, so a "week" here was a week only if that hour happened to be
      // lethal. With the clock fixed, forty careers over a week banked
      // something in forty of forty, at a mean of 4.75 deaths each — which
      // agrees with the resolver harness's 5.35 for the same orders and span.
      // The flake was the endpoint, and the right response to a test that
      // fails an eighth of the time is to find out why, not to weaken it.
      const pension = banked + (await fresh.getPension(start.account.id)).total;
      assert.ok(pension > 0, 'a week on default orders earned no pension at all');

      // Not asserted here: a service review. It is measured from bornTick, so
      // it needs a recruit who serves twelve unbroken hours, and at the
      // defaults most do not — the same 4.75 deaths a week that make the
      // assertion above safe are what keep the reminder from firing. An
      // officer on the defaults learns about the pension from the death
      // overlay instead, which is the louder teacher of the two. The reminder
      // is for the cautious player who never sees one; that case is the test
      // below.

      await solo.close();
      await fresh.close();
    });

    test('a recruit who never dies is still told the pension exists', async () => {
      // Death is otherwise the only way a pension appears, and a player who
      // sets a cautious retreat threshold can go a long time without one —
      // that is the point of a cautious threshold, not a bug in it. Form R-1
      // is the other way; nothing used to mention it.
      const safe = new MemoryRepository();
      await safe.init();
      const solo = buildApp({ repo: safe, config: dev });
      const auth = await solo.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: 'never-dies' },
      });
      const headers = { authorization: `Bearer ${auth.json().token}` };

      // Orders that keep the recruit alive, so the reminder is the only way
      // the pension could ever come up.
      await solo.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers,
        payload: {
          orders: {
            targetDepth: 1,
            retreatPct: RETREAT_MAX_PCT,
            lootPriority: 'gear',
            spendPolicy: 'resupply',
          },
        },
      });

      // Exactly one day, so the reminder is still inside the opening page of
      // the journal. Any further and it scrolls past 60 lines — which is the
      // reason it is on the Terminal as well as in the log.
      for (let i = 0; i < 2; i += 1) {
        await solo.inject({
          method: 'POST', url: '/v1/dev/advance', headers, payload: { hours: 12 },
        });
      }

      const body = (await solo.inject({
        method: 'GET', url: '/v1/state', headers,
      })).json() as StateResponse;
      assert.equal(body.character.alive, true, 'these orders should not kill anybody');

      // The reminder quotes a real number, not a nag.
      const review = body.journal.map((e) => e.text).find((t) => /Service review/.test(t));
      assert.ok(review, 'a day-old recruit was never told Form R-1 exists');
      const quoted = Number(review?.match(/assesses the separation at (\d+)/)?.[1]);
      const offered = body.retirement?.award ?? 0;
      assert.ok(quoted > 0, `the reminder quoted no award: ${review}`);
      // Close, not equal: resolution is lazy, so real minutes elapse between
      // the advance and this read and are resolved into the offer. What
      // matters is that the line quotes the *Form R-1* award — which pays on
      // current depth — rather than the death award, which pays on the
      // deepest floor reached and is a materially different number.
      assert.ok(offered > 0);
      assert.ok(
        Math.abs(quoted - offered) / offered < 0.1,
        `log quoted ${quoted}, Ledger offers ${offered} — different basis, not drift`,
      );

      await solo.close();
      await safe.close();
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

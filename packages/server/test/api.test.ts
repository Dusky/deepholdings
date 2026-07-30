import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { StateResponse } from '@deepholdings/shared';
import { MemoryRepository } from '../src/adapters/memory.js';
import { PostgresRepository } from '../src/adapters/postgres.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { beatOnce } from '../src/heartbeat.js';
import type { Repository } from '../src/ports.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret' });

/**
 * The same suite runs against both adapters — that is the point of the port.
 * Postgres joins in only when TEST_DATABASE_URL is set; registering it
 * conditionally keeps the skip decision out of test bodies.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const adapters: { name: string; make: () => Repository }[] = [
  { name: 'memory', make: () => new MemoryRepository() },
  ...(databaseUrl
    ? [{ name: 'postgres', make: () => new PostgresRepository(databaseUrl) as Repository }]
    : []),
];

for (const adapter of adapters) {
  describe(`api (${adapter.name})`, () => {
    let repo!: Repository;
    let app!: ReturnType<typeof buildApp>;
    let token = '';

    before(async () => {
      repo = adapter.make();
      await repo.init();
      app = buildApp({ repo, config });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `device-${Date.now()}-${Math.random()}` },
      });
      assert.equal(response.statusCode, 200);
      token = response.json().token;
    });

    after(async () => {
      await app.close();
      await repo.close();
    });

    const auth = () => ({ authorization: `Bearer ${token}` });

    test('rejects requests without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/state' });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json().error.code, 'unauthorized');
    });

    test('returns a resolved cold-start state', async () => {
      const response = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal(response.statusCode, 200);

      const state = response.json() as StateResponse;
      assert.match(state.character.name, /^GRIMWALD I,/);
      assert.equal(state.character.alive, true);
      assert.equal(state.pension.total, 0);
      assert.ok(state.world.market.length > 0);
      assert.ok(state.nextBeatInSeconds >= 0);
      assert.equal(state.pendingDeath, null);
    });

    test('validates standing orders', async () => {
      const bad = await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: auth(),
        payload: { orders: { targetDepth: 99, retreatPct: 28, lootPriority: 'gear', spendPolicy: 'resupply' } },
      });
      assert.equal(bad.statusCode, 400);

      const good = await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: auth(),
        payload: { orders: { targetDepth: 5, retreatPct: 40, lootPriority: 'relics', spendPolicy: 'insure' } },
      });
      assert.equal(good.statusCode, 200);
      assert.equal(good.json().orders.targetDepth, 5);

      const state = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal((state.json() as StateResponse).orders.lootPriority, 'relics');
    });

    test('refuses unlocks the pension cannot cover', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/pension/unlocks',
        headers: auth(),
        payload: { id: 'green' },
      });
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, 'insufficient_pension');
    });

    test('grants an unlock once the pension covers it', async () => {
      await repo.savePension(await accountId(app, token), { total: 1000, spent: 0, unlocks: [] });

      const bought = await app.inject({
        method: 'POST',
        url: '/v1/pension/unlocks',
        headers: auth(),
        payload: { id: 'green' },
      });
      assert.equal(bought.statusCode, 200);
      assert.equal(bought.json().pension.total, 100);
      assert.equal(bought.json().pension.spent, 900);

      const again = await app.inject({
        method: 'POST',
        url: '/v1/pension/unlocks',
        headers: auth(),
        payload: { id: 'green' },
      });
      assert.equal(again.statusCode, 409);
      assert.equal(again.json().error.code, 'already_owned');
    });

    test('carries tavern messages', async () => {
      const sent = await app.inject({
        method: 'POST',
        url: '/v1/tavern',
        headers: auth(),
        payload: { body: 'permit D-6 still processing, day 7' },
      });
      assert.equal(sent.statusCode, 200);

      const listed = await app.inject({ method: 'GET', url: '/v1/tavern' });
      const body = listed.json();
      assert.equal(body.messages.at(-1).body, 'permit D-6 still processing, day 7');
      assert.match(body.messages.at(-1).author, /^CASE OFFICER/);

      const empty = await app.inject({ method: 'POST', url: '/v1/tavern', headers: auth(), payload: { body: '  ' } });
      assert.equal(empty.statusCode, 400);
    });

    test('claiming a pension requires a death on file', async () => {
      const response = await app.inject({ method: 'POST', url: '/v1/pension/claim', headers: auth() });
      assert.equal(response.statusCode, 400);
    });

    test('the heartbeat advances the world only when due', async () => {
      const before = await repo.getWorld();
      assert.equal(await beatOnce(repo, new Date(Date.now() - 60_000)), false);

      const due = new Date(new Date(before.nextBeatAt).getTime() + 1000);
      assert.equal(await beatOnce(repo, due), true);

      const after = await repo.getWorld();
      assert.equal(after.beat, before.beat + 1);
      assert.ok(new Date(after.nextBeatAt) > new Date(before.nextBeatAt));
    });

    test('the full death and pension cycle', async () => {
      const account = await accountId(app, token);

      // Suicidal orders plus a rewound watermark: the next read resolves a long,
      // deep, unretreating run, which is fatal.
      await repo.saveOrders(account, {
        targetDepth: 12,
        retreatPct: 5,
        lootPriority: 'gold',
        spendPolicy: 'hoard',
      });

      let state: StateResponse | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const record = await repo.getActiveCharacterForUpdate(account);
        if (!record) break;
        record.character.lastResolvedTick -= 700;
        await repo.saveCharacter(record);

        const response = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
        state = response.json() as StateResponse;
        if (state.pendingDeath) break;
      }

      assert.ok(state?.pendingDeath, 'expected a death after repeated deep runs');
      assert.equal(state!.character.alive, false);
      assert.ok(state!.journal.some((entry) => /died on Floor/.test(entry.text)));

      const pensionBefore = state!.pension.total;
      const award = state!.pendingDeath!.pensionAwarded;

      const claimed = await app.inject({ method: 'POST', url: '/v1/pension/claim', headers: auth() });
      assert.equal(claimed.statusCode, 200);
      const body = claimed.json();
      assert.equal(body.pension.total, pensionBefore + award);
      assert.match(body.character.name, /^GRIMWALD II,/);
      assert.equal(body.character.alive, true);

      const fresh = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal((fresh.json() as StateResponse).character.alive, true);

      const bulletin = await app.inject({ method: 'GET', url: '/v1/bulletin' });
      assert.ok(bulletin.json().deaths.length > 0);
    });
  });
}

async function accountId(app: ReturnType<typeof buildApp>, token: string): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/state',
    headers: { authorization: `Bearer ${token}` },
  });
  return (response.json() as StateResponse).account.id;
}

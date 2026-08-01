import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import {
  REQUISITION_CATALOGUE,
  journalLines,
  type LedgerResponse,
  type Office,
  type RequisitionId,
  type StateResponse,
} from '@deepholdings/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Repository } from '../src/ports.js';
import { adapters } from './adapters.js';

const config = loadConfig({ NODE_ENV: 'test', TOKEN_SECRET: 'test-secret' });

const cost = (id: RequisitionId): number =>
  REQUISITION_CATALOGUE.find((entry) => entry.id === id)!.cost;

for (const adapter of adapters) {
  describe(`requisitions (${adapter.name})`, () => {
    let repo!: Repository;
    let app!: ReturnType<typeof buildApp>;
    let token = '';
    let account = '';

    before(async () => {
      repo = adapter.make();
      await repo.init();
      app = buildApp({ repo, config });

      const auth = await app.inject({
        method: 'POST',
        url: '/v1/auth/device',
        payload: { deviceId: `req-${Date.now()}-${Math.random()}` },
      });
      token = auth.json().token;
      const state = await app.inject({
        method: 'GET',
        url: '/v1/state',
        headers: { authorization: `Bearer ${token}` },
      });
      account = (state.json() as StateResponse).account.id;
    });

    after(async () => {
      await app.close();
      await repo.close();
    });

    const auth = () => ({ authorization: `Bearer ${token}` });

    /** Puts the purse and the equipment cupboard in a known state. */
    const setUp = async (gold: number, requisitions: RequisitionId[] = []) => {
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.character.gold = gold;
      await repo.saveCharacter(record);
      await repo.saveOffice(account, { spent: 0, requisitions });
    };

    const stock = async (
      inventory: { name: string; quantity: number; unitValue: number; category: string }[],
    ) => {
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.inventory = inventory.map((item) => ({
        name: item.name,
        note: `x${item.quantity}`,
        quantity: item.quantity,
        unitValue: item.unitValue,
        category: item.category as never,
      }));
      await repo.saveCharacter(record);
      const world = await repo.getWorld();
      await repo.saveWorld({
        ...world,
        market: world.market.map((quote) => ({ ...quote, demand: 1 })),
      });
      await repo.saveOrders(account, {
        targetDepth: 2,
        retreatPct: 60,
        lootPriority: 'gold',
        spendPolicy: 'resupply',
      });
    };

    const buy = (id: RequisitionId) =>
      app.inject({
        method: 'POST',
        url: '/v1/office/requisitions',
        headers: auth(),
        payload: { id },
      });

    test('the ledger prices requisitions against the purse, not the pension', async () => {
      await setUp(1000);
      const ledger = await app.inject({ method: 'GET', url: '/v1/ledger', headers: auth() });
      assert.equal(ledger.statusCode, 200);
      const body = ledger.json() as LedgerResponse;

      assert.equal(body.gold, 1000);
      // One offer per track, cheapest rung first.
      assert.equal(body.requisitions.length, 4);
      const bulk = body.requisitions.find((offer) => offer.track === 'bulk');
      assert.ok(bulk);
      assert.equal(bulk.id, 'bulk1');
      assert.equal(bulk.tier, 1);
      assert.equal(bulk.maxTier, 2);
      assert.equal(bulk.affordable, true);

      // A rung above the purse is offered but not affordable.
      const dear = body.requisitions.find((offer) => offer.cost > 1000);
      assert.ok(dear);
      assert.equal(dear.affordable, false);
    });

    test('a purchase draws gold from the recruit and the equipment outlives them', async () => {
      await setUp(2000);
      const response = await buy('index1');
      assert.equal(response.statusCode, 200);
      const body = response.json() as { office: Office; gold: number };
      assert.equal(body.gold, 2000 - cost('index1'));
      assert.deepEqual(body.office.requisitions, ['index1']);
      assert.equal(body.office.spent, cost('index1'));

      // Retiring the recruit banks the pension and assigns a successor; the
      // office is account-scoped, so it must survive that.
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.character.bornTick = record.character.lastResolvedTick - 500;
      await repo.saveCharacter(record);
      const retire = await app.inject({
        method: 'POST',
        url: '/v1/recruit/retire',
        headers: auth(),
      });
      assert.equal(retire.statusCode, 200);

      const after = await repo.getOffice(account);
      assert.deepEqual(after.requisitions, ['index1']);
    });

    test('gold it does not have is refused, and nothing is filed', async () => {
      await setUp(10);
      const response = await buy('index1');
      assert.equal(response.statusCode, 409);
      assert.equal(response.json().error.code, 'insufficient_gold');
      assert.deepEqual((await repo.getOffice(account)).requisitions, []);
    });

    test('ladders are climbed in order and only once', async () => {
      await setUp(100_000);

      // Tier II before tier I buys the top rung at the top rung's price.
      const skip = await buy('bulk2');
      assert.equal(skip.statusCode, 400);

      assert.equal((await buy('bulk1')).statusCode, 200);
      assert.equal((await buy('bulk1')).statusCode, 409);
      assert.equal((await buy('bulk2')).statusCode, 200);

      const ledger = await app.inject({ method: 'GET', url: '/v1/ledger', headers: auth() });
      const bulk = (ledger.json() as LedgerResponse).requisitions.find((o) => o.track === 'bulk');
      assert.ok(bulk);
      assert.equal(bulk.owned, true, 'a maxed track reports owned');
      assert.equal(bulk.affordable, false);
    });

    test('an unknown requisition is refused', async () => {
      await setUp(100_000);
      const response = await buy('desk9' as RequisitionId);
      assert.equal(response.statusCode, 400);
    });

    test('bulk filing needs the authorisation it saves taps on', async () => {
      await setUp(500);
      await stock([
        { name: 'Chipped Buckle', quantity: 4, unitValue: 5, category: 'gear' },
        { name: 'Bearer Note', quantity: 2, unitValue: 60, category: 'gold' },
      ]);

      const unauthorised = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: { category: 'gear' },
      });
      assert.equal(unauthorised.statusCode, 403);
      assert.equal(unauthorised.json().error.code, 'not_authorised');

      // The cabinet is untouched — a refused filing sells nothing.
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.equal(record?.inventory.length, 2);
    });

    test('tier I clears a category at exactly the single-sale price', async () => {
      await setUp(0, ['bulk1']);
      await stock([
        { name: 'Chipped Buckle', quantity: 4, unitValue: 5, category: 'gear' },
        { name: 'Dented Greave', quantity: 3, unitValue: 20, category: 'gear' },
        { name: 'Bearer Note', quantity: 2, unitValue: 60, category: 'gold' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: { category: 'gear' },
      });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.stacks, 2);
      assert.equal(body.sold, 7);
      // 4x5 + 3x20 at par demand: the same arithmetic two single sales would do.
      assert.equal(body.goldReceived, 80);
      assert.equal(body.gold, 80);
      assert.deepEqual(
        body.inventory.map((i: { name: string }) => i.name),
        ['Bearer Note'],
      );
    });

    test('the value threshold is what tier II adds', async () => {
      await setUp(0, ['bulk1']);
      await stock([
        { name: 'Chipped Buckle', quantity: 4, unitValue: 5, category: 'gear' },
        { name: 'Bearer Note', quantity: 2, unitValue: 60, category: 'gold' },
      ]);

      const tooEarly = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: { maxUnitValue: 10 },
      });
      assert.equal(tooEarly.statusCode, 403);

      await repo.saveOffice(account, { spent: 0, requisitions: ['bulk1', 'bulk2'] });
      const response = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: { maxUnitValue: 10 },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().stacks, 1);
      assert.equal(response.json().goldReceived, 20);
      assert.deepEqual(
        response.json().inventory.map((i: { name: string }) => i.name),
        ['Bearer Note'],
      );
    });

    test('a bulk filing always names what it is clearing', async () => {
      await setUp(0, ['bulk1', 'bulk2']);
      await stock([{ name: 'Chipped Buckle', quantity: 4, unitValue: 5, category: 'gear' }]);

      // No selector: "sell everything" must not be expressible by omission.
      const bare = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: {},
      });
      assert.equal(bare.statusCode, 400);

      // Both selectors at once is equally ambiguous.
      const both = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: { category: 'gear', maxUnitValue: 10 },
      });
      assert.equal(both.statusCode, 400);

      for (const payload of [{ category: 'bullion' }, { maxUnitValue: -1 }]) {
        const bad = await app.inject({
          method: 'POST',
          url: '/v1/ledger/sell-bulk',
          headers: auth(),
          payload,
        });
        assert.equal(bad.statusCode, 400, `${JSON.stringify(payload)} should be refused`);
      }

      // Nothing was sold by any of the refusals.
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.equal(record?.inventory.length, 1);
    });

    test('a filing that matches nothing is a no-op, not an error', async () => {
      await setUp(0, ['bulk1']);
      await stock([{ name: 'Bearer Note', quantity: 2, unitValue: 60, category: 'gold' }]);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell-bulk',
        headers: auth(),
        payload: { category: 'relics' },
      });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().stacks, 0);
      assert.equal(response.json().goldReceived, 0);
      assert.equal(response.json().inventory.length, 1);
    });

    test('journal retention is the only thing that changes the page size', async () => {
      assert.equal(journalLines([]), 60);
      assert.equal(journalLines(['journal1']), 150);
      assert.equal(journalLines(['journal1', 'journal2']), 400);
      // Owning an unrelated track changes nothing.
      assert.equal(journalLines(['bulk1', 'index1']), 60);
    });

    test('state carries the office so screens the Ledger is not can read it', async () => {
      await setUp(0, ['readouts1']);
      const state = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      const body = state.json() as StateResponse;
      assert.deepEqual(body.office.requisitions, ['readouts1']);
    });
  });
}

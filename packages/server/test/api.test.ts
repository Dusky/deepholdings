import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import {
  HOARD_SALE_BONUS,
  JOURNAL_LINES_BY_TIER,
  JOURNAL_PAGE_SIZE,
  RETREAT_MAX_PCT,
  RETREAT_MIN_PCT,
  inheritedLevel,
  type JournalResponse,
  type StateResponse,
} from '@deepholdings/shared';
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

    test('CORS admits a LAN origin in dev and refuses a public one', async () => {
      // The phone-browser test path loads the client from the desktop's LAN
      // address, which no default list can contain.
      const lan = await app.inject({
        method: 'OPTIONS',
        url: '/v1/state',
        headers: {
          origin: 'http://192.168.1.42:5173',
          'access-control-request-method': 'GET',
        },
      });
      assert.equal(lan.headers['access-control-allow-origin'], 'http://192.168.1.42:5173');

      // Overlay networks (Tailscale et al) live in CGNAT space and are the
      // sane way to reach a dev server from off-network.
      const overlay = await app.inject({
        method: 'OPTIONS',
        url: '/v1/state',
        headers: {
          origin: 'http://100.105.79.34:5173',
          'access-control-request-method': 'GET',
        },
      });
      assert.equal(overlay.headers['access-control-allow-origin'], 'http://100.105.79.34:5173');

      const public_ = await app.inject({
        method: 'OPTIONS',
        url: '/v1/state',
        headers: {
          origin: 'https://evil.example.com',
          'access-control-request-method': 'GET',
        },
      });
      assert.equal(public_.headers['access-control-allow-origin'], undefined);
    });

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
      // A new account must not land on an empty Terminal screen, and the
      // first session has to teach the prestige loop before it happens.
      assert.equal(state.journal.length, 3);
      assert.match(state.journal[0].text, /Case file opened/);
      assert.match(state.journal[2].text, /Pensions are paid on death/);

      // Five tabs on day one is the genre's most common fatal mistake.
      assert.deepEqual(state.clearance, ['terminal', 'orders']);
      assert.equal(state.ordersFiled, false);
      assert.equal(state.digest, null);
    });

    test('filing orders flips the unfiled nudge off, permanently', async () => {
      const before = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal((before.json() as StateResponse).ordersFiled, false);

      await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: auth(),
        payload: { orders: { targetDepth: 2, retreatPct: 30, lootPriority: 'gold', spendPolicy: 'resupply' } },
      });

      const after = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal((after.json() as StateResponse).ordersFiled, true);
    });

    test('a long absence produces a digest and announces new clearance', async () => {
      const account = await accountId(app, token);
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      // Four hours away: long enough to earn a summary and some clearance.
      record.character.lastResolvedTick -= 240;
      await repo.saveCharacter(record);

      const response = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      const state = response.json() as StateResponse;

      assert.ok(state.digest, 'expected a shift digest');
      assert.equal(state.digest.minutes, 240);
      assert.ok(state.digest.encounters > 0);
      assert.ok(state.digest.deepestFloor >= 1);

      assert.ok(state.clearance.includes('ledger'), 'four hours should earn a promotion');
      assert.ok(
        state.journal.some((entry) => /Clearance amended/.test(entry.text)),
        'new clearance should be announced in the log',
      );
    });

    test('a stalled permit is reported with its ready time', async () => {
      const account = await accountId(app, token);
      // Deep orders on a Permit D-1 recruit: the ceiling binds almost at once.
      await repo.saveOrders(account, {
        targetDepth: 12, retreatPct: 60, lootPriority: 'gold', spendPolicy: 'resupply',
      });
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.character.lastResolvedTick -= 300;
      await repo.saveCharacter(record);

      const response = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      const state = response.json() as StateResponse;

      if (state.pendingPermit) {
        assert.ok(state.pendingPermit.tier > state.character.permitTier - 1);
        assert.ok(state.pendingPermit.authorisesDepth > 0);
        assert.ok(Date.parse(state.pendingPermit.readyAt) > 0);
        assert.ok(state.pendingPermit.secondsRemaining >= 0);
      } else {
        // Nothing pending is only correct if the recruit is not at a ceiling.
        assert.ok(state.character.permitTier >= 1);
      }
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

    test('sells from the cabinet at the server price', async () => {
      const account = await accountId(app, token);
      await repo.saveOrders(account, {
        targetDepth: 2, retreatPct: 60, lootPriority: 'gold', spendPolicy: 'resupply',
      });
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.inventory = [
        { name: 'Requisition Stamp', note: 'x3', quantity: 3, unitValue: 40, category: 'gear' },
        { name: 'Tarnished Sigil', note: 'x1', quantity: 1, unitValue: 90, category: 'relics' },
      ];
      await repo.saveCharacter(record);
      await pinDemand(repo, 1);
      const goldBefore = record.character.gold;

      // Part of a stack: the remainder stays on file, re-noted.
      const partial = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell',
        headers: auth(),
        payload: { name: 'Requisition Stamp', quantity: 2 },
      });
      assert.equal(partial.statusCode, 200);
      assert.equal(partial.json().sold, 2);
      assert.equal(partial.json().goldReceived, 80);
      assert.equal(partial.json().gold, goldBefore + 80);
      const left = partial.json().inventory.find((i: { name: string }) => i.name === 'Requisition Stamp');
      assert.equal(left.quantity, 1);
      assert.equal(left.note, 'x1');

      // No quantity means the whole stack, and an emptied stack leaves the cabinet.
      const whole = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell',
        headers: auth(),
        payload: { name: 'Requisition Stamp' },
      });
      assert.equal(whole.statusCode, 200);
      assert.equal(whole.json().sold, 1);
      assert.equal(
        whole.json().inventory.some((i: { name: string }) => i.name === 'Requisition Stamp'),
        false,
      );

      // The price is the server's, so a client cannot invent one.
      const unknown = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell',
        headers: auth(),
        payload: { name: 'Bearer Bonds, Fictitious' },
      });
      assert.equal(unknown.statusCode, 404);

      for (const quantity of [0, -1, 99, 1.5]) {
        const bad = await app.inject({
          method: 'POST',
          url: '/v1/ledger/sell',
          headers: auth(),
          payload: { name: 'Tarnished Sigil', quantity },
        });
        assert.equal(bad.statusCode, 400, `quantity ${quantity} should be refused`);
      }
    });

    test('the quoted offer is what the sale pays', async () => {
      const account = await accountId(app, token);
      await repo.saveOrders(account, {
        targetDepth: 2, retreatPct: 60, lootPriority: 'gold', spendPolicy: 'resupply',
      });
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.inventory = [
        { name: 'Bearer Note, Countersigned', note: 'x4', quantity: 4, unitValue: 55, category: 'gold' },
      ];
      await repo.saveCharacter(record);
      await pinDemand(repo, 1.2);

      const ledger = await app.inject({ method: 'GET', url: '/v1/ledger', headers: auth() });
      const stack = ledger.json().inventory.find(
        (i: { name: string }) => i.name === 'Bearer Note, Countersigned',
      );
      // Demand is priced in, and the two columns agree with each other.
      assert.equal(stack.unitOffer, 66);
      assert.equal(stack.stackOffer, 264);

      const sold = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell',
        headers: auth(),
        payload: { name: 'Bearer Note, Countersigned' },
      });
      assert.equal(sold.json().goldReceived, stack.stackOffer);
    });

    test('hoarding orders sell at a premium', async () => {
      const account = await accountId(app, token);
      await repo.saveOrders(account, {
        targetDepth: 2, retreatPct: 60, lootPriority: 'gold', spendPolicy: 'hoard',
      });
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      record.inventory = [
        { name: 'Sealed Docket', note: 'x1', quantity: 1, unitValue: 100, category: 'knowledge' },
      ];
      await repo.saveCharacter(record);
      await pinDemand(repo, 1);

      const sold = await app.inject({
        method: 'POST',
        url: '/v1/ledger/sell',
        headers: auth(),
        payload: { name: 'Sealed Docket' },
      });
      assert.equal(sold.statusCode, 200);
      assert.equal(sold.json().goldReceived, Math.round(100 * HOARD_SALE_BONUS));
    });

    test('refuses unlocks the pension cannot cover', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/pension/unlocks',
        headers: auth(),
        payload: { id: 'phosphor1' },
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
        payload: { id: 'phosphor1' },
      });
      assert.equal(bought.statusCode, 200);
      assert.equal(bought.json().pension.total, 100);
      assert.equal(bought.json().pension.spent, 900);

      const again = await app.inject({
        method: 'POST',
        url: '/v1/pension/unlocks',
        headers: auth(),
        payload: { id: 'phosphor1' },
      });
      assert.equal(again.statusCode, 409);
      assert.equal(again.json().error.code, 'already_owned');
    });

    test('prestige ladders are climbed in order', async () => {
      const account = await accountId(app, token);
      await repo.savePension(account, { total: 40_000, spent: 0, unlocks: [] });

      // Posting the top rung directly would buy tier III at tier III's price
      // while skipping I and II entirely.
      const skipped = await app.inject({
        method: 'POST',
        url: '/v1/pension/unlocks',
        headers: auth(),
        payload: { id: 'permits3' },
      });
      assert.equal(skipped.statusCode, 400);

      for (const id of ['permits1', 'permits2', 'permits3'] as const) {
        const bought = await app.inject({
          method: 'POST',
          url: '/v1/pension/unlocks',
          headers: auth(),
          payload: { id },
        });
        assert.equal(bought.statusCode, 200, `expected ${id} to be purchasable`);
      }

      // One offer per track, and a maxed track reads as complete.
      const ledger = await app.inject({ method: 'GET', url: '/v1/ledger', headers: auth() });
      const permits = ledger
        .json()
        .unlocks.filter((offer: { track: string }) => offer.track === 'permits');
      assert.equal(permits.length, 1);
      assert.equal(permits[0].owned, true);
      assert.equal(permits[0].tier, permits[0].maxTier);
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

    test('Form R-1 retires a recruit and banks the quoted award', async () => {
      const account = await accountId(app, token);
      await repo.savePension(account, { total: 0, spent: 0, unlocks: [] });
      await repo.saveOrders(account, {
        targetDepth: 3, retreatPct: 60, lootPriority: 'gold', spendPolicy: 'resupply',
      });

      const fresh = await repo.getActiveCharacterForUpdate(account);
      assert.ok(fresh);
      fresh.character.bornTick = fresh.character.lastResolvedTick;
      await repo.saveCharacter(fresh);

      // A recruit who has barely started has nothing to retire on.
      const early = await app.inject({
        method: 'POST',
        url: '/v1/recruit/retire',
        headers: auth(),
      });
      assert.equal(early.statusCode, 400);

      const served = await repo.getActiveCharacterForUpdate(account);
      assert.ok(served);
      served.character.lastResolvedTick -= 400;
      served.character.bornTick = served.character.lastResolvedTick - 400;
      await repo.saveCharacter(served);

      const before = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      const offer = (before.json() as StateResponse).retirement;
      assert.ok(offer);
      assert.equal(offer.eligible, true);
      assert.ok(offer.award > 0, 'a long career should be worth something');
      const previousName = (before.json() as StateResponse).character.name;

      const retired = await app.inject({
        method: 'POST',
        url: '/v1/recruit/retire',
        headers: auth(),
      });
      assert.equal(retired.statusCode, 200);
      // The quote is the payment, and the successor is already on the payroll.
      assert.equal(retired.json().pension.total, offer.award);
      assert.notEqual(retired.json().character.name, previousName);
      assert.equal(retired.json().character.alive, true);

      // The separation is on the feed, and it does not claim they died.
      const bulletin = await app.inject({ method: 'GET', url: '/v1/bulletin' });
      const separation = bulletin
        .json()
        .deaths.find((d: { characterName: string }) => d.characterName === previousName);
      assert.ok(separation);
      assert.match(separation.cause, /separation/);

      // The award is banked, not owed again.
      const claimed = await app.inject({
        method: 'POST',
        url: '/v1/pension/claim',
        headers: auth(),
      });
      assert.equal(claimed.statusCode, 400);
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
      const deceased = state!.character.recruitNum;

      const claimed = await app.inject({ method: 'POST', url: '/v1/pension/claim', headers: auth() });
      assert.equal(claimed.statusCode, 200);
      const body = claimed.json();
      assert.equal(body.pension.total, pensionBefore + award);
      // The ordinal advances; which ordinal depends on how many careers this
      // account has already been through, so do not pin it to a number.
      assert.equal(body.character.recruitNum, deceased + 1);
      assert.match(body.character.name, /^GRIMWALD [IVX]+,/);
      assert.equal(body.character.alive, true);

      const successorJournal = await repo.listJournal(body.character.id, -1, 10);
      assert.match(successorJournal[0].text, /Replacement recruit assigned/);

      const fresh = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal((fresh.json() as StateResponse).character.alive, true);

      const bulletin = await app.inject({ method: 'GET', url: '/v1/bulletin' });
      assert.ok(bulletin.json().deaths.length > 0);
    });

    test('a successor inherits the case file, not nothing', async () => {
      // The design's whole claim about death is that it is a setback rather
      // than a wipe. It was a wipe: `claimInside` never passed the deceased
      // recruit's grade or permit to `newRecruit`, so a Grade 11 officer
      // holding Permit D-6 was replaced by Grade 1 with D-1. Every balance
      // number about the cost of death assumed otherwise.
      const account = await accountId(app, token);
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      Object.assign(record.character, {
        level: 11,
        permitTier: 6,
        depth: 8,
        hp: 0,
        alive: false,
      });
      await repo.saveCharacter(record);
      await repo.recordDeath(account, {
        id: randomUUID(),
        characterName: record.character.name,
        depth: 8,
        cause: 'a clerical error, downstream',
        goldHandled: 0,
        pensionAwarded: 25,
        at: new Date().toISOString(),
      });

      const claim = await app.inject({
        method: 'POST',
        url: '/v1/pension/claim',
        headers: auth(),
      });
      assert.equal(claim.statusCode, 200);
      const successor = claim.json().character;

      // Permits are issued against the case file: all but one tier survives.
      assert.equal(successor.permitTier, 5);
      // Grade kept scales with the floor reached, so a deep loss returns a
      // better replacement than one in the entrance corridor.
      assert.equal(successor.level, inheritedLevel(11, 8));
      assert.ok(successor.level > 1, 'a deep loss must not reset to Grade I');
      assert.ok(
        inheritedLevel(11, 8) > inheritedLevel(11, 0),
        'dying deep must return a better successor than dying shallow',
      );
      assert.equal(successor.hp, successor.maxHp);
    });


    test('retreat thresholds outside the live band are clamped, not rejected', async () => {
      // The slider was narrowed from 5-80 to 10-45 because everything above 35
      // resolved identically. Orders filed under the old range must still PUT
      // cleanly — 60 and 45 mean the same thing to the resolver.
      const wide = await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: auth(),
        payload: {
          orders: { targetDepth: 6, retreatPct: 60, lootPriority: 'gear', spendPolicy: 'resupply' },
        },
      });
      assert.equal(wide.statusCode, 200);
      assert.equal(wide.json().orders.retreatPct, RETREAT_MAX_PCT);

      const low = await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: auth(),
        payload: {
          orders: { targetDepth: 6, retreatPct: 5, lootPriority: 'gear', spendPolicy: 'resupply' },
        },
      });
      assert.equal(low.statusCode, 200);
      assert.equal(low.json().orders.retreatPct, RETREAT_MIN_PCT);

      // Actual garbage is still refused.
      for (const retreatPct of [0, 250, Number.NaN, 'thirty']) {
        const bad = await app.inject({
          method: 'PUT',
          url: '/v1/orders',
          headers: auth(),
          payload: {
            orders: { targetDepth: 6, retreatPct, lootPriority: 'gear', spendPolicy: 'resupply' },
          },
        });
        assert.equal(bad.statusCode, 400, `retreatPct ${String(retreatPct)} should be refused`);
      }
    });


    test('the journal pages backwards to the start of the file', async () => {
      const account = await accountId(app, token);
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      const characterId = record.character.id;

      // More lines than any retention tier opens with.
      await repo.appendJournal(
        Array.from({ length: 140 }, (_, i) => ({
          characterId,
          tick: record.character.lastResolvedTick + i,
          at: new Date(Date.now() + i),
          text: `Filed entry ${i}.`,
        })),
      );

      const state = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      const opening = (state.json() as StateResponse).journal;
      assert.equal(opening.length, JOURNAL_LINES_BY_TIER[0], 'opens at the base retention');

      // Page back from the oldest line on screen.
      const first = await app.inject({
        method: 'GET',
        url: `/v1/journal?before=${opening[0].id}`,
        headers: auth(),
      });
      assert.equal(first.statusCode, 200);
      const page = first.json() as JournalResponse;
      assert.equal(page.entries.length, JOURNAL_PAGE_SIZE);
      assert.equal(page.hasMore, true);

      // Oldest first, contiguous with what was already on screen, no overlap.
      const ids = page.entries.map((e) => Number(e.id));
      assert.deepEqual(ids, [...ids].sort((a, b) => a - b), 'entries arrive oldest first');
      assert.ok(ids[ids.length - 1] < Number(opening[0].id), 'a page never overlaps the screen');

      // Walk to the start of the file.
      let cursor = page.entries[0].id;
      let guard = 0;
      let last = page;
      while (last.hasMore && guard < 20) {
        const next = await app.inject({
          method: 'GET',
          url: `/v1/journal?before=${cursor}`,
          headers: auth(),
        });
        last = next.json() as JournalResponse;
        if (last.entries.length > 0) cursor = last.entries[0].id;
        guard += 1;
      }
      assert.equal(last.hasMore, false, 'paging reaches the start of the file');

      // Nothing before the first line.
      const beyond = await app.inject({
        method: 'GET',
        url: `/v1/journal?before=${cursor}`,
        headers: auth(),
      });
      assert.equal(beyond.statusCode, 200);
      assert.equal(beyond.json().entries.length, 0);
      assert.equal(beyond.json().hasMore, false);

      for (const before of ['', 'abc', '-1', "1; DROP TABLE journal"]) {
        const bad = await app.inject({
          method: 'GET',
          url: `/v1/journal?before=${encodeURIComponent(before)}`,
          headers: auth(),
        });
        assert.equal(bad.statusCode, 400, `before=${before} should be refused`);
      }
    });


    test('the preflight allows every method the client actually uses', async () => {
      // The default is GET,HEAD,POST, which blocked `PUT /v1/orders` — the
      // endpoint that files Form SO-1 — in every cross-origin browser. The
      // client is always cross-origin: Vite in dev, capacitor://localhost on
      // Android. It failed silently as a CORS error, not a 4xx.
      for (const method of ['GET', 'POST', 'PUT']) {
        const preflight = await app.inject({
          method: 'OPTIONS',
          url: '/v1/orders',
          headers: {
            origin: 'http://localhost:5173',
            'access-control-request-method': method,
          },
        });
        assert.equal(preflight.statusCode, 204, `${method} preflight should succeed`);
        assert.match(
          preflight.headers['access-control-allow-methods'] as string,
          new RegExp(method),
          `${method} must be allowed`,
        );
      }

      // And the real request goes through, not just the preflight.
      const filed = await app.inject({
        method: 'PUT',
        url: '/v1/orders',
        headers: { ...auth(), origin: 'http://localhost:5173' },
        payload: {
          orders: { targetDepth: 4, retreatPct: 30, lootPriority: 'gear', spendPolicy: 'resupply' },
        },
      });
      assert.equal(filed.statusCode, 200);
      assert.equal(filed.json().orders.targetDepth, 4);
    });


    test('a dead recruit still has a screen', async () => {
      // The game bricked on the first death: `/v1/state` loaded only the
      // *active* character, so every request after the one they died in
      // returned 404. No overlay, no claim button, nothing the client could do.
      const account = await accountId(app, token);
      const record = await repo.getActiveCharacterForUpdate(account);
      assert.ok(record);
      Object.assign(record.character, { hp: 0, alive: false, depth: 5, level: 7 });
      await repo.saveCharacter(record);
      await repo.recordDeath(account, {
        id: randomUUID(),
        characterName: record.character.name,
        depth: 5,
        cause: 'the floor, generally',
        goldHandled: 12,
        pensionAwarded: 34,
        at: new Date().toISOString(),
      });

      const state = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal(state.statusCode, 200, 'a dead recruit must not 404 the whole client');
      const body = state.json() as StateResponse;
      assert.equal(body.character.alive, false);
      assert.ok(body.pendingDeath, 'the death overlay needs the record');
      assert.equal(body.pendingDeath?.pensionAwarded, 34);
      // Nothing to retire — they are already gone.
      assert.equal(body.retirement, null);
      // And the screens they earned are still on file.
      assert.ok(body.clearance.includes('terminal'));

      // Asking twice is the ordinary case: a player reopens the app.
      const again = await app.inject({ method: 'GET', url: '/v1/state', headers: auth() });
      assert.equal(again.statusCode, 200);

      // And the claim still works from there.
      const claim = await app.inject({
        method: 'POST', url: '/v1/pension/claim', headers: auth(),
      });
      assert.equal(claim.statusCode, 200);
      assert.equal(claim.json().character.alive, true);
    });

  });
}

/** Fix every category's demand so a sale's arithmetic is checkable. */
async function pinDemand(repo: Repository, demand: number): Promise<void> {
  const world = await repo.getWorld();
  await repo.saveWorld({
    ...world,
    market: world.market.map((quote) => ({ ...quote, demand })),
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
